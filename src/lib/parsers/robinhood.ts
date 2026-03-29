import type { Transaction } from "../types";
import type { BrokerParser } from "./normalize";
import { parseCsvFile } from "./utils";

// TODO (Sprint 6): Implement Robinhood CSV parser once a real export is available.
// Robinhood exports options activity as CSV. Verify exact column names from your export:
//
// Expected columns (confirm these match your actual Robinhood CSV):
//   "Activity Date"   - trade date
//   "Process Date"    - settlement date
//   "Instrument"      - underlying ticker
//   "Description"     - e.g. "PLTR 3/15/2024 Call $25.00"
//   "Trans Code"      - e.g. "STO", "BTC", "OEXP", "OASGN", "Buy", "Sell"
//   "Quantity"        - number of contracts/shares
//   "Price"           - price per contract/share
//   "Amount"          - total dollar amount
//
// Action mapping (verify against your exports):
//   STO  → "STO"
//   BTC  → "BTC"
//   OEXP → "Expired"
//   OASGN → "Assigned"
//   Buy  → "Buy"
//   Sell → "Sell"

const ROBINHOOD_REQUIRED_COLUMNS = ["Activity Date", "Trans Code", "Instrument"];

export const robinhoodParser: BrokerParser = {
  name: "robinhood",

  detect(raw: string, filename?: string): boolean {
    // Filename hint
    if (filename) {
      const lower = filename.toLowerCase();
      if (lower.includes("robinhood") && lower.endsWith(".csv")) return true;
    }
    // Content detection: look for Robinhood-specific column headers
    const rows = parseCsvFile(raw);
    if (rows.length === 0) return false;
    const headers = Object.keys(rows[0]);
    return ROBINHOOD_REQUIRED_COLUMNS.every((col) => headers.includes(col));
  },

  parse(_raw: string): Transaction[] {
    // TODO: implement in Sprint 6 once column names are confirmed with a real export
    throw new Error(
      "Robinhood parser not yet implemented. Please export from Schwab for now."
    );
  },
};
