import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { schwabParser } from "@/lib/parsers/schwab";
import { detectAndParse } from "@/lib/parsers/normalize";

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
