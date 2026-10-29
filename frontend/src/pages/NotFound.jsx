import React from "react";
import { Link } from "react-router-dom";
import "./NotFound.css";
import { enterDelay } from "../utils/scrollReveal";

const NotFound = () => {
  return (
    <main className="notfound-page">
      {/* Background glow effects */}
      <div className="notfound-glow" aria-hidden="true"></div>
      <div className="notfound-court-lines" aria-hidden="true"></div>

      {/* Main 404 Glass Card */}
      <div className="notfound-card">
        <span className="cv-section-badge" data-slot="eyebrow" data-enter>
          <span className="notfound-dot" aria-hidden="true"></span>
          SHOT CLOCK VIOLATION • 404
        </span>

        <div className="notfound-code" aria-hidden="true" data-enter style={enterDelay(1)}>
          <span className="notfound-digit">4</span>
          <div className="notfound-ball">
            <div className="notfound-seam-h"></div>
            <div className="notfound-seam-v"></div>
          </div>
          <span className="notfound-digit">4</span>
        </div>

        <h1 className="notfound-title" data-slot="display-heading" data-enter style={enterDelay(2)}>
          OUT OF <span className="text-ember">BOUNDS</span>
        </h1>
        <p className="notfound-description" data-slot="lead" data-enter style={enterDelay(3)}>
          The page or play you were looking for doesn't exist on the court.
          The possession has turned over.
        </p>

        {/* Links, not buttons: each one goes to a page, so it can be opened in a new tab. */}
        <nav className="notfound-actions" aria-label="Back to the site" data-enter style={enterDelay(4)}>
          <Link to="/" className="notfound-btn notfound-btn-primary">
            <span aria-hidden="true">←</span> RETURN TO COURT
          </Link>
          <Link to="/predictions" className="notfound-btn">
            AI PREDICTIONS
          </Link>
          <Link to="/games" className="notfound-btn">
            LIVE SLATE
          </Link>
        </nav>
      </div>
    </main>
  );
};

export default NotFound;
