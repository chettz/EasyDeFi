import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/transactions/current-user";
import type { PinFailure } from "@/lib/payment-pin/service";

export async function readJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

export async function requireAppUser(request: Request) {
  try {
    return await getCurrentAppUser(request);
  } catch (cause) {
    console.error(cause);
    return "error" as const;
  }
}

export function pinFailureResponse(failure: PinFailure) {
  if (failure.error === "not_configured" || failure.error === "already_configured") {
    return NextResponse.json(failure, { status: 409 });
  }
  if (failure.error === "locked") return NextResponse.json(failure, { status: 423 });
  return NextResponse.json(failure, { status: 401 });
}
