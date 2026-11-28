import { NextResponse } from "next/server";
import { isSixDigitPin } from "@/lib/payment-pin/action";
import { readJson, requireAppUser } from "@/lib/payment-pin/http";
import { resetPaymentPinWithRecovery } from "@/lib/payment-pin/recovery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const pin = body && typeof body === "object" && "pin" in body ? body.pin : null;
  const pinConfirm = body && typeof body === "object" && "pinConfirm" in body ? body.pinConfirm : null;
  const recovery = body && typeof body === "object" && "recovery" in body ? body.recovery : null;
  if (!isSixDigitPin(pin) || pin !== pinConfirm || typeof recovery !== "string" || recovery.length < 20) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const result = await resetPaymentPinWithRecovery(user.id, recovery, pin);
    if ("error" in result) return NextResponse.json(result, { status: 401 });
    return NextResponse.json(result);
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
