"use client";

import { useState } from "react";
import Link from "next/link";
import { useTransactions } from "@/hooks/useTransactions";
import type { Transaction, PeriodPnl } from "@/lib/types";

const C = {
  surface:  "#111827",
  surface2: "#1a2234",
  border:   "#1e2d3d",
  accent:   "#00d4aa",
  text:     "#e2e8f0",
  text2:    "#94a3b8",
  muted:    "#4b6080",
  red:      "#f43f5e",
};

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n: number): string {
  const abs = Math.abs(n);
  const s = `$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${s}` : `+${s}`;
}

function fmtK(n: number): string {
  const abs = Math.abs(n);
  return abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toLocaleString()}`;
}

function fmtPct(pnl: number, committed: number): string {
  return committed > 0 ? `${((pnl / committed) * 100).toFixed(1)}%` : "—";
}

function moneyColor(n: number): string {
  return n > 0 ? C.accent : n < 0 ? C.red : C.text2;
}

// Monday of the ISO week containing dateStr (YYYY-MM-DD)
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().slice(0, 10);
}

// Build period → ticker → [txs] drill-down map from raw transactions
function buildPeriodMap(
  transactions: Transaction[],
  type: "weekly" | "monthly"
): Record<string, Record<string, Transaction[]>> {
  const map: Record<string, Record<string, Transaction[]>> = {};
  for (const tx of transactions) {
    // Skip plain stock Buy/Sell (settlement of assignment)
    if ((tx.action === "Buy" || tx.action === "Sell") && tx.optionType === null) continue;
    const key = type === "weekly" ? getWeekStart(tx.date) : tx.date.slice(0, 7);
    const ticker = tx.underlying ?? "UNKNOWN";
    if (!map[key]) map[key] = {};
    if (!map[key][ticker]) map[key][ticker] = [];
    map[key][ticker].push(tx);
  }
  return map;
}

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  STO:      { bg: "rgba(16,185,129,0.15)",  color: "#10b981", label: "SELL"     },
  BTC:      { bg: "rgba(244,63,94,0.15)",   color: "#f43f5e", label: "BUY CLOSE" },
  Expired:  { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", label: "EXPIRED"  },
  Assigned: { bg: "rgba(251,146,60,0.15)",  color: "#fb923c", label: "ASSIGNED" },
};

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_STYLES[action] ?? { bg: "rgba(75,96,128,0.15)", color: "#4b6080", label: action };
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold uppercase"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  period,
}: {
  label: string;
  period: PeriodPnl | null | undefined;
  ytd?: boolean;
}) {
  const hasPeriod = period != null;
  const pnlColor = hasPeriod ? moneyColor(period.pnl) : C.text2;

  return (
    <div
      className="rounded-xl p-5 flex-1"
      style={{
        backgroundColor: C.surface2,
        border: `1px solid ${C.border}`,
        borderTop: `2px solid ${C.accent}`,
      }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: C.text2, letterSpacing: "0.8px" }}
      >
        {label}
      </p>
      <p className="text-3xl font-mono font-medium mb-2" style={{ color: hasPeriod ? pnlColor : C.muted }}>
        {hasPeriod ? fmt(period.pnl) : "—"}
      </p>
      {hasPeriod && (
        <p className="text-xs" style={{ color: C.muted }}>
          Committed {fmtK(period.committed)} · ROI {fmtPct(period.pnl, period.committed)}
        </p>
      )}
    </div>
  );
}

function YtdCard({ ytd, ytdCommitted }: { ytd: number; ytdCommitted: number }) {
  return (
    <div
      className="rounded-xl p-5 flex-1"
      style={{
        backgroundColor: C.surface2,
        border: `1px solid ${C.border}`,
        borderTop: `2px solid ${C.accent}`,
      }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: C.text2, letterSpacing: "0.8px" }}
      >
        YTD
      </p>
      <p className="text-3xl font-mono font-medium mb-2" style={{ color: moneyColor(ytd) }}>
        {fmt(ytd)}
      </p>
      <p className="text-xs" style={{ color: C.muted }}>
        Committed {fmtK(ytdCommitted)} · ROI {fmtPct(ytd, ytdCommitted)}
      </p>
    </div>
  );
}

// ── Breakdown table ───────────────────────────────────────────────────────────

// Column widths: Name (fills remaining) | Committed | P&L | ROI% | Running Total
const GRID = "1fr 88px 110px 65px 140px";

// Within the same date: BTC before STO (so roll pairs display close → open)
function txSortPriority(action: string): number {
  if (action === "BTC")                          return 0;
  if (action === "Assigned" || action === "Expired") return 1;
  if (action === "STO")                          return 2;
  return 3;
}

// Returns the set of transaction IDs that are part of a same-day BTC+STO roll pair.
// Matches on: same date, same optionType, same strike, same quantity.
function detectRolls(txs: Transaction[]): Set<string> {
  const rollIds = new Set<string>();
  const byDate: Record<string, Transaction[]> = {};
  for (const tx of txs) {
    if (!byDate[tx.date]) byDate[tx.date] = [];
    byDate[tx.date].push(tx);
  }
  for (const dateTxs of Object.values(byDate)) {
    const btcs = dateTxs.filter((t) => t.action === "BTC");
    const stos = dateTxs.filter((t) => t.action === "STO");
    for (const btc of btcs) {
      const match = stos.find(
        (s) =>
          s.optionType === btc.optionType &&
          s.strike === btc.strike &&
          s.quantity === btc.quantity
      );
      if (match) {
        rollIds.add(btc.id);
        rollIds.add(match.id);
      }
    }
  }
  return rollIds;
}

function TxRow({ tx, isRoll }: { tx: Transaction; isRoll: boolean }) {
  const committed = tx.action === "STO" && tx.optionType === "PUT"
    ? (tx.strike ?? 0) * tx.quantity * 100
    : 0;
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: GRID,
        borderBottom: "1px solid rgba(30,45,69,0.3)",
        paddingLeft: 48,
        paddingTop: 6,
        paddingBottom: 6,
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs" style={{ color: C.muted }}>{tx.date}</span>
        <ActionBadge action={tx.action} />
        {isRoll && (
          <span
            className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold uppercase"
            style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
          >
            ROLL
          </span>
        )}
        {tx.optionType && (
          <span className="font-mono text-xs" style={{ color: C.text2 }}>
            {tx.optionType}
          </span>
        )}
        {tx.strike != null && (
          <span className="font-mono text-xs" style={{ color: C.text2 }}>
            ${tx.strike}
          </span>
        )}
        {tx.quantity > 0 && (
          <span className="font-mono text-xs" style={{ color: C.muted }}>
            {tx.quantity}x
          </span>
        )}
      </div>
      <span className="font-mono text-xs" style={{ color: C.muted }}>
        {committed > 0 ? fmtK(committed) : ""}
      </span>
      <span className="font-mono text-xs" style={{ color: moneyColor(tx.amount) }}>
        {tx.amount !== 0 ? fmt(tx.amount) : ""}
      </span>
      <span />
      <span />
    </div>
  );
}

function TickerRows({
  ticker,
  txs,
  periodKey,
  expanded,
  onToggle,
}: {
  ticker: string;
  txs: Transaction[];
  periodKey: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tickerPnl = txs.reduce((s, t) => s + t.amount, 0);
  const tickerCommitted = txs
    .filter((t) => t.action === "STO" && t.optionType === "PUT")
    .reduce((s, t) => s + (t.strike ?? 0) * t.quantity * 100, 0);

  const rollIds = detectRolls(txs);

  // Date descending; within same date: BTC before STO
  const sorted = [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return txSortPriority(a.action) - txSortPriority(b.action);
  });

  return (
    <>
      <div
        className="grid items-center cursor-pointer row-hover"
        style={{
          gridTemplateColumns: GRID,
          borderBottom: "1px solid rgba(30,45,69,0.3)",
          backgroundColor: "rgba(26,34,52,0.5)",
          paddingTop: 7,
          paddingBottom: 7,
          paddingLeft: 24,
        }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ color: C.muted, fontSize: 9 }}>{expanded ? "▼" : "▶"}</span>
          <Link
            href={`/ticker/${ticker}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-sm font-semibold hover:underline"
            style={{ color: C.text }}
          >
            {ticker}
          </Link>
        </div>
        <span className="font-mono text-sm" style={{ color: C.muted }}>
          {tickerCommitted > 0 ? fmtK(tickerCommitted) : "—"}
        </span>
        <span className="font-mono text-sm font-semibold" style={{ color: moneyColor(tickerPnl) }}>
          {fmt(tickerPnl)}
        </span>
        <span className="font-mono text-sm" style={{ color: tickerCommitted > 0 ? moneyColor(tickerPnl) : C.muted }}>
          {fmtPct(tickerPnl, tickerCommitted)}
        </span>
        <span />
      </div>
      {expanded && sorted.map((tx) => <TxRow key={tx.id} tx={tx} isRoll={rollIds.has(tx.id)} />)}
    </>
  );
}

function BreakdownTable({
  periods,
  transactions,
  type,
}: {
  periods: PeriodPnl[];
  transactions: Transaction[];
  type: "weekly" | "monthly";
}) {
  const [expandedPeriods, setExpandedPeriods] = useState<Record<string, boolean>>({});
  const [expandedTickers, setExpandedTickers] = useState<Record<string, boolean>>({});

  const periodMap = buildPeriodMap(transactions, type);

  // Running totals: cumulative from oldest → newest
  const runningTotals: Record<string, number> = {};
  let acc = 0;
  [...periods].sort((a, b) => a.period.localeCompare(b.period)).forEach((p) => {
    acc += p.pnl;
    runningTotals[p.period] = acc;
  });

  const sorted = [...periods].sort((a, b) => b.period.localeCompare(a.period));
  const colLabel = type === "weekly" ? "Week" : "Month";

  function togglePeriod(key: string) {
    setExpandedPeriods((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  function toggleTicker(key: string) {
    setExpandedTickers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div style={{ borderRadius: 12, overflowX: "auto", border: `1px solid ${C.border}` }}>
      {/* Table header */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: GRID,
          backgroundColor: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: "8px 16px",
        }}
      >
        {[colLabel, "Committed", "P&L", "ROI%", "Running Total"].map((h) => (
          <span
            key={h}
            className="text-xs uppercase"
            style={{ color: C.muted, letterSpacing: "0.8px", fontWeight: 500 }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ backgroundColor: C.surface }}>
        {sorted.filter((p) => p.pnl !== 0).map((p) => {
          const isPeriodOpen = !!expandedPeriods[p.period];
          const running = runningTotals[p.period];
          const tickers = Object.keys(periodMap[p.period] ?? {}).sort();

          return (
            <div key={p.period} style={{ borderBottom: `1px solid rgba(30,45,69,0.5)` }}>
              {/* Period row */}
              <div
                className="grid items-center cursor-pointer row-hover"
                style={{
                  gridTemplateColumns: GRID,
                  padding: "10px 16px",
                }}
                onClick={() => togglePeriod(p.period)}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: C.muted, fontSize: 9 }}>{isPeriodOpen ? "▼" : "▶"}</span>
                  <span className="font-mono text-sm" style={{ color: C.text }}>{p.period}</span>
                </div>
                <span className="font-mono text-sm" style={{ color: C.muted }}>
                  {p.committed > 0 ? fmtK(p.committed) : "—"}
                </span>
                <span className="font-mono text-sm font-semibold" style={{ color: moneyColor(p.pnl) }}>
                  {fmt(p.pnl)}
                </span>
                <span className="font-mono text-sm" style={{ color: p.committed > 0 ? moneyColor(p.pnl) : C.muted }}>
                  {fmtPct(p.pnl, p.committed)}
                </span>
                <span className="font-mono text-sm font-semibold" style={{ color: moneyColor(running) }}>
                  {fmt(running)}
                </span>
              </div>

              {/* Ticker sub-rows */}
              {isPeriodOpen && tickers.map((ticker) => {
                const tickerKey = `${p.period}_${ticker}`;
                return (
                  <TickerRows
                    key={tickerKey}
                    ticker={ticker}
                    txs={periodMap[p.period][ticker]}
                    periodKey={p.period}
                    expanded={!!expandedTickers[tickerKey]}
                    onToggle={() => toggleTicker(tickerKey)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// User-specific background images keyed by Supabase UUID
const USER_BACKGROUNDS: Record<string, { left: string; right: string }> = {
  // add uuid: { left: "/bg-perry.png", right: "/bg-perry2.png" }
};

export default function PnlPage() {
  const { data, loading, error } = useTransactions();
  const [view, setView] = useState<"weekly" | "monthly">("weekly");
  const [bgImages, setBgImages] = useState<{ left: string; right: string } | null>(null);

  // Load user-specific background on mount
  useState(() => {
    import("@supabase/ssr").then(({ createBrowserClient }) => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user && USER_BACKGROUNDS[user.id]) {
          setBgImages(USER_BACKGROUNDS[user.id]);
        }
      });
    });
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20" style={{ color: C.text2 }}>
        <div
          className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: C.border, borderTopColor: C.accent }}
        />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm" style={{ color: C.red }}>{error}</p>
      </div>
    );
  }

  if (!data || (!data.weekly.length && !data.monthly.length)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-4xl mb-4 opacity-30">📈</p>
        <p className="text-lg font-semibold mb-2" style={{ color: C.text2 }}>No P&L data yet</p>
        <p className="text-sm" style={{ color: C.muted }}>
          Click <strong style={{ color: C.accent }}>Import</strong> in the nav to load your transactions.
        </p>
      </div>
    );
  }

  const { weekly, monthly, ytd, ytdCommitted, transactions } = data;

  // Most recent period = last element (arrays are sorted oldest → newest from API)
  const lastWeek  = weekly.length  ? weekly[weekly.length - 1]   : null;
  const lastMonth = monthly.length ? monthly[monthly.length - 1] : null;

  const periods = view === "weekly" ? weekly : monthly;

  return (
    <div className="relative">
      {/* Flanking images — left and right of content, sized to content height */}
      {bgImages && (
        <>
          {/* Left image — fixed, fills gap between viewport left and content */}
          <div
            className="fixed pointer-events-none"
            style={{
              top: 56, // nav height
              left: 0,
              width: "calc((100vw - min(100vw, 1056px)) / 2)",
              bottom: 0,
              zIndex: 0,
              backgroundImage: `url(${bgImages.left})`,
              backgroundSize: "contain",
              backgroundPosition: "center top",
              backgroundRepeat: "no-repeat",
              opacity: 0.5,
            }}
          >
            {/* Fade right edge into page */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to right, transparent 60%, #0a0e1a 100%)" }} />
          </div>

          {/* Right image — fixed, fills gap between content and viewport right */}
          <div
            className="fixed pointer-events-none"
            style={{
              top: 56,
              right: 0,
              width: "calc((100vw - min(100vw, 1056px)) / 2)",
              bottom: 0,
              zIndex: 0,
              backgroundImage: `url(${bgImages.right})`,
              backgroundSize: "50% auto",
              backgroundPosition: "left top",
              backgroundRepeat: "no-repeat",
              opacity: 0.5,
            }}
          >
            {/* Fade left edge into page */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to left, transparent 60%, #0a0e1a 100%)" }} />
          </div>
        </>
      )}

      {/* Page content sits above background */}
      <div className="relative" style={{ zIndex: 1 }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: C.text }}>P&L</h1>
        <p className="text-sm" style={{ color: C.text2 }}>
          {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* KPI cards */}
      <div className="flex gap-4 mb-6">
        <KpiCard label="Last Week"  period={lastWeek} />
        <KpiCard label="Last Month" period={lastMonth} />
        <YtdCard ytd={ytd} ytdCommitted={ytdCommitted} />
      </div>

      {/* Breakdown section */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: `1px solid ${C.border}`, backgroundColor: C.surface }}
      >
        {/* Section header + toggle */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <span
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: C.text2, letterSpacing: "0.8px" }}
          >
            {view === "weekly" ? "Weekly" : "Monthly"} Breakdown
          </span>
          <div
            className="flex rounded-lg overflow-hidden text-xs font-semibold"
            style={{ border: `1px solid ${C.border}` }}
          >
            {(["weekly", "monthly"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-4 py-1.5 capitalize transition-colors"
                style={{
                  backgroundColor: view === v ? C.text : "transparent",
                  color: view === v ? "#0a0e1a" : C.text2,
                }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table — padding inside the card */}
        <div className="p-4">
          {periods.length ? (
            <BreakdownTable periods={periods} transactions={transactions} type={view} />
          ) : (
            <div className="py-8 text-center text-sm" style={{ color: C.muted }}>
              No data for this view.
            </div>
          )}
        </div>
      </div>
      </div> {/* end relative content wrapper */}
    </div>
  );
}
