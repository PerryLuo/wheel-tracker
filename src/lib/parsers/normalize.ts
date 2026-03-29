import type { Transaction } from "../types";
import { schwabParser } from "./schwab";
import { robinhoodParser } from "./robinhood";

export interface BrokerParser {
  name: string;
  // Return true if this parser can handle the raw input.
  // filename hint (e.g. "schwab-export.json") helps when content alone is ambiguous.
  detect(raw: string, filename?: string): boolean;
  // Parse raw input into normalized Transaction[].
  // Throws if the format is detected but invalid.
  parse(raw: string): Transaction[];
}

// Registry — add new brokers here
const parsers: BrokerParser[] = [schwabParser, robinhoodParser];

// Auto-detect broker and parse. Throws if no parser matches.
export function detectAndParse(raw: string, filename?: string): Transaction[] {
  const parser = parsers.find((p) => p.detect(raw, filename));
  if (!parser) {
    const hint = filename ? ` (file: ${filename})` : "";
    throw new Error(`Unknown broker format${hint}. Supported: ${parsers.map((p) => p.name).join(", ")}`);
  }
  return parser.parse(raw);
}
