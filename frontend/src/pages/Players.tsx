import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Player } from "../api";
import BowlingHero from "../components/BowlingHero";

export default function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .listPlayers()
      .then((data) => setPlayers(data.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError(String(e)));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    await api.createPlayer(name);
    setName("");
    load();
  }

  return (
    <div>
      <BowlingHero title="Players" subtitle="Your team, on the lanes." compact />

      <form className="card" onSubmit={handleAdd}>
        <h2>➕ Add player</h2>
        <div className="form-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        </div>
        <button type="submit">Add</button>
      </form>

      {error && <p className="error">{error}</p>}

      {players.length === 0 && <p className="empty-state">No players yet — add your team above.</p>}

      <div className="card-grid">
        {players.map((p, i) => (
          <Link
            to={`/players/${p.playerId}`}
            key={p.playerId}
            className="entity-card"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="player-avatar">{p.name.charAt(0).toUpperCase()}</div>
            <div>
              <div className="entity-title">{p.name}</div>
              <div className="entity-sub">View stats →</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
