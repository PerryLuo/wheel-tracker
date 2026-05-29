"use client";

import { Suspense, useEffect, useState } from "react";

const C = {
  bg1:    "#0a0e1a",
  bg2:    "#111827",
  bg3:    "#1a2234",
  accent: "#00d4aa",
  text1:  "#e2e8f0",
  text2:  "#94a3b8",
  muted:  "#4b6080",
  green:  "#10b981",
  red:    "#ef4444",
  border: "#1e2d3d",
};

type ScreenerRow = {
  id: number;
  run_date: string;
  rank: number;
  symbol: string;
  stock_price: number;
  strike: number;
  premium: number;
  delta: number;
  cushion_pct: number;
  premium_yield_pct: number;
  dte: number;
  expiration: string;
  current_iv: number;
  score: number;
  summary: string;
};

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-3 py-24" style={{ color: C.text2 }}>
      <div
        className="w-5 h-5 rounded-full border-2 animate-spin"
        style={{ borderColor: C.border, borderTopColor: C.accent }}
      />
      <span className="text-sm">Loading screener results…</span>
    </div>
  );
}

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return n.toFixed(2) + "%";
}
function fmtScore(n: number) {
  return n.toFixed(2);
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.min(score / 15, 1); // scores typically 0-15 range
  const hue = Math.round(pct * 120); // red (0) → green (120)
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold"
      style={{
        backgroundColor: `hsl(${hue} 70% 18%)`,
        color: `hsl(${hue} 80% 65%)`,
        border: `1px solid hsl(${hue} 60% 28%)`,
      }}
    >
      {fmtScore(score)}
    </span>
  );
}

function ScreenerTable({ rows }: { rows: ScreenerRow[] }) {
  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: C.muted,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 13,
    color: C.text1,
    borderBottom: `1px solid ${C.border}`,
    fontFamily: "DM Mono, monospace",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: C.bg3 }}>
            <th style={{ ...thStyle, width: 36 }}>#</th>
            <th style={thStyle}>Symbol</th>
            <th style={thStyle}>Stock Price</th>
            <th style={thStyle}>Strike</th>
            <th style={thStyle}>Premium</th>
            <th style={thStyle}>Delta</th>
            <th style={thStyle}>Cushion</th>
            <th style={thStyle}>Yield/mo</th>
            <th style={thStyle}>DTE</th>
            <th style={thStyle}>Expiration</th>
            <th style={thStyle}>IV%</th>
            <th style={thStyle}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.id}
              style={{ backgroundColor: idx % 2 === 0 ? C.bg2 : C.bg3 }}
              className="transition-colors hover:bg-[#1e2d3d44]"
            >
              <td style={{ ...tdStyle, color: C.muted, fontSize: 12 }}>{row.rank}</td>
              <td style={{ ...tdStyle, fontWeight: 700, color: C.accent }}>{row.symbol}</td>
              <td style={tdStyle}>{fmt$(row.stock_price)}</td>
              <td style={tdStyle}>{fmt$(row.strike)}</td>
              <td style={{ ...tdStyle, color: C.green }}>{fmt$(row.premium)}</td>
              <td style={{ ...tdStyle, color: C.green }}>{row.delta.toFixed(3)}</td>
              <td style={{ ...tdStyle, color: C.text2 }}>{fmtPct(row.cushion_pct)}</td>
              <td style={{ ...tdStyle, color: C.green, fontWeight: 600 }}>
                {fmtPct(row.premium_yield_pct)}
              </td>
              <td style={{ ...tdStyle, color: C.text2 }}>{row.dte}d</td>
              <td style={{ ...tdStyle, color: C.text2 }}>
                {new Date(row.expiration + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td style={{ ...tdStyle, color: C.text2 }}>{fmtPct(row.current_iv)}</td>
              <td style={tdStyle}>
                <ScoreBadge score={row.score} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScreenerPageInner() {
  const [results, setResults] = useState<ScreenerRow[]>([]);
  const [runDate, setRunDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/screener")
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setResults(body.results ?? []);
        setRunDate(body.run_date ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="container mx-auto px-4 max-w-7xl py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: C.text1, fontFamily: "DM Sans, sans-serif" }}
          >
            CSP Screener
          </h1>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>
            Top cash-secured put opportunities · Updated nightly at 8 PM PDT
          </p>
        </div>
        {runDate && (
          <span
            className="ml-auto text-xs px-3 py-1 rounded-full font-mono"
            style={{
              backgroundColor: C.bg3,
              border: `1px solid ${C.border}`,
              color: C.text2,
            }}
          >
            Last run:{" "}
            {new Date(runDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Filter legend */}
      <div
        className="flex flex-wrap gap-3 mb-5 text-xs"
        style={{ color: C.muted }}
      >
        {[
          "Delta −0.10 to −0.20",
          "DTE 21–45 days",
          "Cushion > 5%",
          "Monthly yield > 1%",
          "OI > 100",
          "No earnings within 21d",
        ].map((f) => (
          <span
            key={f}
            className="px-2.5 py-1 rounded"
            style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}` }}
          >
            {f}
          </span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="text-sm px-4 py-3 rounded mb-4"
          style={{ backgroundColor: "#1a0a0a", border: `1px solid ${C.red}`, color: C.red }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!error && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-4xl mb-4 opacity-20">📊</p>
          <p className="text-lg font-semibold mb-2" style={{ color: C.text2 }}>
            No results yet
          </p>
          <p className="text-sm max-w-sm" style={{ color: C.muted }}>
            The pipeline runs nightly at 8 PM PDT. You can also trigger it manually
            from the{" "}
            <a
              href="https://github.com"
              className="underline"
              style={{ color: C.accent }}
              target="_blank"
              rel="noreferrer"
            >
              GitHub Actions
            </a>{" "}
            tab.
          </p>
        </div>
      )}

      {/* Table */}
      {results.length > 0 && (
        <>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${C.border}` }}
          >
            <ScreenerTable rows={results} />
          </div>

          {/* Summaries */}
          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.muted }}>
              Plain English
            </p>
            {results.map((row) => (
              <div
                key={row.id}
                className="flex gap-3 items-start text-sm px-4 py-3 rounded"
                style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}` }}
              >
                <span
                  className="font-mono font-semibold mt-0.5 shrink-0 text-xs"
                  style={{ color: C.muted }}
                >
                  #{row.rank}
                </span>
                <span style={{ color: C.text2 }}>{row.summary}</span>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <p className="text-xs mt-6" style={{ color: C.muted }}>
            Not financial advice. Options involve substantial risk. Data is end-of-day and may be delayed.
            Always verify quotes before trading.
          </p>
        </>
      )}
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense>
      <ScreenerPageInner />
    </Suspense>
  );
}
