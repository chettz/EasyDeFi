"use client";

import {
  useConnectWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
  useLoginWithSiwe,
  usePrivy,
  type BaseConnectedEthereumWallet,
  type BaseConnectedWalletType,
} from "@privy-io/react-auth";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getAddress } from "viem";

const TERMS = [
  { id: "terms", label: "[필수] 이용약관에 동의해요" },
  { id: "privacy", label: "[필수] 개인정보 수집·이용에 동의해요" },
  {
    id: "transfer",
    label: "[필수] 개인정보 국외 이전에 동의해요",
    detail: "이메일과 지갑 주소가 미국의 Privy로 전송돼요.",
  },
] as const;

const NOTES = [
  {
    title: "내 돈은 나만 꺼낼 수 있어요",
    body: "EasyDeFi도, 지갑 기술을 제공하는 Privy도 혼자서는 지갑을 열 수 없어요. 새 기기에서도 같은 계정으로 로그인하면 지갑이 열려요.",
  },
  {
    title: "로그인 계정과 복구 수단을 모두 잃으면 되찾을 수 없어요",
    body: "저희가 대신 열어드릴 수 없어요. 지갑을 만든 뒤 복구 비밀번호를 꼭 설정해 주세요.",
  },
  {
    title: "돈을 잃을 수 있고, 예금이 아니에요",
    body: "예치와 바꾸기는 외부 프로그램(Aave·Uniswap)에서 이뤄져요. 문제가 생기면 돈을 잃을 수 있어요. 예금이 아니며 예금자보호 대상이 아니에요.",
  },
] as const;

const QUESTIONS = [
  {
    prompt: "Q1. 로그인 계정과 복구 수단을 모두 잃으면 어떻게 되나요?",
    choices: ["EasyDeFi가 지갑을 다시 찾아 드려요", "아무도 지갑을 되찾을 수 없어요"],
    answer: 1,
  },
  {
    prompt: "Q2. 예치한 금액은 어떻게 될 수 있나요?",
    choices: ["절대 줄어들지 않아요", "프로그램 문제나 코인 가치 변동으로 잃을 수 있어요"],
    answer: 1,
  },
  {
    prompt: "Q3. 실수로 잘못 보낸 거래는요?",
    choices: ["고객센터에 말하면 취소돼요", "아무도 되돌릴 수 없어요"],
    answer: 1,
  },
] as const;

const WALLETS = [
  { id: "metamask", label: "MetaMask" },
  { id: "phantom", label: "Phantom" },
  { id: "detected_ethereum_wallets", label: "발견된 이더리움 지갑", chain: "ethereum-only" },
] as const;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

type Step = "gate" | "consent" | "quiz" | "methods" | "email" | "wallet" | "pin";
type LoginIntent = "login" | "create";

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "로그인하지 못했어요. 다시 시도해 주세요.";
}

function BackTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="wallet-title-row">
      <button type="button" className="wallet-back" onClick={onBack} aria-label="뒤로">
        <Image src="/figma/move-back.svg" alt="" width={24} height={24} />
      </button>
      <h1>{title}</h1>
    </div>
  );
}

export default function LoginFlow({
  intent,
  onClose,
  onChoose,
}: {
  intent: LoginIntent | null;
  onClose: () => void;
  onChoose: (intent: LoginIntent) => void;
}) {
  const { authenticated, getAccessToken } = usePrivy();
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth();
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail();
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => void authenticateEthereumWallet(wallet),
    onError: () => {
      setBusy(false);
      setError("지갑을 연결하지 못했어요. 다시 시도해 주세요.");
    },
  });
  const [step, setStep] = useState<Step | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Array<number | null>>([null, null, null]);
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [confirmingPin, setConfirmingPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (intent === "create" && authenticated) {
      setStep("pin");
      return;
    }
    setStep((current) => {
      if (!intent) return current ?? "gate";
      if (intent === "login") return !current || current === "gate" ? "methods" : current;
      return !current || current === "gate" ? "consent" : current;
    });
  }, [authenticated, intent]);

  const allChecked = TERMS.every((item) => checks[item.id]);
  const allCorrect = QUESTIONS.every((question, index) => answers[index] === question.answer);
  const code = digits.join("");

  function chooseAnswer(question: number, choice: number) {
    setAnswers((current) => current.map((value, index) => (index === question ? choice : value)));
  }

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      await sendCode({ email: email.trim() });
      setCodeSent(true);
      setDigits(["", "", "", "", "", ""]);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    setError(null);
    setBusy(true);
    try {
      await loginWithCode({ code });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function authenticateEthereumWallet(wallet: BaseConnectedWalletType) {
    if (wallet.type !== "ethereum") {
      setBusy(false);
      setError("이더리움 계정을 선택해 주세요.");
      return;
    }

    try {
      const address = getAddress(wallet.address);
      if (!/^eip155:\d+$/.test(wallet.chainId)) throw new Error("이더리움 네트워크를 확인하지 못했어요.");

      const message = await generateSiweMessage({
        address,
        chainId: wallet.chainId as `eip155:${number}`,
        disableSignup: intent === "login",
      });
      const signature = await (wallet as BaseConnectedEthereumWallet).sign(message);
      await loginWithSiwe({
        message,
        signature,
        disableSignup: intent === "login",
        walletClientType: wallet.walletClientType,
        connectorType: wallet.connectorType,
      });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  function connect(wallet: (typeof WALLETS)[number]) {
    setError(null);
    setBusy(true);
    connectWallet({
      walletList: [wallet.id],
      walletChainType: "ethereum-only",
      description: "",
      ...(wallet.id === "metamask" || wallet.id === "phantom"
        ? { preSelectedWalletId: wallet.id }
        : {}),
    });
  }

  async function savePin(value: string) {
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("로그인 정보를 확인하지 못했어요.");
      const response = await fetch("/api/payment-pin", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ pin: value, pinConfirm: value }),
      });
      if (response.status === 409) {
        onClose();
        return;
      }
      if (!response.ok) {
        setPin("");
        setFirstPin("");
        setConfirmingPin(false);
        setError("비밀번호를 저장하지 못했어요. 다시 입력해 주세요.");
        return;
      }
      onClose();
    } catch (cause) {
      setPin("");
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  function pushPin(digit: string) {
    if (busy || pin.length >= 6) return;
    const next = `${pin}${digit}`;
    setError(null);
    setPin(next);
    if (next.length < 6) return;
    if (!confirmingPin) {
      setFirstPin(next);
      setPin("");
      setConfirmingPin(true);
      return;
    }
    if (next !== firstPin) {
      setPin("");
      setFirstPin("");
      setConfirmingPin(false);
      setError("같은 번호가 아니에요. 다시 입력해 주세요.");
      return;
    }
    void savePin(next);
  }

  function backPin() {
    setError(null);
    if (pin.length > 0) {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (confirmingPin) {
      setConfirmingPin(false);
      setFirstPin("");
      return;
    }
    onClose();
  }

  if (!step) return null;

  return (
    <>
      {step === "gate" ? (
        <main className="wallet-page login-page">
          <BackTitle title="지갑 연결이 필요해요" onBack={onClose} />
          <p className="wallet-description">이미 있으면 로그인하고, 처음이면 지갑을 만들어요.</p>
          <button type="button" className="login-primary" onClick={() => onChoose("login")}>
            로그인
          </button>
          <button type="button" className="login-choice" onClick={() => onChoose("create")}>
            지갑 생성
          </button>
        </main>
      ) : null}

      {step === "consent" ? (
        <main className="wallet-page login-page">
          <BackTitle title="시작하기 전에 꼭 알아두세요" onBack={onClose} />
          {NOTES.map((note) => (
            <article key={note.title} className="login-note">
              <strong>{note.title}</strong>
              <p>{note.body}</p>
            </article>
          ))}
          <div className="login-checks">
            {TERMS.map((item) => (
              <label key={item.id} className="login-check">
                <input
                  type="checkbox"
                  checked={Boolean(checks[item.id])}
                  onChange={(event) =>
                    setChecks((current) => ({ ...current, [item.id]: event.target.checked }))
                  }
                />
                <span>
                  {item.label}
                  {"detail" in item ? <small>{item.detail}</small> : null}
                </span>
              </label>
            ))}
          </div>
          <button type="button" className="login-primary" disabled={!allChecked} onClick={() => setStep("quiz")}>
            다음
          </button>
          <p className="login-footnote">세 가지 모두 동의해야 지갑을 만들 수 있어요</p>
        </main>
      ) : null}

      {step === "quiz" ? (
        <main className="wallet-page login-page">
          <BackTitle title="3가지만 확인할게요" onBack={() => setStep("consent")} />
          <p className="wallet-description">정답을 고르면 바로 시작할 수 있어요. 틀려도 다시 고를 수 있어요.</p>
          {QUESTIONS.map((question, questionIndex) => {
            const selected = answers[questionIndex];
            const correct = selected === question.answer;
            return (
              <section key={question.prompt} className="login-question">
                <h2>{question.prompt}</h2>
                {question.choices.map((choice, choiceIndex) => {
                  const picked = selected === choiceIndex;
                  const state = !picked ? "" : correct ? " is-correct" : " is-wrong";
                  return (
                    <button
                      key={choice}
                      type="button"
                      className={`login-choice${state}`}
                      onClick={() => chooseAnswer(questionIndex, choiceIndex)}
                    >
                      {choice}
                    </button>
                  );
                })}
                {selected !== null && correct ? <p className="login-correct">맞아요.</p> : null}
                {selected !== null && !correct ? <p className="login-wrong">다시 골라 주세요.</p> : null}
              </section>
            );
          })}
          <button type="button" className="login-primary" disabled={!allCorrect} onClick={() => setStep("methods")}>
            시작하기
          </button>
        </main>
      ) : null}

      {step === "methods" ? (
        <main className="wallet-page login-page">
          <BackTitle
            title={intent === "create" ? "지갑 생성" : "로그인"}
            onBack={() => (intent === "create" ? setStep("quiz") : onClose())}
          />
          <p className="wallet-description">
            {intent === "create"
              ? "구글, 이메일, 가진 지갑 중 하나로 새 지갑을 만들어요."
              : "구글, 이메일, 가진 지갑 중 하나로 들어와요."}
          </p>
          {error ? <p className="wallet-alert">{error}</p> : null}
          <button
            type="button"
            className="login-choice"
            disabled={oauthLoading}
            onClick={() => {
              setError(null);
              void initOAuth({ provider: "google" }).catch((cause) => setError(errorText(cause)));
            }}
          >
            Google로 계속
          </button>
          <button type="button" className="login-choice" onClick={() => { setError(null); setStep("email"); }}>
            이메일로 계속
          </button>
          <button type="button" className="login-choice" onClick={() => { setError(null); setStep("wallet"); }}>
            지갑으로 계속
          </button>
        </main>
      ) : null}

      {step === "email" ? (
        <main className="wallet-page login-page">
          <BackTitle title="이메일" onBack={() => setStep("methods")} />
          <p className="wallet-description">
            {codeSent ? "이 주소로 보낸 6자리 코드를 아래에 입력해 주세요." : "이 주소로 6자리 코드를 보내요."}
          </p>
          <input
            className="login-field"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="me@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {codeSent ? (
            <>
              <div className="login-code">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => {
                      codeRefs.current[index] = node;
                    }}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    aria-label={`코드 ${index + 1}번째 자리`}
                    value={digit}
                    onChange={(event) => {
                      const next = event.target.value.replace(/\D/g, "").slice(-1);
                      setDigits((current) => current.map((value, item) => (item === index ? next : value)));
                      if (next && codeRefs.current[index + 1]) codeRefs.current[index + 1]?.focus();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Backspace" && !digits[index] && codeRefs.current[index - 1]) {
                        codeRefs.current[index - 1]?.focus();
                      }
                    }}
                    onPaste={(event) => {
                      const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                      if (!pasted) return;
                      event.preventDefault();
                      const next = ["", "", "", "", "", ""];
                      pasted.split("").forEach((value, item) => {
                        next[item] = value;
                      });
                      setDigits(next);
                      codeRefs.current[Math.min(pasted.length, 5)]?.focus();
                    }}
                  />
                ))}
              </div>
              <button type="button" className="login-text-button" disabled={busy} onClick={() => void requestCode()}>
                코드 다시 보내기
              </button>
            </>
          ) : null}
          {error ? <p className="wallet-alert">{error}</p> : null}
          {codeSent ? (
            <button
              type="button"
              className="login-primary"
              disabled={busy || code.length !== 6 || emailState.status === "submitting-code"}
              onClick={() => void confirmCode()}
            >
              확인
            </button>
          ) : (
            <button
              type="button"
              className="login-primary"
              disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim()) || emailState.status === "sending-code"}
              onClick={() => void requestCode()}
            >
              코드 받기
            </button>
          )}
        </main>
      ) : null}

      {step === "wallet" ? (
        <main className="wallet-page login-page">
          <BackTitle title="지갑 연결" onBack={() => setStep("methods")} />
          <p className="wallet-description">MetaMask 또는 Phantom의 이더리움 계정으로 로그인해요.</p>
          {error ? <p className="wallet-alert">{error}</p> : null}
          {WALLETS.map((wallet) => (
            <button key={wallet.id} type="button" className="login-choice" disabled={busy} onClick={() => connect(wallet)}>
              {wallet.label}
            </button>
          ))}
        </main>
      ) : null}

      {step === "pin" ? (
        <main className="wallet-page login-page login-pin">
          <BackTitle title="간편 결제 비밀번호" onBack={backPin} />
          <p className="wallet-description">
            {confirmingPin ? "같은 번호를 한 번 더 입력해 주세요." : "출금과 예치할 때 쓸 6자리 번호예요."}
          </p>
          <div className="login-pin-dots" aria-label={`6자리 중 ${pin.length}자리 입력`}>
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className={index < pin.length ? "is-filled" : undefined} />
            ))}
          </div>
          {error ? <p className="login-wrong">{error}</p> : null}
          <div className="login-pin-pad">
            {KEYS.map((digit) => (
              <button key={digit} type="button" disabled={busy} onClick={() => pushPin(digit)}>
                {digit}
              </button>
            ))}
            <span />
            <button type="button" disabled={busy} onClick={() => pushPin("0")}>
              0
            </button>
            <button type="button" aria-label="지우기" disabled={busy || pin.length === 0} onClick={() => setPin((current) => current.slice(0, -1))}>
              ⌫
            </button>
          </div>
        </main>
      ) : null}
    </>
  );
}
