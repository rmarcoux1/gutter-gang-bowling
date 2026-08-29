import { useEffect, useState } from "react";
import { api, TeamSummaryEntry } from "../api";
import RankingBarChart from "../components/RankingBarChart";
import BowlingHero from "../components/BowlingHero";
import BowlingLoader from "../components/BowlingLoader";

export default function TeamOverview() {
  const [summary, setSummary] = useState<TeamSummaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.teamSummary().then(setSummary).catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <BowlingHero title="Team overview" subtitle="Who's carrying the team this season." compact />

      {error && <p className="error">{error}</p>}
      {!summary && !error && <BowlingLoader label="Loading team stats…" />}

      {summary && (() => {
        const withGames = summary.filter((s) => s.stringsPlayed > 0);
        return withGames.length === 0 ? (
          <p className="empty-state">No results logged yet — once matches are in, the team ranks show up here.</p>
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
                title="Total spares by player"
                items={withGames.map((s) => ({ label: s.name, value: s.totalSpares }))}
            />
            <RankingBarChart
              title="Total tens by player"
              items={withGames.map((s) => ({ label: s.name, value: s.totalTens }))}
            />
            <RankingBarChart
                title="Total orange pins by player"
                items={withGames.map((s) => ({ label: s.name, value: s.totalOrangePinsLeft }))}
            />
          </div>
        );
      })()}
    </div>
  );
}
