"use client";

import { use, Suspense, useState } from "react";
import Link from "next/link";
import { useTransactions } from "@/hooks/useTransactions";
import { useBrokerFilter } from "@/hooks/useBrokerFilter";
import { useYearFilter } from "@/hooks/useYearFilter";
import type { Chain, Leg } from "@/lib/types";
import { StatusBadge, LegTypeBadge } from "@/components/ui/Badges";

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

// ── CSP Scanner ───────────────────────────────────────────────────────────────

const CSP_LEGEND = [
  { col: "OTM%",          desc: "How far below the stock price your strike is. Higher = safer but less premium." },
  { col: "Return%",       desc: "Weekly return on capital deployed: premium ÷ strike × 100. Core number for picking a strike." },
  { col: "Max Profit",    desc: "Total cash collected per contract (1 contract = 100 shares)." },
];

type CspRow = { id: number; strike: string; premium: string };

function CspScanner({ ticker }: { ticker: string }) {
  void ticker;
  const [open, setOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [price, setPrice] = useState("");
  const [expiry, setExpiry] = useState("");
  const [rows, setRows] = useState<CspRow[]>([]);
  const [nextId, setNextId] = useState(0);

  const priceNum = parseFloat(price) || 0;
  const dte = expiry
    ? Math.max(1, Math.round(
        (new Date(expiry + "T12:00:00").getTime() - Date.now()) / 86_400_000
      ))
    : null;
  const todayStr = new Date().toISOString().slice(0, 10);

  function addRow() {
    setRows((p) => [...p, { id: nextId, strike: "", premium: "" }]);
    setNextId((n) => n + 1);
    setOpen(true);
  }
  function removeRow(id: number) { setRows((p) => p.filter((r) => r.id !== id)); }
  function updateRow(id: number, field: "strike" | "premium", value: string) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  const computed = rows.map((row) => {
    const strike = parseFloat(row.strike) || 0;
    const premium = parseFloat(row.premium) || 0;
    const otmPct = priceNum > 0 && strike > 0 ? ((priceNum - strike) / priceNum) * 100 : null;
    const returnPct = strike > 0 && premium > 0 ? (premium / strike) * 100 : null;
    const maxProfit = premium > 0 ? premium * 100 : null;
    return { ...row, otmPct, returnPct, maxProfit };
  });

  const maxReturn = Math.max(...computed.map((r) => r.returnPct ?? -Infinity), -Infinity);

  return (
    <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer"
        style={{ borderBottom: open ? `1px solid ${C.border}` : "none" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: C.muted, fontSize: 9 }}>{open ? "▼" : "▶"}</span>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.text2, letterSpacing: "0.8px" }}>
            CSP Scanner
          </span>
          {rows.length > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,212,170,0.08)", color: C.accent, border: "1px solid rgba(0,212,170,0.15)" }}>
              {rows.length} row{rows.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Info icon */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowLegend((v) => !v); setOpen(true); }}
            title="What do these metrics mean?"
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ color: showLegend ? C.accent : C.muted, backgroundColor: showLegend ? "rgba(0,212,170,0.1)" : "transparent", border: "1px solid transparent" }}
          >
            ℹ
          </button>
        </div>
        <button
          className="text-xs font-mono px-3 py-1 rounded"
          style={{ backgroundColor: "rgba(0,212,170,0.1)", color: C.accent, border: "1px solid rgba(0,212,170,0.2)" }}
          onClick={(e) => { e.stopPropagation(); addRow(); }}
        >
          + Add row
        </button>
      </div>

      {open && (
        <div>
          {/* Legend */}
          {showLegend && (
            <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: "rgba(0,212,170,0.03)" }}>
              {CSP_LEGEND.map(({ col, desc }) => (
                <div key={col} className="flex gap-3 py-1">
                  <span className="font-mono text-xs w-24 shrink-0" style={{ color: C.accent }}>{col}</span>
                  <span className="text-xs" style={{ color: C.text2 }}>{desc}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inputs */}
          <div className="flex items-center gap-6 px-5 py-3 flex-wrap" style={{ borderBottom: `1px solid ${C.border}` }}>
            <label className="flex items-center gap-2">
              <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: "0.8px" }}>Stock Price</span>
              <input
                type="number" step="0.01" min="0" value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="font-mono text-sm w-24 bg-transparent outline-none text-right"
                style={{ color: C.text, borderBottom: `1px solid ${C.border}` }}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: "0.8px" }}>Expiry</span>
              <input
                type="date" min={todayStr} value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="font-mono text-sm bg-transparent outline-none"
                style={{ color: C.text, borderBottom: `1px solid ${C.border}`, colorScheme: "dark" }}
              />
            </label>
            {dte !== null && (
              <span className="font-mono text-xs" style={{ color: C.text2 }}>{dte} DTE</span>
            )}
          </div>

          {/* Table */}
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Strike", "Premium/sh", "OTM%", "Return%", "Max Profit", ""].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs uppercase"
                        style={{ color: C.muted, letterSpacing: "0.8px", borderBottom: `1px solid ${C.border}`, fontWeight: 500 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {computed.map((row) => {
                    const best = row.returnPct !== null && maxReturn > 0 && row.returnPct === maxReturn;
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid rgba(30,45,69,0.4)", backgroundColor: best ? "rgba(0,212,170,0.06)" : undefined }}>
                        <td className="px-4 py-2">
                          <input type="number" step="0.5" min="0" value={row.strike}
                            onChange={(e) => updateRow(row.id, "strike", e.target.value)}
                            placeholder="0.00" className="font-mono text-sm w-20 bg-transparent outline-none text-right"
                            style={{ color: C.text }} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="0.01" min="0" value={row.premium}
                            onChange={(e) => updateRow(row.id, "premium", e.target.value)}
                            placeholder="0.00" className="font-mono text-sm w-20 bg-transparent outline-none text-right"
                            style={{ color: C.text }} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm"
                          style={{ color: row.otmPct === null ? C.muted : row.otmPct >= 0 ? C.text2 : C.red }}>
                          {row.otmPct !== null ? `${row.otmPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm"
                          style={{ color: row.returnPct !== null ? (best ? C.accent : moneyColor(row.returnPct)) : C.muted, fontWeight: best ? 600 : undefined }}>
                          {row.returnPct !== null ? `${row.returnPct.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm"
                          style={{ color: row.maxProfit !== null ? C.accent : C.muted }}>
                          {row.maxProfit !== null ? fmtMoney(row.maxProfit) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => removeRow(row.id)} style={{ color: C.muted }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm" style={{ color: C.muted }}>
              Click "+ Add row" to compare strikes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Covered Call Simulator ────────────────────────────────────────────────────

const CC_LEGEND = [
  { col: "Premium Income", desc: "Total cash collected from selling the call (premium × your total shares)." },
  { col: "Yield%",         desc: "Premium as a % of your cost basis — what you earn on your position just from the premium." },
  { col: "If Assigned Net P&L", desc: "Total profit if the call is exercised: (strike − cost basis) × shares + premium income." },
  { col: "Total ROI%",     desc: "Net P&L as a % of the capital you originally deployed to acquire the shares." },
];

type CcRow = { id: number; strike: string; premium: string };

function CcSimulator({ assignedChains }: { assignedChains: Chain[] }) {
  const [open, setOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [rows, setRows] = useState<CcRow[]>([]);
  const [nextId, setNextId] = useState(0);

  const totalShares = assignedChains.reduce((s, c) => s + c.contracts * 100, 0);
  const totalCapital = assignedChains.reduce((s, c) => s + (c.costBasis! * c.contracts * 100), 0);
  const blendedCB = totalShares > 0 ? totalCapital / totalShares : 0;

  function addRow() {
    setRows((p) => [...p, { id: nextId, strike: "", premium: "" }]);
    setNextId((n) => n + 1);
    setOpen(true);
  }
  function removeRow(id: number) { setRows((p) => p.filter((r) => r.id !== id)); }
  function updateRow(id: number, field: "strike" | "premium", value: string) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  const computed = rows.map((row) => {
    const strike = parseFloat(row.strike) || 0;
    const premium = parseFloat(row.premium) || 0;
    const premiumIncome = premium > 0 ? premium * totalShares : null;
    const yieldPct = premium > 0 && blendedCB > 0 ? (premium / blendedCB) * 100 : null;
    const ifAssignedNetPnl = strike > 0 && premium > 0 && blendedCB > 0
      ? (strike - blendedCB) * totalShares + premium * totalShares
      : null;
    const totalRoiPct = ifAssignedNetPnl !== null && totalCapital > 0
      ? (ifAssignedNetPnl / totalCapital) * 100
      : null;
    const aboveCB = strike > 0 && blendedCB > 0 && strike >= blendedCB;
    return { ...row, premiumIncome, yieldPct, ifAssignedNetPnl, totalRoiPct, aboveCB };
  });

  const validRows = computed.filter((r) => r.premiumIncome !== null);
  const bestYieldRow = validRows.length > 0
    ? validRows.reduce((best, r) => ((r.yieldPct ?? 0) > (best.yieldPct ?? 0) ? r : best))
    : null;

  return (
    <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer"
        style={{ borderBottom: open ? `1px solid ${C.border}` : "none" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: C.muted, fontSize: 9 }}>{open ? "▼" : "▶"}</span>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.text2, letterSpacing: "0.8px" }}>
            Covered Call Simulator
          </span>
          {rows.length > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,212,170,0.08)", color: C.accent, border: "1px solid rgba(0,212,170,0.15)" }}>
              {rows.length} row{rows.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowLegend((v) => !v); setOpen(true); }}
            title="What do these metrics mean?"
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ color: showLegend ? C.accent : C.muted, backgroundColor: showLegend ? "rgba(0,212,170,0.1)" : "transparent", border: "1px solid transparent" }}
          >
            ℹ
          </button>
        </div>
        <button
          className="text-xs font-mono px-3 py-1 rounded"
          style={{ backgroundColor: "rgba(0,212,170,0.1)", color: C.accent, border: "1px solid rgba(0,212,170,0.2)" }}
          onClick={(e) => { e.stopPropagation(); addRow(); }}
        >
          + Add row
        </button>
      </div>

      {open && (
        <div>
          {/* Legend */}
          {showLegend && (
            <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: "rgba(0,212,170,0.03)" }}>
              {CC_LEGEND.map(({ col, desc }) => (
                <div key={col} className="flex gap-3 py-1">
                  <span className="font-mono text-xs w-36 shrink-0" style={{ color: C.accent }}>{col}</span>
                  <span className="text-xs" style={{ color: C.text2 }}>{desc}</span>
                </div>
              ))}
            </div>
          )}

          {/* Position banner */}
          <div className="flex items-center gap-6 px-5 py-3 flex-wrap" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div>
              <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: "0.8px" }}>Total Shares</span>
              <span className="font-mono text-sm ml-2" style={{ color: C.text }}>{totalShares.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: "0.8px" }}>Blended CB</span>
              <span className="font-mono text-sm ml-2" style={{ color: C.accent }}>${blendedCB.toFixed(2)}/sh</span>
            </div>
            <div>
              <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: "0.8px" }}>Capital Deployed</span>
              <span className="font-mono text-sm ml-2" style={{ color: C.text2 }}>{fmtMoney(totalCapital)}</span>
            </div>
          </div>

          {/* Premium-only summary */}
          {bestYieldRow && (
            <div className="px-5 py-2.5 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.text2 }}>If not assigned: keep </span>
              <span className="font-mono font-semibold" style={{ color: C.accent }}>{fmtMoney(bestYieldRow.premiumIncome!)}</span>
              <span style={{ color: C.text2 }}> in premium</span>
              {bestYieldRow.yieldPct !== null && (
                <span className="font-mono text-xs ml-2" style={{ color: C.text2 }}>
                  (+{bestYieldRow.yieldPct.toFixed(2)}% yield on CB)
                </span>
              )}
              {validRows.length > 1 && (
                <span className="text-xs ml-2" style={{ color: C.muted }}>— best yield row shown</span>
              )}
            </div>
          )}

          {/* Table */}
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Strike", "Premium/sh", "Premium Income", "Yield%", "If Assigned Net P&L", "Total ROI%", ""].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs uppercase"
                        style={{ color: C.muted, letterSpacing: "0.8px", borderBottom: `1px solid ${C.border}`, fontWeight: 500 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {computed.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid rgba(30,45,69,0.4)", backgroundColor: row.aboveCB ? "rgba(16,185,129,0.04)" : undefined }}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input type="number" step="0.5" min="0" value={row.strike}
                            onChange={(e) => updateRow(row.id, "strike", e.target.value)}
                            placeholder="0.00" className="font-mono text-sm w-20 bg-transparent outline-none text-right"
                            style={{ color: C.text }} />
                          {row.aboveCB && (
                            <span className="text-xs px-1 rounded font-mono"
                              style={{ backgroundColor: "rgba(16,185,129,0.12)", color: C.green, border: "1px solid rgba(16,185,129,0.2)" }}>
                              ↑CB
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" step="0.01" min="0" value={row.premium}
                          onChange={(e) => updateRow(row.id, "premium", e.target.value)}
                          placeholder="0.00" className="font-mono text-sm w-20 bg-transparent outline-none text-right"
                          style={{ color: C.text }} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-sm" style={{ color: row.premiumIncome !== null ? C.accent : C.muted }}>
                        {row.premiumIncome !== null ? fmtMoney(row.premiumIncome) : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-sm" style={{ color: row.yieldPct !== null ? moneyColor(row.yieldPct) : C.muted }}>
                        {row.yieldPct !== null ? `${row.yieldPct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-sm font-semibold"
                        style={{ color: row.ifAssignedNetPnl !== null ? moneyColor(row.ifAssignedNetPnl) : C.muted }}>
                        {row.ifAssignedNetPnl !== null ? fmtMoney(row.ifAssignedNetPnl, true) : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-sm"
                        style={{ color: row.totalRoiPct !== null ? moneyColor(row.totalRoiPct) : C.muted }}>
                        {row.totalRoiPct !== null ? `${row.totalRoiPct >= 0 ? "+" : ""}${row.totalRoiPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => removeRow(row.id)} style={{ color: C.muted }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm" style={{ color: C.muted }}>
              Click "+ Add row" to simulate a covered call.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Completed Wheel Summary ───────────────────────────────────────────────────
function CompletedWheelSummary({ chain }: { chain: Chain }) {
  const ws = chain.wheelSummary;
  if (!ws) return null;

  const shares = chain.contracts * 100;
  const boughtAmt = ws.putStrike * shares;
  const soldAmt = ws.callStrike * shares;

  const rows: Array<{ label: string; value: string; bold?: boolean; separator?: boolean; muted?: boolean }> = [
    { label: "Put premiums (net of rolls)", value: fmtMoney(ws.putPremium, true) },
    { label: "Covered call premiums",       value: fmtMoney(ws.callPremium, true) },
    { label: "Total premium collected",     value: fmtMoney(ws.totalPremium, true), bold: true },
    { label: `Bought shares @ $${ws.putStrike.toFixed(2)}`,  value: fmtMoney(-boughtAmt, true) },
    { label: `Sold shares @ $${ws.callStrike.toFixed(2)}`,   value: fmtMoney(soldAmt, true) },
    { label: "Equity gain/loss",            value: fmtMoney(ws.equityGainLoss, true), bold: true, separator: true },
    { label: "Total profit (premium + equity)", value: fmtMoney(ws.totalReturn, true), bold: true },
    { label: "Capital deployed",            value: fmtMoney(ws.capitalDeployed), muted: true },
    { label: "Return on capital",           value: `${ws.roiPct.toFixed(1)}%`, muted: true },
    {
      label: "Time period",
      value: `${chain.days} days (${chain.openDate} → ${chain.closeDate ?? "?"})`,
      muted: true,
    },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden mb-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Header */}
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="text-sm font-mono font-semibold" style={{ color: C.accent2 }}>
          Completed Wheel
          <span style={{ color: C.muted }}> · </span>
          <span style={{ color: C.accent }}>${ws.putStrike} PUT</span>
          <span style={{ color: C.muted }}> → </span>
          <span style={{ color: C.accent2 }}>${ws.callStrike} CALL</span>
        </span>
      </div>

      {/* Rows */}
      <div className="px-5">
        {/* Column headers */}
        <div
          className="grid py-2 text-xs uppercase"
          style={{
            gridTemplateColumns: "1fr auto",
            color: C.muted,
            letterSpacing: "0.8px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span>Component</span>
          <span>Amount</span>
        </div>

        {rows.map(({ label, value, bold, separator, muted }) => {
          const numVal = parseFloat(value.replace(/[^0-9.-]/g, ""));
          const valColor = muted
            ? C.text2
            : bold
            ? moneyColor(numVal)
            : moneyColor(numVal);

          return (
            <div
              key={label}
              className="grid items-center py-3"
              style={{
                gridTemplateColumns: "1fr auto",
                borderTop: separator ? `1px solid ${C.border}` : undefined,
                borderBottom: separator ? `1px solid ${C.border}` : `1px solid rgba(30,45,69,0.3)`,
              }}
            >
              <span
                className="text-sm"
                style={{
                  color: muted ? C.text2 : C.text,
                  fontWeight: bold ? 600 : 400,
                }}
              >
                {label}
              </span>
              <span
                className="font-mono text-sm text-right"
                style={{
                  color: valColor,
                  fontWeight: bold ? 700 : 400,
                  fontSize: bold && !muted ? "1rem" : undefined,
                }}
              >
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cost Basis Breakdown Table (open/assigned chains only) ────────────────────
function CostBasisTable({ chains }: { chains: Chain[] }) {
  const activeChains = chains.filter(
    (c) => (c.status === "OPEN" || c.status === "ASSIGNED") && c.costBasis != null
  );
  if (!activeChains.length) return null;

  let totalCost = 0;
  let totalShares = 0;
  let totalPremium = 0;

  const rows = activeChains.map((chain) => {
    const assignedLeg = chain.legs.find((l) => l.chainType === "assigned");
    const shares = chain.contracts * 100;
    const netPremium = chain.legs.reduce((sum, l) => {
      if (l.chainType === "open" || l.chainType === "roll_open" || l.chainType === "call_open")
        return sum + Math.abs(l.amount);
      if (l.chainType === "roll_close" || l.chainType === "call_close")
        return sum - Math.abs(l.amount);
      return sum;
    }, 0);

    totalCost += (chain.costBasis ?? 0) * shares;
    totalShares += shares;
    totalPremium += netPremium;

    return { chain, shares, netPremium, assignedLeg };
  });

  const combinedCb = totalShares > 0 ? totalCost / totalShares : 0;
  const showCombined = activeChains.length > 1;

  return (
    <div
      className="rounded-xl overflow-hidden mb-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: C.text2, letterSpacing: "0.8px" }}
        >
          Cost Basis Breakdown
        </span>
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Assignment", "Contracts", "Shares", "Cost Basis", "Premiums Collected"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs uppercase"
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
            {rows.map(({ chain, shares, netPremium, assignedLeg }) => (
              <tr
                key={chain.chainId}
                style={{ borderBottom: `1px solid rgba(30,45,69,0.4)` }}
              >
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {assignedLeg?.date ?? "—"}
                  {assignedLeg?.strike != null && (
                    <span className="ml-2" style={{ color: C.muted }}>
                      @ ${assignedLeg.strike}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {chain.contracts}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {shares.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text }}>
                  ${(chain.costBasis ?? 0).toFixed(2)}/sh
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.accent }}>
                  {fmtMoney(netPremium)}
                </td>
              </tr>
            ))}
            {showCombined && (
              <tr
                style={{
                  backgroundColor: "rgba(0,212,170,0.04)",
                  borderTop: `1px solid rgba(0,212,170,0.15)`,
                }}
              >
                <td className="px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: C.accent }}>
                  Combined
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {activeChains.reduce((s, c) => s + c.contracts, 0)}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {totalShares.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm font-semibold" style={{ color: C.accent }}>
                  ${combinedCb.toFixed(2)}/sh
                </td>
                <td className="px-4 py-2.5 font-mono text-sm font-semibold" style={{ color: C.accent }}>
                  {fmtMoney(totalPremium)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Position Chains Table ────────────────────────────────────────────────────
function ChainsTable({ chains }: { chains: Chain[] }) {
  return (
    <div
      className="rounded-xl overflow-hidden mb-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: C.text2, letterSpacing: "0.8px" }}
        >
          Position Chains
        </span>
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Chain", "Status", "Opened", "Closed", "Qty", "Capital", "Net P&L", "ROI"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs uppercase"
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
            {chains.map((chain) => {
              const netPnl = chain.netPnl + (chain.wheelSummary?.equityGainLoss ?? 0);
              return (
                <tr
                  key={chain.chainId}
                  style={{ borderBottom: `1px solid rgba(30,45,69,0.5)` }}
                >
                  <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                    {chain.chainId}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={chain.status} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                    {chain.openDate}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                    {chain.closeDate ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                    {chain.contracts}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                    ${chain.committedCapital.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm" style={{ color: moneyColor(netPnl) }}>
                    {fmtMoney(netPnl, true)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm" style={{ color: moneyColor(chain.roiPct) }}>
                    {fmtPct(chain.roiPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── All Transactions Table ───────────────────────────────────────────────────
function TransactionsTable({ legs }: { legs: Leg[] }) {
  const sorted = [...legs].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <div
      className="rounded-xl overflow-hidden mb-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: C.text2, letterSpacing: "0.8px" }}
        >
          All Transactions
        </span>
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Type", "Symbol", "Qty", "Amount"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs uppercase"
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
            {sorted.map((leg) => (
              <tr
                key={leg.id}
                style={{ borderBottom: `1px solid rgba(30,45,69,0.4)` }}
              >
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {leg.date}
                </td>
                <td className="px-4 py-2.5">
                  <LegTypeBadge type={leg.chainType} />
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {leg.symbol ?? leg.underlying}
                  {leg.strike ? ` $${leg.strike}` : ""}
                  {leg.expiry ? ` exp ${leg.expiry}` : ""}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: C.text2 }}>
                  {leg.quantity}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm" style={{ color: moneyColor(leg.amount) }}>
                  {leg.amount === 0 ? "—" : fmtMoney(leg.amount, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function TickerPageInner({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
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

  const chains = (data?.chains ?? []).filter((c) => c.ticker === ticker);

  if (!chains.length) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm" style={{ color: C.text2 }}>No chains found for {ticker}.</p>
        <Link href="/" className="text-sm mt-2 inline-block" style={{ color: C.accent }}>
          ← Back
        </Link>
      </div>
    );
  }

  const activeChains = chains.filter((c) => c.status === "OPEN" || c.status === "ASSIGNED");
  const closedChains = chains.filter(
    (c) => c.status === "COMPLETED" || c.status === "EXPIRED" || c.status === "CLOSED"
  );

  // Combined CB badge: only for 2+ active assigned chains
  const assignedActive = activeChains.filter((c) => c.costBasis != null);
  let combinedCb: number | null = null;
  let cbTotalShares = 0;
  if (assignedActive.length > 1) {
    let totalCost = 0;
    for (const c of assignedActive) {
      const sh = c.contracts * 100;
      totalCost += (c.costBasis ?? 0) * sh;
      cbTotalShares += sh;
    }
    combinedCb = cbTotalShares > 0 ? totalCost / cbTotalShares : null;
  }

  const totalNetPnl = chains.reduce(
    (sum, c) => sum + c.netPnl + (c.wheelSummary?.equityGainLoss ?? 0),
    0
  );
  const totalCommitted = activeChains.reduce((sum, c) => sum + c.committedCapital, 0);

  // All legs deduplicated
  const seenIds = new Set<string>();
  const allLegs: Leg[] = [];
  for (const chain of chains) {
    for (const leg of chain.legs) {
      if (!seenIds.has(leg.id)) {
        seenIds.add(leg.id);
        allLegs.push(leg);
      }
    }
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/chains"
        className="inline-flex items-center gap-1.5 text-sm mb-5"
        style={{ color: C.text2 }}
      >
        <span style={{ fontSize: 11 }}>◀</span> All positions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-mono font-bold mb-1" style={{ color: C.text }}>
            {ticker}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            {combinedCb != null && (
              <span
                className="text-sm font-mono px-2.5 py-1 rounded"
                style={{
                  backgroundColor: "rgba(0,212,170,0.08)",
                  color: C.accent,
                  border: "1px solid rgba(0,212,170,0.2)",
                }}
              >
                Combined CB ${combinedCb.toFixed(2)}/sh · {cbTotalShares.toLocaleString()} sh
              </span>
            )}
            <span className="text-sm" style={{ color: C.text2 }}>
              {chains.length} chain{chains.length !== 1 ? "s" : ""}
            </span>
            {totalCommitted > 0 && (
              <span className="text-sm" style={{ color: C.text2 }}>
                ${totalCommitted.toLocaleString()} committed
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p
            className="text-2xl font-mono font-semibold"
            style={{ color: moneyColor(totalNetPnl) }}
          >
            {fmtMoney(totalNetPnl, true)}
          </p>
          <p className="text-xs mt-1" style={{ color: C.muted }}>total net P&L</p>
        </div>
      </div>

      {/* Cost Basis Breakdown — only when there are open/assigned chains */}
      {activeChains.length > 0 && <CostBasisTable chains={chains} />}

      {/* CSP Scanner */}
      <CspScanner ticker={ticker} />

      {/* CC Simulator — only when there are assigned positions with known cost basis */}
      {assignedActive.length > 0 && <CcSimulator assignedChains={assignedActive} />}

      {/* Completed Wheel Summary — one card per closed chain with a wheelSummary */}
      {closedChains.filter((c) => c.wheelSummary).map((chain) => (
        <CompletedWheelSummary key={chain.chainId} chain={chain} />
      ))}

      <ChainsTable chains={chains} />
      <TransactionsTable legs={allLegs} />
    </div>
  );
}

export default function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  return (
    <Suspense>
      <TickerPageInner params={params} />
    </Suspense>
  );
}
