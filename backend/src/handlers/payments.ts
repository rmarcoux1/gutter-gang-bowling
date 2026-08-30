import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Match, Payment } from "../lib/types.js";

// POST /matches/{matchId}/payments  Body: { playerId, amountPaid }
// Upsert — resubmitting the same player for the same match overwrites the
// amount, same pattern as logging a string result.
async function submitPayment(matchId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? "{}") as Partial<Payment>;
  const { playerId, amountPaid } = body;

  if (!playerId || typeof amountPaid !== "number" || amountPaid < 0) {
    return jsonResponse(400, { message: "playerId and a non-negative amountPaid are required" });
  }

  const matchLookup = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `MATCH#${matchId}`, SK: "METADATA" } })
  );
  const match = matchLookup.Item as Match | undefined;
  if (!match) {
    return jsonResponse(404, { message: "Match not found" });
  }

  const payment: Payment = {
    matchId,
    playerId,
    amountPaid,
    week: match.week,
    matchDate: match.date,
    season: match.season,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `MATCH#${matchId}`,
        SK: `PLAYER#${playerId}#PAYMENT`,
        GSI1PK: `PLAYER#${playerId}`,
        GSI1SK: `MATCH#${matchId}#PAYMENT`,
        ...payment,
      },
    })
  );

  return jsonResponse(201, payment);
}

// DELETE /matches/{matchId}/payments/{playerId}
async function deletePayment(matchId: string, playerId: string): Promise<APIGatewayProxyResultV2> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MATCH#${matchId}`, SK: `PLAYER#${playerId}#PAYMENT` },
    })
  );
  return jsonResponse(200, { deleted: true, matchId, playerId });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAuthorized(event)) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const matchId = event.pathParameters?.matchId;
  if (!matchId) return jsonResponse(400, { message: "matchId is required" });

  const playerId = event.pathParameters?.playerId;

  if (method === "POST") return submitPayment(matchId, event);
  if (method === "DELETE" && playerId) return deletePayment(matchId, playerId);

  return jsonResponse(404, { message: "Not found" });
}
