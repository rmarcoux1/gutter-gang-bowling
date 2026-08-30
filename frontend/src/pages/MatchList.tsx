import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Match, NO_SEASON_SENTINEL } from "../api";
import BowlingHero from "../components/BowlingHero";
import BowlingLoader from "../components/BowlingLoader";
import SeasonSelect from "../components/SeasonSelect";

export default function MatchList() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [week, setWeek] = useState("");
  const [season, setSeason] = useState<string | undefined>(undefined);

  // Collapsed-season UI state. Populated lazily the first time we see the
  // season list, so every season but the most recent starts collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [initializedCollapse, setInitializedCollapse] = useState(false);
  const [confirmingDeleteSeason, setConfirmingDeleteSeason] = useState<string | null>(null);
  const [deletingSeason, setDeletingSeason] = useState(false);
  const [seasonError, setSeasonError] = useState<string | null>(null);

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
    if (!date || !opponent || !week || !season) return;
    await api.createMatch(date, opponent, Number(week), season);
    setDate("");
    setOpponent("");
    setWeek("");
    load();
  }

  async function handleDeleteSeason(seasonId: string) {
    setDeletingSeason(true);
    setSeasonError(null);
    try {
      await api.deleteSeason(seasonId);
      setConfirmingDeleteSeason(null);
      load();
    } catch (e) {
      setSeasonError(String(e));
    } finally {
      setDeletingSeason(false);
    }
  }

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Group matches by season, newest season first, weeks descending within each.
  // Any match with no season, or a blank one (from before the seasons feature,
  // or a bad edit/import), lands in one shared "no season" bucket — there's no
  // real Season entity behind NO_SEASON_SENTINEL, so it's handled specially
  // on delete (see handleDeleteSeason).
  const bySeason = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.season && m.season.trim() ? m.season : NO_SEASON_SENTINEL;
    const list = bySeason.get(key) ?? [];
    list.push(m);
    bySeason.set(key, list);
  }
  const seasonKeys = [...bySeason.keys()].sort((a, b) => {
    if (a === NO_SEASON_SENTINEL) return 1;
    if (b === NO_SEASON_SENTINEL) return -1;
    return b.localeCompare(a);
  });
  const seasonLabel = (key: string) => (key === NO_SEASON_SENTINEL ? "Unknown season" : key);

  if (!initializedCollapse && seasonKeys.length > 0) {
    setInitializedCollapse(true);
    setCollapsed(new Set(seasonKeys.slice(1))); // all but the most recent start collapsed
  }

  return (
    <div>
      <BowlingHero title="Gutter Gang Bowling" subtitle="Perfection starts with balls." />

      <form className="card" onSubmit={handleCreate}>
        <h2>✨ New match</h2>
        <SeasonSelect
          value={season}
          onChange={setSeason}
          allowCareer={false}
          label="Season"
          onSeasonsLoaded={(_seasons, current) => {
            if (!season && current) setSeason(current.seasonId);
          }}
        />
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
        <button type="submit" disabled={!season}>
          Create match
        </button>
      </form>

      {loading && <BowlingLoader label="Loading matches…" />}
      {error && <p className="error">{error}</p>}
      {seasonError && <p className="error">{seasonError}</p>}

      {!loading && matches.length === 0 && (
        <p className="empty-state">No matches yet — create this week's above to get started.</p>
      )}

      {!loading &&
        seasonKeys.map((key) => {
          const isCollapsed = collapsed.has(key);
          const seasonMatches = bySeason.get(key)!;
          const confirming = confirmingDeleteSeason === key;
          return (
            <div key={key}>
              <div className="season-group-heading">
                <button
                  type="button"
                  className="season-group-toggle"
                  onClick={() => toggleCollapsed(key)}
                  aria-expanded={!isCollapsed}
                >
                  <span className={`chevron${isCollapsed ? " collapsed" : ""}`}>▾</span>
                  <h2>🎳 {seasonLabel(key)}</h2>
                  <span className="muted">
                    {seasonMatches.length} match{seasonMatches.length === 1 ? "" : "es"}
                  </span>
                </button>
                {!confirming ? (
                  <button
                    type="button"
                    className="ghost-button danger-text season-delete-button"
                    onClick={() => setConfirmingDeleteSeason(key)}
                  >
                    Delete season
                  </button>
                ) : (
                  <span className="row-confirm">
                    <button
                      type="button"
                      className="danger-button row-action"
                      disabled={deletingSeason}
                      onClick={() => handleDeleteSeason(key)}
                    >
                      {deletingSeason ? "Deleting…" : `Confirm — deletes ${seasonMatches.length} match${seasonMatches.length === 1 ? "" : "es"}`}
                    </button>
                    <button
                      type="button"
                      className="ghost-button row-action"
                      disabled={deletingSeason}
                      onClick={() => setConfirmingDeleteSeason(null)}
                    >
                      Cancel
                    </button>
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <div className="card-grid">
                  {seasonMatches.map((m, i) => (
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
              )}
            </div>
          );
        })}
    </div>
  );
}
