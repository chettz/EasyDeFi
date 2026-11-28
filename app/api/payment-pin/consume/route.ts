import { NextResponse } from "next/server";
import { isPaymentPinAction } from "@/lib/payment-pin/action";
import { readJson, requireAppUser } from "@/lib/payment-pin/http";
import { consumePaymentGrant } from "@/lib/payment-pin/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireAppUser(request);
  if (user === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const grant = body && typeof body === "object" && "grant" in body ? body.grant : null;
  const action = body && typeof body === "object" && "action" in body ? body.action : null;
  if (typeof grant !== "string" || grant.length < 20 || grant.length > 128 || !isPaymentPinAction(action)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const used = await consumePaymentGrant(user.id, action, grant);
    if (!used) return NextResponse.json({ error: "invalid" }, { status: 401 });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
