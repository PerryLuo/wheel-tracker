import type { RoiRates } from "./types";

export function computeRoiRates(rawRoiPct: number, days: number): RoiRates {
  const d = Math.max(1, days);
  return {
    weekly: rawRoiPct * (7 / d),
    monthly: rawRoiPct * (30 / d),
    annual: rawRoiPct * (365 / d),
  };
}

export function fmtRoiCompact(rates: RoiRates): string {
  const w = `${rates.weekly >= 0 ? "+" : ""}${rates.weekly.toFixed(1)}%`;
  const m = `${rates.monthly >= 0 ? "+" : ""}${rates.monthly.toFixed(1)}%`;
  const a = `${rates.annual >= 0 ? "+" : ""}${rates.annual.toFixed(0)}%`;
  return `${w} / ${m} / ${a}`;
}
