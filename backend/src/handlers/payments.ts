import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Match, Payment } from "../lib/types.js";

// POST /matches/{matchId}/payments  Body: { playerId, stringNumber, amountPaid }
// Upsert — resubmitting the same player+string for the same match overwrites
// the amount, same pattern as logging a string result. stringNumber is
// required so a week's payments break down per string (and sum to a real
// total) instead of one amount silently overwriting another — see the
// comment on Payment in lib/types.ts for why this changed.
async function submitPayment(matchId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? "{}") as Partial<Payment>;
  const { playerId, stringNumber, amountPaid } = body;

  if (
    !playerId ||
    ![1, 2, 3].includes(stringNumber as number) ||
    typeof amountPaid !== "number" ||
    amountPaid < 0
  ) {
    return jsonResponse(400, {
      message: "playerId, stringNumber (1-3), and a non-negative amountPaid are required",
    });
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
    stringNumber: stringNumber as 1 | 2 | 3,
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
        SK: `PLAYER#${playerId}#STRING#${stringNumber}#PAYMENT`,
        GSI1PK: `PLAYER#${playerId}`,
        GSI1SK: `MATCH#${matchId}#STRING#${stringNumber}#PAYMENT`,
        ...payment,
      },
    })
  );

  return jsonResponse(201, payment);
}

// DELETE /matches/{matchId}/payments/{playerId}/{stringNumber} — remove one
// string's payment.
async function deletePayment(matchId: string, playerId: string, stringNumber: string): Promise<APIGatewayProxyResultV2> {
  if (!["1", "2", "3"].includes(stringNumber)) {
    return jsonResponse(400, { message: "stringNumber must be 1, 2, or 3" });
  }

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MATCH#${matchId}`, SK: `PLAYER#${playerId}#STRING#${stringNumber}#PAYMENT` },
    })
  );
  return jsonResponse(200, { deleted: true, matchId, playerId, stringNumber: Number(stringNumber) });
}

// DELETE /matches/{matchId}/payments/{playerId} — legacy route, kept only so
// the handful of payment rows written before per-string payments existed
// (no stringNumber, keyed by PLAYER#<id>#PAYMENT) can still be cleaned up.
// Every new payment is written with a stringNumber via the route above.
async function deleteLegacyPayment(matchId: string, playerId: string): Promise<APIGatewayProxyResultV2> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MATCH#${matchId}`, SK: `PLAYER#${playerId}#PAYMENT` },
    })
  );
  return jsonResponse(200, { deleted: true, matchId, playerId });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!(await isAuthorized(event))) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const matchId = event.pathParameters?.matchId;
  if (!matchId) return jsonResponse(400, { message: "matchId is required" });

  const playerId = event.pathParameters?.playerId;
  const stringNumber = event.pathParameters?.stringNumber;

  if (method === "POST") return submitPayment(matchId, event);
  if (method === "DELETE" && playerId && stringNumber) return deletePayment(matchId, playerId, stringNumber);
  if (method === "DELETE" && playerId) return deleteLegacyPayment(matchId, playerId);

  return jsonResponse(404, { message: "Not found" });
}
