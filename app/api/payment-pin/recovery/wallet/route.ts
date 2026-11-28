import { NextResponse } from "next/server";
import { readJson, requireAppUser } from "@/lib/payment-pin/http";
import { createWalletRecoveryChallenge, verifyWalletRecovery } from "@/lib/payment-pin/recovery";
import { verifyPrivyRequest } from "@/lib/privy/server";

export const runtime = "nodejs";

async function context(request: Request) {
  const claims = await verifyPrivyRequest(request);
  const user = await requireAppUser(request);
  if (user === "error") return "error" as const;
  if (!claims || !user) return null;
  return { claims, user };
}

export async function POST(request: Request) {
  const current = await context(request);
  if (current === "error") return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const signature = body && typeof body === "object" && "signature" in body ? body.signature : null;
  if (signature == null) {
    try {
      const challenge = await createWalletRecoveryChallenge(current.claims.userId, current.user.id);
      if ("error" in challenge) return NextResponse.json(challenge, { status: 409 });
      return NextResponse.json(challenge);
    } catch (cause) {
      console.error(cause);
      return NextResponse.json({ error: "unavailable" }, { status: 500 });
    }
  }
  if (typeof signature !== "string" || !isAddressSignature(signature)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const result = await verifyWalletRecovery(current.claims.userId, current.user.id, signature);
    if ("error" in result) return NextResponse.json(result, { status: result.error === "mismatch" ? 401 : 409 });
    return NextResponse.json(result);
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}

function isAddressSignature(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{130}$/.test(value);
}
