const API_URL = import.meta.env.VITE_API_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

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
  playerStats: (playerId: string) => request<PlayerStats>(`/players/${playerId}/stats`),
  playerWeekly: (playerId: string) => request<WeeklyStat[]>(`/players/${playerId}/weekly`),
  teamSummary: () => request<TeamSummaryEntry[]>("/players/summary"),

  listMatches: () => request<Match[]>("/matches"),
  createMatch: (date: string, opponent: string, week: number) =>
    request<Match>("/matches", { method: "POST", body: JSON.stringify({ date, opponent, week }) }),
  getMatch: (matchId: string) =>
    request<{ match: Match; results: StringResult[] }>(`/matches/${matchId}`),
  updateMatch: (matchId: string, updates: Partial<Pick<Match, "date" | "opponent" | "week">>) =>
    request<Match>(`/matches/${matchId}`, { method: "PUT", body: JSON.stringify(updates) }),
  deleteMatch: (matchId: string) =>
    request<{ deleted: string; resultsDeleted: number }>(`/matches/${matchId}`, { method: "DELETE" }),

  submitResult: (matchId: string, result: Omit<StringResult, "matchId">) =>
    request<StringResult>(`/matches/${matchId}/results`, {
      method: "POST",
      body: JSON.stringify(result),
    }),
  deleteResult: (matchId: string, playerId: string, stringNumber: 1 | 2 | 3) =>
    request<{ deleted: true }>(`/matches/${matchId}/results/${playerId}/${stringNumber}`, {
      method: "DELETE",
    }),
};
