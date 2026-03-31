import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { detectAndParse } from "@/lib/parsers/normalize";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (!body?.trim()) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    // Parse — throws if format is unrecognized
    let transactions: Transaction[];
    const filename = req.headers.get("x-filename") ?? undefined;
    try {
      transactions = detectAndParse(body, filename);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 422 }
      );
    }

    if (!transactions.length) {
      return NextResponse.json({ imported: 0, skipped: 0, errors: [] });
    }

    const db = await getServerSupabase();

    const { data: { user } } = await db.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch existing IDs to deduplicate (RLS filters to this user automatically)
    const { data: existing, error: fetchErr } = await db
      .from("transactions")
      .select("id");

    if (fetchErr) throw fetchErr;

    const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));

    const toInsert = transactions.filter((tx) => !existingIds.has(tx.id));
    const skippedTxs = transactions.filter((tx) => existingIds.has(tx.id));
    const skipped = skippedTxs.length;

    // Unique option-bearing tickers in each group (exclude pure stock rows without option context)
    const importedTickers = [...new Set(
      toInsert.map((tx) => tx.underlying).filter(Boolean)
    )].sort() as string[];
    const skippedTickers = [...new Set(
      skippedTxs.map((tx) => tx.underlying).filter(Boolean)
    )].sort() as string[];

    const isPreview = req.nextUrl.searchParams.get("preview") === "true";

    // Preview mode: return counts without inserting
    if (isPreview || !toInsert.length) {
      return NextResponse.json({ imported: toInsert.length, skipped, importedTickers, skippedTickers, errors: [] });
    }

    // Map Transaction → DB row (snake_case columns), stamp user_id
    const rows = toInsert.map((tx) => ({
      id: tx.id,
      user_id: user.id,
      date: tx.date,
      action: tx.action,
      symbol: tx.symbol,
      underlying: tx.underlying,
      expiry: tx.expiry,
      strike: tx.strike,
      option_type: tx.optionType,
      quantity: tx.quantity,
      price: tx.price,
      fees: tx.fees,
      amount: tx.amount,
      broker: tx.broker ?? "schwab",
      raw: tx.raw ?? null,
    }));

    const { error: insertErr } = await db
      .from("transactions")
      .insert(rows);

    if (insertErr) throw insertErr;

    return NextResponse.json({
      imported: toInsert.length,
      skipped,
      importedTickers,
      skippedTickers,
      errors: [],
    });
  } catch (e) {
    console.error("Import error:", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Import failed" },
      { status: 500 }
    );
  }
}
