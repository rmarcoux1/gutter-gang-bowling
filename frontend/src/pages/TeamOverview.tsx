import { useEffect, useState } from "react";
import { api, TeamSummaryEntry } from "../api";
import RankingBarChart from "../components/RankingBarChart";
import BowlingHero from "../components/BowlingHero";
import BowlingLoader from "../components/BowlingLoader";
import SeasonSelect from "../components/SeasonSelect";

export default function TeamOverview() {
  const [summary, setSummary] = useState<TeamSummaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<string | undefined>(undefined);
  const [defaultedSeason, setDefaultedSeason] = useState(false);

  useEffect(() => {
    setSummary(null);
    api.teamSummary(season).then(setSummary).catch((e) => setError(String(e)));
  }, [season]);

  return (
    <div>
      <BowlingHero title="Team overview" subtitle="Who's carrying the team this season." compact />

      <SeasonSelect
        value={season}
        onChange={setSeason}
        allowCareer
        onSeasonsLoaded={(_seasons, current) => {
          if (!defaultedSeason) {
            setDefaultedSeason(true);
            if (current) setSeason(current.seasonId);
          }
        }}
      />

      {error && <p className="error">{error}</p>}
      {!summary && !error && <BowlingLoader label="Loading team stats…" />}

      {summary && (() => {
        const withGames = summary.filter((s) => s.stringsPlayed > 0);
        return withGames.length === 0 ? (
          <p className="empty-state">No results logged yet for this scope — once matches are in, the team ranks show up here.</p>
        ) : (
          <div className="charts-grid">
            <RankingBarChart
              title="Handicap by player"
              items={withGames.map((s) => ({ label: s.name, value: s.handicap }))}
            />
            <RankingBarChart
              title="Total strikes by player"
              items={withGames.map((s) => ({ label: s.name, value: s.totalStrikes }))}
            />
            <RankingBarChart
              title="Total tens by player"
              items={withGames.map((s) => ({ label: s.name, value: s.totalTens }))}
            />
            <RankingBarChart
              title="Total spares by player"
              items={withGames.map((s) => ({ label: s.name, value: s.totalSpares }))}
            />
            <RankingBarChart
              title="Total orange pins left by player"
              items={withGames.map((s) => ({ label: s.name, value: s.totalOrangePinsLeft }))}
            />
            <RankingBarChart
              title="Total paid by player"
              items={withGames.map((s) => ({ label: s.name, value: Math.round(s.totalPaid * 100) / 100 }))}
              valuePrefix="$"
            />
            <RankingBarChart
              title="Average strike fill by player"
              items={withGames.filter((s) => s.strikeFillsLogged > 0).map((s) => ({ label: s.name, value: s.averageStrikeFill }))}
            />
            <RankingBarChart
              title="Average spare fill by player"
              items={withGames.filter((s) => s.spareFillsLogged > 0).map((s) => ({ label: s.name, value: s.averageSpareFill }))}
            />
          </div>
        );
      })()}
    </div>
  );
}
