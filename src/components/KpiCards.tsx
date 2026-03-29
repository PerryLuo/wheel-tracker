import type { Chain } from "@/lib/types";

const C = {
  surface:  "#111827",
  surface2: "#1a2234",
  border:   "#1e2d3d",
  accent:   "#00d4aa",
  accent2:  "#3b82f6",
  text:     "#e2e8f0",
  text2:    "#94a3b8",
  red:      "#f43f5e",
  green:    "#10b981",
};

function fmt(n: number, sign = false): string {
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toFixed(0)}`;
  if (sign && n < 0) return `-${s}`;
  if (sign && n > 0) return `+${s}`;
  return s;
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  accent?: boolean;
}

function KpiCard({ label, value, sub, color, accent }: KpiCardProps) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: accent ? "rgba(59,130,246,0.05)" : C.surface,
        border: `1px solid ${accent ? "rgba(59,130,246,0.25)" : C.border}`,
      }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-2"
        style={{ color: C.text2, letterSpacing: "0.8px" }}
      >
        {label}
      </p>
      <p
        className="text-2xl font-mono font-medium"
        style={{ color: color ?? C.text }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: C.text2 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

interface Props {
  chains: Chain[];
}

export default function KpiCards({ chains }: Props) {
  const totalPnl = chains.reduce((sum, c) => {
    const equity = c.wheelSummary?.equityGainLoss ?? 0;
    return sum + c.netPnl + equity;
  }, 0);

  const committedCapital = Math.max(
    ...chains
      .filter((c) => c.status === "OPEN" || c.status === "ASSIGNED")
      .map((c) => c.committedCapital),
    0
  );
  const totalCommitted = chains
    .filter((c) => c.status === "OPEN" || c.status === "ASSIGNED")
    .reduce((sum, c) => sum + c.committedCapital, 0);

  const openCount = chains.filter(
    (c) => c.status === "OPEN" || c.status === "ASSIGNED"
  ).length;

  const completedCount = chains.filter((c) => c.status === "COMPLETED").length;

  return (
    <div className="grid grid-cols-2 gap-4 mb-6" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
      <KpiCard
        label="Total P&L"
        value={fmt(totalPnl, true)}
        sub="all closed positions"
        color={totalPnl >= 0 ? C.accent : C.red}
      />
      <KpiCard
        label="Committed Capital"
        value={fmt(totalCommitted)}
        sub={`${openCount} active position${openCount !== 1 ? "s" : ""}`}
        color={C.text}
      />
      <KpiCard
        label="Open Positions"
        value={String(openCount)}
        sub="chains open or assigned"
        color={C.text}
      />
      <KpiCard
        label="Completed Wheels"
        value={String(completedCount)}
        sub="full put → call cycles"
        color={C.accent2}
        accent
      />
    </div>
  );
}
