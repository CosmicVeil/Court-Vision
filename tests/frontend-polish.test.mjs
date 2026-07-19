import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readComponent = (filename) => readFileSync(
  new URL(`../src/components/${filename}`, import.meta.url),
  "utf8",
);

test("authenticated visitors do not render the final homepage account CTA", () => {
  const source = readComponent("home.jsx");
  assert.match(source, /\{!isLoggedIn && \(\s*<section className="cta-section">/);
  assert.match(source, /to="\/login"/);
  assert.match(source, /to="\/create-account"/);
});
