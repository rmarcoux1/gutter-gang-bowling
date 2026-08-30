import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Fill, Match } from "../lib/types.js";

// POST /matches/{matchId}/fills  Body: { playerId, stringNumber, fillType, pins }
// Always creates a new entry (not an upsert like results/payments) — a single
// string can have more than one fill, e.g. two strikes in the same string
// means two separate strike-fill entries.
async function createFill(matchId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? "{}") as Partial<Fill>;
  const { playerId, stringNumber, fillType, pins } = body;

  if (
    !playerId ||
    ![1, 2, 3].includes(stringNumber as number) ||
    (fillType !== "strike" && fillType !== "spare") ||
    typeof pins !== "number" ||
    pins < 0
  ) {
    return jsonResponse(400, {
      message: "playerId, stringNumber (1-3), fillType ('strike' or 'spare'), and a non-negative pins are required",
    });
  }

  const matchLookup = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `MATCH#${matchId}`, SK: "METADATA" } })
  );
  const match = matchLookup.Item as Match | undefined;
  if (!match) {
    return jsonResponse(404, { message: "Match not found" });
  }

  const fillId = randomUUID();
  const fill: Fill = {
    fillId,
    matchId,
    playerId,
    stringNumber: stringNumber as 1 | 2 | 3,
    fillType,
    pins,
    week: match.week,
    matchDate: match.date,
    season: match.season,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `MATCH#${matchId}`,
        SK: `PLAYER#${playerId}#FILL#${fillId}`,
        GSI1PK: `PLAYER#${playerId}`,
        GSI1SK: `MATCH#${matchId}#FILL#${fillId}`,
        ...fill,
      },
    })
  );

  return jsonResponse(201, fill);
}

// DELETE /matches/{matchId}/fills/{playerId}/{fillId}
async function deleteFill(matchId: string, playerId: string, fillId: string): Promise<APIGatewayProxyResultV2> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MATCH#${matchId}`, SK: `PLAYER#${playerId}#FILL#${fillId}` },
    })
  );
  return jsonResponse(200, { deleted: true, matchId, playerId, fillId });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAuthorized(event)) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const matchId = event.pathParameters?.matchId;
  if (!matchId) return jsonResponse(400, { message: "matchId is required" });

  const playerId = event.pathParameters?.playerId;
  const fillId = event.pathParameters?.fillId;

  if (method === "POST") return createFill(matchId, event);
  if (method === "DELETE" && playerId && fillId) return deleteFill(matchId, playerId, fillId);

  return jsonResponse(404, { message: "Not found" });
}
