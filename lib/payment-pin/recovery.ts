import "server-only";

import { randomBytes } from "node:crypto";
import type { User } from "@privy-io/server-auth";
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import { recoveryAccount, type RecoveryAccount } from "@/lib/payment-pin/account";
import { createSalt, hashGrantToken, hashPaymentPin } from "@/lib/payment-pin/hash";
import { privyServer } from "@/lib/privy/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const RECOVERY_MS = 10 * 60 * 1000;
const MAX_SIGNATURE_ATTEMPTS = 5;

type RecoveryRow = {
  id: string;
  method: "email" | "wallet";
  subject: string;
  challenge: string | null;
  attempts: number;
  expires_at: string;
};

export function accountFromPrivyUser(user: User): RecoveryAccount | null {
  return recoveryAccount(
    user.linkedAccounts.map((account) => ({
      type: account.type,
      address: "address" in account ? account.address : undefined,
      email: "email" in account ? account.email : undefined,
      chainType: "chainType" in account ? account.chainType : undefined,
      walletClientType: "walletClientType" in account ? account.walletClientType : undefined,
      latestVerifiedAt: account.latestVerifiedAt,
    })),
  );
}

async function currentAccount(privyUserId: string) {
  const user = await privyServer.getUser(privyUserId);
  return accountFromPrivyUser(user);
}

function appCredentials() {
  const appId = process.env.PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) throw new Error("Privy app credentials are not configured.");
  return { appId, secret };
}

async function authenticateEmailCode(email: string, code: string) {
  const { appId, secret } = appCredentials();
  const response = await fetch("https://auth.privy.io/api/v1/passwordless/authenticate", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`,
      "privy-app-id": appId,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, code, mode: "no-signup" }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { user?: { id?: string } };
  return payload.user?.id ?? null;
}

async function issueRecovery(userId: string, account: RecoveryAccount) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RECOVERY_MS).toISOString();
  const { error } = await supabaseAdmin.from("payment_pin_recoveries").insert({
    user_id: userId,
    method: account.method,
    subject: account.method === "email" ? account.email : account.address,
    token_hash: hashGrantToken(token),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { recovery: token };
}

export async function verifyRecoveryEmail(privyUserId: string, userId: string, code: string) {
  const account = await currentAccount(privyUserId);
  if (!account || account.method !== "email") return { error: "unavailable" } as const;
  const authenticatedUserId = await authenticateEmailCode(account.email, code);
  if (authenticatedUserId !== privyUserId) return { error: "mismatch" } as const;
  return issueRecovery(userId, account);
}

export async function createWalletRecoveryChallenge(privyUserId: string, userId: string) {
  const account = await currentAccount(privyUserId);
  if (!account || account.method !== "wallet" || !isAddress(account.address)) return { error: "unavailable" } as const;

  const expiresAt = new Date(Date.now() + RECOVERY_MS).toISOString();
  const nonce = randomBytes(16).toString("hex");
  const message = `EasyDeFi 결제 비밀번호 재설정\n${getAddress(account.address)}\n${expiresAt}\n${nonce}`;
  const { error } = await supabaseAdmin.from("payment_pin_recoveries").insert({
    user_id: userId,
    method: "wallet",
    subject: getAddress(account.address),
    challenge: message,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { address: getAddress(account.address), message };
}

async function latestWalletChallenge(userId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("payment_pin_recoveries")
    .select("id, method, subject, challenge, attempts, expires_at")
    .eq("user_id", userId)
    .eq("method", "wallet")
    .is("token_hash", null)
    .is("used_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RecoveryRow | null;
}

export async function verifyWalletRecovery(privyUserId: string, userId: string, signature: string) {
  const account = await currentAccount(privyUserId);
  const challenge = await latestWalletChallenge(userId);
  if (!account || account.method !== "wallet" || !challenge?.challenge || !isAddress(challenge.subject)) {
    return { error: "unavailable" } as const;
  }
  if (getAddress(account.address) !== getAddress(challenge.subject)) return { error: "mismatch" } as const;

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message: challenge.challenge, signature: signature as `0x${string}` });
  } catch {
    recovered = "";
  }
  if (!isAddress(recovered) || getAddress(recovered) !== getAddress(challenge.subject)) {
    const attempts = challenge.attempts + 1;
    const expired = attempts >= MAX_SIGNATURE_ATTEMPTS;
    const { error } = await supabaseAdmin
      .from("payment_pin_recoveries")
      .update({
        attempts,
        expires_at: expired ? new Date().toISOString() : challenge.expires_at,
      })
      .eq("id", challenge.id);
    if (error) throw error;
    return { error: "mismatch" } as const;
  }

  const token = randomBytes(32).toString("base64url");
  const { error } = await supabaseAdmin
    .from("payment_pin_recoveries")
    .update({ token_hash: hashGrantToken(token) })
    .eq("id", challenge.id)
    .is("token_hash", null);
  if (error) throw error;
  return { recovery: token };
}

export async function resetPaymentPinWithRecovery(userId: string, token: string, pin: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("payment_pin_recoveries")
    .select("id")
    .eq("user_id", userId)
    .eq("token_hash", hashGrantToken(token))
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: "unauthorized" } as const;

  const salt = createSalt();
  const pinHash = await hashPaymentPin(pin, salt);
  const { error: pinError } = await supabaseAdmin
    .from("payment_pins")
    .update({ pin_hash: pinHash, salt, failed_attempts: 0, locked_until: null, enabled: true })
    .eq("user_id", userId);
  if (pinError) throw pinError;

  const { error: usedError } = await supabaseAdmin
    .from("payment_pin_recoveries")
    .update({ used_at: now })
    .eq("id", data.id);
  if (usedError) throw usedError;
  return { ok: true } as const;
}
