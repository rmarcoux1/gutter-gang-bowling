import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.TABLE_NAME ?? "";

/**
 * Delete a batch of items by key, chunked into groups of 25 (BatchWriteItem's
 * limit). Used for cascading deletes — e.g. removing every logged result when
 * a match or player is deleted.
 */
export async function deleteItems(keys: { PK: string; SK: string }[]): Promise<void> {
  const CHUNK = 25;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((key) => ({ DeleteRequest: { Key: key } })),
        },
      })
    );
  }
}

export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,x-api-key",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
