import { NextResponse } from "next/server";
import { isSixDigitPin } from "@/lib/payment-pin/action";
import { pinFailureResponse, readJson, requireAppUser } from "@/lib/payment-pin/http";
import { createPaymentPin, readPaymentPinStatus, setPaymentPinEnabled } from "@/lib/payment-pin/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await readPaymentPinStatus(user.id));
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const enabled = body && typeof body === "object" && "enabled" in body ? body.enabled : null;
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    const result = await setPaymentPinEnabled(user.id, enabled);
    if ("error" in result) return pinFailureResponse(result);
    return NextResponse.json(result);
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const pin = body && typeof body === "object" && "pin" in body ? body.pin : null;
  const pinConfirm = body && typeof body === "object" && "pinConfirm" in body ? body.pinConfirm : null;
  if (!isSixDigitPin(pin) || pin !== pinConfirm) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const result = await createPaymentPin(user.id, pin);
    if ("error" in result) return pinFailureResponse(result);
    return NextResponse.json({ configured: true });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
