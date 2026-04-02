export type OptionType = "PUT" | "CALL";
export type ChainStatus = "OPEN" | "ASSIGNED" | "COMPLETED" | "EXPIRED" | "CLOSED";

// Mirrors the chainType values assigned in buildChains
export type LegChainType =
  | "open"           // initial STO PUT
  | "roll_open"      // STO PUT that's a roll (same-day reopen after BTC)
  | "roll_close"     // BTC PUT (closing leg of a roll)
  | "assigned"       // PUT assignment — stock acquired at strike
  | "expired"        // PUT expired worthless
  | "call_open"      // STO CALL (covered call)
  | "call_close"     // BTC CALL
  | "call_expired"   // CALL expired worthless
  | "call_assigned"; // CALL assignment — stock called away, wheel complete

export interface Transaction {
  id: string;
  date: string; // ISO "YYYY-MM-DD"
  action: string; // normalized: "STO", "BTC", "Assigned", "Expired", "Buy", "Sell", etc.
  symbol: string | null; // full option symbol or null for stocks
  underlying: string | null;
  expiry: string | null; // ISO "YYYY-MM-DD"
  strike: number | null;
  optionType: OptionType | null;
  quantity: number;
  price: number;
  fees: number;
  amount: number;
  broker?: string;
  raw?: unknown;
}

export interface Leg {
  id: string;
  date: string;
  action: string;
  symbol: string | null;
  underlying: string | null;
  expiry: string | null;
  strike: number | null;
  optionType: OptionType | null;
  quantity: number;
  price: number;
  fees: number;
  amount: number;
  chainType: LegChainType;
  pnl: number;
}

export interface RoiRates {
  weekly: number;   // rawROI × (7 / days)
  monthly: number;  // rawROI × (30 / days)
  annual: number;   // rawROI × (365 / days)
}

export interface WheelSummary {
  putPremium: number;
  callPremium: number;
  totalPremium: number;
  equityGainLoss: number;
  totalReturn: number;
  capitalDeployed: number;
  roiPct: number;
  putStrike: number;
  callStrike: number;
  shares: number;
}

export interface Chain {
  chainId: string;
  ticker: string;
  contracts: number;
  status: ChainStatus;
  openDate: string;   // ISO "YYYY-MM-DD"
  closeDate: string | null;
  days: number;
  committedCapital: number;
  netPnl: number;
  roiPct: number;
  roiRates: RoiRates;
  currentStrike: number | null;
  currentExpiry: string | null;
  pendingPremium: number;
  legs: Leg[];
  costBasis: number | null;
  wheelSummary: WheelSummary | null;
}

export interface PeriodPnl {
  period: string;  // "YYYY-MM-DD" (week start) or "YYYY-MM" (month)
  pnl: number;
  committed: number;
  roiRates: RoiRates | null;
}
