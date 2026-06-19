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
- **2026-06-19 — Per-team clinched ✓ + ▲/▼ matchday movement on Standings** ([PR #22](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/22), merge `257e27c`). Two auto-computed signals on the per-group breakdown rows, both pulled from the live feed with no admin step:
  - **Clinched ✓ per team.** A team's slot now turns green ✓ as soon as it's mathematically locked, not only when the whole group is final. First pass used a strict points-only check (conservative). Real Group A on 2026-06-19 has Mexico at 6 pts after MD2 with SK reachable to 6 — points-only said "not clinched." Switched to a full H2H-aware simulation in `clinchedPositionsHTH(rows, h2h, remaining)`: enumerates every W/D/L scenario for unplayed group-stage matches (≤729 per group, fits in a Worker), resolves points-tied buckets with the FIFA-2026 H2H mini-table (pts → GD-in-H2H → GS-in-H2H), and marks a team clinched at position i iff every scenario lands them there. Still-tied subgroups after H2H points (e.g. a 3-way cycle where overall GD would decide) are reported as ambiguous — never false-positive. **Why this matters:** FIFA 2026 moved H2H *ahead* of overall GD in the tiebreaker order, so a leader who has already beaten the chasing team is clinched on any pure points-tie scenario — the new rule wouldn't be visible to a points-only check. Mexico's real-world state on 2026-06-19 is locked in as a regression test.
  - **▲ green / ▼ red movement glyph** next to each team in `PlayerBreakdown`, showing how that team moved in the real standings since the prior matchday's end. Backed by a new KV key `snapshots:groups` ({ A: { "1": [order], "2": [order] }, ... }) written on clean matchday boundaries (`min played == max played == N`, all 4 teams) in `fd.js`'s post-refresh hook. Bounded at ~24 writes per group stage. No movement shown for MD1 (no prior matchday to compare).
  - **Side fix:** `ordersFromMatches` (the fallback path when `/standings` is unavailable) was building rows with `pts` but calling `clinchedPositions` which reads `points` — that whole path silently returned all-null clinched. Normalized at the call site, regression test added.
  - Two-line copy update in the Help modal's color-meanings section so the green ✓ description matches the new "clinched OR group final" semantics, plus a new "▲ / ▼" row. No `entry.js`/`admin.js`/`LOCK_ISO`/scoring-matrix touch. 31 new tests across clinch (strict + HTH), movement, snapshots, H2H builders, and the regression fix.
- **2026-06-11 — Match-score safeguards: dash fallback + admin override** ([PR #20](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/20), merge `f69b6bf`). The first World Cup match (Mexico v South Africa) finished and the Matches tab rendered "null–null" under the FT badge. The cause was upstream, not us: football-data.org had flipped the match's status to FINISHED before it populated `score.fullTime.home`/`.away`, so our transform pulled in `null`s and the UI printed them. Two changes ship together:
  - **Safety net in the UI.** `MatchRow` in `src/App.jsx` now checks whether both scores actually exist before rendering them. A finished match with missing scores shows "—" instead of "null–null", and we don't bold either team as the winner. Keeps the green `FT` badge — it just refuses to invent numbers.
  - **Admin can fill it in by hand.** New `setMatchScore` action on `POST /api/admin` writes per-match overrides to a new KV key `manualMatchScores`, keyed by the football-data match id (e.g. `{ "537327": { "home": 2, "away": 1 } }`). `functions/api/state.js` reads that key after fetching matches and overlays the override onto the matching id before sending the response — so the UI never sees the missing score in the first place. Override **always wins**, even over a non-null feed score, so the same control also lets admin correct a wrong score; clearing both inputs and saving deletes the override and reverts that match back to whatever the feed currently says.
  - **New admin-modal card "MATCH SCORE OVERRIDES"** lives between the ENTRIES card and the group-results overrides. Lists every FINISHED match with editable home/away inputs and Save/Clear buttons; any match with a missing feed score gets a red `MISSING` tag so the safeguard use-case is obvious at a glance.
  - **Scope guard:** group standings are completely untouched — those still come from the separate `manualResults` flow per the "one shared tournament" invariant in this doc. No change to LOCK_ISO, entry.js, or scoring matrix. 16 new tests in `test/transform.test.mjs` cover the admin action (auth, valid write, bad payload rejection, clear behavior) and the state overlay (no-override passthrough, null-fill, feed-score correction, phantom-id ignored).
- **2026-06-11 — Matches tab with full fixture list in EST** ([PR #17](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/17), merge `4d16f90`). New "Matches" tab between My Picks and Standings showing every fixture from football-data.org, grouped by EST date headers. Finished rows show an `FT` badge + final score; upcoming rows show kickoff time in EST and `vs`. Today's section gets a green `TODAY` pill and accent date. New `matchesFromFeed()` in `functions/_lib/transform.js` normalizes every match through `teamMap`, drops unmappable rows, sorts ascending by `utcDate`, and leaves score fields `null` for non-FINISHED so the UI doesn't render "0–0" before kickoff. New `getMatches()` in `functions/_lib/fd.js` mirrors `getGroupOrders`'s cache-and-serve-stale pattern against new key `cache:matches` (10-min TTL); no stage filter, so knockout fixtures appear automatically once the feed publishes them. `functions/api/state.js` parallel-fetches groups + matches and exposes `matches` on the response. Auto-scroll-to-today was dropped (scrolling the page on tab click would push the tab bar off-screen); today is highlighted visually instead. 12 new tests in `test/transform.test.mjs`. No KV migration, no admin-modal change, no scoring change.
- **2026-06-07 — Contrarian / consensus view** ([PR #14](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/14), merge `ab36b70`). Backlog task 1 (was). New `tallyPicks(entries)` helper in `src/data.js` buckets picks per group/slot with a denominator of entries-that-submitted-picks. Post-lock, Picks tab renders a `ContrarianStrip` below each `GroupCard` showing the user's 1st/2nd/3rd with `X of N picked this` and a gold `CONTRARIAN` pill when the share is ≤ 25% (gated to `total ≥ 4` to avoid noise in tiny pools). Standings tab adds a two-line `POOL 1ST` block at the bottom of each per-group card in `PlayerBreakdown` (two lines so country names don't ellipsis at the 120px card width). Pure read-only; no KV / API / admin-modal change. 4 new `tallyPicks` tests in `test/transform.test.mjs`.
- **2026-06-06 — Tiebreaker placeholder in Help modal** ([PR #12](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/12), merge `71d5b37`). Backlog task 1 (was). New "Tiebreaker · TBD" card in `HelpModal` between the color-meanings section and the TL;DR. Notes that ties on total points will be broken; names the leading candidate (most correct knockout picks weighted by round depth — R32 < R16 < QF < SF < Final). No scoring-logic changes; placeholder only.
- **2026-06-06 — Hide standings projections until games kick off** ([PR #11](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/11), merge `2640c2e`). Backlog task 2 (was). New `"pending"` status in `functions/_lib/transform.js` (both `ordersFromStandings` and `ordersFromMatches`): a group is pending iff every team has played 0 games, live as soon as one has. `App.jsx` skips pending groups in totals, adds a `Trophy`-iconed banner ("Tournament hasn't started yet — projections start once games kick off on June 11") when every group is pending, and renders `—` + a muted `PENDING` tag per group instead of red `~`/`PROJECTED`. Pure additive — no KV / API contract / admin-modal change. 4 new tests in `test/transform.test.mjs`.
- **2026-06-04 — "How it works" help modal** ([PR #6](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/6), merge `015fcd6`). New `HelpPill` next to the lock countdown in the header opens a `HelpModal` explaining scoring, projected-vs-final points, and the red/green/white/dimmed colors on the Standings tab. Frontend only; not a numbered backlog task.
- **2026-06-04 — Drag-and-drop reordering for group picks** ([PR #5](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/5), merge `8bc4ac0`). `GroupCard` now uses `@dnd-kit/sortable` instead of up/down arrow buttons. Drag with mouse/touch, or Tab+Space+Arrows+Space for keyboard. `PicksTab.move(g,idx,dir)` replaced with `reorder(g, newOrder)`. Locked state renders a static `StaticRow`; editable state uses `DndContext`+`SortableContext`+`SortableRow` with a `GripVertical` handle. Admin modal still uses arrows (out of scope).
- **2026-06-04 — Lock blocks new entries after LOCK_ISO** ([PR #4](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/4), merge `9263cac`). `functions/api/entry.js` now rejects any POST after `LOCK_ISO` — new or edit — not just edits (dropped the `&& existing` guard). Added 5 tests in `test/transform.test.mjs` that mock `Date.now` and a fake `POOL` around `onRequestPost` to cover before-lock accept, after-lock new-entry reject, and after-lock edit reject (regression guard).
- **2026-06-04 — World Cup color scheme (Pitch & Trophy)** ([PR #3](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/3), merge `fcb3ffa`). Replaced the pink/gold palette with a football-themed green/gold scheme. Dropped `--mag`; added `--pitch` (brand) and `--red` (live/alert/delete). Re-tinted bg/card/line/text/muted toward dark pitch. Frontend only.
- **2026-06-04 — Admin: delete a bracket** ([PR #1](https://github.com/Danoc99/worldcup2026-bracket-challenge/pull/1), merge `2b3df6e`). New `deleteEntry` action on `POST /api/admin` (admin-pass-checked, slugs the name, KV-deletes `entry:<slug>`) plus an ENTRIES card at the top of the admin modal with per-row Delete.

## Backlog

Ordered easiest → hardest. Pick one and propose a plan before coding.

1. **Phase 2 — Knockout bracket.** When FIFA releases the Round of 32 bracket on
   2026-06-27, open a 1-day window for players to fill out a knockout bracket
   (R32 → Final). Full plan + decisions in [`docs/knockout-plan.md`](docs/knockout-plan.md) — read that before
   implementing. Open questions in the doc must be answered first.

   - Tiebreaker rule (placeholder shipped — see Recently shipped). Concrete rule
     lands alongside knockout scoring per the plan doc.

## Notes
- README.md is intentionally visitor/recruiter-facing — keep setup/deploy mechanics
  OUT of it. Put any contributor/deploy docs in CONTRIBUTING.md or docs/.
