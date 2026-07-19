# CourtVision Backend Port Collision Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move CourtVision's local backend from port 5000 to port 5001 so its AI endpoints cannot be intercepted by the Atlas development server.

**Architecture:** Flask will listen on port 5001 and Vite will proxy relative `/api` requests to that same port. Frontend deployment overrides remain controlled by `VITE_API_URL`, while runtime components use the shared API endpoint builder instead of hard-coded AI URLs.

**Tech Stack:** Python/Flask, React 19, Vite 7, Node's built-in test runner.

## Global Constraints

- CourtVision's local backend port is 5001.
- Production API origins remain overridable through `VITE_API_URL`.
- Do not stop, modify, or reconfigure Atlas.
- Do not change unrelated authentication or prediction behavior.

---

### Task 1: Lock the local API port contract with a failing test

**Files:**
- Create: `tests/backend-port.test.mjs`

**Interfaces:**
- Consumes: Runtime source files containing Flask, Vite proxy, user-facing fallback, and AI endpoint configuration.
- Produces: A source-level regression contract requiring port 5001 and shared AI endpoint usage.

- [ ] **Step 1: Write the failing regression test**

```javascript
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
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/backend-port.test.mjs`

Expected: FAIL because Flask and Vite still reference port 5000 and `AIPredictions.jsx` still fetches a literal URL.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add tests/backend-port.test.mjs
git commit -m "test: reproduce CourtVision backend port collision"
```

---

### Task 2: Move all CourtVision local API boundaries to port 5001

**Files:**
- Modify: `Backend/app.py:930-938`
- Modify: `Backend/api.py:336-343`
- Modify: `Backend/start_backend.bat:22`
- Modify: `vite.config.js:10`
- Modify: `src/config/api.js:15-43`
- Modify: `src/utils/auth.js:67,118`
- Modify: `src/components/Stats.jsx:222`
- Modify: `src/components/Predictions.jsx:236`
- Modify: `src/components/DebugPanel.jsx:1-7`
- Modify: `src/components/AIPredictions.jsx:1-49`

**Interfaces:**
- Consumes: `API_ENDPOINTS.aiPredictions: string` and `API_ENDPOINTS.health: string` from `src/config/api.js`.
- Produces: Flask listeners on port 5001 and Vite proxy routing `/api/*` to `http://localhost:5001`.

- [ ] **Step 1: Change Flask and development startup references to port 5001**

Update both Flask entry points to call:

```python
app.run(debug=False, host='0.0.0.0', port=5001, threaded=True)
```

for `Backend/app.py`, and:

```python
app.run(debug=False, host='127.0.0.1', port=5001, threaded=True)
```

for `Backend/api.py`. Update their printed URLs and `Backend/start_backend.bat` to show `http://localhost:5001`.

- [ ] **Step 2: Point the Vite development proxy and frontend fallback messages at port 5001**

Set the proxy target to:

```javascript
target: 'http://localhost:5001',
```

Replace user-facing development fallback URLs with:

```javascript
import.meta.env.VITE_API_URL || 'http://localhost:5001'
```

and update the proxy comments in `src/config/api.js` accordingly.

- [ ] **Step 3: Route the AI panel and debug panel through shared endpoints**

In `AIPredictions.jsx`, import and use the configured endpoint:

```javascript
import { API_ENDPOINTS } from "../config/api";

const response = await fetch(API_ENDPOINTS.aiPredictions);
```

In `DebugPanel.jsx`, build the endpoint list from `API_ENDPOINTS` and `buildApiUrl`:

```javascript
import { API_ENDPOINTS, buildApiUrl } from "../config/api";

const endpoints = [
  { label: "Health (app.py)", url: API_ENDPOINTS.health },
  { label: "AI Predictions (app.py)", url: API_ENDPOINTS.aiPredictions },
  { label: "Predictions (api.py)", url: buildApiUrl("predictions") },
];
```

- [ ] **Step 4: Run the port regression test and verify GREEN**

Run: `node --test tests/backend-port.test.mjs`

Expected: 3 tests pass.

- [ ] **Step 5: Run focused regression checks**

Run: `node --test tests/*.test.mjs`

Expected: All frontend tests pass.

Run: `python3 -B -m unittest test_expanded_predictions test_expanded_api -v` from `Backend/`.

Expected: All 8 backend tests pass.

Run: `npm run build`

Expected: Vite production build succeeds.

- [ ] **Step 6: Commit the implementation**

```bash
git add Backend/app.py Backend/api.py Backend/start_backend.bat vite.config.js src/config/api.js src/utils/auth.js src/components/Stats.jsx src/components/Predictions.jsx src/components/DebugPanel.jsx src/components/AIPredictions.jsx
git commit -m "fix: isolate CourtVision backend on port 5001"
```

---

### Task 3: Verify the live backend and browser behavior

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: Flask server at `http://127.0.0.1:5001` and Vite proxy at its selected development port.
- Produces: Runtime evidence that the health endpoint and AI Predictions panel load successfully alongside Atlas on port 5000.

- [ ] **Step 1: Start CourtVision's backend**

Run from `Backend/`: `.venv/bin/python app.py`

Expected: Startup output reports `Backend: http://localhost:5001` and the server listens on port 5001.

- [ ] **Step 2: Verify live backend endpoints**

Run: `curl -i http://127.0.0.1:5001/api/health`

Expected: HTTP 200 with CourtVision health JSON.

Run: `curl -i http://127.0.0.1:5001/api/ai-predictions`

Expected: HTTP 200 with prediction groups including `top_steals` and `top_blocks`.

- [ ] **Step 3: Start Vite and verify the AI Predictions panel**

Run: `npm run dev -- --host 127.0.0.1`

Expected: The page loads through Vite, `/api/ai-predictions` is proxied to port 5001, and the previous connection error is absent.

- [ ] **Step 4: Inspect final repository state**

Run: `git diff --check`

Expected: No whitespace errors.

Run: `git status --short --branch`

Expected: `main` is ahead of `origin/main`; only the pre-existing `Backend/__pycache__/nba_ai_system.cpython-312.pyc` modification remains uncommitted.
