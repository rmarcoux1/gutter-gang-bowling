import { useEffect, useState } from "react";
import { api, Season } from "../api";

const CAREER_VALUE = "__career__";

interface SeasonSelectProps {
  // undefined means "Career (all-time)" — only meaningful when allowCareer is true
  value: string | undefined;
  onChange: (season: string | undefined) => void;
  // Show a "Career (all-time)" option. Default true. Set false where a season
  // is required (e.g. creating a match).
  allowCareer?: boolean;
  // Fires once after the first successful load, so a parent page can default
  // its selection to the current season without duplicating the fetch.
  onSeasonsLoaded?: (seasons: Season[], current: Season | null) => void;
  label?: string;
}

// Dropdown of seasons (newest first) with an inline "+ New season" mini-form,
// since there's no dedicated seasons-admin page — a season only needs to be
// created once at the start of a bowling year, right before the first match.
export default function SeasonSelect({
  value,
  onChange,
  allowCareer = true,
  onSeasonsLoaded,
  label = "Season",
}: SeasonSelectProps) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newSeasonId, setNewSeasonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(onLoaded?: (seasons: Season[]) => void) {
    api
      .listSeasons()
      .then((data) => {
        setSeasons(data);
        onLoaded?.(data);
        if (onSeasonsLoaded) {
          onSeasonsLoaded(data, data.find((s) => s.isCurrent) ?? null);
        }
      })
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddSeason(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!newSeasonId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSeason(newSeasonId.trim(), { makeCurrent: true });
      setNewSeasonId("");
      setAdding(false);
      load(() => onChange(created.seasonId));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (adding) {
    // Deliberately not a <form> — this renders inside other <form>s (the new
    // match / edit match cards), and a nested <form> is invalid HTML that
    // makes the browser mangle submit behavior (this was the "+ New season
    // doesn't work on the Matches page" bug). Plain button + Enter-to-submit
    // on the input gets the same UX without nesting.
    return (
      <div className="season-add-form">
        <label>
          New season id
          <input
            value={newSeasonId}
            onChange={(e) => setNewSeasonId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddSeason();
              }
            }}
            placeholder="2026-2027"
            autoFocus
          />
        </label>
        <div className="button-row">
          <button type="button" onClick={() => handleAddSeason()} disabled={busy || !newSeasonId.trim()}>
            {busy ? "Adding…" : "Add & use"}
          </button>
          <button type="button" className="ghost-button" onClick={() => setAdding(false)} disabled={busy}>
            Cancel
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <label className="season-select">
      {label}
      <span className="season-select-row">
        <select
          value={value ?? (allowCareer ? CAREER_VALUE : "")}
          onChange={(e) => onChange(e.target.value === CAREER_VALUE ? undefined : e.target.value)}
        >
          {allowCareer && <option value={CAREER_VALUE}>Career (all-time)</option>}
          {!seasons?.length && !allowCareer && (
            <option value="" disabled>
              No seasons yet
            </option>
          )}
          {(seasons ?? []).map((s) => (
            <option key={s.seasonId} value={s.seasonId}>
              {s.label}
              {s.isCurrent ? " (current)" : ""}
            </option>
          ))}
        </select>
        <button type="button" className="ghost-button season-add-button" onClick={() => setAdding(true)}>
          + New season
        </button>
      </span>
      {error && <p className="error">{error}</p>}
    </label>
  );
}
