import assert from "node:assert/strict";
import test from "node:test";
import { readFrontend, readRepo, readSource } from "./helpers.mjs";

test("CourtVision backend and Vite proxy use port 5001", () => {
  assert.match(readRepo("backend/app/config.py"), /DEFAULT_PORT = 5001/);
  assert.match(readRepo("backend/main.py"), /os\.environ\.get\("PORT", DEFAULT_PORT\)/);
  assert.match(readFrontend("vite.config.js"), /http:\/\/localhost:5001/);
});

test("runtime source has no remaining CourtVision port 5000 references", () => {
  for (const path of ["backend/main.py", "backend/app/config.py"]) {
    assert.doesNotMatch(readRepo(path), /(?:localhost|127\.0\.0\.1):5000/, path);
  }
  for (const path of ["vite.config.js", "src/config/api.js", "src/utils/auth.js", "src/pages/Stats.jsx", "src/pages/Predictions.jsx"]) {
    assert.doesNotMatch(readFrontend(path), /(?:localhost|127\.0\.0\.1):5000/, path);
  }
});

test("AI Predictions uses the shared configured endpoint", () => {
  const source = readSource("AIPredictions.jsx");
  assert.match(source, /API_ENDPOINTS/);
  assert.match(source, /fetch\(API_ENDPOINTS\.aiPredictions\)/);
  assert.doesNotMatch(source, /fetch\(["']\/api\/ai-predictions["']\)/);
});
