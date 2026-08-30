import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME, jsonResponse, deleteItems } from "../lib/dynamo.js";
import { isAuthorized } from "../lib/auth.js";
import type { Match, Season } from "../lib/types.js";

// POST /seasons  Body: { seasonId, label?, startDate?, makeCurrent? }
// seasonId is expected to look like "2025-2026" but nothing enforces that —
// it's just the id/sort key. Creating a season with makeCurrent (or the very
// first season ever created) flips off isCurrent on every other season, so
// there's always exactly zero or one "current" season.
async function createSeason(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? "{}") as {
    seasonId?: string;
    label?: string;
    startDate?: string;
    makeCurrent?: boolean;
  };
  const { seasonId, label, startDate, makeCurrent } = body;
  if (!seasonId) {
    return jsonResponse(400, { message: "seasonId is required, e.g. \"2025-2026\"" });
  }

  const existingSeasons = await listSeasonItems();
  const shouldBeCurrent = makeCurrent || existingSeasons.length === 0;

  const season: Season = {
    seasonId,
    label: label ?? seasonId,
    startDate,
    isCurrent: shouldBeCurrent,
  };

  if (shouldBeCurrent) {
    await Promise.all(
      existingSeasons
        .filter((s) => s.isCurrent)
        .map((s) =>
          ddb.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: `SEASON#${s.seasonId}`, SK: "METADATA" },
              UpdateExpression: "SET isCurrent = :false",
              ExpressionAttributeValues: { ":false": false },
            })
          )
        )
    );
  }

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `SEASON#${seasonId}`, SK: "METADATA", ...season },
    })
  );

  return jsonResponse(201, season);
}

async function listSeasonItems(): Promise<Season[]> {
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "SK = :sk AND begins_with(PK, :prefix)",
      ExpressionAttributeValues: { ":sk": "METADATA", ":prefix": "SEASON#" },
    })
  );
  return (result.Items ?? []) as Season[];
}

// GET /seasons — sorted newest-first by seasonId (year-range ids sort correctly as strings)
async function listSeasons(): Promise<APIGatewayProxyResultV2> {
  const seasons = await listSeasonItems();
  seasons.sort((a, b) => b.seasonId.localeCompare(a.seasonId));
  return jsonResponse(200, seasons);
}

// GET /seasons/current
async function currentSeason(): Promise<APIGatewayProxyResultV2> {
  const seasons = await listSeasonItems();
  const current = seasons.find((s) => s.isCurrent) ?? null;
  return jsonResponse(200, current);
}

// Reserved seasonId the frontend uses for the "Unknown season" bucket on the
// Matches page — matches created before the seasons feature existed, with a
// blank/whitespace season from a bad edit/import, or pointing at a season id
// that no longer exists (e.g. a Season item that was removed some other way
// before cascading delete existed), have no real Season entity to delete.
// This sentinel matches all of those cases, not just "season field literally
// missing or empty" — see isOrphanSeason below for why that widened
// definition was necessary.
const NO_SEASON_SENTINEL = "__no_season__";

// A match counts as "unknown season" if its season is blank/whitespace, OR
// if it's a non-blank value that doesn't correspond to any real Season item
// currently in the table. That second case matters: a match's season field
// can look perfectly normal (a real-looking value, no visible red flag in
// the DynamoDB console) while still being orphaned, e.g. if its Season was
// ever removed a way other than this file's cascading delete. Checking
// "does a matching SEASON# item exist" catches that; checking only for
// missing/empty `season` does not.
function isOrphanSeason(season: unknown, realSeasonIds: Set<string>): boolean {
  if (typeof season !== "string") return true; // missing entirely
  const trimmed = season.trim();
  if (trimmed === "") return true; // empty or whitespace-only
  return !realSeasonIds.has(trimmed);
}

// DELETE /seasons/{seasonId} — cascading: removes the season, every match in
// it, and every result/payment/fill logged under those matches. There's no
// undo; the UI has a confirm step (and shows the match count) before calling
// this. Works even if the Season metadata item is missing (e.g. it was
// already deleted, or seasonId is the NO_SEASON_SENTINEL) as long as at
// least one match actually carries that season — otherwise 404.
async function deleteSeason(seasonId: string): Promise<APIGatewayProxyResultV2> {
  const isSentinel = seasonId === NO_SEASON_SENTINEL;

  const existing = isSentinel
    ? { Items: [] as unknown[] }
    : await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk AND SK = :sk",
          ExpressionAttributeValues: { ":pk": `SEASON#${seasonId}`, ":sk": "METADATA" },
        })
      );

  // Small league dataset — scans are fine at this scale (same pattern as
  // listMatches). For the sentinel we scan every match and filter in code
  // (isOrphanSeason needs the full set of real season ids to compare
  // against, which a DynamoDB FilterExpression can't express); for a real
  // seasonId we can filter server-side with an exact match.
  const matchesResult = isSentinel
    ? await (async () => {
        const [allMatches, realSeasons] = await Promise.all([
          ddb.send(
            new ScanCommand({
              TableName: TABLE_NAME,
              FilterExpression: "SK = :sk",
              ExpressionAttributeValues: { ":sk": "METADATA" },
            })
          ),
          listSeasonItems(),
        ]);
        const realSeasonIds = new Set(realSeasons.map((s) => s.seasonId));
        // Only match items that actually look like matches (have a `date`
        // field) — Season items also have SK "METADATA" but a different PK
        // prefix, and a plain scan-by-SK alone doesn't distinguish them.
        const items = (allMatches.Items ?? []).filter(
          (i): i is Match => typeof (i as Match).date === "string"
        );
        return { Items: items.filter((m) => isOrphanSeason(m.season, realSeasonIds)) };
      })()
    : await ddb.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "SK = :sk AND season = :season",
          ExpressionAttributeValues: { ":sk": "METADATA", ":season": seasonId },
        })
      );
  const matches = (matchesResult.Items ?? []) as Match[];

  if ((!existing.Items || existing.Items.length === 0) && matches.length === 0) {
    return jsonResponse(404, { message: "Season not found" });
  }

  const matchItemKeys = await Promise.all(
    matches.map(async (m) => {
      const result = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": `MATCH#${m.matchId}` },
        })
      );
      return (result.Items ?? []).map((i) => ({ PK: i.PK, SK: i.SK }));
    })
  );

  const keysToDelete = [
    // No real Season item exists for the sentinel — nothing to delete there.
    ...(isSentinel ? [] : [{ PK: `SEASON#${seasonId}`, SK: "METADATA" }]),
    ...matchItemKeys.flat(),
  ];

  await deleteItems(keysToDelete);

  return jsonResponse(200, { deleted: seasonId, matchesDeleted: matches.length });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAuthorized(event)) return jsonResponse(401, { message: "Unauthorized" });

  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const seasonId = event.pathParameters?.seasonId;

  if (method === "GET" && rawPath === "/seasons/current") return currentSeason();
  if (method === "GET" && rawPath === "/seasons") return listSeasons();
  if (method === "POST" && rawPath === "/seasons") return createSeason(event);
  if (method === "DELETE" && seasonId) return deleteSeason(seasonId);

  return jsonResponse(404, { message: "Not found" });
}
