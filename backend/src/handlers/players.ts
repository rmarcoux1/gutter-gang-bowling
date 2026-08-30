import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse, deleteItems } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Fill, Payment, Player, PlayerStatsSummary, StringResult, WeeklyStat } from "../lib/types.js";

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

// DELETE /players/{playerId} — removes the player and every logged result,
// payment, AND fill of theirs across every match (cascading, same as
// deleting a match).
async function deletePlayer(playerId: string): Promise<APIGatewayProxyResultV2> {
  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `PLAYER#${playerId}`, SK: "PROFILE" } })
  );
  if (!existing.Item) {
    return jsonResponse(404, { message: "Player not found" });
  }

  const items = await getPlayerItems(playerId);
  const keysToDelete = [
    { PK: `PLAYER#${playerId}`, SK: "PROFILE" },
    // Use each item's own PK/SK rather than reconstructing it — results,
    // payments, and fills all have differently-shaped sort keys.
    ...items.map((i) => ({ PK: i.PK, SK: i.SK })),
  ];

  await deleteItems(keysToDelete);

  return jsonResponse(200, { deleted: playerId, resultsDeleted: items.length });
}

// All of a player's GSI1 items — a mix of string results, payments, and
// fills, distinguished by which fields they carry (results always have
// `score`, payments have `amountPaid`, fills have `pins`).
async function getPlayerItems(playerId: string): Promise<Record<string, unknown>[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `PLAYER#${playerId}` },
    })
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}

function isPayment(item: Record<string, unknown>): item is Payment {
  return typeof item.amountPaid === "number";
}
function isResult(item: Record<string, unknown>): item is StringResult {
  return typeof item.score === "number";
}
function isFill(item: Record<string, unknown>): item is Fill {
  return typeof item.pins === "number";
}

function totalPaidOf(payments: Payment[]): number {
  return Math.round(payments.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0) * 100) / 100;
}

// Highest single-string score ever logged. Deliberately computed from every
// result a player has ever posted, regardless of which season (if any) the
// caller is otherwise scoping the rest of the stats to — a "career high" is
// meant to stay put as a personal record while someone browses season to
// season, not reset to 0 for a season they haven't bowled a new high in.
function careerHighScoreOf(allResults: StringResult[]): number {
  return allResults.reduce((max, r) => Math.max(max, r.score ?? 0), 0);
}

function avg(total: number, count: number): number {
  return count === 0 ? 0 : Math.round((total / count) * 10) / 10;
}

function fillTotals(fills: Fill[]): {
  strikeFillsLogged: number;
  averageStrikeFill: number;
  spareFillsLogged: number;
  averageSpareFill: number;
} {
  const strikeFills = fills.filter((f) => f.fillType === "strike");
  const spareFills = fills.filter((f) => f.fillType === "spare");
  const strikeTotal = strikeFills.reduce((sum, f) => sum + (f.pins ?? 0), 0);
  const spareTotal = spareFills.reduce((sum, f) => sum + (f.pins ?? 0), 0);
  return {
    strikeFillsLogged: strikeFills.length,
    averageStrikeFill: avg(strikeTotal, strikeFills.length),
    spareFillsLogged: spareFills.length,
    averageSpareFill: avg(spareTotal, spareFills.length),
  };
}

// careerHighScore is passed in rather than computed from `results` here
// because `results` may already be season-filtered by the caller, and a
// career high is deliberately never scoped to a season — see
// careerHighScoreOf above.
function summarize(
  playerId: string,
  results: StringResult[],
  payments: Payment[],
  fills: Fill[],
  careerHighScore: number
): PlayerStatsSummary {
  const stringsPlayed = results.length;
  const totalPaid = totalPaidOf(payments);
  const fillStats = fillTotals(fills);

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
      totalPaid,
      careerHighScore,
      ...fillStats,
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
    totalPaid,
    careerHighScore,
    ...fillStats,
  };
}

// season is undefined for career/all-time (no filter applied), or a seasonId
// like "2025-2026" to scope stats to just that season. Results/payments/fills
// logged before the season feature existed have no `season` field and are
// only included in the career/all-time view (no season query param).
function filterBySeason<T extends { season?: string }>(items: T[], season?: string): T[] {
  if (!season) return items;
  return items.filter((i) => i.season === season);
}

// GET /players/{playerId}/stats?season=2025-2026 — omit season for career/all-time
async function playerStats(playerId: string, season?: string): Promise<APIGatewayProxyResultV2> {
  const items = await getPlayerItems(playerId);
  const allResults = items.filter(isResult);
  const results = filterBySeason(allResults, season);
  const payments = filterBySeason(items.filter(isPayment), season);
  const fills = filterBySeason(items.filter(isFill), season);
  return jsonResponse(200, summarize(playerId, results, payments, fills, careerHighScoreOf(allResults)));
}

// GET /players/{playerId}/weekly?season=2025-2026 — per-week breakdown plus a running
// (cumulative) average, which is the handicap trend: how the number moves as more
// games are added. Omitting season rolls up every season (career trend); passing one
// scopes the running average to just that season, so handicap effectively resets.
async function playerWeekly(playerId: string, season?: string): Promise<APIGatewayProxyResultV2> {
  const items = await getPlayerItems(playerId);
  const results = filterBySeason(items.filter(isResult), season).filter(
    (r): r is StringResult & { week: number } => typeof r.week === "number"
  );
  const payments = filterBySeason(items.filter(isPayment), season).filter(
    (p): p is Payment & { week: number } => typeof p.week === "number"
  );
  const fills = filterBySeason(items.filter(isFill), season).filter(
    (f): f is Fill & { week: number } => typeof f.week === "number"
  );

  const byWeek = new Map<number, StringResult[]>();
  for (const r of results) {
    const list = byWeek.get(r.week) ?? [];
    list.push(r);
    byWeek.set(r.week, list);
  }
  const paidByWeek = new Map<number, number>();
  for (const p of payments) {
    paidByWeek.set(p.week, (paidByWeek.get(p.week) ?? 0) + (p.amountPaid ?? 0));
  }
  const fillsByWeek = new Map<number, Fill[]>();
  for (const f of fills) {
    const list = fillsByWeek.get(f.week) ?? [];
    list.push(f);
    fillsByWeek.set(f.week, list);
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
      totalPaid: Math.round((paidByWeek.get(week) ?? 0) * 100) / 100,
      ...fillTotals(fillsByWeek.get(week) ?? []),
      handicap: Math.round((runningScore / runningCount) * 10) / 10,
    };
  });

  return jsonResponse(200, weekly);
}

// GET /players/summary?season=2025-2026 — every player's aggregate stats + handicap
// in one call, for the team overview page. Omit season for career/all-time.
async function teamSummary(season?: string): Promise<APIGatewayProxyResultV2> {
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
      const items = await getPlayerItems(p.playerId);
      const allResults = items.filter(isResult);
      const results = filterBySeason(allResults, season);
      const payments = filterBySeason(items.filter(isPayment), season);
      const fills = filterBySeason(items.filter(isFill), season);
      return {
        ...summarize(p.playerId, results, payments, fills, careerHighScoreOf(allResults)),
        name: p.name,
      };
    })
  );

  return jsonResponse(200, summaries);
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAuthorized(event)) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const playerId = event.pathParameters?.playerId;
  const season = event.queryStringParameters?.season;

  if (method === "GET" && rawPath === "/players/summary") return teamSummary(season);
  if (method === "POST" && !playerId) return createPlayer(event);
  if (method === "GET" && !playerId) return listPlayers();
  if (method === "GET" && playerId && rawPath.endsWith("/weekly")) return playerWeekly(playerId, season);
  if (method === "GET" && playerId && rawPath.endsWith("/stats")) return playerStats(playerId, season);
  if (method === "PUT" && playerId && rawPath === `/players/${playerId}`) return updatePlayer(playerId, event);
  if (method === "DELETE" && playerId && rawPath === `/players/${playerId}`) return deletePlayer(playerId);

  return jsonResponse(404, { message: "Not found" });
}
