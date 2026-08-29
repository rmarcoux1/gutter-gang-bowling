import { Routes, Route, Link, NavLink } from "react-router-dom";
import MatchList from "./pages/MatchList";
import MatchDetail from "./pages/MatchDetail";
import Players from "./pages/Players";
import PlayerStats from "./pages/PlayerStats";
import TeamOverview from "./pages/TeamOverview";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-emoji">🎳</span> Gutter Gang Bowling
        </Link>
        <nav>
          <NavLink to="/" end>
            Matches
          </NavLink>
          <NavLink to="/players">Players</NavLink>
          <NavLink to="/team">Team</NavLink>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<MatchList />} />
          <Route path="/matches/:matchId" element={<MatchDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:playerId" element={<PlayerStats />} />
          <Route path="/team" element={<TeamOverview />} />
        </Routes>
      </main>

      <footer className="app-footer">🎳 Powered by strikes, spares, and the occasional gutter ball.</footer>
    </div>
  );
}
