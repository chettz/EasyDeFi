"use client";

import { useLoginWithEmail, usePrivy, useSignMessage, type User } from "@privy-io/react-auth";
import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { recoveryAccount, shortWalletAddress, type RecoveryAccount } from "@/lib/payment-pin/account";
import type { PaymentPinAction } from "@/lib/payment-pin/action";

type Status = {
  configured: boolean;
  enabled?: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  attemptLimit: number;
};
type FailureBody = {
  error?: string;
  attemptsRemaining?: number;
  attemptLimit?: number;
  lockedUntil?: string | null;
};

type AttemptCount = { used: number; limit: number };

type SettingsStep = "current" | "next" | "confirm";
type RecoveryStep = "lock" | "email" | "code" | "wallet" | "new" | "confirm";
type RecoveryPanel = {
  kind: "recovery";
  step: RecoveryStep;
  fromLock: boolean;
  account: RecoveryAccount | null;
  recoveryToken: string;
  nextPin: string;
};
type Panel =
  | { kind: "missing" }
  | { kind: "verify"; lockedUntil: string | null }
  | { kind: "settings"; step: SettingsStep; currentPin: string; nextPin: string; lockedUntil: string | null }
  | RecoveryPanel;

type PendingGrant = {
  action: PaymentPinAction;
  resolve: () => void;
  reject: (cause: Error) => void;
};

type PaymentPinContextValue = {
  configured: boolean | null;
  enabled: boolean | null;
  locked: boolean;
  openSettings: () => void;
  updateEnabled: (enabled: boolean) => Promise<void>;
  requireGrant: (action: PaymentPinAction) => Promise<void>;
};

const PaymentPinContext = createContext<PaymentPinContextValue | null>(null);

export class PaymentPinCancelled extends Error {
  constructor() {
    super("Payment PIN entry was cancelled.");
    this.name = "PaymentPinCancelled";
  }
}

export class PaymentPinNotConfigured extends Error {
  constructor() {
    super("Payment PIN is not configured.");
    this.name = "PaymentPinNotConfigured";
  }
}

export class PaymentPinLocked extends Error {
  constructor() {
    super("Payment PIN is locked.");
    this.name = "PaymentPinLocked";
  }
}

export function usePaymentPin() {
  const value = useContext(PaymentPinContext);
  if (!value) throw new Error("Payment PIN is not available.");
  return value;
}

function attemptCount(data: FailureBody): AttemptCount | null {
  if (data.error !== "mismatch" || typeof data.attemptsRemaining !== "number" || typeof data.attemptLimit !== "number") {
    return null;
  }
  return { used: Math.max(0, data.attemptLimit - data.attemptsRemaining), limit: data.attemptLimit };
}

function failureMessage(data: FailureBody) {
  if (data.error === "locked" || data.lockedUntil) return "입력이 잠겼습니다. 잠시 후 다시 시도해 주세요.";
  if (data.error === "mismatch") return "비밀번호가 틀렸습니다.";
  if (data.error === "already_configured") return "이미 결제 비밀번호가 있습니다.";
  if (data.error === "not_configured") return "내 지갑에서 결제 비밀번호를 먼저 설정해 주세요.";
  return "결제 비밀번호를 확인하지 못했습니다.";
}

async function requestPin(path: string, token: string | null, body?: unknown, method: "POST" | "PATCH" = "POST") {
  if (!token) throw new Error("Privy access token was not returned.");
  const response = await fetch(path, {
    method: body === undefined ? "GET" : method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as FailureBody &
    Status & { grant?: string; recovery?: string; address?: string; message?: string };
  return { ok: response.ok, data };
}

function accountForUser(user: User | null): RecoveryAccount | null {
  if (!user) return null;
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

function isFutureLock(value: string | null) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

function titleFor(panel: Panel, configured: boolean | null) {
  if (panel.kind === "recovery") {
    if (panel.step === "confirm") return "한 번 더 입력";
    if (panel.step === "new") return "새 결제 비밀번호";
    return "결제 비밀번호 복구";
  }
  if (panel.kind === "settings" && panel.step === "current") return "현재 비밀번호";
  if (panel.kind === "settings" && panel.step === "confirm") return "비밀번호 확인";
  if (panel.kind === "settings") return configured ? "새 비밀번호" : "비밀번호 설정";
  return "간편 결제 비밀번호";
}

function hintFor(panel: Panel, locked: boolean) {
  if (panel.kind === "missing") return "내 지갑에서 간편 결제 비밀번호를 먼저 설정해 주세요.";
  if (panel.kind === "recovery") {
    return panel.step === "confirm" ? "같은 번호를 다시 입력해 주세요." : "새로 쓸 6자리를 입력해 주세요.";
  }
  if (locked) return "입력이 잠겼습니다. 잠시 후 다시 시도해 주세요.";
  if (panel.kind === "verify") return "6자리 번호를 입력해 주세요.";
  if (panel.step === "current") return "지금 쓰는 6자리 번호를 입력해 주세요.";
  if (panel.step === "confirm") return "같은 번호를 한 번 더 입력해 주세요.";
  return "새로 쓸 6자리 번호를 입력해 주세요.";
}

export function PaymentPinProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready, getAccessToken, user } = usePrivy();
  const { sendCode } = useLoginWithEmail();
  const { signMessage } = useSignMessage();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [digits, setDigits] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptCount | null>(null);
  const [wrong, setWrong] = useState(false);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;
  const pending = useRef<PendingGrant | null>(null);
  const keypadPanel = useRef<Panel | null>(null);
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);
  const statusRef = useRef<Status | null>(null);
  const panelRef = useRef<Panel | null>(null);
  const generation = useRef(0);
  const submitting = useRef(false);
  panelRef.current = panel;

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setConfigured(null);
      setEnabled(null);
      setLocked(false);
      statusRef.current = null;
      return null;
    }
    const token = await getAccessTokenRef.current();
    const { ok, data } = await requestPin("/api/payment-pin", token);
    if (!ok || typeof data.configured !== "boolean") throw new Error("Payment PIN status was not returned.");
    const status = {
      configured: data.configured,
      enabled: data.configured && data.enabled !== false,
      lockedUntil: data.lockedUntil ?? null,
      failedAttempts: data.failedAttempts ?? 0,
      attemptLimit: data.attemptLimit ?? 5,
    };
    statusRef.current = status;
    setConfigured(status.configured);
    setEnabled(status.enabled);
    setLocked(isFutureLock(status.lockedUntil));
    return status;
  }, [authenticated]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void refresh().catch((cause: unknown) => {
      console.error(cause);
      statusRef.current = null;
      setConfigured(null);
      setEnabled(null);
      setLocked(false);
    });
  }, [authenticated, ready, refresh]);

  function closePanel(cause?: Error) {
    generation.current += 1;
    submitting.current = false;
    const current = pending.current;
    pending.current = null;
    setPanel(null);
    setDigits("");
    setMessage(null);
    setAttempts(null);
    setWrong(false);
    setBusy(false);
    if (current) {
      if (cause) current.reject(cause);
      else current.resolve();
    }
  }

  function cancel() {
    const missing = panelRef.current?.kind === "missing";
    closePanel(missing ? new PaymentPinNotConfigured() : new PaymentPinCancelled());
  }

  function openLock() {
    const account = accountForUser(user);
    setDigits("");
    setMessage(account ? null : "본인 인증에 사용할 계정을 찾지 못했습니다.");
    setAttempts(null);
    setWrong(false);
    setPanel({
      kind: "recovery",
      step: account?.method === "wallet" ? "wallet" : "code",
      fromLock: true,
      account,
      recoveryToken: "",
      nextPin: "",
    });
    if (account?.method === "email") void deliverRecoveryCode(account.email);
  }

  function openKeypad(status: Status) {
    if (isFutureLock(status.lockedUntil)) {
      openLock();
      return;
    }
    setDigits("");
    setMessage(null);
    setAttempts(status.configured ? { used: status.failedAttempts, limit: status.attemptLimit } : null);
    setWrong(false);
    setPanel({
      kind: "settings",
      step: status.configured ? "current" : "next",
      currentPin: "",
      nextPin: "",
      lockedUntil: status.lockedUntil,
    });
  }

  async function openSettings() {
    if (pending.current || panelRef.current) return;
    const known = statusRef.current;
    if (known) {
      openKeypad(known);
      return;
    }
    try {
      const status = await refresh();
      if (pending.current || panelRef.current) return;
      if (!status) return;
      openKeypad(status);
    } catch (cause) {
      console.error(cause);
    }
  }

  async function updateEnabled(next: boolean) {
    if (locked || isFutureLock(statusRef.current?.lockedUntil ?? null)) {
      setLocked(true);
      throw new PaymentPinLocked();
    }
    const token = await getAccessToken();
    const { ok, data } = await requestPin("/api/payment-pin", token, { enabled: next }, "PATCH");
    if (data.error === "locked" || isFutureLock(data.lockedUntil ?? null)) {
      setLocked(true);
      throw new PaymentPinLocked();
    }
    if (!ok || typeof data.configured !== "boolean") throw new Error(failureMessage(data));
    const nextEnabled = data.configured && data.enabled !== false;
    statusRef.current = {
      configured: data.configured,
      enabled: nextEnabled,
      lockedUntil: statusRef.current?.lockedUntil ?? null,
      failedAttempts: statusRef.current?.failedAttempts ?? 0,
      attemptLimit: statusRef.current?.attemptLimit ?? 5,
    };
    setConfigured(data.configured);
    setEnabled(nextEnabled);
  }

  function requireGrant(action: PaymentPinAction) {
    return new Promise<void>((resolve, reject) => {
      if (pending.current || panelRef.current) {
        reject(new Error("Payment PIN is already open."));
        return;
      }

      const finish = (status: Status | null) => {
        if (pending.current?.action !== action) return;
        if (!status) {
          pending.current = null;
          reject(new Error("Payment PIN status was not returned."));
          return;
        }
        if (isFutureLock(status.lockedUntil)) {
          pending.current = null;
          setLocked(true);
          reject(new PaymentPinLocked());
          return;
        }
        if (!status.configured || !status.enabled) {
          pending.current = null;
          resolve();
          return;
        }
        setDigits("");
        setMessage(null);
        setAttempts({ used: status.failedAttempts, limit: status.attemptLimit });
        setWrong(false);
        setPanel({ kind: "verify", lockedUntil: status.lockedUntil });
      };

      pending.current = { action, resolve, reject };
      const known = statusRef.current;
      if (known) {
        finish(known);
        return;
      }
      void refresh()
        .then(finish)
        .catch((cause: unknown) => {
          console.error(cause);
          if (pending.current?.action !== action) return;
          pending.current = null;
          reject(cause instanceof Error ? cause : new Error("Payment PIN status was not returned."));
        });
    });
  }

  function rememberLock(data: FailureBody) {
    if (!isFutureLock(data.lockedUntil ?? null)) return false;
    if (statusRef.current) {
      statusRef.current = {
        ...statusRef.current,
        lockedUntil: data.lockedUntil ?? null,
        failedAttempts: data.attemptLimit ?? statusRef.current.attemptLimit,
      };
    }
    setLocked(true);
    openLock();
    return true;
  }

  function startForgot() {
    const current = panelRef.current;
    if (!current || current.kind === "recovery" || current.kind === "missing" || busy) return;
    const account = accountForUser(user);
    if (!account) {
      setMessage("본인 인증에 사용할 계정을 찾지 못했습니다.");
      return;
    }
    keypadPanel.current = current;
    setDigits("");
    setMessage(null);
    setWrong(false);
    setPanel({
      kind: "recovery",
      step: account.method === "wallet" ? "wallet" : "code",
      fromLock: false,
      account,
      recoveryToken: "",
      nextPin: "",
    });
    if (account.method === "email") void deliverRecoveryCode(account.email);
  }

  function backRecovery() {
    const current = panelRef.current;
    if (!current || current.kind !== "recovery") return;
    setMessage(null);
    setWrong(false);
    if (current.step === "confirm") {
      setDigits("");
      setPanel({ ...current, step: "new", nextPin: "" });
      return;
    }
    if (current.step === "new") {
      setDigits("");
      setPanel({ ...current, step: current.account?.method === "wallet" ? "wallet" : "code" });
      return;
    }
    if (current.step === "code" || current.step === "wallet" || current.step === "email" || current.step === "lock") {
      if (current.fromLock) {
        cancel();
        return;
      }
      const previous = keypadPanel.current;
      keypadPanel.current = null;
      setDigits("");
      setPanel(previous && previous.kind !== "recovery" ? previous : null);
      return;
    }
    cancel();
  }

  async function deliverRecoveryCode(email: string) {
    if (submitting.current) return;
    const generationAtStart = generation.current;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await sendCode({ email, disableSignup: true });
      if (generation.current !== generationAtStart) return;
      setDigits("");
    } catch (cause) {
      console.error(cause);
      if (generation.current === generationAtStart) setMessage("인증 코드를 보내지 못했습니다.");
    } finally {
      if (generation.current === generationAtStart) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  function sendRecoveryCode() {
    const current = panelRef.current;
    if (!current || current.kind !== "recovery" || current.account?.method !== "email") return;
    void deliverRecoveryCode(current.account.email);
  }

  async function confirmRecoveryCode() {
    const current = panelRef.current;
    if (!current || current.kind !== "recovery" || current.step !== "code" || digits.length !== 6 || submitting.current) return;
    const generationAtStart = generation.current;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const token = await getAccessToken();
      if (generation.current !== generationAtStart) return;
      const verified = await requestPin("/api/payment-pin/recovery/email", token, { code: digits });
      if (generation.current !== generationAtStart) return;
      if (!verified.ok || !verified.data.recovery) {
        setMessage(verified.data.error === "unavailable" ? "인증 코드를 확인하지 못했습니다." : "인증 코드가 맞지 않습니다.");
        return;
      }
      setDigits("");
      setPanel({ ...current, step: "new", recoveryToken: verified.data.recovery });
    } catch (cause) {
      console.error(cause);
      if (generation.current === generationAtStart) setMessage("인증 코드를 확인하지 못했습니다.");
    } finally {
      if (generation.current === generationAtStart) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  async function signRecoveryWallet() {
    const current = panelRef.current;
    if (!current || current.kind !== "recovery" || current.account?.method !== "wallet" || submitting.current) return;
    const generationAtStart = generation.current;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const token = await getAccessToken();
      if (generation.current !== generationAtStart) return;
      const challenge = await requestPin("/api/payment-pin/recovery/wallet", token, {});
      if (generation.current !== generationAtStart) return;
      if (!challenge.ok || !challenge.data.message || !challenge.data.address) {
        setMessage("서명을 시작하지 못했습니다.");
        return;
      }
      const signed = await signMessage(
        { message: challenge.data.message },
        { address: challenge.data.address, uiOptions: { title: "결제 비밀번호 재설정" } },
      );
      if (generation.current !== generationAtStart) return;
      const verified = await requestPin("/api/payment-pin/recovery/wallet", token, { signature: signed.signature });
      if (generation.current !== generationAtStart) return;
      if (!verified.ok || !verified.data.recovery) {
        setMessage("서명을 확인하지 못했습니다.");
        return;
      }
      setDigits("");
      setPanel({ ...current, step: "new", recoveryToken: verified.data.recovery });
    } catch (cause) {
      console.error(cause);
      if (generation.current === generationAtStart) setMessage("서명을 완료하지 못했어요.");
    } finally {
      if (generation.current === generationAtStart) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  async function submit(pin: string) {
    const current = panelRef.current;
    if (!current || current.kind === "missing" || submitting.current) return;
    if ((current.kind === "verify" || current.kind === "settings") && isFutureLock(current.lockedUntil)) return;

    const generationAtStart = generation.current;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const token = await getAccessToken();
      if (generation.current !== generationAtStart) return;
      if (current.kind === "recovery") {
        if (current.step === "new") {
          setDigits("");
          setWrong(false);
          setPanel({ ...current, step: "confirm", nextPin: pin });
          return;
        }
        if (current.step !== "confirm") return;
        if (pin !== current.nextPin) {
          setDigits("");
          setMessage("비밀번호가 일치하지 않습니다. 다시 입력해 주세요.");
          setPanel({ ...current, step: "new", nextPin: "" });
          return;
        }
        const saved = await requestPin("/api/payment-pin/recovery/reset", token, {
          recovery: current.recoveryToken,
          pin: current.nextPin,
          pinConfirm: pin,
        });
        if (generation.current !== generationAtStart) return;
        if (!saved.ok) {
          setDigits("");
          setMessage("새 비밀번호를 저장하지 못했습니다.");
          return;
        }
        const attemptLimit = statusRef.current?.attemptLimit ?? 5;
        statusRef.current = { configured: true, enabled: true, lockedUntil: null, failedAttempts: 0, attemptLimit };
        setConfigured(true);
        setEnabled(true);
        setLocked(false);
        if (pending.current) {
          setDigits("");
          setMessage(null);
          setAttempts({ used: 0, limit: attemptLimit });
          setWrong(false);
          setPanel({ kind: "verify", lockedUntil: null });
          return;
        }
        closePanel();
        return;
      }
      if (current.kind === "verify") {
        const grantRequest = pending.current;
        if (!grantRequest) return;
        const verified = await requestPin("/api/payment-pin/verify", token, { pin, action: grantRequest.action });
        if (generation.current !== generationAtStart) return;
        if (!verified.ok || !verified.data.grant) {
          setDigits("");
          if (rememberLock(verified.data)) return;
          noteFailure(verified.data);
          if (verified.data.error === "not_configured") setPanel({ kind: "missing" });
          return;
        }
        const consumed = await requestPin("/api/payment-pin/consume", token, {
          grant: verified.data.grant,
          action: grantRequest.action,
        });
        if (generation.current !== generationAtStart) return;
        if (statusRef.current) statusRef.current = { ...statusRef.current, lockedUntil: null, failedAttempts: 0 };
        if (!consumed.ok) {
          setDigits("");
          setMessage("결제 비밀번호를 확인하지 못했습니다.");
          return;
        }
        closePanel();
        return;
      }

      if (current.step === "current") {
        const checked = await requestPin("/api/payment-pin/check", token, { pin });
        if (generation.current !== generationAtStart) return;
        if (!checked.ok) {
          setDigits("");
          if (rememberLock(checked.data)) return;
          noteFailure(checked.data);
          return;
        }
        setDigits("");
        setMessage(null);
        setAttempts(null);
        setWrong(false);
        if (statusRef.current) statusRef.current = { ...statusRef.current, lockedUntil: null, failedAttempts: 0 };
        setPanel({ ...current, step: "next", currentPin: pin, lockedUntil: null });
        return;
      }

      if (current.step === "next") {
        setDigits("");
        setMessage(null);
        setWrong(false);
        setPanel({ ...current, step: "confirm", nextPin: pin });
        return;
      }

      if (pin !== current.nextPin) {
        setDigits("");
        setWrong(true);
        setShake((value) => value + 1);
        setMessage("비밀번호가 일치하지 않습니다. 다시 입력해 주세요.");
        setPanel({ ...current, step: "next", nextPin: "" });
        return;
      }

      const saved = current.currentPin
        ? await requestPin("/api/payment-pin/change", token, {
            currentPin: current.currentPin,
            nextPin: current.nextPin,
            nextPinConfirm: pin,
          })
        : await requestPin("/api/payment-pin", token, { pin: current.nextPin, pinConfirm: pin });
      if (generation.current !== generationAtStart) return;
      if (!saved.ok) {
        setDigits("");
        if (rememberLock(saved.data)) return;
        noteFailure(saved.data);
        if (saved.data.error === "mismatch") {
          setPanel({ ...current, step: "current", currentPin: "", nextPin: "", lockedUntil: null });
        }
        return;
      }
      statusRef.current = {
        configured: true,
        enabled: true,
        lockedUntil: null,
        failedAttempts: 0,
        attemptLimit: statusRef.current?.attemptLimit ?? 5,
      };
      setConfigured(true);
      setEnabled(true);
      setLocked(false);
      closePanel();
    } catch (cause) {
      console.error(cause);
      setDigits("");
      setMessage("결제 비밀번호를 확인하지 못했습니다.");
    } finally {
      if (generation.current === generationAtStart) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  function noteFailure(data: FailureBody) {
    const count = attemptCount(data);
    if (count) {
      setAttempts(count);
      if (statusRef.current) {
        statusRef.current = { ...statusRef.current, failedAttempts: count.used, attemptLimit: count.limit };
      }
      setWrong(true);
      setShake((value) => value + 1);
      setMessage(null);
      return;
    }
    if (data.error === "mismatch") {
      setWrong(true);
      setShake((value) => value + 1);
    }
    setMessage(failureMessage(data));
  }

  function pushDigit(digit: string) {
    if (busy || submitting.current || digits.length >= 6) return;
    const canType =
      panel?.kind === "verify" ||
      panel?.kind === "settings" ||
      (panel?.kind === "recovery" && (panel.step === "new" || panel.step === "confirm"));
    if (!canType || !panel) return;
    if ((panel.kind === "verify" || panel.kind === "settings") && isFutureLock(panel.lockedUntil)) return;
    if (digits.length === 0) setWrong(false);
    const next = `${digits}${digit}`;
    setDigits(next);
    if (next.length === 6) void submit(next);
  }

  function changeCode(index: number, value: string) {
    const incoming = value.replace(/\D/g, "");
    if (incoming.length > 1) {
      setDigits(incoming.slice(0, 6));
      codeInputs.current[Math.min(incoming.length, 5)]?.focus();
      return;
    }
    const chars = digits.padEnd(6, " ").slice(0, 6).split("");
    chars[index] = incoming.slice(-1) || " ";
    setDigits(chars.join("").trimEnd());
    if (incoming && index < 5) codeInputs.current[index + 1]?.focus();
  }

  const keypadLocked = (panel?.kind === "verify" || panel?.kind === "settings") && panel.lockedUntil !== null;

  const showKeys =
    panel?.kind === "verify" ||
    panel?.kind === "settings" ||
    (panel?.kind === "recovery" && (panel.step === "new" || panel.step === "confirm"));
  const countsAttempts = panel?.kind === "verify" || (panel?.kind === "settings" && panel.step === "current");
  const shell = panel && typeof document !== "undefined" ? document.querySelector(".wallet-shell") : null;
  const recoveryForm = panel?.kind === "recovery" && panel.step !== "new" && panel.step !== "confirm" ? panel : null;
  const screen = recoveryForm ? (
    <div className="pin-recovery" role="dialog" aria-modal="true" aria-labelledby="payment-pin-title">
      <div className="wallet-settings-title">
        <button type="button" className="wallet-back" onClick={backRecovery} aria-label="뒤로" disabled={busy}>
          <Image src="/figma/move-back.svg" alt="" width={24} height={24} />
        </button>
        <h1 id="payment-pin-title">{titleFor(recoveryForm, configured)}</h1>
      </div>
      {recoveryForm.fromLock ? (
        <div className="pin-recovery-notice">
          <strong>5번 틀려서 결제 비밀번호 재설정이 필요해요.</strong>
          <p>비밀번호를 다시 설정하기 전에는 출금, USDC 넣기, USDC 빼기를 할 수 없어요.</p>
        </div>
      ) : null}
      {recoveryForm.account?.method === "email" && (recoveryForm.step === "code" || recoveryForm.step === "lock" || recoveryForm.step === "email") ? (
        <>
          <p className="pin-recovery-value">{recoveryForm.account.email}</p>
          <p className="pin-recovery-copy">{recoveryForm.account.email}으로 보낸 6자리 코드를 입력해 주세요.</p>
          <div className="pin-recovery-code">
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                ref={(node) => {
                  codeInputs.current[index] = node;
                }}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                aria-label={`인증 코드 ${index + 1}자리`}
                value={digits[index] && digits[index] !== " " ? digits[index] : ""}
                disabled={busy}
                onChange={(event) => changeCode(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Backspace" || (digits[index] && digits[index] !== " ")) return;
                  if (index === 0) return;
                  event.preventDefault();
                  const chars = digits.padEnd(6, " ").slice(0, 6).split("");
                  chars[index - 1] = " ";
                  setDigits(chars.join("").trimEnd());
                  codeInputs.current[index - 1]?.focus();
                }}
              />
            ))}
          </div>
          <button type="button" className="pin-recovery-resend" onClick={() => void sendRecoveryCode()} disabled={busy}>
            코드 다시 보내기
          </button>
          <button type="button" className="pin-recovery-action" onClick={() => void confirmRecoveryCode()} disabled={busy || !/^\d{6}$/.test(digits)}>
            확인
          </button>
        </>
      ) : null}
      {recoveryForm.account?.method === "wallet" && (recoveryForm.step === "wallet" || recoveryForm.step === "lock") ? (
        <>
          <p className="pin-recovery-value">{shortWalletAddress(recoveryForm.account.address)}</p>
          <p className="pin-recovery-copy">연결된 지갑으로 서명하여 본인 인증을 마치면 새 결제 비밀번호를 설정할 수 있어요.</p>
          <button type="button" className="pin-recovery-action" onClick={() => void signRecoveryWallet()} disabled={busy}>
            서명하기
          </button>
        </>
      ) : null}
      {message ? (
        <p className="login-wrong" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  ) : panel ? (
    <div className="payment-pin-screen" role="dialog" aria-modal="true" aria-labelledby="payment-pin-title">
      <div className="wallet-title-row">
        <button
          type="button"
          className="wallet-back"
          onClick={panel.kind === "recovery" ? backRecovery : cancel}
          aria-label="뒤로"
          disabled={busy}
        >
          <Image src="/figma/move-back.svg" alt="" width={24} height={24} />
        </button>
        <h1 id="payment-pin-title">{titleFor(panel, configured)}</h1>
      </div>
      <div className="payment-pin-stage">
        {showKeys ? null : <p className="wallet-description payment-pin-hint">{hintFor(panel, keypadLocked)}</p>}
        {showKeys ? (
          <div className="payment-pin-marks">
            <p className="wallet-description payment-pin-hint">{hintFor(panel, keypadLocked)}</p>
            <div
              key={shake}
              className={wrong && panel.kind !== "recovery" ? "login-pin-dots is-wrong" : "login-pin-dots"}
              aria-label={`6자리 중 ${digits.length}자리 입력`}
            >
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} className={index < digits.length ? "is-filled" : undefined} />
              ))}
            </div>
            {countsAttempts || message ? (
              <div className="payment-pin-caption">
                {countsAttempts ? (
                  <p
                    className={attempts && attempts.used > 0 ? "payment-pin-attempts is-used" : "payment-pin-attempts"}
                    role={attempts && attempts.used > 0 ? "alert" : "status"}
                    aria-label={`${attempts?.limit ?? 5}번 중 ${attempts?.used ?? 0}번 시도했습니다.`}
                  >
                    {attempts?.used ?? 0}/{attempts?.limit ?? 5}
                  </p>
                ) : null}
                {message ? (
                  <p className="login-wrong" role="alert">
                    {message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : message ? (
          <p className="login-wrong" role="alert">
            {message}
          </p>
        ) : null}
      </div>
      {showKeys ? (
        <>
          {countsAttempts ? (
            <button type="button" className="payment-pin-forgot" onClick={startForgot} disabled={busy}>
              비밀번호를 잊으셨나요?
            </button>
          ) : null}
          <div className="login-pin-pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <button key={digit} type="button" disabled={busy || keypadLocked} onClick={() => pushDigit(digit)}>
                {digit}
              </button>
            ))}
            <span />
            <button type="button" disabled={busy || keypadLocked} onClick={() => pushDigit("0")}>
              0
            </button>
            <button
              type="button"
              aria-label="지우기"
              disabled={busy || keypadLocked || digits.length === 0}
              onClick={() => setDigits((current) => current.slice(0, -1))}
            >
              ⌫
            </button>
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <PaymentPinContext.Provider value={{ configured, enabled, locked, openSettings: () => void openSettings(), updateEnabled, requireGrant }}>
      {children}
      {screen && shell ? createPortal(screen, shell) : screen}
    </PaymentPinContext.Provider>
  );
}
