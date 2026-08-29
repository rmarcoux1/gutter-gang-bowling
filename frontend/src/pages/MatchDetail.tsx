import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Match, Player, StringResult } from "../api";
import { fireConfetti } from "../lib/confetti";
import BowlingHero from "../components/BowlingHero";
import BowlingLoader from "../components/BowlingLoader";

const STRINGS: (1 | 2 | 3)[] = [1, 2, 3];

const emptyForm = {
  playerId: "",
  stringNumber: 1 as 1 | 2 | 3,
  score: "",
  strikes: "",
  spares: "",
  tens: "",
  orangePinsLeft: "",
};

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<Match | null>(null);
  const [results, setResults] = useState<StringResult[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ date: "", opponent: "", week: "" });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingResultKey, setConfirmingResultKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!matchId) return;
    api
      .getMatch(matchId)
      .then(({ match, results }) => {
        setMatch(match);
        setResults(results as StringResult[]);
      })
      .catch((e) => setError(String(e)));
  }

  useEffect(load, [matchId]);
  useEffect(() => {
    api.listPlayers().then(setPlayers).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (match) {
      setEditForm({ date: match.date, opponent: match.opponent, week: String(match.week) });
    }
  }, [match]);

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId) return;
    setBusy(true);
    try {
      await api.updateMatch(matchId, {
        date: editForm.date,
        opponent: editForm.opponent,
        week: Number(editForm.week),
      });
      setEditing(false);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMatch() {
    if (!matchId) return;
    setBusy(true);
    try {
      await api.deleteMatch(matchId);
      navigate("/");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  async function handleDeleteResult(playerId: string, stringNumber: 1 | 2 | 3) {
    if (!matchId) return;
    setBusy(true);
    try {
      await api.deleteResult(matchId, playerId, stringNumber);
      setConfirmingResultKey(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId || !form.playerId) return;

    const strikes = Number(form.strikes);
    const tens = Number(form.tens);

    await api.submitResult(matchId, {
      playerId: form.playerId,
      stringNumber: form.stringNumber,
      score: Number(form.score),
      strikes,
      spares: Number(form.spares),
      tens,
      orangePinsLeft: Number(form.orangePinsLeft),
    });

    // Celebrate a strike or a ten getting logged.
    if (strikes > 0 || tens > 0) {
      fireConfetti();
    }

    setForm({ ...emptyForm, playerId: form.playerId, stringNumber: form.stringNumber });
    load();
  }

  const playerName = (id: string) => players.find((p) => p.playerId === id)?.name ?? id;

  if (error) return <p className="error">{error}</p>;
  if (!match) return <BowlingLoader label="Loading match…" />;

  const sortedResults = [...results].sort(
    (a, b) => a.playerId.localeCompare(b.playerId) || a.stringNumber - b.stringNumber
  );

  return (
    <div>
      <BowlingHero title={`Week ${match.week}`} subtitle={`vs ${match.opponent}`} compact />

      {editing ? (
        <form className="card" onSubmit={handleSaveEdit}>
          <h2>✏️ Edit match</h2>
          <div className="form-row">
            <label>
              Week
              <input
                type="number"
                min={1}
                value={editForm.week}
                onChange={(e) => setEditForm({ ...editForm, week: e.target.value })}
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                required
              />
            </label>
            <label>
              Opponent
              <input
                type="text"
                value={editForm.opponent}
                onChange={(e) => setEditForm({ ...editForm, opponent: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="button-row">
            <button type="submit" disabled={busy}>
              Save changes
            </button>
            <button type="button" className="ghost-button" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="page-title-row" style={{ marginTop: "-0.75rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            {match.date}
          </p>
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete match
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="card confirm-card">
          <p>
            Delete week {match.week} vs {match.opponent}? This permanently deletes{" "}
            <strong>{results.length} logged result{results.length === 1 ? "" : "s"}</strong> for this match too.
            This can't be undone.
          </p>
          <div className="button-row">
            <button type="button" className="danger-button" onClick={handleDeleteMatch} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete it"}
            </button>
            <button type="button" className="ghost-button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <h2>🎳 Log a string result</h2>
        <div className="form-row">
          <label>
            Bowler
            <select
              value={form.playerId}
              onChange={(e) => setForm({ ...form, playerId: e.target.value })}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            String
            <select
              value={form.stringNumber}
              onChange={(e) => setForm({ ...form, stringNumber: Number(e.target.value) as 1 | 2 | 3 })}
            >
              {STRINGS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Score
            <input
              type="number"
              min={0}
              value={form.score}
              onChange={(e) => setForm({ ...form, score: e.target.value })}
              required
            />
          </label>
          <label>
            Strikes
            <input
              type="number"
              min={0}
              value={form.strikes}
              onChange={(e) => setForm({ ...form, strikes: e.target.value })}
              required
            />
          </label>
          <label>
            Spares
            <input
              type="number"
              min={0}
              value={form.spares}
              onChange={(e) => setForm({ ...form, spares: e.target.value })}
              required
            />
          </label>
          <label>
            Tens
            <input
              type="number"
              min={0}
              value={form.tens}
              onChange={(e) => setForm({ ...form, tens: e.target.value })}
              required
            />
          </label>
          <label>
            Orange pins left
            <input
              type="number"
              min={0}
              value={form.orangePinsLeft}
              onChange={(e) => setForm({ ...form, orangePinsLeft: e.target.value })}
              required
            />
          </label>
        </div>
        <button type="submit">Save result 🎉</button>
      </form>

      <h2 style={{ marginTop: "2rem" }}>Results so far</h2>

      {sortedResults.length === 0 ? (
        <p className="empty-state">No results logged yet for this match.</p>
      ) : (
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Bowler</th>
                <th>String</th>
                <th>Score</th>
                <th>Marks</th>
                <th>Orange left</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((r) => {
                const key = `${r.playerId}-${r.stringNumber}`;
                const confirming = confirmingResultKey === key;
                return (
                  <tr key={key}>
                    <td>{playerName(r.playerId)}</td>
                    <td>{r.stringNumber}</td>
                    <td>
                      <strong>{r.score}</strong>
                    </td>
                    <td>
                      {r.strikes > 0 && <span className="badge strike">🔥 {r.strikes}X</span>}{" "}
                      {r.spares > 0 && <span className="badge spare">／ {r.spares}</span>}{" "}
                      {r.tens > 0 && <span className="badge ten">💯 {r.tens}</span>}
                      {r.strikes === 0 && r.spares === 0 && r.tens === 0 && (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{r.orangePinsLeft}</td>
                    <td>
                      {confirming ? (
                        <span className="row-confirm">
                          <button
                            type="button"
                            className="danger-button row-action"
                            disabled={busy}
                            onClick={() => handleDeleteResult(r.playerId, r.stringNumber)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="ghost-button row-action"
                            disabled={busy}
                            onClick={() => setConfirmingResultKey(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="ghost-button row-action"
                          onClick={() => setConfirmingResultKey(key)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
