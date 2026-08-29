import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Player, PlayerStats as Stats, WeeklyStat } from "../api";
import { useCountUp } from "../hooks/useCountUp";
import LineChart from "../components/LineChart";
import GroupedBarChart from "../components/GroupedBarChart";
import { CHART_COLORS } from "../lib/chartColors";
import BowlingHero from "../components/BowlingHero";
import BowlingLoader from "../components/BowlingLoader";

export default function PlayerStats() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<WeeklyStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    api.playerStats(playerId).then(setStats).catch((e) => setError(String(e)));
    api.playerWeekly(playerId).then(setWeekly).catch((e) => setError(String(e)));
    api
      .listPlayers()
      .then((all) => setPlayer(all.find((p) => p.playerId === playerId) ?? null))
      .catch((e) => setError(String(e)));
  }, [playerId]);

  useEffect(() => {
    if (player) setNameInput(player.name);
  }, [player]);

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId || !nameInput.trim()) return;
    setBusy(true);
    try {
      const updated = await api.updatePlayer(playerId, nameInput.trim());
      setPlayer(updated);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!playerId) return;
    setBusy(true);
    try {
      await api.deletePlayer(playerId);
      navigate("/players");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!stats) return <BowlingLoader label="Loading player stats…" />;

  const labels = (weekly ?? []).map((w) => `Wk ${w.week}`);

  return (
    <div>
      <BowlingHero title={player?.name ?? "Player"} subtitle="Season stats & progress" compact />

      {editing ? (
        <form className="card" onSubmit={handleSaveEdit}>
          <h2>✏️ Edit player</h2>
          <div className="form-row">
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} required />
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
        <div className="button-row" style={{ marginBottom: "1rem" }}>
          <button type="button" className="ghost-button" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>
            Delete player
          </button>
        </div>
      )}

      {confirmingDelete && (
        <div className="card confirm-card">
          <p>
            Delete <strong>{player?.name}</strong>? This permanently deletes{" "}
            <strong>
              {stats.stringsPlayed} logged result{stats.stringsPlayed === 1 ? "" : "s"}
            </strong>{" "}
            of theirs across every match. This can't be undone.
          </p>
          <div className="button-row">
            <button type="button" className="danger-button" onClick={handleDelete} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete it"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ marginTop: "1.25rem" }}>
        <Stat label="Strings played" value={stats.stringsPlayed} />
        <Stat label="Handicap" value={stats.handicap} decimals={1} accent big />
        <Stat label="Average score" value={stats.averageScore} decimals={1} accent />
        <Stat label="Total strikes" value={stats.totalStrikes} />
        <Stat label="Total spares" value={stats.totalSpares} />
        <Stat label="Total tens" value={stats.totalTens} />
        <Stat label="Orange pins left" value={stats.totalOrangePinsLeft} />
      </div>

      <h2 style={{ marginTop: "2rem" }}>📈 Progress over the season</h2>
      <div className="charts-grid">
        <LineChart
          title="Weekly average vs. running handicap"
          labels={labels}
          series={[
            { name: "Weekly average", color: CHART_COLORS.blue, values: (weekly ?? []).map((w) => w.averageScore) },
            { name: "Handicap (running avg)", color: CHART_COLORS.orange, values: (weekly ?? []).map((w) => w.handicap) },
          ]}
        />
        <GroupedBarChart
          title="Strikes, spares & tens by week"
          labels={labels}
          series={[
            { name: "Strikes", color: CHART_COLORS.orange, values: (weekly ?? []).map((w) => w.totalStrikes) },
            { name: "Spares", color: CHART_COLORS.blue, values: (weekly ?? []).map((w) => w.totalSpares) },
            { name: "Tens", color: CHART_COLORS.aqua, values: (weekly ?? []).map((w) => w.totalTens) },
          ]}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  decimals = 0,
  accent = false,
  big = false,
}: {
  label: string;
  value: number;
  decimals?: number;
  accent?: boolean;
  big?: boolean;
}) {
  const animated = useCountUp(value);
  return (
    <div className={`stat-tile${accent ? " accent-orange" : ""}${big ? " stat-tile-big" : ""}`}>
      <div className="stat-value">{animated.toFixed(decimals)}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
