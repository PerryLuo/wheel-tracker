"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useTransactions } from "@/hooks/useTransactions";
import { useBrokerFilter } from "@/hooks/useBrokerFilter";
import { useYearFilter } from "@/hooks/useYearFilter";
import type { Transaction } from "@/lib/types";
import { LegTypeBadge } from "@/components/ui/Badges";

const C = {
  surface:  "#111827",
  surface2: "#1a2234",
  border:   "#1e2d3d",
  accent:   "#00d4aa",
  text:     "#e2e8f0",
  text2:    "#94a3b8",
  muted:    "#4b6080",
  red:      "#f43f5e",
  green:    "#10b981",
};

function fmt(n: number): string {
  const abs = Math.abs(n);
  const s = `$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n < 0) return `-${s}`;
  if (n > 0) return `+${s}`;
  return s;
}

function moneyColor(n: number): string {
  return n > 0 ? C.accent : n < 0 ? C.red : C.text2;
}

// ── Action badge ──────────────────────────────────────────────────────────────
const ACTION_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  STO:      { bg: "rgba(16,185,129,0.15)",  color: "#10b981", label: "STO"      },
  BTC:      { bg: "rgba(244,63,94,0.15)",   color: "#f43f5e", label: "BTC"      },
  Expired:  { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", label: "EXPIRED"  },
  Assigned: { bg: "rgba(251,146,60,0.15)",  color: "#fb923c", label: "ASSIGNED" },
};

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_STYLES[action] ?? { bg: "rgba(75,96,128,0.15)", color: "#4b6080", label: action };
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// STO before BTC within same date (shows original open → close order)
function txSortPriority(action: string): number {
  if (action === "STO")                               return 0;
  if (action === "Assigned" || action === "Expired")  return 1;
  if (action === "BTC")                               return 2;
  return 3;
}

const TX_GRID = "1.4fr 1.2fr 0.7fr 0.9fr 1.4fr 0.6fr 1.4fr";

// ── Transaction sub-table ─────────────────────────────────────────────────────
function TxTable({ txs }: { txs: Transaction[] }) {
  const sorted = [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return txSortPriority(a.action) - txSortPriority(b.action);
  });

  return (
    <div style={{ backgroundColor: C.surface2 }}>
      <div
        className="grid text-xs uppercase py-2"
        style={{
          gridTemplateColumns: TX_GRID,
          padding: "8px 16px",
          color: C.muted,
          letterSpacing: "0.7px",
          borderBottom: `1px solid ${C.border}`,
          fontWeight: 500,
        }}
      >
        {["Date", "Action", "Type", "Strike", "Expiry", "Qty", "Amount"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {sorted.map((tx) => (
        <div
          key={tx.id}
          className="grid items-center text-xs font-mono"
          style={{
            gridTemplateColumns: TX_GRID,
            padding: "8px 16px",
            borderBottom: "1px solid rgba(30,45,69,0.4)",
          }}
        >
          <span style={{ color: C.text2 }}>{tx.date}</span>
          <ActionBadge action={tx.action} />
          <span style={{ color: C.muted }}>{tx.optionType ?? "—"}</span>
          <span style={{ color: C.text2 }}>{tx.strike != null ? `$${tx.strike}` : "—"}</span>
          <span style={{ color: C.muted }}>{tx.expiry ?? "—"}</span>
          <span style={{ color: C.muted }}>{tx.quantity}x</span>
          <span style={{ color: tx.amount !== 0 ? moneyColor(tx.amount) : C.muted }}>
            {tx.amount !== 0 ? fmt(tx.amount) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Per-ticker row ────────────────────────────────────────────────────────────
function TickerRow({
  ticker,
  txs,
  chainCount,
}: {
  ticker: string;
  txs: Transaction[];
  chainCount: number;
}) {
  const [open, setOpen] = useState(false);

  const totalPnl = txs.reduce((s, t) => s + t.amount, 0);
  const premiums = txs
    .filter((t) => t.action === "STO")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const btcCosts = txs
    .filter((t) => t.action === "BTC")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const netPremium = premiums - btcCosts;

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer row-hover"
        style={{ borderBottom: `1px solid rgba(30,45,69,0.5)` }}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span style={{ color: C.muted, fontSize: 10 }}>{open ? "▼" : "▶"}</span>
            <Link
              href={`/ticker/${ticker}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono font-bold text-sm hover:underline"
              style={{ color: C.accent }}
            >
              {ticker}
            </Link>
          </div>
        </td>
        <td className="px-4 py-3 font-mono text-sm" style={{ color: C.text2 }}>
          {chainCount}
        </td>
        <td className="px-4 py-3 font-mono text-sm" style={{ color: C.text2 }}>
          {txs.length}
        </td>
        <td className="px-4 py-3 font-mono text-sm" style={{ color: moneyColor(netPremium) }}>
          {fmt(netPremium)}
        </td>
        <td className="px-4 py-3 font-mono text-sm" style={{ color: moneyColor(totalPnl) }}>
          {fmt(totalPnl)}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <TxTable txs={txs} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function TickersPageInner() {
  const broker = useBrokerFilter();
  const year = useYearFilter();
  const { data, loading, error } = useTransactions(broker, year);

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

  if (!data || !data.transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-4xl mb-4 opacity-30">📋</p>
        <p className="text-lg font-semibold mb-2" style={{ color: C.text2 }}>No transactions yet</p>
        <p className="text-sm" style={{ color: C.muted }}>
          Click <strong style={{ color: C.accent }}>Import</strong> in the nav to load your transactions.
        </p>
      </div>
    );
  }

  // Group transactions by ticker (exclude plain stock Buy/Sell)
  const optionTxs = data.transactions.filter(
    (t) => !(( t.action === "Buy" || t.action === "Sell") && t.optionType === null)
  );

  const grouped: Record<string, Transaction[]> = {};
  for (const tx of optionTxs) {
    const key = tx.underlying ?? "UNKNOWN";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  }

  // Chain counts per ticker
  const chainsByTicker: Record<string, number> = {};
  for (const chain of data.chains) {
    chainsByTicker[chain.ticker] = (chainsByTicker[chain.ticker] ?? 0) + 1;
  }

  // Sort tickers by total net P&L descending
  const tickers = Object.keys(grouped).sort((a, b) => {
    const pnlA = grouped[a].reduce((s, t) => s + t.amount, 0);
    const pnlB = grouped[b].reduce((s, t) => s + t.amount, 0);
    return pnlB - pnlA;
  });

  const totalPnl = optionTxs.reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: C.text }}>Tickers</h1>
        <p className="text-sm" style={{ color: C.text2 }}>
          {tickers.length} ticker{tickers.length !== 1 ? "s" : ""} · {optionTxs.length} transactions · {fmt(totalPnl)} total
        </p>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Ticker", "Chains", "Transactions", "Net Premium", "Total P&L"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs uppercase"
                  style={{ color: C.muted, letterSpacing: "0.8px", fontWeight: 500 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((ticker) => (
              <TickerRow
                key={ticker}
                ticker={ticker}
                txs={grouped[ticker]}
                chainCount={chainsByTicker[ticker] ?? 0}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TickersPage() {
  return (
    <Suspense>
      <TickersPageInner />
    </Suspense>
  );
}
