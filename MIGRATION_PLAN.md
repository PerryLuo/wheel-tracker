# Wheel Strategy Tracker — Migration Plan
## Google Apps Script → Next.js + TypeScript + Supabase

**Created:** 2026-03-27
**Goal:** Production-grade wheel strategy tracker with multi-broker support, CSV/JSON import, and polished UI

---

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | Next.js 15 (App Router) | Server components + API routes |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS | Dark theme from day 1 |
| Database | Supabase (Postgres) | Free tier, built-in auth |
| Auth | Supabase Auth | Google OAuth |
| Hosting | Vercel | Auto-deploy from git |
| Testing | Vitest | Unit tests for all calculation logic |
| CSV Parsing | PapaParse | Client + server side |
| Package Manager | pnpm | Fast, disk efficient |

---

## Sprint 0 — Project Scaffold (Day 1) ✅

**Goal:** Empty app runs locally and deploys to Vercel

- [x] Initialize Next.js 15 with TypeScript, Tailwind, App Router
- [x] Set up project structure (layout, pages, lib, components, hooks, supabase migrations, tests/fixtures)
- [x] Configure Tailwind dark theme (port existing CSS variables)
- [x] Create Supabase project + connect
- [x] Deploy empty app to Vercel
- [x] Confirm: local dev (`pnpm dev`) + Vercel preview both work

**Deliverable:** Empty dark-themed shell with nav showing "Chains" and "P&L" tabs

---

## Sprint 1 — Types & Core Logic Port (Day 1-2) ✅

**Goal:** All calculation logic ported to TypeScript with tests passing

### 1a. Define Types (`src/lib/types.ts`)
- [x] `Transaction` interface
- [x] `Chain` interface (with costBasis, wheelSummary, currentStrike, currentExpiry, roiPct)
- [x] `Leg` interface with `chainType` (LegChainType union)
- [x] `WheelSummary` interface
- [x] `PeriodPnl` interface

### 1b. Port Calculation Logic
- [x] `buildChains()` → `src/lib/chains.ts` (same-day priority, roll detection, CC attribution, call assignment/expiry)
- [x] `computeChainCostBasis()` → `src/lib/costBasis.ts`
- [x] `computeWheelSummary()` → `src/lib/costBasis.ts`
- [x] `computePeriodPnl()` → `src/lib/pnl.ts`
- [x] BTC CALL fix: clears `currentStrike`/`currentExpiry` (improvement over Code.gs)

### 1c. Write Tests
- [x] 53 Vitest tests passing across chains, costBasis, parsers
- [x] TNA: 4 chains, roll detection, combined CB $44.27/sh
- [x] PLTR: COMPLETED chain, $901.36 total P&L
- [x] SOFI: open/assigned position

**Deliverable:** `pnpm test` passes, all core logic verified against known data

---

## Sprint 2 — Database & Import (Day 2-3) ✅

**Goal:** Transactions stored in Supabase, import works via UI

### 2a. Database Schema
- [x] `transactions` table with deterministic ID, all fields, broker + raw JSONB columns
- [x] 3 indexes (user_id, underlying, date)
- [x] Supabase migration file at `supabase/migrations/001_init.sql`
- [ ] Row-level security (deferred to Sprint 5 with auth)

### 2b. Parsers
- [x] `src/lib/parsers/schwab.ts` — `parseTx()` for Schwab JSON format
- [x] `src/lib/parsers/schwab.ts` — CSV parsing (Schwab CSV export format via PapaParse)
- [x] `src/lib/parsers/normalize.ts` — `BrokerParser` interface + auto-detection
- [x] Deduplicate on import via deterministic ID hash

### 2c. API Routes
- [x] `POST /api/import` — JSON or CSV, parses, deduplicates, upserts to Supabase
- [x] `GET /api/transactions` — returns transactions, chains, weekly/monthly P&L, YTD stats, totalPnl

### 2d. Import Modal UI
- [x] Drag-and-drop file upload (.json and .csv)
- [x] Paste JSON textarea
- [x] Loading spinner, success/error feedback with import/skip counts
- [x] Auto-detect Schwab JSON vs CSV

**Deliverable:** Can import Schwab JSON + CSV, data persists in Supabase

---

## Sprint 3 — Chains View UI (Day 3-4) ✅

**Goal:** Chains page matches current functionality with better UX

### 3a. Components
- [x] `KpiCards.tsx` — total P&L, open positions, completed wheels
- [x] `ChainTable.tsx` — two sections (Active / Closed), ticker-grouped with combined CB header rows
  - Weighted-average combined cost basis badge per ticker
  - Click ticker → navigate to `/ticker/[ticker]`
  - Chain rows show: status, open/close date, contracts, strike (PUT assignment strike for ASSIGNED), expiry, committed, P&L, ROI
  - BTC CALL bug fixed: assignment column now shows PUT strike, not call strike
- [x] `StatusBadge` + `LegTypeBadge` in `src/components/ui/Badges.tsx`

### 3b. Ticker Detail View (`/ticker/[ticker]`)
- [x] Back link to `/chains`
- [x] Header: ticker, combined CB badge, chain count, committed, total net P&L
- [x] Cost Basis Breakdown table (per assignment: date, contracts, shares, CB/sh, premiums collected; + combined total row)
- [x] Position Chains table (chain ID, status, open/close, qty, capital, P&L, ROI)
- [x] All Transactions table (deduplicated, newest-first, with LegTypeBadge)

**Deliverable:** Chains view fully functional at `/chains`, ticker detail at `/ticker/[ticker]`

---

## Sprint 4 — P&L View UI (Day 4-5) ✅

**Goal:** Weekly/monthly P&L breakdown with drill-down

### 4a. KPI Cards (top of page)
- [x] Last Week: committed, P&L, ROI%
- [x] Last Month: committed, P&L, ROI%
- [x] YTD: committed, P&L, ROI% (YTD stats computed in API route)

### 4b. Breakdown Table
- [x] Weekly / Monthly toggle (defaults to weekly)
- [x] Columns: Period, Committed, P&L, ROI%, Running Total
- [x] Level 1 accordion: click period → show ticker subtotals
- [x] Level 2 accordion: click ticker → show individual transactions
  - Transactions sorted: BTC first, then Assigned/Expired, then STO (within same date)
  - Roll detection: same-day BTC+STO pairs → ROLL badge shown, BTC appears before STO
  - $0.00 amounts hidden; option type, strike, quantity shown on each row
  - Ticker names link to `/ticker/[ticker]` detail page
- [x] Running total accumulates chronologically (oldest→newest)
- [x] P&L landing page is `/`; `/pnl` redirects to `/`; Chains is `/chains`

**Deliverable:** P&L view fully functional as landing page with correct ROI + roll detection

---

## Sprint 5 — Auth & Multi-User (Day 5-6) ✅

**Goal:** Users can sign up, log in, and see only their data

- [x] Supabase Auth setup (Google OAuth provider via Google Cloud Console)
- [x] Login page (`/login`) with Google sign-in button, friendly copy
- [x] `src/middleware.ts` — validates JWT on every request, redirects unauthenticated users to `/login`
      Note: must be in `src/` directory (not project root) when using `src/` layout
- [x] Route groups: `(app)` layout has Nav, `(auth)` layout is bare — login page has no Nav
- [x] RLS enabled on transactions table (`002_auth.sql` migration applied via Supabase CLI)
- [x] `user_id` backfilled on existing rows, FK constraint to `auth.users` with ON DELETE CASCADE
- [x] Protected API routes — both `/api/transactions` and `/api/import` validate session via `getUser()`
- [x] Import route stamps `user_id` on every inserted row
- [x] Sign out button in Nav
- [x] Verified with test user: RLS correctly isolates data between accounts
- [ ] User settings page (deferred — not needed for personal use)

**Deliverable:** App is multi-user ready, data isolated per user, Google OAuth working

---

## Sprint 6 — Broker Expansion & CSV (Day 6-7)

**Goal:** Support multiple broker formats

- [ ] `src/lib/parsers/ibkr.ts` — Interactive Brokers CSV/flex query parser
- [ ] `src/lib/parsers/robinhood.ts` — Robinhood CSV parser
- [ ] `src/lib/parsers/tastytrade.ts` — Tastytrade CSV parser
- [ ] Import modal: broker auto-detection OR manual dropdown
- [ ] Column mapping UI for unknown CSV formats (map columns to fields)
- [ ] Test each parser with sample data

**Deliverable:** Import from 4+ brokers

---

## Sprint 7 — Polish & Production (Day 7-8)

**Goal:** Production-ready quality

- [ ] Responsive design (mobile-friendly tables → card layout on small screens)
- [ ] Error boundaries and graceful error states
- [ ] Empty states (no data yet → show import CTA)
- [ ] Loading skeletons for data fetching
- [ ] Keyboard navigation (arrow keys in tables)
- [ ] SEO + meta tags
- [ ] Custom domain setup
- [ ] Analytics (Vercel Analytics or Plausible)
- [ ] Rate limiting on API routes
- [ ] End-to-end test with Playwright (import → verify chains → verify P&L)

**Deliverable:** Ship it

---

## Future Sprints (Post-Launch)

### Sprint 8 — Advanced Features
- [ ] Portfolio-level dashboard (all tickers at a glance)
- [ ] Dividend tracking (already in Schwab data)
- [ ] Export to CSV/PDF
- [ ] Dark/light theme toggle

### Sprint 9 — Market Data Integration
- [ ] Current stock prices (for unrealized P&L on open positions)
- [ ] Options chain viewer (see available strikes)
- [ ] Break-even visualization

### Sprint 10 — Analytics
- [ ] Win rate by ticker
- [ ] Average days in trade
- [ ] Best/worst performing wheels
- [ ] Premium decay charts
- [ ] Annualized return calculation

---

## Migration Checklist (Code.gs → TypeScript)

| Function | Source | Target | Status |
|----------|--------|--------|--------|
| `parseTx()` | Code.gs:79 | `src/lib/parsers/schwab.ts` | ✅ Complete |
| `buildChains()` | Code.gs:335 | `src/lib/chains.ts` | ✅ Complete |
| `computeChainCostBasis()` | Code.gs:268 | `src/lib/costBasis.ts` | ✅ Complete |
| `computeTickerCostBasis()` | Index.html (frontend) | `src/lib/costBasis.ts` | ✅ Complete |
| `computeWheelSummary()` | NEW | `src/lib/costBasis.ts` | ✅ Complete |
| `computePeriodPnl()` | Code.gs | `src/lib/pnl.ts` | ✅ Complete |
| `getAppData()` | Code.gs | `src/app/api/transactions/route.ts` | ✅ Complete |
| `importTransactions()` | Code.gs | `src/app/api/import/route.ts` | ✅ Complete |
| `getOrCreateSheet()` | Code.gs | Supabase migration | ✅ Complete |

## Key Decisions
- **No ORM** — use Supabase JS client directly (simple queries, not complex joins)
- **Server Components** — fetch data on server, pass to client components for interactivity
- **No state management library** — React useState + server components is sufficient for this app size
- **Monorepo** — everything in one Next.js project, no separate backend
