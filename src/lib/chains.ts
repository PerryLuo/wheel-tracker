// Ported from Code.gs:427 buildChains()
// Takes transactions for ONE underlying ticker, returns position chains.

import type { Transaction, Chain, Leg, LegChainType, ChainStatus, RoiRates } from "./types";
import { computeRoiRates } from "./roi";

// Same-day sort priority: Assigned/Expired before BTC before STO before everything else.
// Critical: assignment must be recorded before any same-day covered call sell.
const ACTION_PRIORITY: Record<string, number> = {
  Assigned: 0,
  Expired: 0,
  BTC: 1,
  STO: 2,
};

function sortPriority(action: string): number {
  return ACTION_PRIORITY[action] ?? 3;
}

function makeLeg(tx: Transaction, chainType: LegChainType, pnl: number): Leg {
  return {
    id: tx.id,
    date: tx.date,
    action: tx.action,
    symbol: tx.symbol,
    underlying: tx.underlying,
    expiry: tx.expiry,
    strike: tx.strike,
    optionType: tx.optionType,
    quantity: tx.quantity,
    price: tx.price,
    fees: tx.fees,
    amount: tx.amount,
    chainType,
    pnl,
  };
}

// Internal chain shape during building — has tracking fields stripped before return
interface BuildingChain {
  chainId: string;
  ticker: string;
  contracts: number;
  status: ChainStatus;
  openDate: string;
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
  costBasis: null;
  wheelSummary: null;
  _awaitingRollOpen: boolean;
  _lastCloseDate: string | null;
}

function dateDiffDays(a: string, b: string): number {
  const msA = new Date(a + "T00:00:00Z").getTime();
  const msB = new Date(b + "T00:00:00Z").getTime();
  return Math.round(Math.abs(msA - msB) / 86400000);
}

function finalizeChain(ch: BuildingChain, today: string): Chain {
  const closeOrToday = ch.closeDate ?? today;
  const days = Math.max(1, dateDiffDays(closeOrToday, ch.openDate));
  const roiPct =
    ch.committedCapital > 0 ? (ch.netPnl / ch.committedCapital) * 100 : 0;
  const roiRates = computeRoiRates(roiPct, days);

  return {
    chainId: ch.chainId,
    ticker: ch.ticker,
    contracts: ch.contracts,
    status: ch.status,
    openDate: ch.openDate,
    closeDate: ch.closeDate,
    days,
    committedCapital: ch.committedCapital,
    netPnl: ch.netPnl,
    roiPct,
    roiRates,
    currentStrike: ch.currentStrike,
    currentExpiry: ch.currentExpiry,
    pendingPremium: ch.pendingPremium,
    legs: ch.legs,
    costBasis: null,
    wheelSummary: null,
  };
}

export function buildChains(txs: Transaction[]): Chain[] {
  const chains: Chain[] = [];
  const openChains: Record<string, BuildingChain> = {};
  const putExpiryMap: Record<string, string> = {};  // expiry → chainId
  const callExpiryMap: Record<string, string> = {}; // expiry → chainId
  let chainCounter = 0;

  const today = new Date().toISOString().slice(0, 10);

  // Sort: by date asc, then by action priority within same date
  const sorted = txs.slice().sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return sortPriority(a.action) - sortPriority(b.action);
  });

  function getAssignedChains(): BuildingChain[] {
    return Object.values(openChains).filter((c) => c.status === "ASSIGNED");
  }

  function applyTx(tx: Transaction): boolean {
    // Returns false if the tx could not be applied (deferred BTC case)
    const { action, optionType, amount: amt, quantity: contracts } = tx;
    const expiry = tx.expiry ?? "";

    // ── SELL TO OPEN (PUT) ──────────────────────────────────────
    if (action === "STO" && optionType === "PUT") {
      // Roll detection: chain that BTC'd on the same calendar day awaits a reopen
      let rollId: string | null = null;
      for (const [cid, c] of Object.entries(openChains)) {
        if (
          c._awaitingRollOpen &&
          c.contracts === contracts &&
          c._lastCloseDate === tx.date
        ) {
          rollId = cid;
          break;
        }
      }

      if (rollId) {
        const ch = openChains[rollId];
        ch._awaitingRollOpen = false;
        ch.currentStrike = tx.strike;
        ch.currentExpiry = expiry;
        ch.netPnl += amt;
        ch.pendingPremium += Math.abs(amt);
        ch.legs.push(makeLeg(tx, "roll_open", amt));
        const newCapital = (tx.strike ?? 0) * contracts * 100;
        if (newCapital > ch.committedCapital) ch.committedCapital = newCapital;
        putExpiryMap[expiry] = rollId;
      } else {
        chainCounter++;
        const cid = `${tx.underlying ?? "X"}_${chainCounter}`;
        openChains[cid] = {
          chainId: cid,
          ticker: tx.underlying ?? "",
          contracts,
          status: "OPEN",
          openDate: tx.date,
          closeDate: null,
          days: 0,
          committedCapital: (tx.strike ?? 0) * contracts * 100,
          netPnl: amt,
          roiPct: 0,
          roiRates: { weekly: 0, monthly: 0, annual: 0 },
          currentStrike: tx.strike,
          currentExpiry: expiry,
          pendingPremium: Math.abs(amt),
          legs: [makeLeg(tx, "open", amt)],
          costBasis: null,
          wheelSummary: null,
          _awaitingRollOpen: false,
          _lastCloseDate: null,
        };
        putExpiryMap[expiry] = cid;
      }
      return true;
    }

    // ── BUY TO CLOSE (PUT) ──────────────────────────────────────
    if (action === "BTC" && optionType === "PUT") {
      const cid = putExpiryMap[expiry];
      if (!cid || !openChains[cid]) return false; // defer — expiry not yet opened
      const ch = openChains[cid];
      ch.netPnl += amt;
      ch.legs.push(makeLeg(tx, "roll_close", amt));
      ch._awaitingRollOpen = true;
      ch._lastCloseDate = tx.date;
      delete putExpiryMap[expiry];
      return true;
    }

    // ── EXPIRED (PUT) ───────────────────────────────────────────
    if (action === "Expired" && optionType === "PUT") {
      const cid = putExpiryMap[expiry];
      if (!cid || !openChains[cid]) return true;
      const ch = openChains[cid];
      ch.legs.push(makeLeg(tx, "expired", 0));
      ch.status = "EXPIRED";
      ch.closeDate = tx.date;
      ch.pendingPremium = 0;
      ch.currentStrike = null;
      ch.currentExpiry = null;
      chains.push(finalizeChain(ch, today));
      delete putExpiryMap[expiry];
      delete openChains[cid];
      return true;
    }

    // ── ASSIGNED (PUT) — stock acquired ─────────────────────────
    if (action === "Assigned" && optionType === "PUT") {
      const cid = putExpiryMap[expiry];
      if (!cid || !openChains[cid]) return true;
      const ch = openChains[cid];
      ch.legs.push(makeLeg(tx, "assigned", amt));
      ch.status = "ASSIGNED";
      ch.pendingPremium = 0;
      delete putExpiryMap[expiry];
      // stays in openChains for CC tracking
      return true;
    }

    // ── ASSIGNED (CALL) — stock called away, wheel complete ─────
    if (action === "Assigned" && optionType === "CALL") {
      const cid = callExpiryMap[expiry];
      if (!cid || !openChains[cid]) return true;
      const ch = openChains[cid];
      ch.legs.push(makeLeg(tx, "call_assigned", amt));
      ch.status = "COMPLETED";
      ch.closeDate = tx.date;
      ch.pendingPremium = 0;
      ch.currentStrike = null;
      ch.currentExpiry = null;
      chains.push(finalizeChain(ch, today));
      delete callExpiryMap[expiry];
      delete openChains[cid];
      return true;
    }

    // ── SELL TO OPEN (CALL) — covered call ──────────────────────
    if (action === "STO" && optionType === "CALL") {
      const assigned = getAssignedChains();
      if (!assigned.length) return true;
      const owner = assigned.reduce((latest, c) =>
        c.openDate > latest.openDate ? c : latest
      );
      owner.netPnl += amt;
      owner.pendingPremium += Math.abs(amt);
      owner.legs.push(makeLeg(tx, "call_open", amt));
      owner.currentStrike = tx.strike;
      owner.currentExpiry = expiry;
      callExpiryMap[expiry] = owner.chainId;
      return true;
    }

    // ── BUY TO CLOSE (CALL) ─────────────────────────────────────
    if (action === "BTC" && optionType === "CALL") {
      const cid = callExpiryMap[expiry];
      if (!cid || !openChains[cid]) return true;
      const ch = openChains[cid];
      ch.netPnl += amt;
      ch.legs.push(makeLeg(tx, "call_close", amt));
      ch.currentStrike = null;
      ch.currentExpiry = null;
      delete callExpiryMap[expiry];
      return true;
    }

    // ── EXPIRED (CALL) ───────────────────────────────────────────
    if (action === "Expired" && optionType === "CALL") {
      const cid = callExpiryMap[expiry];
      if (!cid || !openChains[cid]) return true;
      openChains[cid].legs.push(makeLeg(tx, "call_expired", 0));
      openChains[cid].currentExpiry = null;
      openChains[cid].currentStrike = null;
      delete callExpiryMap[expiry];
      return true;
    }

    // Plain Buy/Sell stock transactions (settlement of assignment) are intentionally
    // skipped — assignment cost is derived from PUT strike × contracts.
    return true;
  }

  // Process day-by-day so deferred BTCs can be retried after same-day STOs
  const dates = [...new Set(sorted.map((tx) => tx.date))].sort();
  for (const date of dates) {
    const dayTxs = sorted.filter((tx) => tx.date === date);
    const deferred: Transaction[] = [];

    for (const tx of dayTxs) {
      if (!applyTx(tx)) {
        deferred.push(tx);
      }
    }

    // Retry deferred BTCs now that same-day STOs have registered their expiries
    for (const tx of deferred) {
      applyTx(tx);
    }
  }

  // Finalize remaining open/assigned chains
  for (const ch of Object.values(openChains)) {
    // A chain that BTC'd without reopening is CLOSED
    if (ch._awaitingRollOpen) {
      ch.status = "CLOSED";
      ch.closeDate = ch._lastCloseDate;
    }
    chains.push(finalizeChain(ch, today));
  }

  return chains;
}

// Groups all transactions by underlying, runs buildChains per ticker, returns all chains.
export function buildAllChains(txs: Transaction[]): Chain[] {
  const byTicker: Record<string, Transaction[]> = {};
  for (const tx of txs) {
    const key = tx.underlying ?? "UNKNOWN";
    if (!byTicker[key]) byTicker[key] = [];
    byTicker[key].push(tx);
  }
  return Object.values(byTicker).flatMap(buildChains);
}
