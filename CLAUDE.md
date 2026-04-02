# Wheel Strategy Tracker — Claude Context

## Project Purpose

A personal portfolio tracker for the **wheel options strategy** — selling cash-secured puts (CSP) and covered calls (CC) on individual stocks. Tracks position chains from open → assignment → covered calls → close/expiry, calculating accurate cost basis, P&L, and ROI per chain and per period.

Originally migrated from Google Apps Script + Google Sheets. Migration is complete — now in active feature development.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, server components) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS (dark theme from day 1) |
| Database | Supabase (PostgreSQL, free tier) |
| Auth | Supabase Auth (Google OAuth) |
| Hosting | Vercel (auto-deploy from git) |
| Testing | Vitest (unit tests for all calculation logic) |
| CSV Parsing | PapaParse (client + server) |
| Package Manager | pnpm |

## Architecture Decisions

- **No ORM** — use Supabase JS client directly (simple queries, no abstraction overhead)
- **Server Components** — fetch data on the server, pass to client components as props
- **No state management library** — React useState + server components is sufficient
- **Monorepo** — everything in one Next.js project
- **Deterministic IDs** — transaction deduplication via hash of (date + action + symbol + quantity)
- **Same-day processing priority** — Assigned/Expired processes before BTC before STO when building chains
- **Roll detection** — same-day closure + matching contract count = pending roll, awaiting reopen
- **Covered call attribution** — multiple assigned chains → CC goes to most recently assigned chain
- **Middleware location** — `src/middleware.ts` (not project root) — Next.js requires this when using `src/` directory layout

## Key Source Files

| File | Purpose |
|------|---------|
| `Code.gs` | Legacy Apps Script reference (migration complete) |
| `Index.html` | Legacy UI reference (migration complete) |
| `MIGRATION_PLAN.md` | Product roadmap — completed sprints + upcoming features |
| `sample-data/schwab-tna-sample.json` | TNA test data — roll detection, multiple chains |
| `sample-data/schwab-pltr-sample.json` | PLTR test data — completed wheel, $901.36 P&L |
| `sample-data/schwab-sofi-sample.json` | SOFI test data — open/assigned position |

## Color Palette & Fonts

```
Background primary:   #0a0e1a
Background secondary: #111827
Background tertiary:  #1a2234
Accent (teal):        #00d4aa
Text primary:         #e2e8f0
Text secondary:       #94a3b8
Positive (green):     #10b981
Negative (red):       #ef4444
Border:               #1e2d3d
```

Fonts: **DM Mono** (code/numbers) + **DM Sans** (UI text)

## Function Migration Map

| Business Logic | Source Location | Target File |
|---------------|----------------|------------|
| `parseTx()` | `Code.gs:87` | `src/lib/parsers/schwab.ts` |
| `buildChains()` | `Code.gs:427` | `src/lib/chains.ts` |
| `computeChainCostBasis()` | `Code.gs:289` | `src/lib/costBasis.ts` |
| `computeWheelSummary()` | `Code.gs:320` | `src/lib/costBasis.ts` |
| `computePeriodPnl()` | `Code.gs:370` | `src/lib/pnl.ts` |
| `getAppData()` | `Code.gs:202` | `src/app/api/transactions/route.ts` |
| `importTransactions()` | `Code.gs:38` | `src/app/api/import/route.ts` |

## Sprint Status

| Sprint | Goal | Status |
|--------|------|--------|
| **0** | Project scaffold — empty app runs locally + deploys to Vercel | Complete |
| **1** | Port all business logic to TypeScript + 53 Vitest tests passing | Complete |
| **2** | Supabase schema, JSON/CSV import API, ImportModal with drag-and-drop | Complete |
| **3** | Chains view (`/chains`): KPI cards, ChainTable with ticker grouping + combined CB, ticker detail page (`/ticker/[ticker]`) | Complete |
| **4** | P&L landing page (`/`): KPI cards (Last Week/Month/YTD), two-level expandable weekly/monthly breakdown, roll detection, YTD stats | Complete |
| **5** | Auth + multi-user (Supabase Google OAuth + RLS policies) | Complete |
| **6** | Robinhood CSV parser, split fill aggregation, broker filter UI | Complete |
| **8** | Options Calculator (CSP Scanner + CC Simulator) on ticker page | Complete |
| **8a** | Open position cost basis + nav filter dropdowns | Complete |
| **7** | Responsive & polish (mobile layout, error states, loading skeletons) | Pending |
| **9** | Premium income charts (bar chart on P&L page) | Pending |
| **10** | Manual trade entry (quick-add form) | Pending |
| **11** | Expiration alerts & position warnings | Pending |
| **12** | Win rate & strategy analytics | Pending |
| **13** | Capital at risk dashboard | Pending |
| **14** | Ticker page enrichment (campaign view) | Pending |
| **15** | Export & reporting (CSV/PDF) | Pending |
| **16** | Market data integration (live prices) | Pending |

## App Routes

| Route | View |
|-------|------|
| `/` | P&L landing page — KPI cards + weekly/monthly breakdown |
| `/chains` | Chains view — ticker-grouped table with combined cost basis |
| `/ticker/[ticker]` | Ticker detail — cost basis breakdown, chains, all transactions |
| `/api/transactions` | GET — returns transactions, chains, period P&L, YTD stats |
| `/api/import` | POST — accepts Schwab JSON/CSV or Robinhood CSV, deduplicates, inserts to Supabase |

## Wheel Strategy Concepts

- **CSP (Cash-Secured Put)** — sell put, collect premium, may get assigned stock
- **CC (Covered Call)** — sell call on assigned stock, collect premium
- **Chain** — full sequence from first CSP through final exit (completed wheel)
- **Roll** — close current option + open new one same day (extends duration)
- **Assignment** — option exercised, stock bought at strike price
- **Cost Basis** = (Assignment Cost − Put Premiums + Put BTC costs − Call Premiums + Call BTC costs) ÷ shares
- **Chain statuses**: OPEN, ASSIGNED, COMPLETED, EXPIRED, CLOSED
