import { Link } from "react-router-dom";
import "./Privacy.css";
import PageHero from "../components/PageHero";
import { enterDelay } from "../utils/scrollReveal";

function Privacy() {
  return (
    <main className="privacy-page">
      <div className="privacy-ambient privacy-ambient-one" aria-hidden="true" />
      <div className="privacy-ambient privacy-ambient-two" aria-hidden="true" />

      <div className="privacy-shell">
        <PageHero
          eyebrow="PRIVACY & COOKIES"
          title="PRIVACY &"
          accent="COOKIES"
          lead="A plain-English summary of what Court Vision stores and why."
        />
        <p className="privacy-updated" data-enter style={enterDelay(1)}>Last updated: October 18, 2026</p>

        <aside className="privacy-disclaimer" role="note" data-enter style={enterDelay(2)}>
          <p className="privacy-label">DISCLAIMER</p>
          <p>
            This page was written by the developers and has <strong>not been reviewed by a lawyer</strong>.
            It is a good-faith description of how the site works and is not legal advice.
          </p>
        </aside>

        <div className="privacy-sections">
          <section className="privacy-card" aria-labelledby="privacy-cookies-title" data-enter style={enterDelay(3)}>
            <p className="privacy-eyebrow">01</p>
            <h2 id="privacy-cookies-title">Cookies</h2>
            <p>
              Court Vision does not set any cookies of its own and runs no analytics, advertising or tracking scripts.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-browser-title" data-enter style={enterDelay(4)}>
            <p className="privacy-eyebrow">02</p>
            <h2 id="privacy-browser-title">What your browser stores (localStorage)</h2>
            <p>These are not cookies, but localStorage serves a similar purpose by storing information in your browser:</p>
            <ul className="privacy-list">
              <li><code>authToken</code>: a random sign-in token, valid up to 24 hours.</li>
              <li><code>user</code>: your account's id, first name, last name and email, used to show your profile.</li>
              <li><code>nba_favorites</code>: players you favourited.</li>
            </ul>
            <p>
              Logging out clears <code>authToken</code> and <code>user</code>.
              You can clear all three by clearing site data in your browser.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-account-title" data-enter style={enterDelay(5)}>
            <p className="privacy-eyebrow">03</p>
            <h2 id="privacy-account-title">If you create an account</h2>
            <p>
              Our PostgreSQL database stores your first name, last name, email, password stored only as a
              salted hash (never in plain text), account creation time, and the players you save.
            </p>
            <p>
              Sign-in tokens are stored in our database only as a one-way hash, and are deleted on logout or expire after 24 hours.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-third-parties-title" data-enter style={enterDelay(6)}>
            <p className="privacy-eyebrow">04</p>
            <h2 id="privacy-third-parties-title">Third parties</h2>
            <p>
              Google Fonts (<code>fonts.googleapis.com</code> / <code>fonts.gstatic.com</code>) loads our fonts,
              so Google receives your IP address and browser information when the page loads.
            </p>
            <p>
              The site is hosted on Vercel (frontend) and Render (API). Like any host, they
              may keep standard server logs, such as your IP address and request time.
            </p>
            <p>NBA data comes from public sources fetched by our server, not by your browser.</p>
            <p>Links to LinkedIn on the Contact page go to LinkedIn's own site and policies.</p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-data-use-title" data-enter style={enterDelay(7)}>
            <p className="privacy-eyebrow">05</p>
            <h2 id="privacy-data-use-title">We don't</h2>
            <p>We do not sell or share your data, or use it for advertising.</p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-choices-title" data-enter style={enterDelay(8)}>
            <p className="privacy-eyebrow">06</p>
            <h2 id="privacy-choices-title">Your choices</h2>
            <p>
              You can log out, clear site data, or ask us to delete your account via the <Link to="/contact">Contact page</Link>.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-changes-title" data-enter style={enterDelay(9)}>
            <p className="privacy-eyebrow">07</p>
            <h2 id="privacy-changes-title">Changes</h2>
            <p>We'll update this page and the "Last updated" date if anything changes.</p>
          </section>
        </div>

        <footer className="privacy-footer" data-enter style={enterDelay(10)}>
          <span>COURT VISION</span>
          <Link to="/contact">CONTACT</Link>
        </footer>
      </div>
    </main>
  );
}

export default Privacy;
