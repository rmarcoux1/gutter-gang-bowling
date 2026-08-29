export interface Player {
  playerId: string;
  name: string;
  joinedDate: string;
}

export interface Match {
  matchId: string;
  date: string;
  opponent: string;
  week: number;
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
  // Running average through and including this week — this IS the handicap
  // number, since handicap here is defined as total score / games played.
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
}
