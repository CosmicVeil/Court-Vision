import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { readFrontend, readSource } from "./helpers.mjs";

function readPrivacy(filename = "Privacy.jsx") {
  assert.ok(existsSync(new URL(`../src/pages/${filename}`, import.meta.url)), `${filename} must exist`);
  return readSource(filename);
}

test("Privacy page is registered before the catch-all without replacing NotFound", () => {
  const app = readFrontend("src/App.jsx");
  assert.match(app, /import Privacy from "\.\/pages\/Privacy\.jsx"/);
  assert.match(app, /<Route path="\/privacy" element={<Privacy\s*\/>}\s*\/>/);
  assert.ok(app.indexOf('path="/privacy"') < app.indexOf('path="*"'));
  assert.match(app, /<Route path="\*" element={<NotFound\s*\/>}\s*\/>/);
});

test("Privacy page prominently disclaims legal review before its sections", () => {
  const page = readPrivacy();
  const disclaimer = page.match(/<aside className="privacy-disclaimer" role="note"[^>]*>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(disclaimer, "A visible disclaimer callout is required");
  assert.match(disclaimer, /We wrote this page ourselves/);
  assert.match(disclaimer, /not been reviewed by a lawyer/i);
  assert.match(disclaimer, /honest description of how the site works/);
  assert.match(disclaimer, /not legal advice/i);
  assert.ok(page.indexOf('className="privacy-disclaimer"') < page.indexOf('className="privacy-sections"'));
});

test("Privacy page explains cookies, data use, choices and future updates", () => {
  const page = readPrivacy();
  assert.match(page, /doesn't set any cookies of its own/);
  assert.match(page, /there are no ad scripts/);
  assert.match(page, /We don't sell your data or use it for advertising/);
  assert.match(page, /log out at any time, or clear this site's data/);
  // Contact page is temporarily hidden, so Privacy must not link to it.
  assert.doesNotMatch(page, /to="\/contact"/);
  assert.match(page, /update this page and the date at the top/);
  assert.equal((page.match(/<section className="privacy-card" aria-labelledby=/g) || []).length, 8);
});

test("Privacy page discloses Google Analytics to match the tracking code in main.jsx", () => {
  const page = readPrivacy();
  const main = readFrontend("src/main.jsx");
  // If GA is ever removed from main.jsx, this disclosure should be removed too (and vice versa).
  assert.match(main, /ReactGA\.initialize\(/);
  assert.doesNotMatch(page, /no analytics|no trackers|No cookies, no tracking/);
  assert.match(page, /<strong>Google Analytics<\/strong>/);
  assert.match(page, /<code>_ga<\/code>/);
  assert.match(page, /doesn't receive your name, email or anything from your account/);
  assert.match(page, /href="https:\/\/policies\.google\.com\/privacy"/);
  assert.match(page, /href="https:\/\/tools\.google\.com\/dlpage\/gaoptout"/);
});

test("Privacy page describes self-serve account deletion that matches the Profile page and API", () => {
  const page = readPrivacy();
  const choices = page.match(/aria-labelledby="privacy-choices-title"[\s\S]*?<\/section>/)?.[0];
  assert.ok(choices);
  // There is no contact channel, so the page must not tell users to ask us.
  assert.doesNotMatch(page, /ask us to delete/);
  assert.match(choices, /delete your account yourself from your <Link to="\/profile">Profile page<\/Link>/);
  assert.match(choices, /confirm with your password/);
  assert.match(choices, /name, email, password hash, sign-up date, saved players, fantasy scoring setting and sign-in\s+tokens/);
  assert.match(choices, /can't be undone/);
  assert.match(readSource("Profile.jsx"), /API_ENDPOINTS\.deleteAccount/);
  assert.match(readFrontend("src/config/api.js"), /deleteAccount: buildApiUrl\('auth\/account'\)/);
});

test("Privacy page documents localStorage keys and distinguishes logout from clearing site data", () => {
  const page = readPrivacy();
  const auth = readFrontend("src/utils/auth.js");
  const favorites = readFrontend("src/utils/favorites.js");
  assert.match(page, /localStorage/);
  assert.match(page, /isn't a cookie/i);
  for (const key of ["authToken", "user", "nba_favorites"]) {
    assert.ok(page.includes(`<code>${key}</code>`));
    assert.ok((key === "nba_favorites" ? favorites : auth).includes(`'${key}'`));
  }
  assert.match(page, /random token that stops working after 24 hours/);
  assert.match(page, /account id, name, email and fantasy scoring setting, so we can show your profile/);
  assert.match(page, /players you've favourited/);
  assert.match(page, /Logging out removes <code>authToken<\/code> and <code>user<\/code>/);
  assert.match(page, /clear this\s+site's data in your browser settings/);
});

test("Privacy page describes account storage and third-party data handling", () => {
  const page = readPrivacy();
  assert.match(page, /what we keep in our database/);
  assert.match(page, /first name, last name and email/);
  assert.match(page, /salted hash\. We never store the password itself/);
  assert.match(page, /When you created your account/);
  assert.match(page, /players you save and your fantasy scoring setting/);
  assert.match(page, /one-way hash of your sign-in token, not the token itself/);
  assert.match(page, /deleted\s+when you log out and expires after 24 hours/);
  assert.doesNotMatch(page, /only in the server's memory/);
  for (const provider of ["Vercel", "Render", "GitHub"]) {
    assert.ok(page.includes(provider), `${provider} must be disclosed`);
  }
  assert.match(page, /Inter and Barlow Condensed\) are served from our own site/);
  assert.match(page, /doesn't send\s+anything to Google Fonts/);
  assert.match(page, /website runs on Vercel and the API runs on Render/);
  assert.match(page, /may keep standard server\s+logs, such as your IP address and the time of each request/);
  assert.match(page, /Our server fetches them, so your browser never contacts those\s+sources directly/);
  assert.match(page, /their own privacy policies apply/);
});

test("Privacy page uses the Contact theme with readable prose and narrow-screen wrapping", () => {
  const page = readPrivacy();
  const css = readPrivacy("Privacy.css");
  assert.match(page, /import "\.\/Privacy\.css"/);
  // PageHero renders the cv-section-badge eyebrow, the h1 with its ember accent, and the lead.
  assert.match(page, /<PageHero\s+eyebrow="PRIVACY & COOKIES"\s+title="Privacy &"\s+accent="Cookies"/);
  assert.match(page, /lead="The short version: no ads, one analytics tool/);
  assert.match(page, /Last updated: November 21, 2026/);
  assert.match(page, /privacy-ambient-one/);
  assert.match(page, /privacy-ambient-two/);
  assert.match(page, /<footer className="privacy-footer"[^>]*>/);
  assert.match(css, /--color-ember-orange/);
  assert.match(css, /line-height: 1\.7/);
  assert.match(css, /max-width: 760px/);
  assert.match(css, /width: min\(calc\(100% - 2rem\), 1160px\);/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /backdrop-filter: blur\(20px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(css, /\.contact-/);
});

test("Privacy is in the site nav (Contact temporarily hidden) and linked from the Contact footer", () => {
  const siteNav = readFrontend("src/utils/siteNav.js");
  assert.match(siteNav, /^\s*\{ to: '\/privacy', label: 'Privacy' \}/m);
  assert.doesNotMatch(siteNav, /^\s*\{ to: '\/contact'/m);
  const footer = readSource("Contact.jsx").match(/<footer className="contact-footer"[^>]*>([\s\S]*?)<\/footer>/)?.[1];
  assert.ok(footer);
  assert.match(footer, /<Link to="\/privacy">Privacy &amp; Cookies<\/Link>/);
});
