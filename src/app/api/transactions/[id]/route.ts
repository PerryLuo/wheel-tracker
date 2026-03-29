import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await getSupabase()
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ deleted: id });
  } catch (e) {
    console.error("DELETE /api/transactions/[id] error:", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Delete failed" },
      { status: 500 }
    );
  }
}
