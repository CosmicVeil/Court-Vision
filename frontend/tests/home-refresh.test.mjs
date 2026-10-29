import assert from "node:assert/strict";
import test from "node:test";
import { readSource } from "./helpers.mjs";

const home = readSource("Home.jsx");
const css = readSource("Home.css");
const reducedCss = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));

test("Home uses the shared reveal instead of its own observer and classes", () => {
  assert.doesNotMatch(home, /useScrollReveal|scroll-reveal|classList\.add\('revealed'\)/);
  assert.doesNotMatch(css, /\.scroll-reveal|\.revealed\b/);
  assert.match(home, /import ScrollReveal from "\.\.\/components\/ScrollReveal"/);
  assert.match(home, /import \{ enterDelay, getRevealDelay \} from "\.\.\/utils\/scrollReveal"/);
  // The trending cards arrive after a fetch, so the scan reruns once it settles.
  assert.match(home, /<ScrollReveal scanKey=\{`\$\{trendingSettled\}:\$\{leadersContent\}`\} \/>/);
  assert.match(home, /onSettled=\{setTrendingSettled\}/);
  assert.match(home, /onContentChange=\{setLeadersContent\}/);
  assert.match(home, /onSettled\(true\)/);
});

test("the hero's on-screen blocks enter on mount; the undefined heroReveal keyframe is gone", () => {
  assert.match(home, /className="hero-subtitle" data-enter>/);
  assert.match(home, /className="hero-cta" data-enter style=\{enterDelay\(1\)\}/);
  assert.doesNotMatch(css, /heroReveal/);
  assert.doesNotMatch(css, /\.hero-cta\s*\{[^}]*opacity:\s*0/);
});

test("sections below the intro share one heading anatomy and reveal in a stagger", () => {
  assert.equal(home.match(/<SectionHead\b/g)?.length, 5);
  assert.match(home, /<div className="home-section-head" data-reveal>/);
  assert.match(home, /className="cv-section-badge" data-slot="eyebrow"/);
  assert.match(home, /data-slot="display-heading"/);
  assert.match(home, /<li className="step-item" data-reveal style=\{revealDelay\(index \* 2\)\}>/);
  assert.match(home, /<div className="featured-card" data-reveal style=\{revealDelay\(index\)\}>/);
  assert.match(home, /className="featured-grid" data-defer/);
});

test("cards with hover lifts keep their transitions alongside the reveal", () => {
  assert.match(css, /html\[data-motion-ready\] :is\(\.featured-card, \.step-item\)\[data-reveal\] \{[^}]*opacity var\(--duration-reveal\)[^}]*translate var\(--duration-reveal\)[^}]*transform /);
  assert.doesNotMatch(css, /\.(featured-card|step-item) \{[^}]*transition: all/);
});

test("the intro respects reduced motion", () => {
  assert.match(home, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(home, /if \(reducedMotion\.matches\) \{[\s\S]*?return;\s*\}\s*window\.addEventListener\('scroll', onScroll/);
  assert.match(home, /reducedMotion\.addEventListener\('change', syncMotion\)/);
  assert.match(reducedCss, /\.cv-hero-wrapper \{ height: 100vh; \}/);
  assert.match(reducedCss, /\.cv-svg-line \{ animation: none; opacity: 1; \}/);
  assert.match(reducedCss, /\.cv-court-spotlight \{ animation: none; \}/);
});

test("Home's interactive elements are keyboard reachable with the ember focus ring", () => {
  assert.match(home, /<button type="button" key=\{player\.name\} className="search-result-item"/);
  assert.match(home, /<button\s+type="button"\s+className="pra-open"/);
  assert.doesNotMatch(home, /clickable-pra-card/);
  for (const selector of [".cta-button:focus-visible", ".featured-link:focus-visible", ".pra-card:has(.pra-open:focus-visible)",
    ".search-bar-container:has(.search-input-field:focus-visible)", ".predictions-tabs .tab-button:focus-visible"]) {
    const at = css.indexOf(selector);
    assert.ok(at >= 0, `${selector} has a focus style`);
    assert.match(css.slice(at, css.indexOf("}", at)), /outline: 2px solid var\(--color-ember-orange\)/, selector);
  }
});
