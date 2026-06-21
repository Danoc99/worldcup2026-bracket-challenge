# Contributing

This file collects the contributor- and deploy-facing details that used to live in the README. The README itself is intentionally visitor/recruiter-facing; everything practical for running, deploying, or extending the app lives here.

## Production status

- Deployed on Cloudflare Pages
- Cloudflare KV storage is working
- `FOOTBALL_DATA_KEY` is configured as a Cloudflare secret
- `/api/health` passes
- Users can create and save brackets; brackets persist correctly
- Standings are working

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
| `/api/state` | GET | Returns config, entries, standings, overrides, matches, and feed status |
| `/api/setup` | POST | Initializes the pool name and admin password |
| `/api/entry` | POST | Creates or updates a user's bracket entry (lock-aware) |
| `/api/admin` | POST | Verifies admin, saves manual result overrides, deletes entries, sets per-match score overrides |
| `/api/health` | GET | Checks API key presence, feed reachability, parsed groups, and mapping issues |

## Cloudflare KV data

The app stores production data in a KV namespace bound as `POOL`.

Keys:

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

KV has **no migration tooling** and writes are **last-write-wins**. Any change to KV key shapes needs an explicit plan for data already stored.

## Environment variables and secrets

### Required secret

```text
FOOTBALL_DATA_KEY
```

The football-data.org API key. Must be configured as a Cloudflare secret. Never commit it.

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

Start the Vite development server (frontend only, no Functions):

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

Run the built app with Wrangler (full app + Functions locally):

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

The project is live in production, so changes should be small, tested, and low-risk.

- Do not commit `.dev.vars`
- Do not commit real API keys or secrets
- Do not commit `node_modules` or `dist`
- Keep the admin manual override path available as an emergency fallback
- Check `/api/health` after every deployment
- Avoid major rewrites unless there is a clear production reason
- `main` is production. Always branch off main and open a PR.
- Run `npm test` and `npm run build` before merging — both must pass.

## Known MVP risks

- Admin password hashing is lightweight and should be improved before wider public use
- User PINs are simple MVP authentication and should eventually be hashed
- Rate limiting is not implemented
- Backend prediction validation could be stricter
- Cloudflare KV is eventually consistent — acceptable at MVP scale; may matter later

## Working agreement (for AI assistants)

If you're an AI assistant editing this repo, read [`CLAUDE.md`](CLAUDE.md) before making any changes. It contains the full architectural context, the working agreement, key invariants, and the recently-shipped log.
