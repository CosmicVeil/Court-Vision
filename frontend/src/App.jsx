import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Stats from "./pages/Stats.jsx";
import Recommendations from "./pages/Recommendations.jsx";
import Favourites from "./pages/Favourites.jsx";
import Login from "./pages/Login.jsx";
import SignUp from "./pages/SignUp.jsx";
import LiveGames from "./pages/LiveGames.jsx";
import LiveGameDetail from "./pages/LiveGameDetail.jsx";
import RecommendationChart from "./pages/RecommendationChart.jsx";
import Predictions from "./pages/Predictions.jsx";
import Contact from "./pages/Contact.jsx";
import Privacy from "./pages/Privacy.jsx";
import NotFound from "./pages/NotFound.jsx";
import AppShell from "./components/AppShell.jsx";


function App() {
  return (
    <Router>
      <Routes>
        {/* Layout route: every page renders inside AppShell, below the shared header. */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/favourites" element={<Favourites />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create-account" element={<SignUp />} />
          <Route path="/games" element={<LiveGames />} />
          <Route path="/games/:gameId" element={<LiveGameDetail />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="/recommendations/:stat"
            element={<RecommendationChart />}
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
