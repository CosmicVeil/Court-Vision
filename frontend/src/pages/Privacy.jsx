import "./Privacy.css";
import { Link } from "react-router-dom";
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
          title="Privacy &"
          accent="Cookies"
          lead="The short version: no ads, one analytics tool so we can see how the site is used, and we only keep what Court Vision needs to work."
        />
        <p className="privacy-updated" data-enter style={enterDelay(1)}>Last updated: November 21, 2026</p>

        <aside className="privacy-disclaimer" role="note" data-enter style={enterDelay(2)}>
          <p className="privacy-label">DISCLAIMER</p>
          <p>
            We wrote this page ourselves and it has <strong>not been reviewed by a lawyer</strong>.
            It's our honest description of how the site works, not legal advice.
          </p>
        </aside>

        <div className="privacy-sections">
          <section className="privacy-card" aria-labelledby="privacy-cookies-title" data-enter style={enterDelay(3)}>
            <p className="privacy-eyebrow">01</p>
            <h2 id="privacy-cookies-title">Cookies and analytics</h2>
            <p>
              Court Vision doesn't set any cookies of its own, and there are no ad scripts. We do use{" "}
              <strong>Google Analytics</strong> to understand how many people visit and which pages they use, so we
              know what to improve.
            </p>
            <p>
              Google Analytics sets its own cookies (named <code>_ga</code> and <code>_ga_...</code>) to tell
              visits apart. When you load a page, it sends Google the page you're on, the site that sent you here,
              your browser, device and screen size, and your rough location (country or city, worked out from your IP
              address). It doesn't receive your name, email or anything from your account.
            </p>
            <p>
              Google handles this data under its own{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">privacy policy</a>.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-browser-title" data-enter style={enterDelay(4)}>
            <p className="privacy-eyebrow">02</p>
            <h2 id="privacy-browser-title">What we save in your browser</h2>
            <p>
              To remember a few things between visits, we use your browser's localStorage. It isn't a cookie, but it
              works in a similar way: the data stays on your device. Here's everything we put there:
            </p>
            <ul className="privacy-list">
              <li><code>authToken</code> keeps you signed in. It's a random token that stops working after 24 hours.</li>
              <li><code>user</code> holds your account id, name, email and fantasy scoring setting, so we can show your profile.</li>
              <li><code>nba_favorites</code> is the list of players you've favourited.</li>
              <li><code>courtvision-theme</code> remembers whether you picked light or dark mode.</li>
            </ul>
            <p>
              Logging out removes <code>authToken</code> and <code>user</code>. To clear the rest, clear this
              site's data in your browser settings.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-account-title" data-enter style={enterDelay(5)}>
            <p className="privacy-eyebrow">03</p>
            <h2 id="privacy-account-title">If you make an account</h2>
            <p>Here's what we keep in our database, and nothing more:</p>
            <ul className="privacy-list">
              <li>Your first name, last name and email, so you can sign in and see your profile.</li>
              <li>Your password, stored only as a salted hash. We never store the password itself.</li>
              <li>When you created your account.</li>
              <li>The players you save and your fantasy scoring setting, so they're there next time.</li>
            </ul>
            <p>
              When you sign in, we store a one-way hash of your sign-in token, not the token itself. It's deleted
              when you log out and expires after 24 hours either way.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-third-parties-title" data-enter style={enterDelay(6)}>
            <p className="privacy-eyebrow">04</p>
            <h2 id="privacy-third-parties-title">Other services involved</h2>
            <p>
              Our fonts (Inter and Barlow Condensed) are served from our own site, so loading a page doesn't send
              anything to Google Fonts.
            </p>
            <p>
              Google Analytics, described in section 01, receives basic usage data about your visit.
            </p>
            <p>
              The website runs on Vercel and the API runs on Render. Like any web host, they may keep standard server
              logs, such as your IP address and the time of each request.
            </p>
            <p>
              NBA stats come from public sources. Our server fetches them, so your browser never contacts those
              sources directly.
            </p>
            <p>Links to other sites, like GitHub, take you to those sites, where their own privacy policies apply.</p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-data-use-title" data-enter style={enterDelay(7)}>
            <p className="privacy-eyebrow">05</p>
            <h2 id="privacy-data-use-title">What we'll never do</h2>
            <p>
              We don't sell your data or use it for advertising. Apart from the usage data Google Analytics collects
              (section 01), we don't share it with anyone.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-open-source-title" data-enter style={enterDelay(8)}>
            <p className="privacy-eyebrow">06</p>
            <h2 id="privacy-open-source-title">Don't just take our word for it</h2>
            <p>
              Court Vision is open source. If you want to check that this page matches what the code actually does,
              it's all on{" "}
              <a href="https://github.com/CosmicVeil/Court-Vision" target="_blank" rel="noreferrer">GitHub</a>.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-choices-title" data-enter style={enterDelay(9)}>
            <p className="privacy-eyebrow">07</p>
            <h2 id="privacy-choices-title">You're in control</h2>
            <p>You can log out at any time, or clear this site's data in your browser.</p>
            <p>
              To stop Google Analytics, you can block its cookies in your browser, use a content blocker, or install
              Google's{" "}
              <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">
                opt-out browser add-on
              </a>
              . The site works the same either way.
            </p>
            <p>
              You can also delete your account yourself from your <Link to="/profile">Profile page</Link>. After you
              confirm with your password, we permanently delete everything in section 03 from our database: your
              name, email, password hash, sign-up date, saved players, fantasy scoring setting and sign-in tokens.
              It happens straight away, you're signed out on every device, and it can't be undone.
            </p>
            <p>
              Your favourites and light/dark choice live only in your browser, so they stay there until you clear
              this site's data.
            </p>
          </section>

          <section className="privacy-card" aria-labelledby="privacy-changes-title" data-enter style={enterDelay(10)}>
            <p className="privacy-eyebrow">08</p>
            <h2 id="privacy-changes-title">If anything changes</h2>
            <p>If we change how Court Vision handles your data, we'll update this page and the date at the top.</p>
          </section>
        </div>

        <footer className="privacy-footer" data-enter style={enterDelay(11)}>
          <span>COURT VISION</span>
        </footer>
      </div>
    </main>
  );
}

export default Privacy;
