# World Cup 2026 Bracket Challenge

**Live site:** [dcoworldcup.xyz](https://dcoworldcup.xyz)

A production MVP for running a private **World Cup 2026 group-stage bracket pool** with friends, family, classmates, coworkers, or a small community.

Users submit their predicted group standings, the app stores their bracket, pulls live standings data, calculates scores, and displays a leaderboard as the tournament progresses.

## What the app does

This app lets a group of people compete on World Cup 2026 predictions without using a spreadsheet or manually tracking every pick.

Users can:

- Enter their name and create a bracket
- Predict the final order of teams in each World Cup group (drag-and-drop or keyboard)
- Save their picks with a simple PIN
- Return later and view their saved bracket
- View current standings and leaderboard results with live projected points
- See scoring based on how accurate their predictions are
- Browse the full match schedule in their local-friendly EST timezone
- See how their picks compare to the rest of the pool (contrarian vs consensus)
- Track how many leaderboard spots they moved after each matchday

Admins can:

- Set up the pool
- Use an admin password to manage results
- Manually override group standings if live data is unavailable or incorrect
- Override individual match scores when the feed publishes a finished match without a final score
- Delete an entry from the pool if needed
- Keep the app running even if the external football data feed has issues

The app is already deployed as a working production MVP on Cloudflare Pages.

## Features

- World Cup 2026 group-stage bracket predictions
- Persistent user entries using Cloudflare KV
- Live standings from football-data.org with cached + stale-fallback resilience
- Admin manual override system (group results, per-match scores, single-entry delete)
- Leaderboard scoring with live projected points pre-tournament-final
- Drag-and-drop pick reordering (mouse, touch, or full keyboard support)
- Inline "How it works" help panel — scoring rules, color legend, examples
- Full match schedule grouped by EST date with `FT` / `TODAY` badges
- Mathematically-clinched ✓ indicator per team using FIFA 2026 head-to-head tiebreakers
- Real-time movement indicators: team ▲/▼ on Standings and player rank ▲N / ▼N / — chip on the leaderboard, updated after each matchday boundary
- Contrarian / consensus view — `CONTRARIAN` badge on Picks tab, `POOL 1ST` line on Standings
- Pre-tournament placeholder state ("no projections yet" banner before kickoff)
- Mobile-friendly React UI
- Serverless backend using Cloudflare Pages Functions
- Production health check endpoint

## Current production status

- Deployed on Cloudflare Pages
- Cloudflare KV storage is working
- `FOOTBALL_DATA_KEY` is configured as a Cloudflare secret
- `/api/health` passes
- Users can create and save brackets
- Brackets persist correctly
- Standings are working
- This is the current production MVP

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind-style utility classes |
| Icons | lucide-react |
| Backend | Cloudflare Pages Functions |
| Storage | Cloudflare Workers KV |
| Live data | football-data.org API |
| Hosting | Cloudflare Pages |
| Build output | `dist/` |
| Tests | Node-based transform/scoring tests |

## How it works

The app is split into two main parts:

1. A React frontend in `src/`
2. A serverless backend in `functions/api/`

When a user opens the site, the React app calls `/api/state`. That endpoint loads the pool configuration, saved user entries, admin overrides, and current group standings.

The app gets live football standings through football-data.org, but the frontend never talks to that API directly. Instead, Cloudflare Pages Functions handle the request on the server side using the secret API key. The result is cached in Cloudflare KV so the app is faster and more stable.

If the live data feed fails, the app can fall back to the most recent cached standings instead of breaking the leaderboard.

## Project structure

```text
.
├── functions/
│   ├── api/
│   │   ├── admin.js       # Admin login, manual overrides, entry delete, match-score overrides
│   │   ├── entry.js       # Create/update user bracket entries (lock-aware)
│   │   ├── health.js      # Production health check endpoint
│   │   ├── setup.js       # One-time pool setup endpoint
│   │   └── state.js       # Main app state endpoint
│   └── _lib/
│       ├── fd.js          # football-data.org fetch, cache, and fallback logic
│       ├── scoring.js     # Server-side score matrix mirror of src/data.js
│       ├── teamMap.js     # Maps API team names to app team names
│       ├── transform.js   # Converts live data into group standings, ranks, clinch, movement
│       └── util.js        # Shared helpers
├── src/
│   ├── App.jsx            # Main React application
│   ├── api.js             # Frontend API helper functions
│   ├── data.js            # Groups, flags, scoring rules, and app constants
│   └── main.jsx           # React entry point
├── test/
│   ├── fixtures/          # Test fixture data
│   └── transform.test.mjs # Transform and scoring tests
├── docs/
│   └── knockout-plan.md   # Phase 2 plan for the knockout bracket
├── index.html             # Vite HTML entry
├── vite.config.js         # Vite configuration
├── wrangler.toml          # Cloudflare Pages/KV configuration
├── package.json           # npm scripts and dependencies
└── .dev.vars.example      # Example local environment variables
```

## API routes

| Route | Method | Purpose |
|---|---:|---|
| `/api/state` | GET | Returns config, entries, standings, overrides, and feed status |
| `/api/setup` | POST | Initializes the pool name and admin password |
| `/api/entry` | POST | Creates or updates a user's bracket entry |
| `/api/admin` | POST | Verifies admin access or saves manual result overrides |
| `/api/health` | GET | Checks API key presence, feed reachability, parsed groups, and mapping issues |

## Cloudflare KV data

The app stores production data in a KV namespace bound as `POOL`.

Important keys include:

```text
config                # pool name, admin hash, created-at
entry:<user_slug>     # one per user — name, pin, predictions, updated-at
manualResults         # admin overrides of group standings (global)
manualMatchScores     # admin overrides of per-match scores, keyed by feed match id
cache:standings       # cached football-data /standings response
cache:matches         # cached football-data /matches response
snapshots:groups      # per-group matchday-boundary snapshots for ▲/▼ team movement
snapshots:players     # last two leaderboard snapshots for ▲N/▼N/— player chip
```

## Environment variables and secrets

### Required secret

```text
FOOTBALL_DATA_KEY
```

This is the football-data.org API key. It must be configured as a Cloudflare secret and should never be committed to GitHub.

### Required KV binding

```text
POOL
```

The backend expects a Cloudflare KV binding named exactly `POOL`.

## Local development

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build the production frontend:

```bash
npm run build
```

For local Cloudflare Pages Functions testing, copy the example environment file:

```bash
cp .dev.vars.example .dev.vars
```

Then add your real API key:

```text
FOOTBALL_DATA_KEY=your_real_token_here
```

Run the built app with Wrangler:

```bash
npm run build
npx wrangler pages dev dist --kv POOL
```

## Cloudflare Pages deployment

Expected Cloudflare Pages settings:

```text
Build command: npm run build
Build output directory: dist
```

Required production configuration:

- KV binding named `POOL`
- Secret named `FOOTBALL_DATA_KEY`
- `wrangler.toml` configured with `pages_build_output_dir = "dist"`

After deploying, verify:

```text
/api/health
```

## Stability notes

This project is already live in production, so changes should be small, tested, and low-risk.

Important production notes:

- Do not commit `.dev.vars`
- Do not commit real API keys or secrets
- Do not commit `node_modules` or `dist`
- Keep the admin manual override path available as an emergency fallback
- Check `/api/health` after every deployment
- Avoid major rewrites unless there is a clear production reason

## Known MVP risks

- Entry lock behavior should be reviewed before the tournament starts
- Admin password hashing is lightweight and should be improved before wider public use
- User PINs are currently simple MVP authentication and should eventually be hashed
- Rate limiting is not implemented
- Backend prediction validation should be stricter
- Cloudflare KV is eventually consistent, which is acceptable for a small MVP but may matter at larger scale

## Roadmap

### Immediate fixes

- Confirm no secrets are committed
- Add stricter backend validation for submitted group predictions
- Improve frontend error messages if `/api/state` fails

### MVP improvements

- Add admin export/download of all entries
- Add audit logging for manual admin overrides
- Show clearer feed status and last successful sync time
- Add simple request-size validation to API routes
- Improve admin authentication and user PIN storage

### Future features

- **Phase 2 — Knockout bracket predictions** (R32 → Final). Full plan in [`docs/knockout-plan.md`](docs/knockout-plan.md); opens after FIFA publishes the R32 bracket on 2026-06-27.
- Invite-only pool access
- Shareable leaderboard screenshots
- User edit history
- Admin backup/restore tools

## License

Private project unless a license is added.
