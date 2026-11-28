import { NextResponse } from "next/server";
import { isSixDigitPin } from "@/lib/payment-pin/action";
import { readJson, requireAppUser } from "@/lib/payment-pin/http";
import { verifyRecoveryEmail } from "@/lib/payment-pin/recovery";
import { verifyPrivyRequest } from "@/lib/privy/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const claims = await verifyPrivyRequest(request);
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!claims || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const code = body && typeof body === "object" && "code" in body ? body.code : null;
  if (!isSixDigitPin(code)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    const result = await verifyRecoveryEmail(claims.userId, user.id, code);
    if ("error" in result) return NextResponse.json(result, { status: result.error === "mismatch" ? 401 : 409 });
    return NextResponse.json(result);
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
