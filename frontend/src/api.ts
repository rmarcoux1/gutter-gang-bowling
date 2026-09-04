const API_URL = import.meta.env.VITE_API_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // If VITE_API_URL wasn't baked into this build (missing/blank env var on
  // Amplify, or a local .env that was never filled in), API_URL is "" and the
  // fetch below silently targets this same site instead of the API. Since
  // this is a client-routed SPA, that always 200s with index.html — and
  // res.json() on an HTML page fails with a cryptic
  // "Unexpected token '<' ... is not valid JSON" that gives no hint what
  // actually went wrong. Fail fast with a message that says so.
  if (!API_URL) {
    throw new Error(
      "VITE_API_URL is not set in this build — the app doesn't know where the API is, so every request would 404 back to this same page. " +
        "Set VITE_API_URL (and VITE_API_KEY) as environment variables in the Amplify app (or frontend/.env for local dev) and redeploy."
    );
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...options.headers,
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (!contentType.includes("application/json")) {
    // A 200 with no JSON body almost always means the request never reached
    // the API at all (wrong VITE_API_URL, a stale/incorrect ApiUrl value, or
    // the API route genuinely doesn't exist and something in front of it —
    // Amplify's SPA rewrite, a CDN — is serving index.html instead of a 404).
    const body = await res.text();
    throw new Error(
      `Expected a JSON response from ${path} but got "${contentType || "unknown"}" instead. ` +
        "This usually means VITE_API_URL is wrong (pointing at the site itself, not the API), or the backend hasn't been deployed with cdk deploy yet. " +
        `First 120 chars of the response: ${body.slice(0, 120)}`
    );
  }
  return res.json() as Promise<T>;
}

// Appends ?season=... when a season id is given; omit (or pass undefined) for
// the career/all-time view.
function withSeason(path: string, season?: string): string {
  return season ? `${path}?season=${encodeURIComponent(season)}` : path;
}

// Sentinel the Matches page groups under for matches with no real season
// (created before the seasons feature existed, or with a blank season from a
// bad edit/import) — there's no Season entity behind this id, but the
// backend's deleteSeason still accepts it and deletes those matches by their
// absent/blank `season` field instead of an exact match.
export const NO_SEASON_SENTINEL = "__no_season__";

export interface Player {
  playerId: string;
  name: string;
  joinedDate: string;
}

export interface Season {
  seasonId: string;
  label: string;
  startDate?: string;
  isCurrent: boolean;
}

export interface Match {
  matchId: string;
  date: string;
  opponent: string;
  week: number;
  season: string;
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
  season?: string;
}

export interface Payment {
  matchId: string;
  playerId: string;
  // Optional only for a handful of rows logged before payments were tracked
  // per string (2026-09) — every new payment always has one.
  stringNumber?: 1 | 2 | 3;
  amountPaid: number;
  season?: string;
}

export interface Fill {
  fillId: string;
  matchId: string;
  playerId: string;
  stringNumber: 1 | 2 | 3;
  fillType: "strike" | "spare";
  pins: number;
  season?: string;
}

export interface PlayerStats {
  playerId: string;
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
  // Highest single-string score ever logged, across every season — stays put
  // as a personal record regardless of which season is selected above.
  careerHighScore: number;
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
  handicap: number;
}

export interface TeamSummaryEntry extends PlayerStats {
  name: string;
}

export const api = {
  listPlayers: () => request<Player[]>("/players"),
  createPlayer: (name: string) =>
    request<Player>("/players", { method: "POST", body: JSON.stringify({ name }) }),
  updatePlayer: (playerId: string, name: string) =>
    request<Player>(`/players/${playerId}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deletePlayer: (playerId: string) =>
    request<{ deleted: string; resultsDeleted: number }>(`/players/${playerId}`, { method: "DELETE" }),
  // Pass a seasonId to scope stats to one season; omit for career/all-time.
  playerStats: (playerId: string, season?: string) =>
    request<PlayerStats>(withSeason(`/players/${playerId}/stats`, season)),
  playerWeekly: (playerId: string, season?: string) =>
    request<WeeklyStat[]>(withSeason(`/players/${playerId}/weekly`, season)),
  teamSummary: (season?: string) => request<TeamSummaryEntry[]>(withSeason("/players/summary", season)),

  listSeasons: () => request<Season[]>("/seasons"),
  currentSeason: () => request<Season | null>("/seasons/current"),
  createSeason: (seasonId: string, opts?: { label?: string; startDate?: string; makeCurrent?: boolean }) =>
    request<Season>("/seasons", { method: "POST", body: JSON.stringify({ seasonId, ...opts }) }),
  deleteSeason: (seasonId: string) =>
    request<{ deleted: string; matchesDeleted: number }>(`/seasons/${encodeURIComponent(seasonId)}`, {
      method: "DELETE",
    }),

  listMatches: () => request<Match[]>("/matches"),
  createMatch: (date: string, opponent: string, week: number, season: string) =>
    request<Match>("/matches", { method: "POST", body: JSON.stringify({ date, opponent, week, season }) }),
  getMatch: (matchId: string) =>
    request<{ match: Match; results: StringResult[]; payments: Payment[]; fills: Fill[] }>(`/matches/${matchId}`),
  updateMatch: (matchId: string, updates: Partial<Pick<Match, "date" | "opponent" | "week" | "season">>) =>
    request<Match>(`/matches/${matchId}`, { method: "PUT", body: JSON.stringify(updates) }),
  deleteMatch: (matchId: string) =>
    request<{ deleted: string; resultsDeleted: number }>(`/matches/${matchId}`, { method: "DELETE" }),

  submitResult: (matchId: string, result: Omit<StringResult, "matchId" | "season">) =>
    request<StringResult>(`/matches/${matchId}/results`, {
      method: "POST",
      body: JSON.stringify(result),
    }),
  deleteResult: (matchId: string, playerId: string, stringNumber: 1 | 2 | 3) =>
    request<{ deleted: true }>(`/matches/${matchId}/results/${playerId}/${stringNumber}`, {
      method: "DELETE",
    }),

  submitPayment: (matchId: string, playerId: string, stringNumber: 1 | 2 | 3, amountPaid: number) =>
    request<Payment>(`/matches/${matchId}/payments`, {
      method: "POST",
      body: JSON.stringify({ playerId, stringNumber, amountPaid }),
    }),
  // stringNumber omitted only when deleting a legacy pre-per-string payment
  // (see the Payment type comment above).
  deletePayment: (matchId: string, playerId: string, stringNumber?: 1 | 2 | 3) =>
    request<{ deleted: true }>(
      `/matches/${matchId}/payments/${playerId}${stringNumber ? `/${stringNumber}` : ""}`,
      { method: "DELETE" }
    ),

  submitFill: (matchId: string, fill: { playerId: string; stringNumber: 1 | 2 | 3; fillType: "strike" | "spare"; pins: number }) =>
    request<Fill>(`/matches/${matchId}/fills`, {
      method: "POST",
      body: JSON.stringify(fill),
    }),
  deleteFill: (matchId: string, playerId: string, fillId: string) =>
    request<{ deleted: true }>(`/matches/${matchId}/fills/${playerId}/${fillId}`, { method: "DELETE" }),
};
