import { NextResponse } from "next/server";
import { isSixDigitPin } from "@/lib/payment-pin/action";
import { pinFailureResponse, readJson, requireAppUser } from "@/lib/payment-pin/http";
import { matchPaymentPin } from "@/lib/payment-pin/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const pin = body && typeof body === "object" && "pin" in body ? body.pin : null;
  if (!isSixDigitPin(pin)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    const result = await matchPaymentPin(user.id, pin);
    if ("error" in result) return pinFailureResponse(result);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
