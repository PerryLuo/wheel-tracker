import type { Transaction } from "../types";
import type { BrokerParser } from "./normalize";
import { parseCsvFile, parseCurrency, parseQuantity, buildTxId } from "./utils";

// ── Action mapping ────────────────────────────────────────────────────────────
const ACTION_MAP: Record<string, string> = {
  STO: "STO",
  BTC: "BTC",
  BTO: "BTO",
  OEXP: "Expired",
  OASGN: "Assigned",
  Buy: "Buy",
  Sell: "Sell",
};

const OPTION_TRANS_CODES = new Set(["STO", "BTC", "BTO", "OEXP", "OASGN"]);

// ── Multi-line CSV normalizer ─────────────────────────────────────────────────
// Robinhood descriptions contain CUSIP info with embedded newlines inside quoted
// fields. The shared parseCsvFile splits on \n first, which breaks these rows.
// This pre-processor collapses newlines inside quotes to spaces.
function normalizeMultilineCsv(raw: string): string {
  const chars = raw.split("");
  let inQuotes = false;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes && (chars[i] === "\n" || chars[i] === "\r")) {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

// ── Description parsing ───────────────────────────────────────────────────────
// Direct trades: "TSLL 4/2/2026 Put $12.00"
const DIRECT_RE = /^(\w+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(Put|Call)\s+\$([0-9,.]+)$/;
// Expirations: "Option Expiration for DG 3/20/2026 Call $136.00"
const EXPIRY_RE = /^Option Expiration for (\w+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(Put|Call)\s+\$([0-9,.]+)$/;

interface OptionDetails {
  underlying: string;
  expiry: string; // YYYY-MM-DD
  optionType: "PUT" | "CALL";
  strike: number;
}

function parseRhDate(raw: string): string {
  const parts = raw.split("/");
  if (parts.length !== 3) return raw;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseOptionDescription(desc: string): OptionDetails | null {
  let match = desc.match(DIRECT_RE);
  if (!match) match = desc.match(EXPIRY_RE);
  if (!match) return null;

  const [, underlying, dateStr, type, strikeStr] = match;
  return {
    underlying,
    expiry: parseRhDate(dateStr),
    optionType: type === "Put" ? "PUT" : "CALL",
    strike: parseFloat(strikeStr.replace(",", "")),
  };
}

// ── Aggregation key ───────────────────────────────────────────────────────────
// Group split fills by: date + action + underlying + expiry + strike + optionType
function aggKey(tx: Transaction): string {
  return `${tx.date}|${tx.action}|${tx.underlying}|${tx.expiry}|${tx.strike}|${tx.optionType}`;
}

function aggregateSplitFills(txs: Transaction[]): Transaction[] {
  const groups = new Map<string, Transaction[]>();
  const result: Transaction[] = [];

  for (const tx of txs) {
    // Only aggregate option transactions (STO, BTC, BTO — not Assigned/Expired/Buy/Sell)
    if (tx.action === "STO" || tx.action === "BTC" || tx.action === "BTO") {
      const key = aggKey(tx);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    } else {
      result.push(tx);
    }
  }

  for (const [, fills] of groups) {
    if (fills.length === 1) {
      result.push(fills[0]);
      continue;
    }
    const base = { ...fills[0] };
    base.quantity = fills.reduce((s, f) => s + f.quantity, 0);
    base.amount = fills.reduce((s, f) => s + f.amount, 0);
    base.fees = fills.reduce((s, f) => s + f.fees, 0);
    // Recalculate price as weighted average (amount / quantity / 100 for options)
    // Actually just use the first fill's price since they're the same price for split fills
    // Regenerate ID with aggregated quantity
    base.id = buildTxId(base.date, base.action, base.symbol ?? base.underlying ?? "", base.quantity);
    result.push(base);
  }

  return result;
}

// ── Detection ─────────────────────────────────────────────────────────────────
const ROBINHOOD_REQUIRED_COLUMNS = ["Activity Date", "Trans Code", "Instrument"];

export const robinhoodParser: BrokerParser = {
  name: "robinhood",

  detect(raw: string, filename?: string): boolean {
    if (filename) {
      const lower = filename.toLowerCase();
      if (lower.includes("robinhood") && lower.endsWith(".csv")) return true;
    }
    // Only check header row — normalizeMultilineCsv not needed for first line
    const rows = parseCsvFile(raw);
    if (rows.length === 0) return false;
    const headers = Object.keys(rows[0]);
    return ROBINHOOD_REQUIRED_COLUMNS.every((col) => headers.includes(col));
  },

  parse(raw: string): Transaction[] {
    const normalized = normalizeMultilineCsv(raw);
    const rows = parseCsvFile(normalized);

    // First pass: identify tickers with option activity
    const optionTickers = new Set<string>();
    for (const row of rows) {
      const code = row["Trans Code"]?.trim();
      const ticker = row["Instrument"]?.trim();
      if (ticker && OPTION_TRANS_CODES.has(code)) {
        optionTickers.add(ticker);
      }
    }

    // Second pass: parse transactions
    const transactions: Transaction[] = [];
    let prevOasgn: { ticker: string; date: string } | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dateRaw = row["Activity Date"]?.trim();
      const code = row["Trans Code"]?.trim();
      const ticker = row["Instrument"]?.trim();
      const desc = row["Description"]?.trim();

      // Skip empty/invalid rows and trailing disclaimer
      if (!dateRaw || !code) continue;

      const action = ACTION_MAP[code];
      if (!action) continue; // Skip CDIV, ACH, INT, GOLD, SLIP, FUTSWP

      const date = parseRhDate(dateRaw);
      const amount = parseCurrency(row["Amount"] ?? "");
      const price = parseCurrency(row["Price"] ?? "");
      const qty = parseQuantity(row["Quantity"] ?? "");

      // Handle option transactions
      if (OPTION_TRANS_CODES.has(code)) {
        const details = desc ? parseOptionDescription(desc) : null;

        if (code === "OASGN") {
          prevOasgn = { ticker: ticker, date };
        }

        const optionSymbol = details
          ? `${details.underlying} ${details.expiry} ${details.strike} ${details.optionType}`
          : null;

        transactions.push({
          id: buildTxId(date, action, optionSymbol ?? ticker ?? "", qty),
          date,
          action,
          symbol: optionSymbol,
          underlying: details?.underlying ?? ticker ?? null,
          expiry: details?.expiry ?? null,
          strike: details?.strike ?? null,
          optionType: details?.optionType ?? null,
          quantity: qty,
          price,
          fees: 0,
          amount,
          broker: "robinhood",
          raw: row,
        });
        continue;
      }

      // Handle Buy/Sell
      if (action === "Buy" || action === "Sell") {
        const isAssignmentLeg =
          prevOasgn !== null &&
          prevOasgn.ticker === ticker &&
          prevOasgn.date === date;

        const hasOptionActivity = optionTickers.has(ticker);

        if (isAssignmentLeg) {
          prevOasgn = null;
          // Emit assignment stock leg
          transactions.push({
            id: buildTxId(date, action, ticker ?? "", qty),
            date,
            action,
            symbol: null,
            underlying: ticker ?? null,
            expiry: null,
            strike: null,
            optionType: null,
            quantity: qty,
            price,
            fees: 0,
            amount,
            broker: "robinhood",
            raw: row,
          });
        } else if (hasOptionActivity) {
          // Standalone stock trade for a ticker with option activity (e.g. ANET Sell)
          transactions.push({
            id: buildTxId(date, action, ticker ?? "", qty),
            date,
            action,
            symbol: null,
            underlying: ticker ?? null,
            expiry: null,
            strike: null,
            optionType: null,
            quantity: qty,
            price,
            fees: 0,
            amount,
            broker: "robinhood",
            raw: row,
          });
        }
        // else: skip (VOOG recurring buys, dividend reinvestments, etc.)
        continue;
      }
    }

    // Aggregate split fills
    return aggregateSplitFills(transactions);
  },
};
