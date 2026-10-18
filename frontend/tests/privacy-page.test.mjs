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
  const disclaimer = page.match(/<aside className="privacy-disclaimer" role="note">([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(disclaimer, "A visible disclaimer callout is required");
  assert.match(disclaimer, /written by the developers/i);
  assert.match(disclaimer, /not been reviewed by a lawyer/i);
  assert.match(disclaimer, /good-faith/);
  assert.match(disclaimer, /not legal advice/i);
  assert.ok(page.indexOf('className="privacy-disclaimer"') < page.indexOf('className="privacy-sections"'));
});

test("Privacy page explains cookies, data use, choices and future updates", () => {
  const page = readPrivacy();
  assert.match(page, /does not set any cookies of its own/);
  assert.match(page, /no analytics, advertising or tracking scripts/);
  assert.match(page, /do not sell or share your data, or use it for advertising/);
  assert.match(page, /log out, clear site data/);
  assert.match(page, /delete your account[\s\S]*?<Link to="\/contact">Contact page<\/Link>/);
  assert.match(page, /update this page and the "Last updated" date if anything changes/);
  assert.equal((page.match(/<section className="privacy-card" aria-labelledby=/g) || []).length, 7);
});

test("Privacy page documents localStorage keys and distinguishes logout from clearing site data", () => {
  const page = readPrivacy();
  const auth = readFrontend("src/utils/auth.js");
  const favorites = readFrontend("src/utils/favorites.js");
  assert.match(page, /localStorage/);
  assert.match(page, /not cookies/i);
  for (const key of ["authToken", "user", "nba_favorites"]) {
    assert.ok(page.includes(`<code>${key}</code>`));
    assert.ok((key === "nba_favorites" ? favorites : auth).includes(`'${key}'`));
  }
  assert.match(page, /random sign-in token, valid up to 24 hours/);
  assert.match(page, /id, first name, last name and email, used to show your profile/);
  assert.match(page, /players you favourited/);
  assert.match(page, /Logging out clears <code>authToken<\/code> and <code>user<\/code>/);
  assert.match(page, /clear all three by clearing site data in your browser/);
});

test("Privacy page describes account storage and third-party data handling", () => {
  const page = readPrivacy();
  assert.match(page, /PostgreSQL/);
  assert.match(page, /first name, last name, email/);
  assert.match(page, /salted hash \(never in plain text\)/);
  assert.match(page, /account creation time, and the players you save/);
  assert.match(page, /only in the server's memory and expire after 24 hours or on logout/);
  for (const provider of ["Google Fonts", "fonts.googleapis.com", "fonts.gstatic.com", "Vercel", "Render", "LinkedIn"]) {
    assert.ok(page.includes(provider), `${provider} must be disclosed`);
  }
  assert.match(page, /Google receives your IP address and browser information when the page loads/);
  assert.match(page, /Vercel \(frontend\) and Render \(API\)/);
  assert.match(page, /may keep standard server logs, such as your IP address and request time/);
  assert.match(page, /public sources fetched by our server, not by your browser/);
  assert.match(page, /LinkedIn's own site and policies/);
});

test("Privacy page uses the Contact theme with readable prose and narrow-screen wrapping", () => {
  const page = readPrivacy();
  const css = readPrivacy("Privacy.css");
  assert.match(page, /import "\.\/Privacy\.css"/);
  assert.match(page, /<Link to="\/" className="back-to-home">← HOME<\/Link>/);
  assert.match(page, /className="cv-section-badge"/);
  assert.match(page, /<h1 id="privacy-title">PRIVACY &amp; <span className="text-ember">COOKIES<\/span><\/h1>/);
  assert.match(page, /plain-English summary/);
  assert.match(page, /Last updated: October 18, 2026/);
  assert.match(page, /privacy-ambient-one/);
  assert.match(page, /privacy-ambient-two/);
  assert.match(page, /<footer className="privacy-footer">[\s\S]*?<Link to="\/contact">CONTACT<\/Link>/);
  assert.match(css, /--color-ember-orange/);
  assert.match(css, /line-height: 1\.7/);
  assert.match(css, /max-width: 760px/);
  assert.match(css, /width: min\(calc\(100% - 2rem\), 1160px\);/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /\.privacy-header \.stats-nav-top\s*\{[^}]*flex-wrap: wrap/s);
  assert.match(css, /backdrop-filter: blur\(20px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(css, /\.contact-/);
});

test("Privacy is linked next to Contact in the Home nav and from the Contact footer", () => {
  const homeNav = readSource("Home.jsx").match(/<nav className="header-nav">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(homeNav);
  assert.match(homeNav, /<Link to="\/contact">CONTACT<\/Link>\s*<Link to="\/privacy">PRIVACY<\/Link>/);
  const footer = readSource("Contact.jsx").match(/<footer className="contact-footer">([\s\S]*?)<\/footer>/)?.[1];
  assert.ok(footer);
  assert.match(footer, /<Link to="\/privacy">Privacy &amp; Cookies<\/Link>/);
});
