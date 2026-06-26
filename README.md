# World Cup 2026 Bracket Challenge

> A March-Madness-style prediction pool for the FIFA World Cup 2026.

### → [**Live site: dcoworldcup.xyz**](https://dcoworldcup.xyz)

Players predict the 1→4 finishing order of all 12 groups. The leaderboard updates automatically from a live football data feed, with mathematically-clinched indicators, per-matchday movement chips, and a contrarian/consensus view comparing each pick against the pool. A knockout-bracket phase opens once FIFA publishes the Round of 32.

**Status:** live in production on Cloudflare Pages.

---

## What it does
this is a test line

**For players:**

- Drag-and-drop predicted standings for each World Cup group (mouse, touch, or keyboard)
- Save and edit picks with a simple PIN
- Browse the full match schedule in EST with kickoff times and final scores
- Watch the live leaderboard with projected points, mathematically-clinched ✓ teams, and ▲/▼ movement after every matchday
- See how each pick compares to the rest of the pool (contrarian badge + consensus row)

**For the admin:**

- Set up the pool
- Override group standings or individual match scores when the live feed is wrong or incomplete
- Delete entries if needed
- Keep the app online even when the upstream data feed has issues

---

## Engineering highlights

Selected non-obvious problems solved while building this:

- **FIFA 2026 head-to-head clinch simulation.** Enumerates every win/draw/loss scenario for unplayed group-stage matches (≤729 per group, fits in a Worker), applies the FIFA-2026 head-to-head mini-table (points → GD-in-H2H → GS-in-H2H), and marks a team clinched only if every scenario lands them in the same slot. Captures the rule change where H2H now sits *above* overall GD.
- **Cache-and-serve-stale data resilience.** football-data.org responses are cached in Cloudflare KV with a 10-minute TTL; if the upstream fails, the last good payload is served stale so the leaderboard never breaks.
- **Snapshot-based movement detection.** Group and leaderboard snapshots are written only on clean per-group matchday boundaries (~24 KV writes across the entire tournament), powering both ▲/▼ team movement on the standings cards and the ▲N / ▼N / — player rank chip on the leaderboard.
- **Full keyboard accessibility for drag-and-drop.** The Picks screen uses `@dnd-kit` with both pointer and keyboard sensors — fully usable with Tab + Space + Arrow keys, not just a mouse.
- **API key never reaches the browser.** football-data.org is called server-side from Cloudflare Pages Functions; the secret stays in Cloudflare's secret store and the frontend only sees the transformed result.
- **Scoring matrix mirrored across three files with a documented sync requirement.** Frontend, backend, and tests are kept in lockstep so the leaderboard a user sees and the snapshots written server-side can never disagree.

---

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Drag & drop | `@dnd-kit` (pointer + keyboard sensors) |
| Icons | lucide-react |
| Backend | Cloudflare Pages Functions |
| Storage | Cloudflare Workers KV |
| Live data | football-data.org API (server-side only) |
| Hosting | Cloudflare Pages |
| Tests | Node-based transform/scoring tests (138 tests) |

---

## Architecture

A React frontend in `src/` and a serverless backend in `functions/api/`. On page load, the frontend calls `/api/state`, which loads the pool configuration, saved entries, admin overrides, and current group standings + match list. Football-data.org is called server-side from Cloudflare Pages Functions using a secret API key; responses are cached in Cloudflare KV with stale-fallback so a feed outage never breaks the leaderboard.

---

## Roadmap

**Phase 2 — Knockout bracket.** Once FIFA publishes the Round of 32 (2026-06-27), a one-day window opens for players to fill out a knockout bracket (R32 → Final) with deeper-round scoring on top of the group-stage total. Full plan in [`docs/knockout-plan.md`](docs/knockout-plan.md).

**Other future work:** invite-only pool access, shareable leaderboard screenshots, user edit history, admin backup/restore tools.

---

## Development & deployment

For local setup, environment variables, KV bindings, Cloudflare Pages deployment, and the working agreement, see [**CONTRIBUTING.md**](CONTRIBUTING.md).

## License

Private project unless a license is added.
