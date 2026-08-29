import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Match, StringResult } from "../lib/types.js";

// POST /matches/{matchId}/results
// Body: { playerId, stringNumber, score, strikes, spares, tens, orangePinsLeft }
async function createResult(matchId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? "{}") as Partial<StringResult>;
  const { playerId, stringNumber, score, strikes, spares, tens, orangePinsLeft } = body;

  if (
    !playerId ||
    ![1, 2, 3].includes(stringNumber as number) ||
    score === undefined ||
    strikes === undefined ||
    spares === undefined ||
    tens === undefined ||
    orangePinsLeft === undefined
  ) {
    return jsonResponse(400, {
      message:
        "playerId, stringNumber (1-3), score, strikes, spares, tens, and orangePinsLeft are required",
    });
  }

  // Look up the match's week/date so we can denormalize them onto the result —
  // this lets weekly/handicap trend queries read straight off GSI1 without a
  // second round trip per result.
  const matchLookup = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MATCH#${matchId}`, SK: "METADATA" },
    })
  );
  const match = matchLookup.Item as Match | undefined;
  if (!match) {
    return jsonResponse(404, { message: "Match not found" });
  }

  const result: StringResult = {
    matchId,
    playerId,
    stringNumber: stringNumber as 1 | 2 | 3,
    score,
    strikes,
    spares,
    tens,
    orangePinsLeft,
    week: match.week,
    matchDate: match.date,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `MATCH#${matchId}`,
        SK: `PLAYER#${playerId}#STRING#${stringNumber}`,
        GSI1PK: `PLAYER#${playerId}`,
        GSI1SK: `MATCH#${matchId}#STRING#${stringNumber}`,
        ...result,
      },
    })
  );

  return jsonResponse(201, result);
}

// DELETE /matches/{matchId}/results/{playerId}/{stringNumber} — remove a single
// mis-entered result without deleting the whole match.
async function deleteResult(matchId: string, playerId: string, stringNumber: string): Promise<APIGatewayProxyResultV2> {
  if (!["1", "2", "3"].includes(stringNumber)) {
    return jsonResponse(400, { message: "stringNumber must be 1, 2, or 3" });
  }

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MATCH#${matchId}`, SK: `PLAYER#${playerId}#STRING#${stringNumber}` },
    })
  );

  return jsonResponse(200, { deleted: true, matchId, playerId, stringNumber: Number(stringNumber) });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAuthorized(event)) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const matchId = event.pathParameters?.matchId;
  if (!matchId) return jsonResponse(400, { message: "matchId is required" });

  const playerId = event.pathParameters?.playerId;
  const stringNumber = event.pathParameters?.stringNumber;

  if (method === "POST") return createResult(matchId, event);
  if (method === "DELETE" && playerId && stringNumber) return deleteResult(matchId, playerId, stringNumber);

  return jsonResponse(404, { message: "Not found" });
}
