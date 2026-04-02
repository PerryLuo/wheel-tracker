// Ported from Code.gs:370 computePeriodPnl()

import type { Transaction, Chain, PeriodPnl } from "./types";
import { computeRoiRates } from "./roi";

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1)); // back to Monday
  return d.toISOString().slice(0, 10);
}

function isStockTx(tx: Transaction): boolean {
  return (tx.action === "Buy" || tx.action === "Sell") && tx.optionType === null;
}

function getPeriodEnd(periodStart: string, type: "weekly" | "monthly"): string {
  if (type === "weekly") {
    const d = new Date(periodStart + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 6);
    return d.toISOString().slice(0, 10);
  }
  // Monthly: last day of the month
  const [y, m] = periodStart.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
  return last.toISOString().slice(0, 10);
}

function getPeriodDays(type: "weekly" | "monthly", periodKey: string): number {
  if (type === "weekly") return 7;
  // Actual days in the month
  const [y, m] = periodKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isChainActiveInPeriod(chain: Chain, periodStart: string, periodEnd: string): boolean {
  return chain.openDate <= periodEnd && (chain.closeDate == null || chain.closeDate >= periodStart);
}

// Buckets transactions into weekly or monthly P&L periods.
// Committed capital is computed from chains active in each period (not from individual STO PUTs).
export function computePeriodPnl(
  txs: Transaction[],
  chains: Chain[],
  type: "weekly" | "monthly"
): PeriodPnl[] {
  const buckets: Record<string, { pnl: number }> = {};
  const periodTickers: Record<string, Set<string>> = {};

  const optionTxs = txs.filter((tx) => !isStockTx(tx));

  for (const tx of optionTxs) {
    if (!tx.date) continue;

    const key =
      type === "weekly"
        ? getWeekStart(tx.date)
        : tx.date.slice(0, 7); // "YYYY-MM"

    if (!buckets[key]) buckets[key] = { pnl: 0 };
    buckets[key].pnl += tx.amount;

    if (tx.underlying) {
      if (!periodTickers[key]) periodTickers[key] = new Set();
      periodTickers[key].add(tx.underlying);
    }
  }

  return Object.keys(buckets)
    .sort()
    .map((period) => {
      const periodStart = type === "weekly"
        ? period                    // already "YYYY-MM-DD" (Monday)
        : `${period}-01`;           // "YYYY-MM" → "YYYY-MM-01"
      const periodEnd = getPeriodEnd(periodStart, type);

      // Only count chains for tickers that had transactions in this period
      // so the total matches the sum of ticker sub-rows
      const tickers = periodTickers[period] ?? new Set<string>();
      const committed = chains
        .filter((c) => tickers.has(c.ticker) && isChainActiveInPeriod(c, periodStart, periodEnd))
        .reduce((sum, c) => sum + c.committedCapital, 0);

      const days = getPeriodDays(type, period);
      const pnl = buckets[period].pnl;
      const rawRoi = committed > 0 ? (pnl / committed) * 100 : 0;
      const roiRates = committed > 0 ? computeRoiRates(rawRoi, days) : null;

      return { period, pnl, committed, roiRates };
    });
}
