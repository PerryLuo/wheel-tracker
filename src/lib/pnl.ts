// Ported from Code.gs:370 computePeriodPnl()

import type { Transaction, PeriodPnl } from "./types";

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1)); // back to Monday
  return d.toISOString().slice(0, 10);
}

function isStockTx(tx: Transaction): boolean {
  return (tx.action === "Buy" || tx.action === "Sell") && tx.optionType === null;
}

// Buckets transactions into weekly or monthly P&L periods.
// Stock Buy/Sell transactions (settlement of assignment) are excluded from P&L.
// Committed capital is tracked per STO PUT as strike × contracts × 100.
export function computePeriodPnl(
  txs: Transaction[],
  type: "weekly" | "monthly"
): PeriodPnl[] {
  const buckets: Record<string, { pnl: number; committed: number }> = {};

  const optionTxs = txs.filter((tx) => !isStockTx(tx));

  for (const tx of optionTxs) {
    if (!tx.date) continue;

    const key =
      type === "weekly"
        ? getWeekStart(tx.date)
        : tx.date.slice(0, 7); // "YYYY-MM"

    if (!buckets[key]) buckets[key] = { pnl: 0, committed: 0 };
    buckets[key].pnl += tx.amount;

    if (tx.action === "STO" && tx.optionType === "PUT") {
      buckets[key].committed += (tx.strike ?? 0) * tx.quantity * 100;
    }
  }

  return Object.keys(buckets)
    .sort()
    .map((period) => ({
      period,
      pnl: buckets[period].pnl,
      committed: buckets[period].committed,
    }));
}
