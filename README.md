# qa-automation

Playwright E2E automation for QA Management Platform — login smoke suite + reporter that creates Test Runs.

Sibling repo to `qa-management-platform` (the app under test). The app itself runs at `http://localhost:3000`.

## What it does

- Smoke tests for login:
  - **TC-001** — valid login → redirected to dashboard
  - **TC-002** — invalid login, 3 combos (wrong password / wrong email / empty) → all map to one TC-002
  - **TC-004** — OTP first attempt → **Blocked**, not faked green, because 2FA / OTP is not implemented in the app yet
  - **TC-003** — not in this smoke run, stays `Not Run` in the Run
- Reporter `scripts/report-to-qa-platform.ts` logs in via browser (cookies), finds the `Automation - Smoke` suite by name, creates a Test Run, updates each case, and completes the Run. The Suite Details page then shows it as **Last Run**.

## Setup

```bash
npm install
cp .env.example .env
# edit .env:
# PLAYWRIGHT_BASE_URL=http://localhost:3000
# TEST_USER_EMAIL=you@example.com
# TEST_USER_PASSWORD=...
```

Do not commit `.env`.

## Run

Terminal 1 — QA Platform must be running:

```bash
cd ../qa-management-platform
npm run dev
```

Terminal 2 — smoke + reporter:

```bash
npx playwright test tests/TC-001-login-valid.spec.ts tests/TC-002-login-invalid.spec.ts tests/TC-004-login-otp-first-attempt.spec.ts
npx tsx scripts/report-to-qa-platform.ts
```

Expected reporter output:

```
[reporter] TC-001: Playwright [passed] -> QA passed
[reporter] TC-002: Playwright [passed,passed,passed] -> QA passed
[reporter] TC-004: Playwright [skipped] -> QA blocked
[reporter] Run created id=...
[reporter] DONE. See it at: http://localhost:3000/test-runs/<id>
```

## Reporter mapping

| Playwright | QA Platform |
|---|---|
| `passed` | `passed` |
| `failed` / `timedOut` | `failed` |
| `skipped` (TC-004) | `blocked` — API maps `skipped` → `not_applicable`, so reporter sends `blocked` explicitly |
| TC-002a / b / c | combined to one TC-002 — any fail = `failed`, all pass = `passed` |

Pass Rate in QA Platform is `Passed / Total` (e.g. 2 / 4 = 50%). Progress is `Done / Total` (e.g. 3 / 4 = 75% — 2 passed + 1 blocked have a result).

## Structure

```
tests/                          Playwright specs (TC-001, TC-002, TC-004)
helpers/login.ts                Login helper — waits until leaving /auth/login
scripts/report-to-qa-platform.ts Reporter — browser login + POST / PATCH /api/test-runs
playwright.config.ts            Base URL, JSON reporter to test-results/results.json
```

## Notes

- Reporter uses `page.request` with browser cookies — the API is cookie-only, Bearer tokens return 401.
- Login helper must wait for redirect to `/dashboard`, otherwise cookies are 0 and the reporter gets 401.
- Do not put TC IDs in Description — link cases / suites properly.
