import { Link } from "react-router-dom";
import "./Contact.css";
import PageHero from "../components/PageHero";
import { enterDelay } from "../utils/scrollReveal";

const LinkedInIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.45 3H3.55A.55.55 0 0 0 3 3.55v16.9c0 .3.25.55.55.55h16.9c.3 0 .55-.25.55-.55V3.55A.55.55 0 0 0 20.45 3ZM8.34 18.34H5.67V9.75h2.67v8.59ZM7 8.58a1.55 1.55 0 1 1 0-3.1 1.55 1.55 0 0 1 0 3.1Zm11.35 9.76h-2.66v-4.18c0-1 0-2.29-1.4-2.29-1.4 0-1.61 1.09-1.61 2.22v4.25H10V9.75h2.56v1.17h.04c.36-.67 1.23-1.39 2.54-1.39 2.71 0 3.21 1.78 3.21 4.1v4.71Z" />
  </svg>
);

function Contact() {
  return (
    <main className="contact-page">
      <div className="contact-ambient contact-ambient-one" aria-hidden="true" />
      <div className="contact-ambient contact-ambient-two" aria-hidden="true" />

      <div className="contact-shell">
        <PageHero
          eyebrow="DEVELOPMENT INTEL"
          title="THE ARCHITECTS BEHIND"
          accent="COURT VISION"
          lead="Turning NBA box-score data into XGBoost forecasts and live game insights. Meet the engineers building the platform."
        />

        <article className="contact-project-card" data-enter style={enterDelay(1)}>
          <div>
            <p className="contact-label">LIVE PROJECT</p>
            <h2>Court Vision Analytics</h2>
            <p>Explore the public NBA intelligence platform.</p>
          </div>
          <a className="contact-domain" href="https://courtvision.works" target="_blank" rel="noreferrer">
            <span>courtvision.works</span><small>VISIT PLATFORM <span aria-hidden="true">↗</span></small>
          </a>
        </article>

        <section className="contact-team" aria-labelledby="team-title">
          <div className="contact-section-head" data-enter style={enterDelay(2)}>
            <span className="cv-section-badge" data-slot="eyebrow">OUR TEAM</span>
            <h2 id="team-title" data-slot="display-heading">The people behind the platform.</h2>
          </div>

          <div className="contact-team-grid">
            <article className="contact-team-card" data-enter style={enterDelay(3)}>
              <div className="contact-team-topline">
                <div className="contact-team-initials" aria-hidden="true">MD</div>
                <span className="contact-team-status"><i aria-hidden="true" /> Available to connect</span>
              </div>
              <div className="contact-team-content">
                <p className="contact-label">BACKEND &amp; ML</p>
                <h3>Mohan Dixit</h3>
                <p className="contact-team-role">Backend/ML Developer</p>
                <p className="contact-team-bio">
                  Mohan develops the data pipelines, prediction systems, and production infrastructure
                  that turn live NBA information into useful basketball insight.
                </p>
                <ul className="contact-team-skills" aria-label="Mohan's focus areas">
                  <li>Python</li>
                  <li>PyTorch</li>
                  <li>XGBoost</li>
                </ul>
              </div>
              <a
                className="contact-team-link"
                href="https://www.linkedin.com/in/mohan-dixit-6396922b5/"
                target="_blank"
                rel="noreferrer"
              >
                <LinkedInIcon /> Connect on LinkedIn <span aria-hidden="true">↗</span>
              </a>
            </article>

            <article className="contact-team-card" data-enter style={enterDelay(4)}>
              <div className="contact-team-topline">
                <div className="contact-team-initials" aria-hidden="true">VU</div>
                <span className="contact-team-status"><i aria-hidden="true" /> Available to connect</span>
              </div>
              <div className="contact-team-content">
                <p className="contact-label">BACKEND &amp; FRONTEND</p>
                <h3>Varun Uday</h3>
                <p className="contact-team-role">Frontend/Backend Developer</p>
                <p className="contact-team-bio">
                  Varun develops and maintains the Flask API layer, real-time NBA data collection, and
                  prediction-serving endpoints that power Court Vision's live outcome forecasts.
                </p>
                <ul className="contact-team-skills" aria-label="Varun's focus areas">
                  <li>Flask</li>
                  <li>Scikit-Learn</li>
                  <li>Pandas &amp; NumPy</li>
                  <li>JS</li>
                </ul>
              </div>
              <a
                className="contact-team-link"
                href="https://www.linkedin.com/in/varunuday"
                target="_blank"
                rel="noreferrer"
              >
                <LinkedInIcon /> Connect on LinkedIn <span aria-hidden="true">↗</span>
              </a>
            </article>
          </div>
        </section>

        <footer className="contact-footer" data-enter style={enterDelay(5)}>
          {/* Real separators, so the line still reads apart when copied or read aloud. */}
          <span>COURT VISION</span>
          <span className="contact-footer-sep" aria-hidden="true">·</span>
          <span>NBA analytics, made clear.</span>
          <span className="contact-footer-sep" aria-hidden="true">·</span>
          <Link to="/privacy">Privacy &amp; Cookies</Link>
        </footer>
      </div>
    </main>
  );
}

export default Contact;
