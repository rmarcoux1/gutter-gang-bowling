#!/usr/bin/env node
// Converts a Supabase-exported `players` + `games` CSV pair (the pre-DynamoDB
// data model — per-player-per-game rows, no match/opponent concept) into the
// CSV format `import-history.mjs` expects. See data-migration.md in the
// project docs for background on why this conversion step exists (a direct
// DynamoDB write was the original plan before the seasons feature landed).
//
// Usage:
//   node scripts/convert-supabase-export.mjs players.csv games.csv --season 2025-2026 [--opponent TBD] > converted.csv
//
// players.csv columns: id, name, created_at
// games.csv columns:   id, player_id, date, total_score, orange_pins, money_owed,
//                       strike_count, spare_count, ten_count, game_number
//
// What it does:
// - Every distinct `date` in games.csv becomes one week, numbered in chronological order.
// - `opponent` isn't in the source data at all — every row gets the placeholder passed
//   via --opponent (default "TBD"). Fix these up afterward using the app's "Edit match"
//   feature once you remember who each week was against; it doesn't affect any stats.
// - `game_number` is unreliable in the source (0 for everything before the export started
//   tracking it properly), so instead each player's games on a given date are renumbered
//   1, 2, 3 in the order they appear in games.csv — the best available proxy for play order
//   since there's no per-game timestamp.
// - `money_owed` (a side-bet/dues field) has no equivalent in the app's schema and is dropped.
// - Any (player, date) group with more than 3 rows is left as-is (all get numbered, so you'd
//   end up with a string 4/5/etc that the app will reject on import) — the script prints a
//   warning so you can fix the source data first rather than have the import fail partway
//   through.

import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { _: [], opponent: "TBD" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--season") args.season = argv[++i];
    else if (a === "--opponent") args.opponent = argv[++i];
    else args._.push(a);
  }
  return args;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parseLine = (line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };
  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function csvEscape(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [playersPath, gamesPath] = args._;
  if (!playersPath || !gamesPath || !args.season) {
    console.error(
      "Usage: node scripts/convert-supabase-export.mjs players.csv games.csv --season 2025-2026 [--opponent TBD] > converted.csv"
    );
    process.exit(1);
  }

  const players = new Map(parseCsv(await readFile(playersPath, "utf8")).map((p) => [p.id, p.name]));
  const games = parseCsv(await readFile(gamesPath, "utf8"));

  const dates = [...new Set(games.map((g) => g.date))].sort();
  const weekByDate = new Map(dates.map((d, i) => [d, i + 1]));

  const seen = new Map(); // "playerId|date" -> count so far
  const rows = [];
  const overflow = new Set();

  for (const g of games) {
    const playerName = players.get(g.player_id);
    if (!playerName) {
      console.error(`Warning: no player found for player_id ${g.player_id}, skipping row ${g.id}`);
      continue;
    }
    const key = `${g.player_id}|${g.date}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 3) overflow.add(`${playerName} on ${g.date}`);

    rows.push([
      args.season,
      weekByDate.get(g.date),
      g.date,
      args.opponent,
      playerName,
      count,
      g.total_score,
      g.strike_count,
      g.spare_count,
      g.ten_count,
      g.orange_pins,
    ]);
  }

  if (overflow.size > 0) {
    console.error(`Warning: more than 3 games found for: ${[...overflow].join(", ")} — check the source data.`);
  }

  const header = "season,week,date,opponent,player,string,score,strikes,spares,tens,orangePinsLeft";
  console.log(header);
  for (const row of rows) {
    console.log(row.map(csvEscape).join(","));
  }
  console.error(`\nConverted ${rows.length} rows across ${dates.length} weeks (${dates[0]} to ${dates[dates.length - 1]}).`);
  console.error(`Opponent was not in the source data — every row was set to "${args.opponent}". Fix up per-match via Edit match in the app once known.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
