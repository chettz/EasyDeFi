import "server-only";

import type { PaymentPinAction } from "@/lib/payment-pin/action";
import { createGrantToken, createSalt, hashGrantToken, hashPaymentPin, paymentPinMatches } from "@/lib/payment-pin/hash";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_ATTEMPTS = 5;
const LOCK_UNTIL = "9999-12-31T00:00:00.000Z";
const GRANT_MS = 60 * 1000;

type PinRow = {
  pin_hash: string;
  salt: string;
  enabled: boolean;
  failed_attempts: number;
  locked_until: string | null;
};

export type PinFailure =
  | { error: "not_configured" }
  | { error: "already_configured" }
  | { error: "locked"; lockedUntil: string }
  | { error: "mismatch"; attemptsRemaining: number; attemptLimit: number; lockedUntil: string | null };

function lockTime(row: PinRow) {
  if (!row.locked_until) return null;
  return new Date(row.locked_until).getTime() > Date.now() ? row.locked_until : null;
}

async function readPin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("payment_pins")
    .select("pin_hash, salt, enabled, failed_attempts, locked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as PinRow | null;
}

async function resetExpiredLock(userId: string, row: PinRow) {
  if (!row.locked_until || new Date(row.locked_until).getTime() > Date.now()) return row;
  const { error } = await supabaseAdmin
    .from("payment_pins")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("user_id", userId);
  if (error) throw error;
  return { ...row, failed_attempts: 0, locked_until: null };
}

export async function readPaymentPinStatus(userId: string) {
  const stored = await readPin(userId);
  if (!stored) {
    return { configured: false, enabled: false, lockedUntil: null as string | null, failedAttempts: 0, attemptLimit: MAX_ATTEMPTS };
  }
  const row = await resetExpiredLock(userId, stored);
  return {
    configured: true,
    enabled: row.enabled,
    lockedUntil: lockTime(row),
    failedAttempts: row.failed_attempts,
    attemptLimit: MAX_ATTEMPTS,
  };
}

export async function setPaymentPinEnabled(
  userId: string,
  enabled: boolean,
): Promise<{ configured: boolean; enabled: boolean } | { error: "not_configured" } | { error: "locked"; lockedUntil: string }> {
  const existing = await readPin(userId);
  if (!existing) {
    if (!enabled) return { configured: false, enabled: false };
    return { error: "not_configured" } as const;
  }
  const row = await resetExpiredLock(userId, existing);
  const lockedUntil = lockTime(row);
  if (lockedUntil) return { error: "locked" as const, lockedUntil };
  const { error } = await supabaseAdmin.from("payment_pins").update({ enabled }).eq("user_id", userId);
  if (error) throw error;
  return { configured: true, enabled };
}

export async function createPaymentPin(
  userId: string,
  pin: string,
): Promise<{ ok: true } | { error: "already_configured" }> {
  const existing = await readPin(userId);
  if (existing) return { error: "already_configured" } as const;

  const salt = createSalt();
  const pinHash = await hashPaymentPin(pin, salt);
  const { error } = await supabaseAdmin.from("payment_pins").insert({
    user_id: userId,
    pin_hash: pinHash,
    salt,
    enabled: true,
  });
  if (error?.code === "23505") return { error: "already_configured" } as const;
  if (error) throw error;
  return { ok: true } as const;
}

// 맞으면 실패 횟수를 지우고, 5회 틀리면 새 비밀번호를 설정할 때까지 잠근다.
export async function matchPaymentPin(userId: string, pin: string): Promise<{ ok: true } | PinFailure> {
  const stored = await readPin(userId);
  if (!stored) return { error: "not_configured" };
  const row = await resetExpiredLock(userId, stored);
  const lockedUntil = lockTime(row);
  if (lockedUntil) return { error: "locked", lockedUntil };

  const matches = await paymentPinMatches(pin, row.salt, row.pin_hash);
  if (!matches) {
    const attempts = row.failed_attempts + 1;
    const nextLock = attempts >= MAX_ATTEMPTS ? LOCK_UNTIL : null;
    const { error } = await supabaseAdmin
      .from("payment_pins")
      .update({ failed_attempts: attempts, locked_until: nextLock })
      .eq("user_id", userId);
    if (error) throw error;
    return {
      error: "mismatch",
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts),
      attemptLimit: MAX_ATTEMPTS,
      lockedUntil: nextLock,
    };
  }

  if (row.failed_attempts !== 0 || row.locked_until) {
    const { error } = await supabaseAdmin
      .from("payment_pins")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("user_id", userId);
    if (error) throw error;
  }
  return { ok: true };
}

export async function changePaymentPin(userId: string, currentPin: string, nextPin: string) {
  const current = await matchPaymentPin(userId, currentPin);
  if (!("ok" in current)) return current;

  const salt = createSalt();
  const pinHash = await hashPaymentPin(nextPin, salt);
  const { error } = await supabaseAdmin
    .from("payment_pins")
    .update({ pin_hash: pinHash, salt, failed_attempts: 0, locked_until: null })
    .eq("user_id", userId);
  if (error) throw error;
  return { ok: true } as const;
}

export async function issuePaymentGrant(userId: string, action: PaymentPinAction) {
  const { token, tokenHash } = createGrantToken();
  const expiresAt = new Date(Date.now() + GRANT_MS).toISOString();
  const { error } = await supabaseAdmin.from("payment_pin_grants").insert({
    user_id: userId,
    action,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { grant: token, expiresAt };
}

export async function consumePaymentGrant(userId: string, action: PaymentPinAction, grant: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("payment_pin_grants")
    .update({ used_at: now })
    .eq("user_id", userId)
    .eq("action", action)
    .eq("token_hash", hashGrantToken(grant))
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
