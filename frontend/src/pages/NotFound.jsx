import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "./NotFound.css";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="notfound-container">
      {/* Background glow effects */}
      <div className="notfound-glow"></div>
      <div className="notfound-court-lines"></div>

      {/* Floating Header */}
      <header className="header">
        <div className="header-left">
          <Link to="/" className="header-title">COURT VISION</Link>
        </div>
        <nav className="header-nav">
          <Link to="/">HOME</Link>
          <Link to="/games">LIVE GAMES</Link>
          <Link to="/stats">STATS</Link>
          <Link to="/predictions">PREDICTIONS</Link>
          <Link to="/recommendations">AI RADAR</Link>
        </nav>
      </header>

      {/* Main 404 Glass Card */}
      <main className="notfound-content">
        <div className="notfound-card">
          <div className="notfound-badge">
            <span className="badge-dot"></span>
            SHOT CLOCK VIOLATION • 404
          </div>

          <div className="notfound-code-container">
            <span className="notfound-digit">4</span>
            <div className="notfound-ball-icon">
              <div className="ball-seam-h"></div>
              <div className="ball-seam-v"></div>
            </div>
            <span className="notfound-digit">4</span>
          </div>

          <h1 className="notfound-title">OUT OF BOUNDS</h1>
          <p className="notfound-description">
            The page or play you were looking for doesn't exist on the court. 
            The possession has turned over.
          </p>

          <div className="notfound-actions">
            <button 
              className="notfound-btn primary" 
              onClick={() => navigate("/")}
            >
              ← RETURN TO COURT
            </button>
            <button 
              className="notfound-btn secondary" 
              onClick={() => navigate("/predictions")}
            >
              AI PREDICTIONS
            </button>
            <button 
              className="notfound-btn secondary" 
              onClick={() => navigate("/games")}
            >
              LIVE SLATE
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
