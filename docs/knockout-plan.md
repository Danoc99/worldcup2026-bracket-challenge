# Phase 2 — Knockout bracket plan

Drafted 2026-06-07 (group stage hasn't started yet; written ahead of time so the
implementation crunch on the R32 reveal day is mostly mechanical, not deliberative).

**Status:** draft — open questions at the bottom must be resolved before code lands.
Once approved, treat changes as new decisions, not refinements.

## Timing

- **R32 bracket reveal:** ~2026-06-27 by FIFA (exact time TBD).
- **Knockout picks window:** opens at reveal, closes at first R32 kickoff (~2026-06-28
  16:00 UTC, TBD — confirm against the actual schedule).
- **New constant:** `KNOCKOUT_LOCK_ISO` in `src/data.js` AND `functions/_lib/util.js`
  (kept in sync, same as `LOCK_ISO`).

## Scoring

Per-match values (locked in):

| Round | Per-match | Matches | Round total |
|-------|----------:|--------:|------------:|
| R32   |  40 | 16 |   640 |
| R16   |  80 |  8 |   640 |
| QF    | 160 |  4 |   640 |
| SF    | 320 |  2 |   640 |
| Final | 640 |  1 |   640 |
| **Total** | | **31** | **3,200** |

- Clean doubling per round mirrors the "deeper rounds are skill, not luck" philosophy.
- Weighted so the knockout dominates final standings (~82% of max combined points)
  but a strong group performance still matters. R32 at 40 pts beats the easiest
  group pick (25 pts for an exact 1st-place hit) — the harder decision pays more.
- 3rd-place playoff: **not scored** (also not displayed — see open question 4).
- Knockout points add to group-stage total. Max combined: 720 + 3,200 = **3,920**.
- Tiebreaker: existing `HelpModal` placeholder says "most correct knockout picks
  weighted by round depth (R32 < R16 < QF < SF < Final)". With per-round values
  40 < 80 < 160 < 320 < 640, summing raw knockout points naturally weights deeper
  rounds. Concrete tiebreaker = compare knockout-only point totals.

**Copy to update during implementation** (these currently advertise the old 1,600
number from a stale earlier decision):
- `App.jsx` `ScoringKey` paragraph — change "1,600 more (20/40/80/160/320 a round;
  the champion pick alone is 320)" → "3,200 more (40/80/160/320/640 a round; the
  champion pick alone is 640)".
- `App.jsx` `HelpModal` "How points work" card — extend with the knockout matrix.

## KV shape

**Decision: new `knockout:<slug>` key, separate from `entry:<slug>`.**

Why: group `predictions` are immutable after `LOCK_ISO`. A separate key means the
`/api/knockout` write path cannot accidentally clobber stored group picks under
last-write-wins. Cost: one extra KV read per entry in `state.js`. Acceptable —
KV reads are cheap and `state.js` already reads many keys.

New keys:
- `knockout:<slug>` — `{ picks, updatedAt }` where `picks` is
  `{ R32_1: "Brazil", R32_2: "Argentina", ..., FINAL: "Brazil" }`. Match IDs match
  the bracket structure (see below). Missing IDs = no pick (renders blank).
- `cache:knockout` — cached football-data knockout matches. Mirrors `cache:standings`,
  same serve-stale resilience.

Extend existing:
- `manualResults` — add a `.knockout` field: `{ groups: {...}, knockout: { R32_1: {winner, status} } }`.
  Absence of the field in existing keys = no override (backward compatible).

No migration needed: all three are net-new fields on net-new or backward-compatible
keys. `entry:<slug>` shape is unchanged.

## Match IDs / bracket structure

32 R32 teams → 31 matches if we skip 3rd-place playoff (we are).

Match ID scheme:
- `R32_1` through `R32_16` — Round of 32
- `R16_1` through `R16_8` — Round of 16 (winners of `R32_(2n-1)` and `R32_(2n)`)
- `QF_1` through `QF_4` — Quarterfinals
- `SF_1`, `SF_2` — Semifinals
- `FINAL`

The bracket itself (which teams are in which R32 match) is **derived from the
football-data feed**, not hardcoded. Hardcoding would mean editing on June 27;
deriving is safer and matches the existing pattern for group results.

## API contract changes

**New: `POST /api/knockout`**
- Body: `{ name, pin, picks }` mirroring `/api/entry`.
- PIN-checked via existing `entry:<slug>` lookup (same identity, separate brackets).
- Rejects with 423 after `KNOCKOUT_LOCK_ISO` — new entries AND edits, mirroring
  the post-LOCK_ISO fix in `entry.js`.
- Writes to `knockout:<slug>`.

**Extend: `GET /api/state`**
- Add `knockout: { matches: [...], picksByEntry: {...}, meta }` to response.
- `matches`: `[{ id: "R32_1", round: "R32", home: "Brazil", away: "South Korea", winner: "Brazil" | null, status: "scheduled" | "live" | "final" }]` for all 31.
- `picksByEntry`: `{ "<slug>": { R32_1: "Brazil", ... } }`. Empty `{}` per slug if no knockout entry yet.

**Extend: `POST /api/admin`**
- New `action: "setKnockoutResult"` — body `{ matchId, winner, status }` to override
  a single match. `winner: null` clears the override.

## Frontend changes

- New `src/data.js` exports: `KNOCKOUT_LOCK_ISO`, `KNOCKOUT_SCORE_MATRIX` (the
  per-round point values above), `KNOCKOUT_MATCH_IDS` (ordered list of all 31 IDs).
- New `KnockoutTab` component in `src/App.jsx`.
- Tab order: **My Picks · Standings · Bracket**. Bracket tab is visible only when
  `state.knockout.matches.length > 0` (post-reveal).
- Bracket UI: 5 columns left-to-right (R32 / R16 / QF / SF / Final). Each match cell
  shows two team rows; click to pick the winner. Downstream matches show "winner of
  M_N" placeholder until the upstream pick is made. Locked state shows pick + ✓/✗
  if the match is final.
- Scoring breakdown: extend `PlayerBreakdown` on Standings with a knockout summary
  card below the per-group grid: per-round points + total.
- `HelpModal`: extend the "How points work" section to include the knockout matrix.
  Tiebreaker card already references it.
- Admin modal: new "KNOCKOUT" section after the existing GROUPS, per-match
  Auto/Live/Final mode with winner override (same UX as group overrides).

## Implementation order (on the day)

Strictly sequential to avoid mid-flight rework. Each step ends with `npm test`
passing before moving to the next.

1. `src/data.js` + `functions/_lib/util.js`: add `KNOCKOUT_LOCK_ISO`,
   `KNOCKOUT_SCORE_MATRIX`, `KNOCKOUT_MATCH_IDS`. Tests: constants only, no logic.
2. `functions/_lib/transform.js`: add `bracketFromMatches(feedJson)` returning
   `{ matches: [...], unmapped: [...] }`. Mirror `ordersFromMatches`'s structure.
   Tests with a fixture pre-built from a real feed snapshot.
3. `functions/_lib/fd.js`: add `getKnockoutMatches()` paralleling the standings
   fetcher. Same serve-stale resilience pattern.
4. `functions/api/knockout.js`: new file mirroring `entry.js`. Tests for lock
   behavior (before/after `KNOCKOUT_LOCK_ISO`, like the existing entry.js tests).
5. `functions/api/state.js`: extend response with the `knockout` field.
6. `functions/api/admin.js`: add `setKnockoutResult` action.
7. `src/api.js`: wrappers for `submitKnockout`, `adminKnockoutOverride`.
8. `src/App.jsx`: `KnockoutTab` component + tab plumbing.
9. `src/App.jsx`: extend `PlayerBreakdown` with knockout summary; extend
   `HelpModal`; extend admin modal (highest risk of breaking existing flow — last).
10. `npm test`, `npm run build`.
11. Manual test on `npx wrangler pages dev dist --kv POOL` with a real feed.
12. PR + merge.

Rough estimate: 4–6 focused hours if the plan holds. The risk is step 2 (the
transform) and step 8 (the bracket UI). Both warrant a sanity check before
committing to a direction.

## Open questions — resolve before June 27

1. **3rd-place playoff:** skip entirely from picks + display, right?
2. **Lock window length:** ~24 hours from R32 reveal is tight (friends may be
   asleep). Worth extending to 36 hours?
3. **Mobile UX:** standard left-to-right bracket grid is rough on phones. Acceptable
   for the friends-pool audience, or worth a vertical mobile layout?
4. **Bracket structure source:** does football-data actually populate knockout
   matchups in the feed immediately after the FIFA draw? Verify on June 27 via
   `/api/health` or a manual fetch before relying on it. If not, fallback plan:
   manually enter the 16 R32 matchups via a one-time admin form.

## Not in scope

- Reseeding mechanics (FIFA's bracket is fixed once revealed).
- Real-time push notifications when picks are saved.
- Bracket visualization animations.
- Per-pool scoring overrides (intentional — see CLAUDE.md "Standings are ONE real
  tournament").
- Multiple-pool support (already dropped from backlog).
