# Wheel Strategy Tracker — Product Roadmap

**Created:** 2026-03-27
**Updated:** 2026-04-01
**Goal:** Production-grade wheel strategy tracker with multi-broker support, CSV/JSON import, analytics, and polished UI

> **Note:** The original migration from Google Apps Script (Code.gs) to Next.js + TypeScript + Supabase is complete (Sprints 0–6). This document now serves as the product roadmap for new features and improvements.

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

## Completed Sprints

### Sprint 0 — Project Scaffold ✅

- [x] Initialize Next.js 15 with TypeScript, Tailwind, App Router
- [x] Set up project structure, Tailwind dark theme, Supabase connection
- [x] Deploy to Vercel

### Sprint 1 — Types & Core Logic Port ✅

- [x] `Transaction`, `Chain`, `Leg`, `WheelSummary`, `PeriodPnl` types
- [x] `buildChains()`, `computeChainCostBasis()`, `computeWheelSummary()`, `computePeriodPnl()`
- [x] 53 Vitest tests passing (TNA, PLTR, SOFI fixtures)

### Sprint 2 — Database & Import ✅

- [x] Supabase schema with deterministic IDs, indexes
- [x] Schwab JSON + CSV parsers with auto-detection
- [x] `POST /api/import` + `GET /api/transactions` API routes
- [x] Drag-and-drop import modal

### Sprint 3 — Chains View ✅

- [x] KPI cards, ChainTable with ticker grouping + combined CB
- [x] Ticker detail page (`/ticker/[ticker]`) with cost basis breakdown

### Sprint 4 — P&L View ✅

- [x] KPI cards (Last Week/Month/YTD), weekly/monthly toggle
- [x] Two-level expandable breakdown with roll detection

### Sprint 5 — Auth & Multi-User ✅

- [x] Google OAuth, RLS policies, session validation, sign out

### Sprint 6 — Broker Expansion ✅

- [x] Robinhood CSV parser, split fill aggregation
- [x] Broker filter UI (now dropdown), year filter (now dropdown)

### Sprint 8 — Options Calculator ✅

- [x] CSP Scanner + Covered Call Simulator on ticker page
- [x] OTM% display on CC cards

### Sprint 8a — Open Position Cost Basis ✅

- [x] Effective cost basis for OPEN chains (strike − net premiums per share)
- [x] Nav filters converted from pills to dropdowns (Brokerage / Year)

---

## Upcoming Sprints

### Sprint 7 — Responsive & Polish

**Goal:** Mobile-friendly layout and production-ready quality

**Priority:** HIGH — traders check positions from their phone constantly

- [ ] Responsive design (tables → card layout on small screens)
- [ ] Mobile-friendly nav (hamburger menu or collapsible filters)
- [ ] Touch-friendly expand/collapse on chain rows
- [ ] Error boundaries and graceful error states
- [ ] Empty states (no data yet → show import CTA)
- [ ] Loading skeletons for data fetching
- [ ] Custom domain setup

**Deliverable:** App is fully usable on mobile

---

### Sprint 9 — Premium Income Charts

**Goal:** Visual trend of income over time

**Priority:** HIGH — huge visual payoff, data already exists in PeriodPnl

- [ ] Bar chart on P&L page showing weekly/monthly premium income
- [ ] Cumulative premium line overlay
- [ ] Chart library integration (recharts or lightweight alternative)
- [ ] Filter by broker/year carries through to charts

**Deliverable:** At-a-glance income trend on P&L page

---

### Sprint 10 — Manual Trade Entry

**Goal:** Quick-add trades without importing a full CSV file

**Priority:** HIGH — useful for corrections, quick adds between imports

- [ ] "Add Trade" button in nav or on chains page
- [ ] Smart form that adapts fields based on action type (STO / BTC / Assigned / Expired)
- [ ] Pre-fill ticker from current page context (e.g., on `/ticker/PLTR`)
- [ ] Validate required fields (date, action, strike, quantity, premium)
- [ ] Insert directly to Supabase with deduplication check

**Deliverable:** Can log a single trade in under 10 seconds

---

### Sprint 11 — Expiration Alerts & Position Warnings

**Goal:** Never miss an expiration or sell CCs below cost basis

**Priority:** HIGH — low effort, data already exists on chains

- [ ] Banner/badge for positions expiring within 1–3 days
- [ ] Warning indicator when a CC's strike is below the chain's cost basis
- [ ] "Expiring Soon" section at top of chains page
- [ ] DTE (days to expiration) column on open positions

**Deliverable:** On-page alerts for positions needing attention

---

### Sprint 12 — Win Rate & Strategy Analytics

**Goal:** Understand strategy effectiveness at a glance

**Priority:** MEDIUM — all derivable from existing chain data

- [ ] KPI cards: win rate %, avg premium per contract, avg days held
- [ ] Win rate by ticker (% expired worthless vs assigned vs rolled)
- [ ] Average rolls per chain
- [ ] Best/worst performing tickers by total P&L and ROI
- [ ] Annualized return calculation

**Deliverable:** Analytics dashboard or enriched KPI section

---

### Sprint 13 — Capital at Risk Dashboard

**Goal:** Real-time view of capital deployment

**Priority:** MEDIUM — committedCapital already on chains

- [ ] KPI card: total capital deployed across all open positions
- [ ] Total premium collected vs capital at risk ratio
- [ ] Capital utilization over time (chart)
- [ ] Per-ticker capital breakdown

**Deliverable:** Clear picture of exposure and capital efficiency

---

### Sprint 14 — Ticker Page Enrichment

**Goal:** Make `/ticker/[ticker]` a full "campaign" view

**Priority:** MEDIUM — ticker page exists but could be richer

- [ ] Lifetime premium collected for ticker
- [ ] Total ROI across all chains for ticker
- [ ] Average days per wheel cycle
- [ ] Chain history timeline visualization
- [ ] Current position summary (shares held, current CB, unrealized P&L)

**Deliverable:** Comprehensive per-ticker campaign dashboard

---

### Sprint 15 — Export & Reporting

**Goal:** Get data out for taxes, record-keeping

**Priority:** MEDIUM — especially valuable at tax time

- [ ] Export filtered transactions to CSV
- [ ] Export P&L summary to CSV/PDF
- [ ] Tax lot report (cost basis, gains/losses by tax year)
- [ ] Print-friendly view for P&L breakdown

**Deliverable:** One-click export for any filtered view

---

### Sprint 16 — Market Data Integration

**Goal:** Real-time prices for unrealized P&L and position monitoring

**Priority:** LOW — requires 3rd party API (yahoo-finance2 or similar)

- [ ] Current stock prices on open positions
- [ ] Unrealized P&L on assigned chains (current price vs cost basis)
- [ ] Options chain viewer (available strikes + premiums)
- [ ] Break-even visualization on ticker page

**Deliverable:** Live market data enriching open positions

---

### Sprint 17 — Additional Broker Support

**Goal:** Support more brokerage export formats

**Priority:** LOW — Schwab + Robinhood covers primary use

- [ ] Interactive Brokers CSV/flex query parser
- [ ] Tastytrade CSV parser
- [ ] Column mapping UI for unknown CSV formats
- [ ] Import modal: broker auto-detection improvements

**Deliverable:** Import from 4+ brokers

---

## Migration Checklist (Code.gs → TypeScript) — COMPLETE ✅

| Function | Source | Target | Status |
|----------|--------|--------|--------|
| `parseTx()` | Code.gs:79 | `src/lib/parsers/schwab.ts` | ✅ |
| `buildChains()` | Code.gs:335 | `src/lib/chains.ts` | ✅ |
| `computeChainCostBasis()` | Code.gs:268 | `src/lib/costBasis.ts` | ✅ |
| `computeTickerCostBasis()` | Index.html | `src/lib/costBasis.ts` | ✅ |
| `computeWheelSummary()` | NEW | `src/lib/costBasis.ts` | ✅ |
| `computePeriodPnl()` | Code.gs | `src/lib/pnl.ts` | ✅ |
| `getAppData()` | Code.gs | `src/app/api/transactions/route.ts` | ✅ |
| `importTransactions()` | Code.gs | `src/app/api/import/route.ts` | ✅ |
| `getOrCreateSheet()` | Code.gs | Supabase migration | ✅ |

## Key Decisions

- **No ORM** — use Supabase JS client directly (simple queries, not complex joins)
- **Server Components** — fetch data on server, pass to client components for interactivity
- **No state management library** — React useState + server components is sufficient for this app size
- **Monorepo** — everything in one Next.js project, no separate backend
- **Automated import over manual entry** — key differentiator vs competitors (optionwheeltracker.ai is manual-only)
