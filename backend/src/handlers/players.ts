import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse, deleteItems } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Player, PlayerStatsSummary, StringResult, WeeklyStat } from "../lib/types.js";

async function createPlayer(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? "{}");
  const { name } = body as { name?: string };
  if (!name) return jsonResponse(400, { message: "name is required" });

  const playerId = randomUUID();
  const player: Player = { playerId, name, joinedDate: new Date().toISOString().slice(0, 10) };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `PLAYER#${playerId}`, SK: "PROFILE", ...player },
    })
  );

  return jsonResponse(201, player);
}

async function listPlayers(): Promise<APIGatewayProxyResultV2> {
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "PROFILE" },
    })
  );
  return jsonResponse(200, result.Items ?? []);
}

// PUT /players/{playerId} — currently just the name, but written to merge so
// it's easy to add more editable fields later without a breaking change.
async function updatePlayer(playerId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `PLAYER#${playerId}`, SK: "PROFILE" } })
  );
  if (!existing.Item) {
    return jsonResponse(404, { message: "Player not found" });
  }

  const body = JSON.parse(event.body ?? "{}") as Partial<Player>;
  const current = existing.Item as Player;
  const updated: Player = {
    playerId,
    name: body.name ?? current.name,
    joinedDate: current.joinedDate,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `PLAYER#${playerId}`, SK: "PROFILE", ...updated },
    })
  );

  return jsonResponse(200, updated);
}

// DELETE /players/{playerId} — removes the player and every logged result of
// theirs across every match (cascading, same as deleting a match).
async function deletePlayer(playerId: string): Promise<APIGatewayProxyResultV2> {
  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `PLAYER#${playerId}`, SK: "PROFILE" } })
  );
  if (!existing.Item) {
    return jsonResponse(404, { message: "Player not found" });
  }

  const results = await getPlayerResults(playerId);
  const keysToDelete = [
    { PK: `PLAYER#${playerId}`, SK: "PROFILE" },
    ...results.map((r) => ({
      PK: `MATCH#${r.matchId}`,
      SK: `PLAYER#${playerId}#STRING#${r.stringNumber}`,
    })),
  ];

  await deleteItems(keysToDelete);

  return jsonResponse(200, { deleted: playerId, resultsDeleted: results.length });
}

async function getPlayerResults(playerId: string): Promise<StringResult[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `PLAYER#${playerId}` },
    })
  );
  return (result.Items ?? []) as StringResult[];
}

function summarize(playerId: string, results: StringResult[]): PlayerStatsSummary {
  const stringsPlayed = results.length;
  if (stringsPlayed === 0) {
    return {
      playerId,
      stringsPlayed: 0,
      averageScore: 0,
      handicap: 0,
      totalStrikes: 0,
      totalSpares: 0,
      totalTens: 0,
      totalOrangePinsLeft: 0,
    };
  }

  const totals = results.reduce(
    (acc, r) => ({
      score: acc.score + (r.score ?? 0),
      strikes: acc.strikes + (r.strikes ?? 0),
      spares: acc.spares + (r.spares ?? 0),
      tens: acc.tens + (r.tens ?? 0),
      orangePinsLeft: acc.orangePinsLeft + (r.orangePinsLeft ?? 0),
    }),
    { score: 0, strikes: 0, spares: 0, tens: 0, orangePinsLeft: 0 }
  );

  const averageScore = Math.round((totals.score / stringsPlayed) * 10) / 10;

  return {
    playerId,
    stringsPlayed,
    averageScore,
    // Handicap, per this team's definition: total score / games (strings) played.
    handicap: averageScore,
    totalStrikes: totals.strikes,
    totalSpares: totals.spares,
    totalTens: totals.tens,
    totalOrangePinsLeft: totals.orangePinsLeft,
  };
}

// GET /players/{playerId}/stats
async function playerStats(playerId: string): Promise<APIGatewayProxyResultV2> {
  const results = await getPlayerResults(playerId);
  return jsonResponse(200, summarize(playerId, results));
}

// GET /players/{playerId}/weekly — per-week breakdown plus a running (cumulative)
// average, which is the handicap trend: how the number moves as more games are added.
async function playerWeekly(playerId: string): Promise<APIGatewayProxyResultV2> {
  const results = (await getPlayerResults(playerId)).filter(
    (r): r is StringResult & { week: number } => typeof r.week === "number"
  );

  const byWeek = new Map<number, StringResult[]>();
  for (const r of results) {
    const list = byWeek.get(r.week) ?? [];
    list.push(r);
    byWeek.set(r.week, list);
  }

  const weeks = [...byWeek.keys()].sort((a, b) => a - b);

  let runningScore = 0;
  let runningCount = 0;

  const weekly: WeeklyStat[] = weeks.map((week) => {
    const weekResults = byWeek.get(week)!;
    const stringsPlayed = weekResults.length;
    const totals = weekResults.reduce(
      (acc, r) => ({
        score: acc.score + (r.score ?? 0),
        strikes: acc.strikes + (r.strikes ?? 0),
        spares: acc.spares + (r.spares ?? 0),
        tens: acc.tens + (r.tens ?? 0),
        orangePinsLeft: acc.orangePinsLeft + (r.orangePinsLeft ?? 0),
      }),
      { score: 0, strikes: 0, spares: 0, tens: 0, orangePinsLeft: 0 }
    );

    runningScore += totals.score;
    runningCount += stringsPlayed;

    return {
      week,
      date: weekResults[0].matchDate ?? "",
      stringsPlayed,
      averageScore: Math.round((totals.score / stringsPlayed) * 10) / 10,
      totalStrikes: totals.strikes,
      totalSpares: totals.spares,
      totalTens: totals.tens,
      totalOrangePinsLeft: totals.orangePinsLeft,
      handicap: Math.round((runningScore / runningCount) * 10) / 10,
    };
  });

  return jsonResponse(200, weekly);
}

// GET /players/summary — every player's aggregate stats + handicap in one call,
// for the team overview page.
async function teamSummary(): Promise<APIGatewayProxyResultV2> {
  const playersResult = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "PROFILE" },
    })
  );
  const players = (playersResult.Items ?? []) as Player[];

  const summaries = await Promise.all(
    players.map(async (p) => {
      const results = await getPlayerResults(p.playerId);
      return { ...summarize(p.playerId, results), name: p.name };
    })
  );

  return jsonResponse(200, summaries);
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAuthorized(event)) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const playerId = event.pathParameters?.playerId;

  if (method === "GET" && rawPath === "/players/summary") return teamSummary();
  if (method === "POST" && !playerId) return createPlayer(event);
  if (method === "GET" && !playerId) return listPlayers();
  if (method === "GET" && playerId && rawPath.endsWith("/weekly")) return playerWeekly(playerId);
  if (method === "GET" && playerId && rawPath.endsWith("/stats")) return playerStats(playerId);
  if (method === "PUT" && playerId && rawPath === `/players/${playerId}`) return updatePlayer(playerId, event);
  if (method === "DELETE" && playerId && rawPath === `/players/${playerId}`) return deletePlayer(playerId);

  return jsonResponse(404, { message: "Not found" });
}
