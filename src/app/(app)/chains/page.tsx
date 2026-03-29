"use client";

import { Suspense } from "react";
import { useTransactions } from "@/hooks/useTransactions";
import { useBrokerFilter } from "@/hooks/useBrokerFilter";
import KpiCards from "@/components/KpiCards";
import ChainTable from "@/components/ChainTable";

const C = {
  text2:  "#94a3b8",
  muted:  "#4b6080",
  accent: "#00d4aa",
  border: "#1e2d3d",
  red:    "#f43f5e",
};

function Spinner() {
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-4 opacity-30">📊</p>
      <p className="text-lg font-semibold mb-2" style={{ color: C.text2 }}>
        No transactions yet
      </p>
      <p className="text-sm" style={{ color: C.muted }}>
        Click <strong style={{ color: C.accent }}>Import</strong> in the nav to load your Schwab export.
      </p>
    </div>
  );
}

function ChainsPageInner() {
  const broker = useBrokerFilter();
  const { data, loading, error } = useTransactions(broker);

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm" style={{ color: C.red }}>{error}</p>
      </div>
    );
  }

  if (!data || !data.chains.length) return <EmptyState />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: "#e2e8f0" }}>
            Chains
          </h1>
          <p className="text-sm" style={{ color: C.text2 }}>
            {data.chains.length} chain{data.chains.length !== 1 ? "s" : ""} · {data.transactions.length} transactions
          </p>
        </div>
      </div>
      <KpiCards chains={data.chains} />
      <ChainTable chains={data.chains} />
    </div>
  );
}

export default function ChainsPage() {
  return (
    <Suspense>
      <ChainsPageInner />
    </Suspense>
  );
}
