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
- **2026-06-06 — Tiebreaker placeholder in Help modal** ([PR #12](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/12), merge `71d5b37`). Backlog task 1 (was). New "Tiebreaker · TBD" card in `HelpModal` between the color-meanings section and the TL;DR. Notes that ties on total points will be broken; names the leading candidate (most correct knockout picks weighted by round depth — R32 < R16 < QF < SF < Final). No scoring-logic changes; placeholder only.
- **2026-06-06 — Hide standings projections until games kick off** ([PR #11](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/11), merge `2640c2e`). Backlog task 2 (was). New `"pending"` status in `functions/_lib/transform.js` (both `ordersFromStandings` and `ordersFromMatches`): a group is pending iff every team has played 0 games, live as soon as one has. `App.jsx` skips pending groups in totals, adds a `Trophy`-iconed banner ("Tournament hasn't started yet — projections start once games kick off on June 11") when every group is pending, and renders `—` + a muted `PENDING` tag per group instead of red `~`/`PROJECTED`. Pure additive — no KV / API contract / admin-modal change. 4 new tests in `test/transform.test.mjs`.
- **2026-06-04 — "How it works" help modal** ([PR #6](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/6), merge `015fcd6`). New `HelpPill` next to the lock countdown in the header opens a `HelpModal` explaining scoring, projected-vs-final points, and the red/green/white/dimmed colors on the Standings tab. Frontend only; not a numbered backlog task.
- **2026-06-04 — Drag-and-drop reordering for group picks** ([PR #5](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/5), merge `8bc4ac0`). `GroupCard` now uses `@dnd-kit/sortable` instead of up/down arrow buttons. Drag with mouse/touch, or Tab+Space+Arrows+Space for keyboard. `PicksTab.move(g,idx,dir)` replaced with `reorder(g, newOrder)`. Locked state renders a static `StaticRow`; editable state uses `DndContext`+`SortableContext`+`SortableRow` with a `GripVertical` handle. Admin modal still uses arrows (out of scope).
- **2026-06-04 — Lock blocks new entries after LOCK_ISO** ([PR #4](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/4), merge `9263cac`). `functions/api/entry.js` now rejects any POST after `LOCK_ISO` — new or edit — not just edits (dropped the `&& existing` guard). Added 5 tests in `test/transform.test.mjs` that mock `Date.now` and a fake `POOL` around `onRequestPost` to cover before-lock accept, after-lock new-entry reject, and after-lock edit reject (regression guard).
- **2026-06-04 — World Cup color scheme (Pitch & Trophy)** ([PR #3](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/3), merge `fcb3ffa`). Replaced the pink/gold palette with a football-themed green/gold scheme. Dropped `--mag`; added `--pitch` (brand) and `--red` (live/alert/delete). Re-tinted bg/card/line/text/muted toward dark pitch. Frontend only.
- **2026-06-04 — Admin: delete a bracket** ([PR #1](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/1), merge `2b3df6e`). New `deleteEntry` action on `POST /api/admin` (admin-pass-checked, slugs the name, KV-deletes `entry:<slug>`) plus an ENTRIES card at the top of the admin modal with per-row Delete.

## Backlog

Ordered easiest → hardest. Pick one and propose a plan before coding.

1. **Contrarian / consensus view.** Post-lock, surface how each player's picks compare
   to the pool. Two variants — implement either or both:
   - **Contrarian badge on Picks tab:** "You're 1 of 2 picking Morocco to win Group C."
   - **Consensus row on Standings tab (per group):** "8/12 picked Brazil 1st."
   Pure read-only from existing entries. New component(s); no backend or KV change.
   Medium effort.

2. **Phase 2 — Knockout bracket.** When FIFA releases the Round of 32 bracket on
   2026-06-27, open a 1-day window for players to fill out a knockout bracket
   (R32 → Final). Scoring is March-Madness-style: deeper rounds are worth more (e.g.
   R32 +25, R16 +50, QF +100, SF +200, Final +300 — exact matrix TBD). Knockout
   points add to the group-stage total. Large change: new lock window (separate from
   `LOCK_ISO`), new KV shape for knockout picks, new scoring matrix in `src/data.js`,
   new UI tab/flow, and new admin overrides for match results. Needs an explicit plan
   before any code lands; KV-shape changes follow the working agreement above.

   - Tiebreaker rule (placeholder shipped — see Recently shipped). Actual scoring rule
     will land alongside knockout scoring once the matrix is finalized.

## Notes
- README.md is intentionally visitor/recruiter-facing — keep setup/deploy mechanics
  OUT of it. Put any contributor/deploy docs in CONTRIBUTING.md or docs/.
