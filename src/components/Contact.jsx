import { Link } from "react-router-dom";
import "./Contact.css";

const LinkedInIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.45 3H3.55A.55.55 0 0 0 3 3.55v16.9c0 .3.25.55.55.55h16.9c.3 0 .55-.25.55-.55V3.55A.55.55 0 0 0 20.45 3ZM8.34 18.34H5.67V9.75h2.67v8.59ZM7 8.58a1.55 1.55 0 1 1 0-3.1 1.55 1.55 0 0 1 0 3.1Zm11.35 9.76h-2.66v-4.18c0-1 0-2.29-1.4-2.29-1.4 0-1.61 1.09-1.61 2.22v4.25H10V9.75h2.56v1.17h.04c.36-.67 1.23-1.39 2.54-1.39 2.71 0 3.21 1.78 3.21 4.1v4.71Z" />
  </svg>
);

function Contact() {
  return (
    <main className="contact-page">
      <div className="contact-ambient contact-ambient-one" />
      <div className="contact-ambient contact-ambient-two" />

      <header className="contact-header">
        <div className="stats-nav-top">
          <Link to="/" className="back-to-home">← HOME</Link>
          <span className="cv-section-badge">DEVELOPMENT INTEL</span>
        </div>
      </header>

      <section className="contact-hero" aria-labelledby="contact-title">
        <h1 id="contact-title">THE ARCHITECTS BEHIND <span className="text-ember">COURT VISION</span></h1>
        <p className="contact-intro">
          Transforming raw NBA tracking telemetry into actionable neural forecasting. Meet the engineers engineering the platform.
        </p>
      </section>

      <section className="contact-project-card" aria-label="Court-Vision project contact">
        <div className="contact-project-orb">✦</div>
        <div>
          <p className="contact-label">PROJECT CONTACT</p>
          <h2>Let&apos;s build what&apos;s next.</h2>
          <p>For project updates, collaboration, and future opportunities, find Court-Vision at:</p>
        </div>
        <a className="contact-domain" href="https://courtvision.works" target="_blank" rel="noreferrer">
          <span>courtvision.works</span>
          <small>Launching soon</small>
        </a>
      </section>

      <section className="contact-team" aria-labelledby="team-title">
        <div className="contact-section-heading">
          <p className="contact-eyebrow">OUR TEAM</p>
          <h2 id="team-title">The people behind the platform.</h2>
        </div>

        <div className="contact-team-grid">
          <article className="team-card team-card-featured">
            <div className="team-card-topline">
              <div className="team-initials">MD</div>
              <span className="team-status"><i /> Available to connect</span>
            </div>
            <div className="team-card-content">
              <p className="contact-label">BACKEND &amp; ML</p>
              <h3>Mohan Dixit</h3>
              <p className="team-role">Backend/ML Developer</p>
              <p className="team-bio">
                Mohan develops the data pipelines, prediction systems, and production infrastructure
                that turn live NBA information into useful basketball insight.
              </p>
              <div className="team-skills" aria-label="Mohan's focus areas">
                <span>Python</span>
                <span>PyTorch</span>
                <span>XGBoost</span>
              </div>
            </div>
            <a
              className="team-linkedin"
              href="https://www.linkedin.com/in/mohan-dixit-6396922b5/"
              target="_blank"
              rel="noreferrer"
            >
              <LinkedInIcon /> Connect on LinkedIn <span aria-hidden="true">↗</span>
            </a>
          </article>

          <article className="team-card team-card-featured">
            <div className="team-card-topline">
              <div className="team-initials">VU</div>
              <span className="team-status"><i /> Available to connect</span>
            </div>
            <div className="team-card-content">
              <p className="contact-label">BACKEND &amp; FRONTEND</p>
              <h3>Varun Uday</h3>
              <p className="team-role">Backend Developer</p>
              <p className="team-bio">
                Varun develops and maintains the Flask API layer, real-time NBA telemetry ingestion pipelines, and
                prediction-serving endpoints that power Court Vision's live outcome forecasts.
              </p>
              <div className="team-skills" aria-label="Varun's focus areas">
                <span>Flask &amp; REST APIs</span>
                <span>Scikit-Learn</span>
                <span>Pandas &amp; NumPy</span>
                <span>SQLite</span>
              </div>
            </div>
            <a
              className="team-linkedin"
              href="https://www.linkedin.com/in/varunuday"
              target="_blank"
              rel="noreferrer"
            >
              <LinkedInIcon /> Connect on LinkedIn <span aria-hidden="true">↗</span>
            </a>
          </article>
        </div>
      </section>

      <footer className="contact-footer">
        <span>COURT VISION</span>
        <span>NBA analytics, made clear.</span>
      </footer>
    </main>
  );
}

export default Contact;
