import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { buildAllChains } from "@/lib/chains";
import { computeChainCostBasis, computeWheelSummary } from "@/lib/costBasis";
import { computePeriodPnl } from "@/lib/pnl";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    date: (row.date as string).slice(0, 10),
    action: row.action as string,
    symbol: (row.symbol as string | null) ?? null,
    underlying: (row.underlying as string | null) ?? null,
    expiry: row.expiry ? (row.expiry as string).slice(0, 10) : null,
    strike: (row.strike as number | null) ?? null,
    optionType: (row.option_type as "PUT" | "CALL" | null) ?? null,
    quantity: row.quantity as number,
    price: row.price as number,
    fees: row.fees as number,
    amount: row.amount as number,
    broker: (row.broker as string | undefined) ?? "schwab",
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brokerFilter = req.nextUrl.searchParams.get("broker");

    let query = supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: true });

    if (brokerFilter) {
      query = query.eq("broker", brokerFilter);
    }

    const { data, error } = await query;

    if (error) throw error;

    const transactions: Transaction[] = (data ?? []).map(rowToTransaction);

    const chains = buildAllChains(transactions).map((chain) => ({
      ...chain,
      costBasis: computeChainCostBasis(chain),
      wheelSummary: computeWheelSummary(chain),
    }));

    chains.sort((a, b) => {
      const aOpen = a.status === "OPEN" || a.status === "ASSIGNED" ? 0 : 1;
      const bOpen = b.status === "OPEN" || b.status === "ASSIGNED" ? 0 : 1;
      return aOpen - bOpen || b.openDate.localeCompare(a.openDate);
    });

    const weekly = computePeriodPnl(transactions, "weekly");
    const monthly = computePeriodPnl(transactions, "monthly");

    // YTD + totals (option txs only — exclude stock Buy/Sell)
    const currentYear = new Date().getUTCFullYear().toString();
    const optionTxs = transactions.filter(
      (t) => !(( t.action === "Buy" || t.action === "Sell") && t.optionType === null)
    );
    const ytdTxs = optionTxs.filter((t) => t.date.startsWith(currentYear));

    const totalPnl = optionTxs.reduce((s, t) => s + t.amount, 0);
    const ytd = ytdTxs.reduce((s, t) => s + t.amount, 0);
    const ytdCommitted = ytdTxs
      .filter((t) => t.action === "STO" && t.optionType === "PUT")
      .reduce((s, t) => s + (t.strike ?? 0) * t.quantity * 100, 0);

    return NextResponse.json({ transactions, chains, weekly, monthly, totalPnl, ytd, ytdCommitted });
  } catch (e) {
    console.error("GET /api/transactions error:", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Failed to load transactions" },
      { status: 500 }
    );
  }
}
