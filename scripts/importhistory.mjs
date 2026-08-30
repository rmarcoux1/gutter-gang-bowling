#!/usr/bin/env node
// Backfill historical bowling data from a CSV export (Excel/Google Sheets: just
// "Download as CSV" or "File > Download > CSV"). Talks to the live API — same
// validation the app itself uses — so no separate import endpoint was needed.
// No npm dependencies: uses Node's built-in global `fetch` (Node 18+).
//
// Usage:
//   VITE_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com \
//   VITE_API_KEY=your-shared-secret \
//   node scripts/import-history.mjs path/to/last-season.csv
//
// Or pass them as flags instead of env vars:
//   node scripts/import-history.mjs last-season.csv --api-url https://... --api-key ...
//
// Add --dry-run to parse and print what would be created/sent without calling the API.
// Add --create-players to auto-create any bowler name not already in the Players list
// (default: the script stops and tells you which names are missing, so you can fix
// typos in the CSV instead of creating a duplicate player by mistake).
//
// Expected CSV columns (header row required, any column order, extra columns ignored):
//   season, week, date, opponent, player, string, score, strikes, spares, tens, orangePinsLeft, moneyOwed
//
// - season:  e.g. "2025-2026" — matches Season.seasonId. Created automatically if it
//            doesn't exist yet (not marked current — use the app's "+ New season" to
//            flip that when the new season actually starts).
// - week:    integer, 1-based, resets each season.
// - date:    YYYY-MM-DD.
// - opponent: free text, must match across all 3 strings/all players for the same match
//             (used along with season+week+date to group rows into one Match).
// - player:  bowler's display name, must exactly match an existing Player's name
//            (case-insensitive) unless --create-players is passed.
// - string:  1, 2, or 3.
// - score, strikes, spares, tens, orangePinsLeft: integers.
// - moneyOwed: optional, decimal. Dues/side-bet money for that one string. The app's
//              Payment feature is per-match-per-player (not per-string), so this script
//              sums a player's moneyOwed across all their strings within a match and
//              submits one payment (POST /matches/{matchId}/payments) for the total, if
//              it's greater than 0. Column can be omitted entirely (treated as all-0s).
//
// One row = one bowler's one string. A full historical week is usually
// (number of bowlers) x 3 rows.

import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--create-players") args.createPlayers = true;
    else if (a === "--api-url") args.apiUrl = argv[++i];
    else if (a === "--api-key") args.apiKey = argv[++i];
    else args._.push(a);
  }
  return args;
}

// Minimal CSV parser: handles quoted fields with commas/escaped quotes, but
// assumes no embedded newlines inside quoted fields (fine for a spreadsheet
// export of simple stat rows).
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = args._[0];
  if (!csvPath) {
    console.error("Usage: node scripts/import-history.mjs <path-to-csv> [--dry-run] [--create-players]");
    process.exit(1);
  }

  const apiUrl = (args.apiUrl ?? process.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const apiKey = args.apiKey ?? process.env.VITE_API_KEY;
  if (!args.dryRun && (!apiUrl || !apiKey)) {
    console.error("Missing API URL/key. Set VITE_API_URL and VITE_API_KEY, or pass --api-url/--api-key.");
    process.exit(1);
  }

  const csvText = await readFile(csvPath, "utf8");
  const rows = parseCsv(csvText);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  async function api(path, options = {}) {
    const res = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, ...options.headers },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${options.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
    }
    return res.status === 204 ? null : res.json();
  }

  // Group rows into matches: one match per unique (season, week, date, opponent).
  const matchGroups = new Map();
  const seasonsSeen = new Set();
  const playerNamesSeen = new Set();

  for (const row of rows) {
    const season = row.season;
    const week = row.week;
    const date = row.date;
    const opponent = row.opponent;
    if (!season || !week || !date || !opponent) {
      throw new Error(`Row missing season/week/date/opponent: ${JSON.stringify(row)}`);
    }
    seasonsSeen.add(season);
    playerNamesSeen.add(row.player);

    const key = `${season}__${week}__${date}__${opponent}`;
    if (!matchGroups.has(key)) {
      matchGroups.set(key, { season, week: Number(week), date, opponent, rows: [] });
    }
    matchGroups.get(key).rows.push(row);
  }

  console.log(`Found ${matchGroups.size} distinct matches across seasons: ${[...seasonsSeen].join(", ")}`);
  console.log(`Bowler names referenced: ${[...playerNamesSeen].join(", ")}`);

  const totalOwed = rows.reduce((sum, r) => sum + Number(r.moneyowed || 0), 0);
  if (totalOwed > 0) {
    console.log(`Total moneyOwed across all rows: $${(Math.round(totalOwed * 100) / 100).toFixed(2)} (will be summed per player per match into Payment records)`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: not calling the API. Re-run without it once this looks right.");
    return;
  }

  // Resolve/create seasons.
  const existingSeasons = await api("/seasons");
  const seasonIds = new Set(existingSeasons.map((s) => s.seasonId));
  for (const seasonId of seasonsSeen) {
    if (!seasonIds.has(seasonId)) {
      console.log(`Creating season ${seasonId} (not marked current)`);
      await api("/seasons", { method: "POST", body: JSON.stringify({ seasonId, makeCurrent: false }) });
    }
  }

  // Resolve players by name (case-insensitive); optionally create missing ones.
  const existingPlayers = await api("/players");
  const byName = new Map(existingPlayers.map((p) => [p.name.toLowerCase(), p]));
  const missing = [...playerNamesSeen].filter((n) => !byName.has(n.toLowerCase()));
  if (missing.length > 0) {
    if (!args.createPlayers) {
      console.error(
        `\nThese bowler names don't match an existing player (check for typos, or re-run with --create-players):\n  ${missing.join("\n  ")}`
      );
      process.exit(1);
    }
    for (const name of missing) {
      console.log(`Creating player ${name}`);
      const created = await api("/players", { method: "POST", body: JSON.stringify({ name }) });
      byName.set(name.toLowerCase(), created);
    }
  }

  // Create matches, then submit each row as a result. moneyOwed (if present) is
  // per-string in the source data but the app's Payment feature is one amount per
  // player per match, so it's summed per player across the group and submitted once
  // per match, after all that match's results are in.
  let matchCount = 0;
  let resultCount = 0;
  let paymentCount = 0;
  for (const group of matchGroups.values()) {
    const match = await api("/matches", {
      method: "POST",
      body: JSON.stringify({ date: group.date, opponent: group.opponent, week: group.week, season: group.season }),
    });
    matchCount++;

    const owedByPlayer = new Map(); // playerId -> running total moneyOwed for this match
    for (const row of group.rows) {
      const player = byName.get(row.player.toLowerCase());
      await api(`/matches/${match.matchId}/results`, {
        method: "POST",
        body: JSON.stringify({
          playerId: player.playerId,
          stringNumber: Number(row.string),
          score: Number(row.score),
          strikes: Number(row.strikes),
          spares: Number(row.spares),
          tens: Number(row.tens),
          orangePinsLeft: Number(row.orangepinsleft),
        }),
      });
      resultCount++;

      const owed = Number(row.moneyowed || 0);
      if (owed > 0) {
        owedByPlayer.set(player.playerId, (owedByPlayer.get(player.playerId) ?? 0) + owed);
      }
    }

    for (const [playerId, amountPaid] of owedByPlayer) {
      // Round to cents — repeated float addition of values like 0.75 can drift
      // (e.g. 0.1 + 0.2 !== 0.3 in floating point).
      const rounded = Math.round(amountPaid * 100) / 100;
      await api(`/matches/${match.matchId}/payments`, {
        method: "POST",
        body: JSON.stringify({ playerId, amountPaid: rounded }),
      });
      paymentCount++;
    }

    console.log(
      `  Season ${group.season}, week ${group.week} vs ${group.opponent}: ${group.rows.length} results, ${owedByPlayer.size} payments`
    );
  }

  console.log(`\nDone. Created ${matchCount} matches, ${resultCount} results, and ${paymentCount} payments.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
