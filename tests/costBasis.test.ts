import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { schwabParser } from "@/lib/parsers/schwab";
import { buildChains } from "@/lib/chains";
import { computeChainCostBasis, computeWheelSummary } from "@/lib/costBasis";
import type { Transaction } from "@/lib/types";

function fixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "tests/fixtures", name),
    "utf-8"
  );
}

function parseTicker(file: string, ticker: string): Transaction[] {
  return schwabParser
    .parse(fixture(file))
    .filter((t) => t.underlying === ticker);
}

// ─── PLTR cost basis ──────────────────────────────────────────────────────────
describe("computeChainCostBasis() — PLTR", () => {
  const chains = buildChains(parseTicker("schwab-pltr-sample.json", "PLTR"));
  const chain = chains[0];

  it("returns a value (chain was assigned)", () => {
    const cb = computeChainCostBasis(chain);
    expect(cb).not.toBeNull();
  });

  it("cost basis is correct", () => {
    // assignmentCost = 150 × 1 × 100 = 15000
    // putIn (open + roll_opens abs): 265.34 + 760.34 + 1924.34 = 2950.02
    // putOut (roll_closes abs):      501.66 + 1875.66 = 2377.32
    // callIn (call_opens abs):       224.34 + 304.34  = 528.68
    // callOut: 0
    // costBasis = (15000 - 2950.02 + 2377.32 - 528.68) / 100 = 138.9862
    const cb = computeChainCostBasis(chain);
    expect(cb).toBeCloseTo(138.99, 1);
  });

  it("returns null for OPEN/non-assigned chains", () => {
    const tnaTxs = parseTicker("schwab-tna-sample.json", "TNA");
    const tnaChains = buildChains(tnaTxs);
    const openChain = tnaChains.find((c) => c.status === "OPEN");
    expect(computeChainCostBasis(openChain!)).toBeNull();
  });
});

// ─── PLTR wheel summary ───────────────────────────────────────────────────────
describe("computeWheelSummary() — PLTR", () => {
  const chains = buildChains(parseTicker("schwab-pltr-sample.json", "PLTR"));
  const chain = chains[0];
  const summary = computeWheelSummary(chain);

  it("returns a summary for COMPLETED chain", () => {
    expect(summary).not.toBeNull();
  });

  it("putStrike = 150, callStrike = 148", () => {
    expect(summary!.putStrike).toBe(150);
    expect(summary!.callStrike).toBe(148);
  });

  it("shares = 100 (1 contract)", () => {
    expect(summary!.shares).toBe(100);
  });

  it("putPremium is net of all STO/BTC put legs", () => {
    // (265.34 + 760.34 + 1924.34) - (501.66 + 1875.66) = 2950.02 - 2377.32 = 572.70
    expect(summary!.putPremium).toBeCloseTo(572.70, 1);
  });

  it("callPremium is net of all STO/BTC call legs", () => {
    // 224.34 + 304.34 = 528.68 (no call BTC)
    expect(summary!.callPremium).toBeCloseTo(528.68, 1);
  });

  it("totalPremium = putPremium + callPremium", () => {
    // 572.70 + 528.68 = 1101.38
    expect(summary!.totalPremium).toBeCloseTo(1101.38, 1);
  });

  it("equityGainLoss = (callStrike - putStrike) × shares", () => {
    // (148 - 150) × 100 = -200
    expect(summary!.equityGainLoss).toBeCloseTo(-200, 1);
  });

  it("totalReturn = totalPremium + equityGainLoss", () => {
    // 1101.38 + (-200) = 901.38
    expect(summary!.totalReturn).toBeCloseTo(901.38, 1);
  });

  it("capitalDeployed = putStrike × shares", () => {
    // 150 × 100 = 15000
    expect(summary!.capitalDeployed).toBe(15000);
  });

  it("roiPct = (totalReturn / capitalDeployed) × 100", () => {
    // (901.38 / 15000) × 100 ≈ 6.01%
    expect(summary!.roiPct).toBeCloseTo(6.01, 0);
  });

  it("returns null for non-COMPLETED chains", () => {
    const sofiTxs = parseTicker("schwab-sofi-sample.json", "SOFI");
    const sofiChains = buildChains(sofiTxs);
    expect(computeWheelSummary(sofiChains[0])).toBeNull();
  });
});

// ─── SOFI cost basis ──────────────────────────────────────────────────────────
describe("computeChainCostBasis() — SOFI", () => {
  const chains = buildChains(parseTicker("schwab-sofi-sample.json", "SOFI"));
  const summary = computeChainCostBasis(chains[0]);

  it("returns a value (chain is assigned)", () => {
    expect(summary).not.toBeNull();
  });

  it("cost basis is correct", () => {
    // assignmentCost = 24 × 5 × 100 = 12000
    // putIn (open + roll_open): 396.68 + 2186.68 = 2583.36
    // putOut (roll_close): 2178.30
    // callIn/callOut: 0
    // costBasis = (12000 - 2583.36 + 2178.30) / 500 = 11594.94 / 500 = 23.1899
    const cb = computeChainCostBasis(chains[0]);
    expect(cb).toBeCloseTo(23.19, 1);
  });
});
