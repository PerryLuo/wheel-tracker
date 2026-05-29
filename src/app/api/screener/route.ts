import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await getServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the most recent run date
  const { data: latest, error: latestErr } = await supabase
    .from("csp_screener_results")
    .select("run_date")
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    return NextResponse.json({ error: latestErr.message }, { status: 500 });
  }

  if (!latest) {
    return NextResponse.json({ results: [], run_date: null });
  }

  const { data: results, error: resultsErr } = await supabase
    .from("csp_screener_results")
    .select("*")
    .eq("run_date", latest.run_date)
    .order("rank", { ascending: true });

  if (resultsErr) {
    return NextResponse.json({ error: resultsErr.message }, { status: 500 });
  }

  return NextResponse.json({ results: results ?? [], run_date: latest.run_date });
}
