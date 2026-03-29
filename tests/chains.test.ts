import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { schwabParser } from "@/lib/parsers/schwab";
import { buildChains, buildAllChains } from "@/lib/chains";
import type { Transaction } from "@/lib/types";

function fixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "tests/fixtures", name),
    "utf-8"
  );
}

function parseTicker(file: string, ticker: string): Transaction[] {
  const txs = schwabParser.parse(fixture(file));
  return txs.filter((t) => t.underlying === ticker);
}

// ─── TNA ──────────────────────────────────────────────────────────────────────
describe("buildChains() — TNA", () => {
  const txs = parseTicker("schwab-tna-sample.json", "TNA");
  const chains = buildChains(txs);

  it("produces 4 chains", () => {
    expect(chains).toHaveLength(4);
  });

  it("has 2 EXPIRED chains (53P roll→expired, 51P expired)", () => {
    const expired = chains.filter((c) => c.status === "EXPIRED");
    expect(expired).toHaveLength(2);
  });

  it("has 1 ASSIGNED chain (50P assigned 03/06)", () => {
    const assigned = chains.filter((c) => c.status === "ASSIGNED");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].contracts).toBe(3);
    expect(assigned[0].openDate).toBe("2026-02-26");
  });

  it("has 1 OPEN chain (44P/03/13 not yet expired)", () => {
    const open = chains.filter((c) => c.status === "OPEN");
    expect(open).toHaveLength(1);
    expect(open[0].currentExpiry).toBe("2026-03-13");
    expect(open[0].currentStrike).toBe(44);
  });

  it("53P roll chain has correct legs: open + roll_close + roll_open + expired", () => {
    const chain = chains.find(
      (c) => c.status === "EXPIRED" && c.contracts === 2
    );
    expect(chain).toBeDefined();
    const types = chain!.legs.map((l) => l.chainType);
    expect(types).toEqual(["open", "roll_close", "roll_open", "expired"]);
  });

  it("53P roll chain netPnl is sum of option amounts", () => {
    const chain = chains.find(
      (c) => c.status === "EXPIRED" && c.contracts === 2
    );
    // 168.67 (STO) - 229.32 (BTC) + 498.67 (STO roll) + 0 (expired) = 438.02
    expect(chain!.netPnl).toBeCloseTo(438.02, 1);
  });

  it("committedCapital uses highest strike × contracts × 100", () => {
    const chain = chains.find(
      (c) => c.status === "EXPIRED" && c.contracts === 2
    );
    // strike=53, contracts=2 → 53 × 2 × 100 = $10,600
    expect(chain!.committedCapital).toBe(10600);
  });

  it("51P chain has correct legs: open + expired", () => {
    const c51 = chains.find(
      (c) => c.status === "EXPIRED" && c.openDate === "2026-02-17"
    );
    expect(c51).toBeDefined();
    const types = c51!.legs.map((l) => l.chainType);
    expect(types).toEqual(["open", "expired"]);
  });
});

// ─── PLTR ─────────────────────────────────────────────────────────────────────
describe("buildChains() — PLTR", () => {
  const txs = parseTicker("schwab-pltr-sample.json", "PLTR");
  const chains = buildChains(txs);

  it("produces exactly 1 chain", () => {
    expect(chains).toHaveLength(1);
  });

  it("chain is COMPLETED", () => {
    expect(chains[0].status).toBe("COMPLETED");
  });

  it("chain opened 2026-01-21 and closed 2026-03-06", () => {
    expect(chains[0].openDate).toBe("2026-01-21");
    expect(chains[0].closeDate).toBe("2026-03-06");
  });

  it("chain has correct leg sequence", () => {
    const types = chains[0].legs.map((l) => l.chainType);
    expect(types).toEqual([
      "open",
      "roll_close",
      "roll_open",
      "roll_close",
      "roll_open",
      "assigned",
      "call_open",
      "call_expired",
      "call_open",
      "call_assigned",
    ]);
  });

  it("netPnl equals sum of all option leg amounts", () => {
    // 265.34 - 501.66 + 760.34 - 1875.66 + 1924.34 + 0 + 224.34 + 0 + 304.34 + 0
    expect(chains[0].netPnl).toBeCloseTo(1101.38, 1);
  });

  it("committedCapital is putStrike × contracts × 100", () => {
    // Initial STO 155P × 1 × 100 = $15,500, then rolls to 150 (lower), stays at 15500
    // Actually committed = max(155*100, 150*100) = 15500 for initial,
    // but roll_open at 150 is 150*100 = 15000 < 15500 so stays 15500
    expect(chains[0].committedCapital).toBe(15500);
  });

  it("pendingPremium resets to 0 when completed", () => {
    expect(chains[0].pendingPremium).toBe(0);
  });

  it("days is positive", () => {
    expect(chains[0].days).toBeGreaterThan(0);
  });
});

// ─── SOFI ─────────────────────────────────────────────────────────────────────
describe("buildChains() — SOFI", () => {
  const txs = parseTicker("schwab-sofi-sample.json", "SOFI");
  const chains = buildChains(txs);

  it("produces exactly 1 chain", () => {
    expect(chains).toHaveLength(1);
  });

  it("chain is ASSIGNED (pending covered calls)", () => {
    expect(chains[0].status).toBe("ASSIGNED");
  });

  it("has correct leg sequence: open, roll_close, roll_open, assigned", () => {
    const types = chains[0].legs.map((l) => l.chainType);
    expect(types).toEqual(["open", "roll_close", "roll_open", "assigned"]);
  });

  it("contracts = 5", () => {
    expect(chains[0].contracts).toBe(5);
  });

  it("pendingPremium is 0 after assignment", () => {
    expect(chains[0].pendingPremium).toBe(0);
  });
});

// ─── buildAllChains ───────────────────────────────────────────────────────────
describe("buildAllChains()", () => {
  it("groups by underlying and builds all chains from mixed ticker input", () => {
    const pltrTxs = schwabParser.parse(fixture("schwab-pltr-sample.json"));
    const tnaTxs = schwabParser.parse(fixture("schwab-tna-sample.json"));
    const allTxs = [...pltrTxs, ...tnaTxs];
    const chains = buildAllChains(allTxs);
    const pltrChains = chains.filter((c) => c.ticker === "PLTR");
    const tnaChains = chains.filter((c) => c.ticker === "TNA");
    expect(pltrChains).toHaveLength(1);
    expect(tnaChains).toHaveLength(4);
  });
});
