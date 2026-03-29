import type { ChainStatus, LegChainType } from "@/lib/types";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ChainStatus, { bg: string; color: string }> = {
  OPEN:      { bg: "rgba(0,212,170,0.15)",   color: "#00d4aa" },
  ASSIGNED:  { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
  COMPLETED: { bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
  EXPIRED:   { bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  CLOSED:    { bg: "rgba(75,96,128,0.15)",   color: "#4b6080" },
};

export function StatusBadge({ status }: { status: ChainStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {status}
    </span>
  );
}

// ── Leg type badge ────────────────────────────────────────────────────────────

const LEG_STYLES: Record<LegChainType, { bg: string; color: string; label: string }> = {
  open:          { bg: "rgba(16,185,129,0.15)",  color: "#10b981", label: "STO PUT"       },
  roll_open:     { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24", label: "ROLL OPEN"     },
  roll_close:    { bg: "rgba(244,63,94,0.15)",   color: "#f43f5e", label: "ROLL CLOSE"    },
  assigned:      { bg: "rgba(59,130,246,0.15)",  color: "#3b82f6", label: "ASSIGNED"      },
  expired:       { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", label: "EXPIRED"       },
  call_open:     { bg: "rgba(168,85,247,0.15)",  color: "#c084fc", label: "STO CALL"      },
  call_close:    { bg: "rgba(168,85,247,0.1)",   color: "#a855f7", label: "BTC CALL"      },
  call_expired:  { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", label: "CALL EXP"      },
  call_assigned: { bg: "rgba(59,130,246,0.15)",  color: "#3b82f6", label: "CALL ASGN"     },
};

export function LegTypeBadge({ type }: { type: LegChainType }) {
  const s = LEG_STYLES[type];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}
