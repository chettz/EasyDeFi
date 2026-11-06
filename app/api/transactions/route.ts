import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/transactions/current-user";
import { supabaseAdmin } from "@/lib/supabase/server";

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Cursor = { occurredAt: string; id: string };

function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!UUID.test(parsed.id) || !Number.isFinite(Date.parse(parsed.occurredAt))) return null;
    return { id: parsed.id, occurredAt: new Date(parsed.occurredAt).toISOString() };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentAppUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cursorValue = new URL(request.url).searchParams.get("cursor");
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    if (cursorValue && !cursor) {
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("activities")
      .select("id, type, status, network, token_symbol, amount_raw, token_decimals, occurred_at")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false });
    if (cursor) {
      query = query.or(
        `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query.limit(PAGE_SIZE + 1);
    if (error) throw error;

    const transactions = data.slice(0, PAGE_SIZE);
    const last = transactions.at(-1);
    const nextCursor =
      data.length > PAGE_SIZE && last
        ? encodeCursor({ occurredAt: last.occurred_at, id: last.id })
        : null;
    return NextResponse.json({ transactions, nextCursor });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Transactions could not be loaded." }, { status: 500 });
  }
}
