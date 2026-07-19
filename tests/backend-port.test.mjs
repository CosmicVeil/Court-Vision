import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CourtVision backend and Vite proxy use port 5001", () => {
  assert.match(read("Backend/app.py"), /port=5001/);
  assert.match(read("Backend/api.py"), /port=5001/);
  assert.match(read("vite.config.js"), /http:\/\/localhost:5001/);
});

test("runtime source has no remaining CourtVision port 5000 references", () => {
  for (const path of [
    "Backend/app.py",
    "Backend/api.py",
    "Backend/start_backend.bat",
    "vite.config.js",
    "src/config/api.js",
    "src/utils/auth.js",
    "src/components/Stats.jsx",
    "src/components/Predictions.jsx",
    "src/components/DebugPanel.jsx",
  ]) {
    assert.doesNotMatch(read(path), /(?:localhost|127\.0\.0\.1):5000/, path);
  }
});

test("AI Predictions uses the shared configured endpoint", () => {
  const source = read("src/components/AIPredictions.jsx");
  assert.match(source, /API_ENDPOINTS/);
  assert.match(source, /fetch\(API_ENDPOINTS\.aiPredictions\)/);
  assert.doesNotMatch(source, /fetch\(["']\/api\/ai-predictions["']\)/);
});
