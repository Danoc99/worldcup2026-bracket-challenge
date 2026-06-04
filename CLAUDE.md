# CLAUDE.md — Project guide for Claude Code

This file is context for Claude Code. Read it before making changes.

## What this is
A March-Madness-style World Cup 2026 prediction pool. Players predict the 1→4
finishing order of all 12 groups; the leaderboard shows projected points that
update automatically from a live football-data.org feed. Knockout bracket (Phase 2)
will be added after the Round of 32 is set on June 28.

- Live site: https://dcoworldcup.xyz
- Repo: https://github.com/Danoc99/worldcup2026-bracket-challenge
- Hosting: Cloudflare Pages (auto-deploys from `main`)

## ⚠️ Working agreement (important)
- **`main` is production.** Never commit directly to `main`. Create a branch for
  every change (`git checkout -b fix/...` or `feat/...`).
- **Stability beats elegance.** Make small, isolated, reviewable changes. Do not
  refactor or restructure unprompted. Don't change things I didn't ask you to.
- **Before merging:** run `npm test` and `npm run build` — both must pass.
- **Ask before large changes.** Propose a plan and wait for my OK on anything that
  touches the data model or multiple files.
- KV has **no migration tooling** and writes are **last-write-wins**. Any change to
  KV key shapes needs an explicit plan for data already stored.

## Architecture
- **Frontend:** React + Vite.
  - `src/App.jsx` — entire UI (tabs, picks, standings, admin modal, scoring key).
  - `src/data.js` — GROUPS, FLAG emojis, SCORE_MATRIX, GROUP_TOTAL_MAX, LOCK_ISO, helpers.
  - `src/api.js` — thin fetch wrappers for the API routes.
  - `src/main.jsx`, `index.html` — entry point.
- **Backend:** Cloudflare Pages Functions in `functions/api/`.
  - `state.js`  — GET /api/state: merged config + entries + group orders. Drives the UI.
  - `setup.js`  — POST /api/setup: one-time pool creation.
  - `entry.js`  — POST /api/entry: create/update a bracket (PIN-checked, lock-aware).
  - `admin.js`  — POST /api/admin: verify admin, save manual group overrides, delete a single entry (`action: "deleteEntry"`).
  - `health.js` — GET /api/health: live feed smoke test.
  - `_lib/` — `util.js` (hash/slug/LOCK_ISO/json), `fd.js` (football-data fetch +
    cache + serve-stale), `transform.js` (standings/matches → group orders),
    `teamMap.js` (country-name matcher).
- **Storage:** Cloudflare KV via `env.POOL`.
- **External API:** football-data.org, server-side only, key in `FOOTBALL_DATA_KEY`.

## Current KV data model (single-pool)
- `config` — { poolName, adminHash, createdAt }
- `entry:<slug>` — { name, pin, predictions, updatedAt }
- `manualResults` — { groups: { A:{order,status}, ... } }  (admin overrides of results)
- `cache:standings` — cached football-data feed

## Key invariants / decisions
- **Standings are ONE real tournament, shared by everyone.** The feed cache
  (`cache:standings`) AND any admin override of group results are **global** — the
  same for every pool. Group results never differ by pool.
- Scoring per group: matrix in `src/data.js` (4th place is always 0 by design).
  Mirror any change in BOTH `src/data.js` and the test.
- Lock date: `LOCK_ISO` in `src/data.js` and `functions/_lib/util.js` (keep in sync).
- Resilience: if football-data fails, `fd.js` serves the last good cache (stale).
- Security is intentionally light (friends' pool): PINs/admin password are simple.
  Do NOT harden these unless I explicitly ask — it risks locking out stored entries.

## Tests / commands
- `npm install`
- `npm test`        → name-matching + scoring unit tests (`test/transform.test.mjs`)
- `npm run build`   → Vite production build (must succeed before merge)
- `npm run dev`     → frontend only (no Functions)
- `npx wrangler pages dev dist --kv POOL`  → full app + Functions locally

## Recently shipped
- **2026-06-04 — Admin: delete a bracket** ([PR #1](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/1), merge `2b3df6e`). New `deleteEntry` action on `POST /api/admin` (admin-pass-checked, slugs the name, KV-deletes `entry:<slug>`) plus an ENTRIES card at the top of the admin modal with per-row Delete.

## Task backlog (do these as separate branches, in this order)
2. **Fix the lock.** `functions/api/entry.js` currently blocks *edits* after lock
   but still allows *new* brackets to be created after lock. After `LOCK_ISO`, reject
   BOTH new entries and edits. Add/adjust a test.
3. **World Cup color scheme.** Frontend only (`src/App.jsx` theme variables in the
   `FontAndTheme` style block). Replace the current pink/gold "vibe-code" palette with
   a more World-Cup-themed look. No backend changes. Eyeball locally before merge.
4. **Multiple pools (e.g. "Friends" and "Family").** The only architectural change.
   - Namespace per-pool keys: `pool:<poolId>:config`, `pool:<poolId>:entry:<slug>`.
   - **Keep standings GLOBAL:** `cache:standings` and `manualResults` stay shared
     across all pools (one real tournament — see invariants above).
   - Add pool selection in the UI and a `poolId` to the relevant API calls.
   - Plan a migration for the existing single-pool `config`/entries (or start fresh
     after deleting test data). Propose the plan and wait for approval before coding.

## Notes
- README.md is intentionally visitor/recruiter-facing — keep setup/deploy mechanics
  OUT of it. Put any contributor/deploy docs in CONTRIBUTING.md or docs/.
