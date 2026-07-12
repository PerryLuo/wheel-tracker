import { describe, it, expect } from "vitest";
import { buildChains } from "@/lib/chains";
import type { Transaction } from "@/lib/types";

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: p.id!, date: p.date!, action: p.action!, symbol: "SOXL", underlying: "SOXL",
    expiry: p.expiry ?? null, strike: p.strike ?? null, optionType: p.optionType ?? null,
    quantity: p.quantity ?? 2, price: 0, fees: 0, amount: p.amount ?? 0,
  };
}

// Regression: two puts sharing an expiry (07-10) but different strikes must build
// as independent chains. The 175 is the initial put, rolled forward and still open;
// the 135 was sold once and expired. Keying the put map by expiry alone previously
// let the 135 STO clobber the 175 mapping, misattributing the 175's rolls onto the
// 135 chain and orphaning the 175 as a spurious EXPIRED chain.
describe("buildChains() — same-expiry different-strike puts", () => {
  const txs: Transaction[] = [
    tx({ id: "1", date: "2026-07-01", action: "STO", optionType: "PUT", strike: 175, expiry: "2026-07-10", amount: 1458.63 }),
    tx({ id: "2", date: "2026-07-02", action: "STO", optionType: "PUT", strike: 135, expiry: "2026-07-10", amount: 974.64 }),
    tx({ id: "3", date: "2026-07-06", action: "BTC", optionType: "PUT", strike: 175, expiry: "2026-07-10", amount: -1373.33 }),
    tx({ id: "4", date: "2026-07-06", action: "STO", optionType: "PUT", strike: 175, expiry: "2026-07-17", amount: 2890.60 }),
    tx({ id: "5", date: "2026-07-09", action: "BTC", optionType: "PUT", strike: 175, expiry: "2026-07-17", amount: -2311.33 }),
    tx({ id: "6", date: "2026-07-09", action: "STO", optionType: "PUT", strike: 175, expiry: "2026-07-24", amount: 3748.58 }),
    tx({ id: "7", date: "2026-07-10", action: "Expired", optionType: "PUT", strike: 135, expiry: "2026-07-10", amount: 0 }),
  ];
  const chains = buildChains(txs, "2026-07-12");

  it("produces exactly 2 chains", () => {
    expect(chains).toHaveLength(2);
  });

  it("135 put is its own EXPIRED chain (open + expired, no rolls)", () => {
    const expired = chains.find((c) => c.status === "EXPIRED")!;
    expect(expired).toBeDefined();
    expect(expired.legs.map((l) => l.strike)).toEqual([135, 135]);
    expect(expired.legs.map((l) => l.chainType)).toEqual(["open", "expired"]);
  });

  it("175 put is the OPEN rolling chain ending at strike 175 exp 07-24", () => {
    const open = chains.find((c) => c.status === "OPEN")!;
    expect(open).toBeDefined();
    expect(open.currentStrike).toBe(175);
    expect(open.currentExpiry).toBe("2026-07-24");
    expect(open.legs[0].strike).toBe(175);
    expect(open.legs.map((l) => l.chainType)).toEqual([
      "open", "roll_close", "roll_open", "roll_close", "roll_open",
    ]);
  });
});
