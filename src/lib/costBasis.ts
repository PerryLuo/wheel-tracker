// Ported from Code.gs:289 computeChainCostBasis() and Code.gs:320 computeWheelSummary()

import type { Chain, WheelSummary } from "./types";

// Cost basis per share for an assigned chain.
// Formula: (Assignment Cost − Put Premiums Received + Put BTC Costs − Call Premiums Received + Call BTC Costs) ÷ shares
// Returns null if the chain has never been assigned.
export function computeChainCostBasis(chain: Chain): number | null {
  const hasAssignment = chain.legs.some((l) => l.chainType === "assigned");
  if (!hasAssignment) return null;

  let assignmentCost = 0;
  let shares = 0;
  let putIn = 0;   // STO PUT premiums received (reduces cost basis)
  let putOut = 0;  // BTC PUT costs paid (increases cost basis)
  let callIn = 0;  // STO CALL premiums received (reduces cost basis)
  let callOut = 0; // BTC CALL costs paid (increases cost basis)

  for (const leg of chain.legs) {
    switch (leg.chainType) {
      case "assigned":
        assignmentCost += (leg.strike ?? 0) * leg.quantity * 100;
        shares += leg.quantity * 100;
        break;
      case "open":
      case "roll_open":
        putIn += Math.abs(leg.amount);
        break;
      case "roll_close":
        putOut += Math.abs(leg.amount);
        break;
      case "call_open":
        callIn += Math.abs(leg.amount);
        break;
      case "call_close":
        callOut += Math.abs(leg.amount);
        break;
    }
  }

  if (!shares) return null;
  return (assignmentCost - putIn + putOut - callIn + callOut) / shares;
}

// Full premium + equity breakdown for a completed wheel.
// Returns null for non-COMPLETED chains.
export function computeWheelSummary(chain: Chain): WheelSummary | null {
  if (chain.status !== "COMPLETED") return null;

  let putPremium = 0;
  let callPremium = 0;
  let putStrike = 0;
  let callStrike = 0;
  let shares = 0;

  for (const leg of chain.legs) {
    switch (leg.chainType) {
      case "open":
      case "roll_open":
        putPremium += Math.abs(leg.amount);
        break;
      case "roll_close":
        putPremium -= Math.abs(leg.amount);
        break;
      case "assigned":
        putStrike = leg.strike ?? 0;
        shares = leg.quantity * 100;
        break;
      case "call_open":
        callPremium += Math.abs(leg.amount);
        break;
      case "call_close":
        callPremium -= Math.abs(leg.amount);
        break;
      case "call_assigned":
        callStrike = leg.strike ?? 0;
        break;
      // call_expired: premium already counted via call_open, no change
    }
  }

  if (!shares || !callStrike) return null;

  const totalPremium = putPremium + callPremium;
  const equityGainLoss = (callStrike - putStrike) * shares;
  const totalReturn = totalPremium + equityGainLoss;
  const capitalDeployed = putStrike * shares;
  const roiPct = capitalDeployed > 0 ? (totalReturn / capitalDeployed) * 100 : 0;

  return {
    putPremium,
    callPremium,
    totalPremium,
    equityGainLoss,
    totalReturn,
    capitalDeployed,
    roiPct,
    putStrike,
    callStrike,
    shares,
  };
}
