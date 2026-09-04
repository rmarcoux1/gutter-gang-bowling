export interface Player {
  playerId: string;
  name: string;
  joinedDate: string;
}

// A season is just an id ("2025-2026") plus a friendly label and whether it's
// the one new matches default into. Matches/results carry `season` so stats
// can be scoped to one season or rolled up across all of them (career).
export interface Season {
  seasonId: string; // e.g. "2025-2026" — also the sort/display key
  label: string; // usually same as seasonId, but editable
  startDate?: string;
  isCurrent: boolean;
}

export interface Match {
  matchId: string;
  date: string;
  opponent: string;
  week: number;
  season: string; // Season.seasonId
}

export interface StringResult {
  matchId: string;
  playerId: string;
  stringNumber: 1 | 2 | 3;
  score: number;
  strikes: number;
  spares: number;
  tens: number;
  orangePinsLeft: number;
  // Denormalized from the match at write time so per-player weekly stats
  // don't require a join back to MATCH#<id>/METADATA for every result.
  week?: number;
  matchDate?: string;
  season?: string;
}

// One bowler's dues/payment for one string of one match. At most one payment
// item per (matchId, playerId, stringNumber) — resubmitting the same trio
// overwrites the amount, same as how results work. Originally this was one
// payment per (matchId, playerId) — i.e. per week, not per string — but that
// meant logging an amount on string 2 silently overwrote whatever was
// logged on string 1, so a week's real total (e.g. side-bet money owed per
// string) only ever reflected the last string entered. `stringNumber` is
// optional only so a handful of pre-2026-09 payment rows written before this
// change (no stringNumber at all) don't break existing reads — they're
// still included in a player's totalPaid sum, just not attributable to a
// specific string in the per-match breakdown UI.
export interface Payment {
  matchId: string;
  playerId: string;
  stringNumber?: 1 | 2 | 3;
  amountPaid: number;
  week?: number;
  matchDate?: string;
  season?: string;
}

// One fill: the pins knocked down on the bonus ball(s) after a single strike
// or spare mark. Unlike results/payments there can be several of these per
// string (e.g. two strikes in one string = two strike-fill entries), so each
// gets its own id rather than being keyed by (match, player, string).
export interface Fill {
  fillId: string;
  matchId: string;
  playerId: string;
  stringNumber: 1 | 2 | 3;
  fillType: "strike" | "spare";
  pins: number;
  week?: number;
  matchDate?: string;
  season?: string;
}

export interface WeeklyStat {
  week: number;
  date: string;
  stringsPlayed: number;
  averageScore: number;
  totalStrikes: number;
  totalSpares: number;
  totalTens: number;
  totalOrangePinsLeft: number;
  totalPaid: number;
  strikeFillsLogged: number;
  averageStrikeFill: number;
  spareFillsLogged: number;
  averageSpareFill: number;
  // Running average through and including this week — this IS the handicap
  // number, since handicap here is defined as total score / games played.
  // Resets to 0 at the start of each season (running average is computed
  // only over the results in the selected season, or across all of them
  // when no season filter is applied).
  handicap: number;
}

export interface PlayerStatsSummary {
  playerId: string;
  name?: string;
  stringsPlayed: number;
  averageScore: number;
  handicap: number;
  totalStrikes: number;
  totalSpares: number;
  totalTens: number;
  totalOrangePinsLeft: number;
  totalPaid: number;
  strikeFillsLogged: number;
  averageStrikeFill: number;
  spareFillsLogged: number;
  averageSpareFill: number;
  // Highest single-string score ever logged, across all seasons — unaffected
  // by whichever season the rest of this summary is scoped to (see
  // careerHighScoreOf in handlers/players.ts).
  careerHighScore: number;
}
