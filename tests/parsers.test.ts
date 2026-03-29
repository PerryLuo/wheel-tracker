import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { schwabParser } from "@/lib/parsers/schwab";
import { robinhoodParser } from "@/lib/parsers/robinhood";
import { detectAndParse } from "@/lib/parsers/normalize";
import { parseCurrency } from "@/lib/parsers/utils";

function fixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "tests/fixtures", name),
    "utf-8"
  );
}

describe("schwabParser.detect()", () => {
  it("detects Schwab JSON by content", () => {
    expect(schwabParser.detect(fixture("schwab-pltr-sample.json"))).toBe(true);
  });

  it("detects Schwab JSON by filename hint", () => {
    expect(schwabParser.detect("{}", "schwab-export.json")).toBe(true);
  });

  it("rejects non-Schwab JSON", () => {
    expect(schwabParser.detect('{"foo": "bar"}')).toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(schwabParser.detect("not json")).toBe(false);
  });
});

describe("schwabParser.parse() — PLTR", () => {
  const raw = fixture("schwab-pltr-sample.json");
  const txs = schwabParser.parse(raw);

  it("parses all transactions", () => {
    // 12 raw rows, but 'Sell' and 'Buy' stock txs map to known actions too
    // All rows have recognized actions in our ACTION_MAP
    expect(txs.length).toBeGreaterThan(0);
  });

  it("parses STO correctly", () => {
    const sto = txs.find(
      (t) => t.action === "STO" && t.expiry === "2026-01-30"
    );
    expect(sto).toBeDefined();
    expect(sto!.underlying).toBe("PLTR");
    expect(sto!.strike).toBe(155);
    expect(sto!.optionType).toBe("PUT");
    expect(sto!.quantity).toBe(1);
    expect(sto!.amount).toBeCloseTo(265.34, 2);
    expect(sto!.date).toBe("2026-01-21");
    expect(sto!.broker).toBe("schwab");
  });

  it("parses BTC correctly", () => {
    const btc = txs.find(
      (t) => t.action === "BTC" && t.expiry === "2026-01-30"
    );
    expect(btc).toBeDefined();
    expect(btc!.amount).toBeCloseTo(-501.66, 2);
    expect(btc!.date).toBe("2026-01-29");
  });

  it("parses Assigned correctly and extracts settlement date", () => {
    // "02/13/2026 as of 02/12/2026" → uses the 'as of' date
    const assigned = txs.find(
      (t) => t.action === "Assigned" && t.optionType === "PUT"
    );
    expect(assigned).toBeDefined();
    expect(assigned!.date).toBe("2026-02-12");
    expect(assigned!.strike).toBe(150);
    expect(assigned!.optionType).toBe("PUT");
  });

  it("parses call assignment correctly", () => {
    const callAssigned = txs.find(
      (t) => t.action === "Assigned" && t.optionType === "CALL"
    );
    expect(callAssigned).toBeDefined();
    expect(callAssigned!.date).toBe("2026-03-06");
    expect(callAssigned!.strike).toBe(148);
    expect(callAssigned!.optionType).toBe("CALL");
  });

  it("parses Expired correctly", () => {
    const expired = txs.find((t) => t.action === "Expired");
    expect(expired).toBeDefined();
    expect(expired!.date).toBe("2026-02-27"); // "as of 02/27/2026"
    expect(expired!.amount).toBe(0);
  });

  it("assigns deterministic IDs (no duplicates)", () => {
    const ids = txs.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("schwabParser.parse() — TNA", () => {
  const raw = fixture("schwab-tna-sample.json");
  const txs = schwabParser.parse(raw);

  it("parses all TNA transactions", () => {
    expect(txs.length).toBeGreaterThan(0);
  });

  it("parses multi-contract STO correctly", () => {
    const sto = txs.find(
      (t) => t.action === "STO" && t.expiry === "2026-02-06"
    );
    expect(sto).toBeDefined();
    expect(sto!.quantity).toBe(2);
    expect(sto!.strike).toBe(53);
    expect(sto!.underlying).toBe("TNA");
  });
});

describe("detectAndParse()", () => {
  it("auto-detects and parses Schwab JSON", () => {
    const raw = fixture("schwab-pltr-sample.json");
    const txs = detectAndParse(raw);
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].broker).toBe("schwab");
  });

  it("throws on unknown format", () => {
    expect(() => detectAndParse('{"unknown": true}')).toThrow(
      "Unknown broker format"
    );
  });
});

// ── parseCurrency — parenthesized negatives ───────────────────────────────────
describe("parseCurrency", () => {
  it("parses standard positive", () => {
    expect(parseCurrency("$1,234.56")).toBeCloseTo(1234.56, 2);
  });

  it("parses standard negative", () => {
    expect(parseCurrency("-$1,234.56")).toBeCloseTo(-1234.56, 2);
  });

  it("parses parenthesized negative", () => {
    expect(parseCurrency("($620.80)")).toBeCloseTo(-620.80, 2);
  });

  it("parses parenthesized negative with comma", () => {
    expect(parseCurrency("($14,000.00)")).toBeCloseTo(-14000.0, 2);
  });

  it("returns 0 for empty string", () => {
    expect(parseCurrency("")).toBe(0);
  });
});

// ── Robinhood parser ──────────────────────────────────────────────────────────
describe("robinhoodParser.detect()", () => {
  const raw = fixture("robinhood_2026.csv");

  it("detects by CSV headers", () => {
    expect(robinhoodParser.detect(raw)).toBe(true);
  });

  it("detects by filename hint", () => {
    expect(robinhoodParser.detect("", "robinhood_2026.csv")).toBe(true);
  });

  it("rejects non-Robinhood content", () => {
    expect(robinhoodParser.detect('{"BrokerageTransactions": []}')).toBe(false);
  });

  it("rejects random CSV", () => {
    expect(robinhoodParser.detect("Name,Age\nAlice,30")).toBe(false);
  });
});

describe("robinhoodParser.parse()", () => {
  const raw = fixture("robinhood_2026.csv");
  const txs = robinhoodParser.parse(raw);

  it("returns transactions", () => {
    expect(txs.length).toBeGreaterThan(0);
  });

  it("all transactions have broker=robinhood", () => {
    expect(txs.every((t) => t.broker === "robinhood")).toBe(true);
  });

  it("filters out CDIV, ACH, INT, GOLD, SLIP, FUTSWP", () => {
    const actions = new Set(txs.map((t) => t.action));
    expect(actions.has("CDIV")).toBe(false);
    expect(actions.has("ACH")).toBe(false);
    expect(actions.has("INT")).toBe(false);
    expect(actions.has("GOLD")).toBe(false);
    expect(actions.has("SLIP")).toBe(false);
    expect(actions.has("FUTSWP")).toBe(false);
  });

  it("excludes VOOG Buy (no option activity)", () => {
    const voog = txs.filter((t) => t.underlying === "VOOG");
    expect(voog.length).toBe(0);
  });

  it("all IDs are unique", () => {
    const ids = txs.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── STO ───────────────────────────────────────────────────────────────────
  it("parses STO put correctly", () => {
    // 1/23 TNA STO PUT $53 exp 1/30, qty 6
    const sto = txs.find(
      (t) => t.action === "STO" && t.underlying === "TNA" && t.expiry === "2026-01-30"
    );
    expect(sto).toBeDefined();
    expect(sto!.strike).toBe(53);
    expect(sto!.optionType).toBe("PUT");
    expect(sto!.quantity).toBe(6);
    expect(sto!.amount).toBeCloseTo(425.74, 2);
  });

  it("parses STO call correctly", () => {
    // 3/23 TNA STO CALL $48.50 exp 3/27, qty 5
    const sto = txs.find(
      (t) => t.action === "STO" && t.underlying === "TNA" && t.expiry === "2026-03-27" && t.optionType === "CALL"
    );
    expect(sto).toBeDefined();
    expect(sto!.strike).toBe(48.5);
    expect(sto!.quantity).toBe(5);
    expect(sto!.amount).toBeCloseTo(394.78, 2);
  });

  // ── BTC ───────────────────────────────────────────────────────────────────
  it("parses BTC with parenthesized negative amount", () => {
    // BRKB BTC CALL $500 exp 1/16, qty 1, amount ($149.04)
    const btc = txs.find(
      (t) => t.action === "BTC" && t.underlying === "BRKB" && t.expiry === "2026-01-16"
    );
    expect(btc).toBeDefined();
    expect(btc!.strike).toBe(500);
    expect(btc!.optionType).toBe("CALL");
    expect(btc!.amount).toBeCloseTo(-149.04, 2);
  });

  // ── OEXP ──────────────────────────────────────────────────────────────────
  it("parses option expiration", () => {
    // SOFI 1/30 Call $29 expired, qty 10
    const exp = txs.find(
      (t) => t.action === "Expired" && t.underlying === "SOFI" && t.expiry === "2026-01-30"
    );
    expect(exp).toBeDefined();
    expect(exp!.optionType).toBe("CALL");
    expect(exp!.strike).toBe(29);
    expect(exp!.quantity).toBe(10);
    expect(exp!.amount).toBe(0);
  });

  it("parses 8S quantity on OEXP", () => {
    // ANET 3/20 Call $150 expired, qty "8S"
    const exp = txs.find(
      (t) => t.action === "Expired" && t.underlying === "ANET" && t.expiry === "2026-03-20"
    );
    expect(exp).toBeDefined();
    expect(exp!.quantity).toBe(8);
  });

  // ── Assignment (put — two-row pattern) ────────────────────────────────────
  it("parses DG put assignment (Assigned + Buy)", () => {
    const assigned = txs.find(
      (t) => t.action === "Assigned" && t.underlying === "DG" && t.optionType === "PUT"
    );
    expect(assigned).toBeDefined();
    expect(assigned!.strike).toBe(140);
    expect(assigned!.expiry).toBe("2026-03-13");
    expect(assigned!.quantity).toBe(1);

    const buy = txs.find(
      (t) => t.action === "Buy" && t.underlying === "DG" && t.date === "2026-03-13"
    );
    expect(buy).toBeDefined();
    expect(buy!.quantity).toBe(100);
    expect(buy!.amount).toBeCloseTo(-14000, 0);
  });

  // ── Assignment (call — two-row pattern) ────────────────────────────────────
  it("parses PLTR call assignment (Assigned + Sell)", () => {
    const assigned = txs.find(
      (t) => t.action === "Assigned" && t.underlying === "PLTR" && t.optionType === "CALL" && t.expiry === "2026-03-06"
    );
    expect(assigned).toBeDefined();
    expect(assigned!.strike).toBe(143);
    expect(assigned!.quantity).toBe(2);

    const sell = txs.find(
      (t) => t.action === "Sell" && t.underlying === "PLTR" && t.date === "2026-03-06"
    );
    expect(sell).toBeDefined();
    expect(sell!.quantity).toBe(200);
    expect(sell!.amount).toBeCloseTo(28599.96, 2);
  });

  // ── Standalone stock trade with option activity ───────────────────────────
  it("includes ANET Sell (standalone, has option activity)", () => {
    const sell = txs.find(
      (t) => t.action === "Sell" && t.underlying === "ANET"
    );
    expect(sell).toBeDefined();
    expect(sell!.quantity).toBe(100);
    expect(sell!.amount).toBeCloseTo(13986.02, 2);
  });

  // ── BTO ───────────────────────────────────────────────────────────────────
  it("parses BTO correctly", () => {
    // ANET BTO 8 contracts CALL $150 exp 3/20
    const bto = txs.find(
      (t) => t.action === "BTO" && t.underlying === "ANET"
    );
    expect(bto).toBeDefined();
    expect(bto!.quantity).toBe(8);
    expect(bto!.strike).toBe(150);
    expect(bto!.optionType).toBe("CALL");
    expect(bto!.amount).toBeCloseTo(-1536.32, 2);
  });

  // ── Date parsing ──────────────────────────────────────────────────────────
  it("converts M/D/YYYY to YYYY-MM-DD", () => {
    // 1/5/2026 → 2026-01-05
    const tx = txs.find(
      (t) => t.action === "STO" && t.underlying === "ANET" && t.expiry === "2026-01-09"
    );
    expect(tx).toBeDefined();
    expect(tx!.date).toBe("2026-01-05");
  });

  // ── Split fill aggregation ────────────────────────────────────────────────
  it("aggregates TNA 1/30 BTC split fills (5 rows → 1 tx, qty 6)", () => {
    const btc = txs.find(
      (t) => t.action === "BTC" && t.underlying === "TNA" && t.expiry === "2026-01-30"
    );
    expect(btc).toBeDefined();
    expect(btc!.quantity).toBe(6);
    expect(btc!.amount).toBeCloseTo(-720.24, 2);
  });

  it("aggregates TNA 1/30 STO split fills (5 rows → 1 tx, qty 6)", () => {
    const sto = txs.find(
      (t) => t.action === "STO" && t.underlying === "TNA" && t.expiry === "2026-02-06" && t.date === "2026-01-30"
    );
    expect(sto).toBeDefined();
    expect(sto!.quantity).toBe(6);
    expect(sto!.amount).toBeCloseTo(1517.71, 2);
  });

  it("aggregates TNA 2/12 STO split fills (3 rows → 1 tx, qty 4)", () => {
    const sto = txs.find(
      (t) => t.action === "STO" && t.underlying === "TNA" && t.expiry === "2026-02-20"
    );
    expect(sto).toBeDefined();
    expect(sto!.quantity).toBe(4);
    expect(sto!.amount).toBeCloseTo(335.81, 2);
  });

  it("aggregates PLTR 2/6 STO CALL split fills (2 rows → 1 tx, qty 2)", () => {
    const sto = txs.find(
      (t) => t.action === "STO" && t.underlying === "PLTR" && t.expiry === "2026-02-13" && t.optionType === "CALL"
    );
    expect(sto).toBeDefined();
    expect(sto!.quantity).toBe(2);
    expect(sto!.amount).toBeCloseTo(437.90, 2);
  });
});

describe("detectAndParse() — Robinhood", () => {
  it("auto-detects and parses Robinhood CSV", () => {
    const raw = fixture("robinhood_2026.csv");
    const txs = detectAndParse(raw, "robinhood_2026.csv");
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].broker).toBe("robinhood");
  });
});
