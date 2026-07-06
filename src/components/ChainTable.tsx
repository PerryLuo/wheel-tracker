"use client";

import { useState } from "react";
import Link from "next/link";
import type { Chain, Leg } from "@/lib/types";
import { StatusBadge, LegTypeBadge } from "./ui/Badges";
import { fmtRoiCompact } from "@/lib/roi";

const C = {
  surface:  "#111827",
  surface2: "#1a2234",
  border:   "#1e2d3d",
  accent:   "#00d4aa",
  accent2:  "#3b82f6",
  text:     "#e2e8f0",
  text2:    "#94a3b8",
  muted:    "#4b6080",
  red:      "#f43f5e",
  green:    "#10b981",
};

function fmtMoney(n: number, sign = false): string {
  const abs = Math.abs(n);
  const s = `$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (sign && n < 0) return `-${s}`;
  if (sign && n > 0) return `+${s}`;
  return n < 0 ? `-${s}` : s;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function moneyColor(n: number): string {
  return n > 0 ? C.accent : n < 0 ? C.red : C.text2;
}

// Weighted-average cost basis across all assigned chains for a ticker group.
function tickerCombinedCostBasis(chains: Chain[]): { costBasis: number; shares: number } | null {
  let totalCost = 0;
  let totalShares = 0;
  for (const chain of chains) {
    if (chain.costBasis != null) {
      const shares = chain.contracts * 100;
      totalCost += chain.costBasis * shares;
      totalShares += shares;
    }
  }
  if (!totalShares) return null;
  return { costBasis: totalCost / totalShares, shares: totalShares };
}

// ── Wheel summary block shown inside an expanded COMPLETED chain ──────────────
function WheelSummaryBlock({ chain }: { chain: Chain }) {
  const ws = chain.wheelSummary;
  if (!ws) return null;
  return (
    <div
      className="mx-4 my-2 rounded-lg p-4"
      style={{
        backgroundColor: "rgba(59,130,246,0.04)",
        border: "1px solid rgba(59,130,246,0.15)",
      }}
    >
      <p
        className="text-xs uppercase tracking-widest font-semibold mb-3"
        style={{ color: C.accent2, letterSpacing: "1px" }}
      >
        Wheel Summary
      </p>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-xs mb-1" style={{ color: C.text2 }}>Put Premium</p>
          <p className="text-base font-mono font-medium" style={{ color: C.accent }}>
            {fmtMoney(ws.putPremium)}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: C.text2 }}>Call Premium</p>
          <p className="text-base font-mono font-medium" style={{ color: C.accent }}>
            {fmtMoney(ws.callPremium)}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: C.text2 }}>Total Premium</p>
          <p className="text-base font-mono font-medium" style={{ color: C.accent }}>
            {fmtMoney(ws.totalPremium)}
          </p>
        </div>
      </div>
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 text-xs"
        style={{ borderTop: "1px solid rgba(59,130,246,0.12)" }}
      >
        {[
          ["Put Strike",       `$${ws.putStrike}`],
          ["Call Strike",      `$${ws.callStrike}`],
          ["Equity Gain/Loss", fmtMoney(ws.equityGainLoss, true)],
          ["Total Return",     fmtMoney(ws.totalReturn, true)],
          ["Capital Deployed", fmtMoney(ws.capitalDeployed)],
          ["ROI",              fmtRoiCompact(chain.roiRates)],
        ].map(([label, val]) => (
          <div key={label} className="flex justify-between">
            <span style={{ color: C.text2 }}>{label}</span>
            <span
              className="font-mono"
              style={{
                color: label.includes("Gain") || label.includes("Return") || label === "ROI"
                  ? moneyColor(parseFloat(val.replace(/[^0-9.-]/g, "")))
                  : C.text,
              }}
            >
              {val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const LEG_TYPE_ORDER: Record<string, number> = {
  open: 0, roll_open: 0, call_open: 0,
  roll_close: 1, assigned: 1, expired: 1, call_close: 1, call_expired: 1, call_assigned: 1,
};

function sortLegs(legs: Leg[]): Leg[] {
  return legs.slice().sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    const ea = a.expiry ?? "";
    const eb = b.expiry ?? "";
    if (ea > eb) return -1;
    if (ea < eb) return 1;
    return (LEG_TYPE_ORDER[a.chainType] ?? 1) - (LEG_TYPE_ORDER[b.chainType] ?? 1);
  });
}

// ── Leg rows shown inside an expanded chain ───────────────────────────────────
function LegRows({ legs }: { legs: Leg[] }) {
  return (
    <div style={{ backgroundColor: C.surface2 }}>
      {sortLegs(legs).map((leg) => (
        <div
          key={leg.id}
          className="grid items-center gap-2 px-7 py-2 text-xs"
          style={{
            gridTemplateColumns: "100px 96px 1fr 100px",
            borderBottom: `1px solid rgba(30,45,69,0.4)`,
          }}
        >
          <span style={{ color: C.text2 }}>{leg.date}</span>
          <LegTypeBadge type={leg.chainType} />
          <span className="font-mono truncate" style={{ color: C.text2 }}>
            {leg.symbol ?? leg.underlying}
            {leg.strike ? ` $${leg.strike}` : ""}
            {leg.expiry ? ` exp ${leg.expiry}` : ""}
          </span>
          <span
            className="font-mono text-right"
            style={{ color: moneyColor(leg.amount) }}
          >
            {leg.amount === 0 ? "—" : fmtMoney(leg.amount, true)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Single chain row ──────────────────────────────────────────────────────────
function ChainRow({ chain, hideTicker }: { chain: Chain; hideTicker?: boolean }) {
  const [open, setOpen] = useState(false);

  const netPnl = chain.netPnl + (chain.wheelSummary?.equityGainLoss ?? 0);
  const isActive = chain.status === "OPEN" || chain.status === "ASSIGNED";

  // For ASSIGNED chains show put assignment strike (acquisition price), not the active call.
  // For OPEN chains show the current put strike + expiry.
  const assignedStrike = chain.status === "ASSIGNED"
    ? (chain.legs.find((l) => l.chainType === "assigned")?.strike ?? null)
    : null;
  const currentDisplay = assignedStrike != null
    ? `$${assignedStrike} put`
    : (isActive && chain.currentStrike
        ? `$${chain.currentStrike} · ${chain.currentExpiry ?? ""}`
        : "—");

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer row-hover"
        style={{ borderBottom: `1px solid rgba(30,45,69,0.5)` }}
      >
        {/* Chevron + ticker */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span style={{ color: C.muted, fontSize: 10 }}>{open ? "▼" : "▶"}</span>
            {!hideTicker && (
              <span className="font-mono font-bold text-sm" style={{ color: C.text }}>
                {chain.ticker}
              </span>
            )}
            {chain.costBasis != null && !hideTicker && (
              <span
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "rgba(0,212,170,0.08)",
                  color: C.accent,
                  border: "1px solid rgba(0,212,170,0.2)",
                }}
              >
                CB ${chain.costBasis.toFixed(2)}
              </span>
            )}
            {hideTicker && (
              <span className="text-xs font-mono" style={{ color: C.muted }}>
                chain {chain.chainId.slice(-6)}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={chain.status} />
        </td>
        <td className="px-3 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
          {chain.contracts}
        </td>
        <td className="px-3 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
          {currentDisplay}
        </td>
        <td className="px-3 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
          ${chain.committedCapital.toLocaleString()}
        </td>
        <td className="px-3 py-2.5 font-mono text-sm" style={{ color: moneyColor(netPnl) }}>
          {fmtMoney(netPnl, true)}
        </td>
        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: moneyColor(chain.roiPct) }}>
          {fmtRoiCompact(chain.roiRates)}
        </td>
        <td className="px-3 py-2.5 text-sm" style={{ color: C.text2 }}>
          {chain.days}d
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} style={{ padding: 0 }}>
            {chain.wheelSummary && <WheelSummaryBlock chain={chain} />}
            <LegRows legs={chain.legs} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Ticker group: header row + expandable chain rows ─────────────────────────
function TickerGroup({ ticker, chains, open, onToggle }: { ticker: string; chains: Chain[]; open: boolean; onToggle: () => void }) {

  const combined = tickerCombinedCostBasis(chains);
  const groupNetPnl = chains.reduce(
    (sum, c) => sum + c.netPnl + (c.wheelSummary?.equityGainLoss ?? 0),
    0
  );

  return (
    <>
      {/* Ticker group header */}
      <tr
        onClick={onToggle}
        className="cursor-pointer"
        style={{
          backgroundColor: "rgba(30,45,69,0.35)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <td colSpan={8} className="px-3 py-2">
          <div className="flex items-center gap-3">
            <span style={{ color: C.muted, fontSize: 10 }}>{open ? "▼" : "▶"}</span>
            <Link
              href={`/ticker/${ticker}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono font-bold text-sm hover:underline"
              style={{ color: C.text }}
            >
              {ticker}
            </Link>
            {combined && (() => {
              const cbCount = chains.filter((c) => c.costBasis != null).length;
              const label = cbCount > 1
                ? `Combined CB $${combined.costBasis.toFixed(2)}/sh · ${combined.shares.toLocaleString()} sh`
                : `CB $${combined.costBasis.toFixed(2)}/sh · ${combined.shares.toLocaleString()} sh`;
              return (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: "rgba(0,212,170,0.08)",
                    color: C.accent,
                    border: "1px solid rgba(0,212,170,0.2)",
                  }}
                >
                  {label}
                </span>
              );
            })()}
            <span
              className="font-mono text-xs font-semibold ml-auto"
              style={{ color: moneyColor(groupNetPnl) }}
            >
              {fmtMoney(groupNetPnl, true)}
            </span>
            <span className="text-xs" style={{ color: C.muted }}>
              {chains.length} chain{chains.length !== 1 ? "s" : ""}
            </span>
          </div>
        </td>
      </tr>
      {/* Chain rows */}
      {open &&
        chains.map((chain) => (
          <ChainRow key={chain.chainId} chain={chain} hideTicker={true} />
        ))}
    </>
  );
}

// ── Section (Open Positions / Closed Positions) ───────────────────────────────
function Section({ title, chains }: { title: string; chains: Chain[] }) {
  if (!chains.length) return null;

  // Group by ticker, preserving insertion order
  const groups = new Map<string, Chain[]>();
  for (const chain of chains) {
    const arr = groups.get(chain.ticker) ?? [];
    arr.push(chain);
    groups.set(chain.ticker, arr);
  }

  const tickers = Array.from(groups.keys());
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(tickers.map((t) => [t, true]))
  );

  const allExpanded = tickers.every((t) => openMap[t]);
  const allCollapsed = tickers.every((t) => !openMap[t]);

  function toggleTicker(ticker: string) {
    setOpenMap((m) => ({ ...m, [ticker]: !m[ticker] }));
  }

  function expandAll() {
    setOpenMap(Object.fromEntries(tickers.map((t) => [t, true])));
  }

  function collapseAll() {
    setOpenMap(Object.fromEntries(tickers.map((t) => [t, false])));
  }

  return (
    <div
      className="rounded-xl overflow-hidden mb-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Section header */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: C.text2, letterSpacing: "0.8px" }}
        >
          {title}
        </span>
        <div className="flex items-center gap-3">
          {!allExpanded && (
            <button
              onClick={expandAll}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: C.muted }}
            >
              Expand all
            </button>
          )}
          {!allCollapsed && (
            <button
              onClick={collapseAll}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: C.muted }}
            >
              Collapse all
            </button>
          )}
          <span className="text-xs font-mono" style={{ color: C.muted }}>
            {chains.length} chain{chains.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Ticker", "Status", "Qty", "Current", "Capital", "Net P&L", "ROI (W / M / Y)", "Days"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-xs uppercase"
                  style={{
                    color: C.muted,
                    letterSpacing: "0.8px",
                    borderBottom: `1px solid ${C.border}`,
                    fontWeight: 500,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(groups.entries()).map(([ticker, tickerChains]) => (
              <TickerGroup
                key={ticker}
                ticker={ticker}
                chains={tickerChains}
                open={openMap[ticker] ?? true}
                onToggle={() => toggleTicker(ticker)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ChainTable({ chains }: { chains: Chain[] }) {
  const active = chains.filter(
    (c) => c.status === "OPEN" || c.status === "ASSIGNED"
  );
  const closed = chains.filter(
    (c) => c.status === "COMPLETED" || c.status === "EXPIRED" || c.status === "CLOSED"
  );

  return (
    <div>
      <Section title="Open Positions" chains={active} />
      <Section title="Closed Positions" chains={closed} />
    </div>
  );
}
