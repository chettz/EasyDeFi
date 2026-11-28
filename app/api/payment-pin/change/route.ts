import { NextResponse } from "next/server";
import { isSixDigitPin } from "@/lib/payment-pin/action";
import { pinFailureResponse, readJson, requireAppUser } from "@/lib/payment-pin/http";
import { changePaymentPin } from "@/lib/payment-pin/service";

export const runtime = "nodejs";

function field(body: unknown, name: string) {
  return body && typeof body === "object" && name in body ? body[name as keyof typeof body] : null;
}

export async function POST(request: Request) {
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const currentPin = field(body, "currentPin");
  const nextPin = field(body, "nextPin");
  const nextPinConfirm = field(body, "nextPinConfirm");
  if (!isSixDigitPin(currentPin) || !isSixDigitPin(nextPin) || nextPin !== nextPinConfirm) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const result = await changePaymentPin(user.id, currentPin, nextPin);
    if ("error" in result) return pinFailureResponse(result);
    return NextResponse.json({ configured: true });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
