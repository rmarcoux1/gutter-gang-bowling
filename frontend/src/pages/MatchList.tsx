import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Match } from "../api";
import BowlingHero from "../components/BowlingHero";
import BowlingLoader from "../components/BowlingLoader";

export default function MatchList() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [week, setWeek] = useState("");

  function load() {
    setLoading(true);
    api
      .listMatches()
      .then((data) => setMatches(data.sort((a, b) => b.week - a.week)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !opponent || !week) return;
    await api.createMatch(date, opponent, Number(week));
    setDate("");
    setOpponent("");
    setWeek("");
    load();
  }

  return (
    <div>
      <BowlingHero title="Gutter Gang Bowling" subtitle="Every strike, spare, and gutter ball — tracked." />

      <form className="card" onSubmit={handleCreate}>
        <h2>✨ New match</h2>
        <div className="form-row">
          <label>
            Week
            <input value={week} onChange={(e) => setWeek(e.target.value)} type="number" min={1} required />
          </label>
          <label>
            Date
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required />
          </label>
          <label>
            Opponent
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} type="text" required />
          </label>
        </div>
        <button type="submit">Create match</button>
      </form>

      {loading && <BowlingLoader label="Loading matches…" />}
      {error && <p className="error">{error}</p>}

      {!loading && matches.length > 0 && <h2 style={{ marginTop: "1.75rem" }}>🎳 This season</h2>}

      {!loading && matches.length === 0 && (
        <p className="empty-state">No matches yet — create this week's above to get started.</p>
      )}

      <div className="card-grid">
        {matches.map((m, i) => (
          <Link
            to={`/matches/${m.matchId}`}
            key={m.matchId}
            className="entity-card"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="week-badge">
              <span className="num">{m.week}</span>
              <span className="label">Week</span>
            </div>
            <div>
              <div className="entity-title">vs {m.opponent}</div>
              <div className="entity-sub">{m.date}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
