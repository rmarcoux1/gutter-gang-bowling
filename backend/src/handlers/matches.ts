import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse, deleteItems } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Match } from "../lib/types.js";

// POST /matches
async function createMatch(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? "{}");
  const { date, opponent, week } = body as { date?: string; opponent?: string; week?: number };

  if (!date || !opponent || week === undefined) {
    return jsonResponse(400, { message: "date, opponent, and week are required" });
  }

  const matchId = randomUUID();
  const match: Match = { matchId, date, opponent, week };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `MATCH#${matchId}`, SK: "METADATA", ...match },
    })
  );

  return jsonResponse(201, match);
}

// GET /matches
async function listMatches(): Promise<APIGatewayProxyResultV2> {
  // Small league dataset — a scan with a filter is fine at this scale.
  const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "METADATA" },
    })
  );
  return jsonResponse(200, result.Items ?? []);
}

// GET /matches/{matchId} — metadata + all string results
async function getMatch(matchId: string): Promise<APIGatewayProxyResultV2> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `MATCH#${matchId}` },
    })
  );

  const items = result.Items ?? [];
  const metadata = items.find((i) => i.SK === "METADATA");
  if (!metadata) {
    return jsonResponse(404, { message: "Match not found" });
  }
  const results = items.filter((i) => i.SK !== "METADATA");
  return jsonResponse(200, { match: metadata, results });
}

// PUT /matches/{matchId} — partial update of date/opponent/week
async function updateMatch(matchId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `MATCH#${matchId}`, SK: "METADATA" } })
  );
  if (!existing.Item) {
    return jsonResponse(404, { message: "Match not found" });
  }

  const body = JSON.parse(event.body ?? "{}") as Partial<Match>;
  const current = existing.Item as Match;
  const updated: Match = {
    matchId,
    date: body.date ?? current.date,
    opponent: body.opponent ?? current.opponent,
    week: body.week ?? current.week,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `MATCH#${matchId}`, SK: "METADATA", ...updated },
    })
  );

  // Results denormalize week/date from the match at write time (see results.ts).
  // Keep them in sync so weekly/handicap-trend charts don't go stale after an edit.
  if (body.week !== undefined || body.date !== undefined) {
    const existingResults = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": `MATCH#${matchId}`, ":prefix": "PLAYER#" },
      })
    );
    await Promise.all(
      (existingResults.Items ?? []).map((item) =>
        ddb.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: { ...item, week: updated.week, matchDate: updated.date },
          })
        )
      )
    );
  }

  return jsonResponse(200, updated);
}

// DELETE /matches/{matchId} — removes the match and every logged result under it
async function deleteMatch(matchId: string): Promise<APIGatewayProxyResultV2> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `MATCH#${matchId}` },
    })
  );

  const items = result.Items ?? [];
  if (items.length === 0) {
    return jsonResponse(404, { message: "Match not found" });
  }

  await deleteItems(items.map((i) => ({ PK: i.PK, SK: i.SK })));

  return jsonResponse(200, { deleted: matchId, resultsDeleted: items.length - 1 });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAuthorized(event)) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const matchId = event.pathParameters?.matchId;

  if (method === "POST" && !matchId) return createMatch(event);
  if (method === "GET" && !matchId) return listMatches();
  if (method === "GET" && matchId) return getMatch(matchId);
  if (method === "PUT" && matchId) return updateMatch(matchId, event);
  if (method === "DELETE" && matchId) return deleteMatch(matchId);

  return jsonResponse(404, { message: "Not found" });
}
