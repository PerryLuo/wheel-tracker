import type { Transaction, OptionType } from "../types";
import type { BrokerParser } from "./normalize";
import { parseJsonFile, parseCurrency, parseQuantity, buildTxId } from "./utils";

// Schwab action labels → our normalized action strings
// Only option-relevant actions — dividends, transfers, journals, interest are skipped
const ACTION_MAP: Record<string, string> = {
  "Sell to Open": "STO",
  "Buy to Close": "BTC",
  "Sell to Close": "STC",
  "Buy to Open": "BTO",
  "Assigned": "Assigned",
  "Expired": "Expired",
  "Buy": "Buy",
  "Sell": "Sell",
};

interface SchwabRawTx {
  Date: string;
  Action: string;
  Symbol: string;
  Description: string;
  Quantity: string;
  Price: string;
  "Fees & Comm": string;
  Amount: string;
}

interface SchwabExport {
  BrokerageTransactions: SchwabRawTx[];
}

// Parse Schwab date: "03/09/2026 as of 03/06/2026" → "2026-03-06" (settlement date)
// or "03/05/2026" → "2026-03-05"
function parseSchwabDate(raw: string): string {
  const asOfMatch = raw.match(/as of (\d{2}\/\d{2}\/\d{4})/);
  const dateStr = asOfMatch ? asOfMatch[1] : raw.trim().split(" ")[0];
  const [month, day, year] = dateStr.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Parse Schwab option symbol: "TNA 03/06/2026 50.00 P"
// Returns null for stock symbols like "TNA" or "PLTR"
function parseSchwabSymbol(raw: string): {
  underlying: string;
  expiry: string | null;
  strike: number | null;
  optionType: OptionType | null;
  isOption: boolean;
} {
  const parts = raw.trim().split(/\s+/);

  if (parts.length === 4) {
    // Option: UNDERLYING MM/DD/YYYY STRIKE P|C
    const [underlying, expRaw, strikeRaw, typeLetter] = parts;
    const [month, day, year] = expRaw.split("/");
    const expiry = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const strike = parseFloat(strikeRaw);
    const optionType: OptionType = typeLetter.toUpperCase() === "C" ? "CALL" : "PUT";
    return { underlying, expiry, strike, optionType, isOption: true };
  }

  // Stock: just the ticker
  return {
    underlying: parts[0],
    expiry: null,
    strike: null,
    optionType: null,
    isOption: false,
  };
}

export function parseTx(raw: SchwabRawTx): Transaction | null {
  const action = ACTION_MAP[raw.Action];
  if (!action) return null; // skip unrecognized actions

  const date = parseSchwabDate(raw.Date);
  const { underlying, expiry, strike, optionType, isOption } = parseSchwabSymbol(raw.Symbol);
  const quantity = parseQuantity(raw.Quantity);
  const price = parseCurrency(raw.Price);
  const fees = parseCurrency(raw["Fees & Comm"]);
  const amount = parseCurrency(raw.Amount);

  const id = buildTxId(date, raw.Action, raw.Symbol, quantity);

  return {
    id,
    date,
    action,
    symbol: isOption ? raw.Symbol : null,
    underlying,
    expiry,
    strike,
    optionType,
    quantity,
    price,
    fees,
    amount,
    broker: "schwab",
    raw,
  };
}

export const schwabParser: BrokerParser = {
  name: "schwab",

  detect(raw: string, filename?: string): boolean {
    // Filename hint: .json extension and "schwab" in name
    if (filename) {
      const lower = filename.toLowerCase();
      if (lower.endsWith(".json") && lower.includes("schwab")) return true;
    }
    // Content detection: Schwab JSON has BrokerageTransactions at root
    const data = parseJsonFile(raw);
    return (
      typeof data === "object" &&
      data !== null &&
      "BrokerageTransactions" in data &&
      Array.isArray((data as SchwabExport).BrokerageTransactions)
    );
  },

  parse(raw: string): Transaction[] {
    const data = parseJsonFile(raw) as SchwabExport;
    if (!data?.BrokerageTransactions) {
      throw new Error("Invalid Schwab JSON: missing BrokerageTransactions");
    }

    // Identify tickers with option activity
    const optionTickers = new Set<string>();
    for (const tx of data.BrokerageTransactions) {
      const parts = tx.Symbol.trim().split(/\s+/);
      if (parts.length === 4) optionTickers.add(parts[0]);
    }

    return data.BrokerageTransactions
      .map(parseTx)
      .filter((tx): tx is Transaction => {
        if (tx === null) return false;
        // Keep all option transactions
        if (tx.symbol !== null) return true;
        // For stock Buy/Sell, only keep if ticker has option activity (assignment legs)
        if (tx.action === "Buy" || tx.action === "Sell") {
          return optionTickers.has(tx.underlying ?? "");
        }
        return true;
      });
  },
};
