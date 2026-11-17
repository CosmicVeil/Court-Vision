# Security Policy

CourtVision is a personal, student-maintained project. It stores a small amount of user data (name, email, a hashed password, saved players, and fantasy scoring preferences), so security reports are welcome and taken seriously.

## Supported versions

Only the current `main` branch and the live deployment at [courtvision.works](https://courtvision.works) (frontend) and its Render-hosted API are supported. Older commits and forks do not receive fixes.

| Version | Supported |
|---|---|
| `main` / live site | Yes |
| Anything else | No |

## Reporting a vulnerability

**Please do not open a public issue, pull request, or discussion for a security problem.**

Report it privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (GitHub private vulnerability reporting).
3. Include:
   - what the issue is and which part of the system it affects (frontend, API route, database, scraper, CI workflow)
   - steps to reproduce, or a minimal proof of concept
   - the impact you think it has (for example: read another user's saved players, take over an account, leak a secret)

### What to expect

This is maintained by one person in their spare time, so these are goals rather than guarantees:

- **Acknowledgement:** within 7 days.
- **Initial assessment:** within 14 days, including whether the report is accepted.
- **Fix:** as soon as practical for accepted issues; critical issues (account takeover, credential or data exposure) come first.
- **Credit:** you will be credited in the fix's release notes or commit message unless you ask not to be.

## Scope

**In scope**

- The Flask API under `backend/app/` (auth, saved players, predictions, stats, games routes)
- Authentication and session tokens (`backend/app/auth.py`, `backend/app/api/routes/auth.py`)
- Storage of user data in PostgreSQL (`backend/app/db.py`)
- The React frontend in `frontend/`
- GitHub Actions workflows in `.github/workflows/` and deployment config (`backend/render.yaml`, `netlify.toml`, `frontend/vercel.json`)
- Accidentally committed secrets anywhere in the repository or its history

**Out of scope**

- Accuracy of statistics or ML predictions (those are not security issues; open a normal issue)
- Vulnerabilities in third-party services CourtVision depends on (ESPN, NBA.com, Basketball Reference, Render, Netlify/Vercel); report those to the vendor
- Denial-of-service or load testing against the live site
- Social engineering, phishing, or physical attacks
- Reports from automated scanners with no demonstrated impact
- Missing best-practice headers or settings with no realistic exploit

## Testing rules (safe harbor)

Good-faith research that follows these rules will not be treated as malicious:

- Only test against **accounts you created yourself**. Do not access, modify, or delete other users' data.
- Prefer running the project **locally** (see the README's *Local development* section) over testing the live site.
- No denial-of-service, spam, brute-force password guessing at volume, or automated scanning of the live site.
- Stop and report as soon as you confirm an issue; do not pivot further or keep any user data you encounter.
- Give a reasonable chance to fix the issue before disclosing it publicly.

## How the project protects users today

So reporters know what is already in place:

- **Passwords** are hashed with PBKDF2-SHA256 via Werkzeug (`backend/app/db.py`); plaintext passwords are never stored.
- **Session tokens** are random (`secrets.token_urlsafe(32)`), stored only as SHA-256 hashes in the `auth_tokens` table, expire after 24 hours, and are deleted on logout (`backend/app/auth.py`).
- **Database queries** use parameterized SQL rather than string formatting.
- **Secrets** (`DATABASE_URL`, `SECRET_KEY`) come from environment variables or the hosting provider's secret store. `backend/.env` is git-ignored and must never be committed.
- **CORS** only allows the production site and local dev servers (`DEFAULT_CORS_ORIGINS` in `backend/app/config.py`). Set `CORS_ORIGINS` (comma-separated) to change the list, for example to add a preview deploy.
- **Rate limiting:** login allows 10 attempts per 5 minutes and signup 5 per hour, per client IP (`backend/app/utils/rate_limit.py`). Over the limit, the API returns `429` with a `Retry-After` header. On Render, the client IP comes from the one trusted proxy hop in `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, default 1 on Render and 0 elsewhere).
- **Content-Security-Policy:** production builds get a CSP `<meta>` tag (`frontend/src/config/csp.js`). Scripts run only from the site itself, hashed inline scripts, and Google Analytics. Requests and images can only go to the API, analytics, and the NBA/ESPN image CDNs. This limits what an injected script could do with the token.

### Known limitations

These are known trade-offs, listed so they are not reported as new findings unless you can show a concrete exploit:

- The frontend keeps the auth token in `localStorage`, because the API is on a different site (Render) than the frontend, which rules out first-party cookies. The CSP narrows what an XSS bug could do, but an XSS finding is still high-impact and in scope.
- The CSP allows `'unsafe-inline'` styles, and as a `<meta>` tag it can't set `frame-ancestors` (`X-Frame-Options: DENY` covers framing instead).
- Rate-limit counts live in memory: they reset when the API restarts and are per-process.

## For contributors

- Never commit credentials, `.env` files, database dumps, or real user data. If you commit a secret by accident, tell the maintainer privately right away; the secret must be rotated, since removing it from git history is not enough.
- Keep SQL parameterized and keep new routes that touch user data behind `@require_auth`, scoped to `request.user_id`.
- Avoid adding new dependencies without discussing them first. Each one is extra attack surface.
