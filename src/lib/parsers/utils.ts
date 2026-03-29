// Generic file format readers — broker-agnostic

// Parse a JSON string, returning null if invalid
export function parseJsonFile(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Parse a CSV string into an array of row objects keyed by header
export function parseCsvFile(raw: string): Record<string, string>[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

// Handle quoted CSV fields (e.g. "$1,234.56" should not split on the comma)
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Strip currency formatting: "$1,234.56" → 1234.56, "-$1,234.56" → -1234.56, "($620.80)" → -620.80
export function parseCurrency(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  const trimmed = raw.trim();
  const isNegParens = trimmed.startsWith("(") && trimmed.endsWith(")");
  const inner = isNegParens ? trimmed.slice(1, -1) : trimmed;
  const cleaned = inner.replace(/[$,\s]/g, "");
  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  return isNegParens ? -val : val;
}

// Normalize a quantity string: "3" → 3, "" → 0
export function parseQuantity(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  const val = parseInt(raw.trim(), 10);
  return isNaN(val) ? 0 : val;
}

// Build a deterministic transaction ID from key fields
export function buildTxId(date: string, action: string, symbol: string, quantity: number): string {
  const key = `${date}|${action}|${symbol}|${quantity}`;
  // Simple djb2 hash — good enough for dedup, no crypto dep needed
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}
