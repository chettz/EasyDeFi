import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/transactions/current-user";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentAppUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("activities")
      .select(
        "id, type, status, occurred_at, primary_tx_hash, network, sender_address, recipient_address, fee_raw, fee_decimals, fee_symbol, amount_raw, token_decimals, token_symbol",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });

    return NextResponse.json({ transaction: data });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Transaction could not be loaded." }, { status: 500 });
  }
}
