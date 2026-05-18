import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/home.jsx";
import Stats from "./components/Stats.jsx";
import Recommendations from "./components/Recommendations.jsx";
import Favourites from "./components/Favourites.jsx";
import Login from "./components/Login.jsx";
import SignUp from "./components/SignUp.jsx";
import LiveGames from "./components/LiveGames.jsx"; // adjust path
import RecommendationChart from "./components/RecommendationChart.jsx";
import Predictions from "./components/Predictions.jsx";


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/stats" element={<Stats/>} />
        <Route path="/recommendations" element={<Recommendations/>} />
        <Route path="/favourites" element={<Favourites/>} />
        <Route path="/login" element={<Login/>} />
        <Route path="/create-account" element={<SignUp/>} />
        <Route path="/games" element={<LiveGames />} />
        <Route path="/predictions" element={<Predictions />} />
        <Route
          path="/recommendations/:stat"
          element={<RecommendationChart />}
        />
      </Routes>
    </Router>
  );
}

export default App;
