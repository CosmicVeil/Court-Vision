import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { readSource } from "./helpers.mjs";

// Contact, Privacy, Login, Create Account and 404 share one layout and interaction vocabulary.
const pages = {
  "Contact.jsx": { css: "Contact.css", prefix: "contact-" },
  "Privacy.jsx": { css: "Privacy.css", prefix: "privacy-" },
  "Login.jsx": { css: "Auth.css", prefix: "auth-" },
  "SignUp.jsx": { css: "Auth.css", prefix: "auth-" },
  "NotFound.jsx": { css: "NotFound.css", prefix: "notfound-" },
};

const FOCUS_RING = /outline: 2px solid var\(--color-ember-orange(, #ff6436)?\);\s*outline-offset: 3px;/;

// The class each selector in a stylesheet starts with, e.g. ".contact-page a" -> "contact-page".
function leadingClasses(css) {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|[{}])\s*([^{}@]+?)\s*\{/g);
  return [...rules].flatMap(([, selectors]) => selectors.split(","))
    .map(selector => selector.trim().match(/^\.([\w-]+)/)?.[1] ?? selector.trim());
}

test("each small page is a <main> with the shared page padding and the PageHero anatomy", () => {
  for (const [file, { css }] of Object.entries(pages)) {
    const source = readSource(file);
    assert.match(source, /return \(\s*<main className="[\w-]+-page">/, file);
    assert.match(readSource(css), /padding: calc\(var\(--header-height\) \+ var\(--space\) \* 10\) var\(--gutter\) calc\(var\(--space\) \* 18\);/, css);
  }
  // PageHero draws the ember accent for Contact and Privacy; the card pages mark theirs by hand.
  for (const file of ["Contact.jsx", "Privacy.jsx"]) {
    const source = readSource(file);
    assert.match(source, /import PageHero from "\.\.\/components\/PageHero"/, file);
    assert.match(source, /<PageHero[^>]*\saccent="/, file);
  }
  // Card pages repeat the hero's slots (eyebrow, display heading, lead) inside their card.
  for (const file of ["Login.jsx", "SignUp.jsx", "NotFound.jsx"]) {
    const source = readSource(file);
    for (const slot of ["eyebrow", "display-heading", "lead"]) assert.match(source, new RegExp(`data-slot="${slot}"`), `${file} ${slot}`);
    assert.match(source, /className="cv-section-badge" data-slot="eyebrow"/, file);
    assert.match(source, /<span className="text-ember">/, file);
  }
});

test("page CSS is global, so every rule is prefixed with its page's name", () => {
  for (const { css, prefix } of new Set(Object.values(pages))) {
    for (const cls of leadingClasses(readSource(css))) {
      assert.ok(cls.startsWith(prefix), `${css}: "${cls}" should start with .${prefix}`);
    }
  }
});

test("Login and Create Account share one form stylesheet", () => {
  for (const file of ["Login.jsx", "SignUp.jsx"]) {
    const source = readSource(file);
    assert.match(source, /import "\.\/Auth\.css"/, file);
    assert.match(source, /className="auth-field"/, file);
    assert.match(source, /className="auth-error" role="alert"/, file);
  }
  for (const old of ["Login.css", "SignUp.css"]) {
    assert.ok(!existsSync(new URL(`../src/pages/${old}`, import.meta.url)), `${old} was merged into Auth.css`);
  }
});

test("Create Account ties each field error to its input and focuses the first one", () => {
  const source = readSource("SignUp.jsx");
  assert.match(source, /aria-invalid=\{Boolean\(errors\[name\]\)\}/);
  assert.match(source, /aria-describedby=\{errors\[name\] \? `\$\{name\}-error` : undefined\}/);
  assert.match(source, /id=\{`\$\{name\}-error`\}/);
  assert.match(source, /FIELDS\.find\(\(\{ name \}\) => newErrors\[name\]\)/);
  assert.match(source, /onSubmit=\{handleSubmit\} noValidate/);
  assert.match(readSource("Auth.css"), /\.auth-field input\[aria-invalid="true"\]/);
});

test("the 404 page's way back is real links, not click-handled buttons", () => {
  const source = readSource("NotFound.jsx");
  assert.doesNotMatch(source, /useNavigate|<button|onClick/);
  for (const to of ["/", "/predictions", "/games"]) assert.match(source, new RegExp(`<Link to="${to}" className="notfound-btn`));
});

test("every interactive element on the small pages gets the ember focus ring", () => {
  const selectors = {
    "Contact.css": [".contact-page a:focus-visible"],
    "Privacy.css": [".privacy-page a:focus-visible"],
    "Auth.css": [".auth-field input:focus-visible", ".auth-link:focus-visible"],
    "NotFound.css": [".notfound-btn:focus-visible"],
  };
  for (const [file, list] of Object.entries(selectors)) {
    const css = readSource(file);
    for (const selector of list) {
      const at = css.indexOf(selector);
      assert.ok(at >= 0, `${file}: ${selector}`);
      assert.match(css.slice(at, css.indexOf("}", at)), FOCUS_RING, selector);
    }
  }
  assert.match(readSource("Auth.css"), /\.auth-submit:focus-visible,\s*\.auth-link:focus-visible/);
  assert.doesNotMatch(readSource("Auth.css"), /outline: none/);
});

test("Contact's team cards fit a phone: the grid track can't outgrow its container", () => {
  const css = readSource("Contact.css");
  const jsx = readSource("Contact.jsx");
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 22rem\), 1fr\)\);/);
  assert.doesNotMatch(css, /minmax\(360px/);
  // The LinkedIn button's class must be the one the stylesheet styles.
  assert.match(jsx, /className="contact-team-link"/);
  assert.match(css, /\.contact-team-link \{/);
});

test("Contact's footer items are separated in the text itself, not only by layout", () => {
  const footer = readSource("Contact.jsx").match(/<footer className="contact-footer"[^>]*>([\s\S]*?)<\/footer>/)?.[1];
  assert.equal(footer.match(/<span className="contact-footer-sep" aria-hidden="true">·<\/span>/g)?.length, 2);
});
