"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { TOKEN_NETWORKS, type DepositNetwork, type DepositToken } from "@/lib/deposit/networks";

const labFieldStyle = {
  width: "100%",
  marginTop: "0.25rem",
  border: "1px solid #888",
  padding: "0.5rem",
};

export function DepositFlow({ variant = "product" }: { variant?: "lab" | "product" }) {
  const { accounts, isLoading } = useDepositAccounts();
  const [token, setToken] = useState<DepositToken>("USDC");
  const [network, setNetwork] = useState<DepositNetwork>("이더리움");
  const [copied, setCopied] = useState(false);
  const networks = TOKEN_NETWORKS[token];
  const depositAddress = getDepositAddress(network, accounts);

  // 토큰 변경 시 네트워크 변경하는 함수
  function onTokenChange(nextToken: DepositToken) {
    setToken(nextToken);
    const nextNetworks = TOKEN_NETWORKS[nextToken];
    if (!nextNetworks.some((item) => item === network)) {
      setNetwork(nextNetworks[0]);
    }
  }

  // 입금 주소 복사
  async function onCopyAddress() {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (cause) {
      console.error(cause);
    }
  }

  if (variant === "lab") {
    return (
      <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
        <h1>입금 기능 테스트</h1>
        <p>
          <label>
            입금할 토큰
            <select
              value={token}
              onChange={(event) => onTokenChange(event.target.value as DepositToken)}
              style={labFieldStyle}
            >
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            네트워크
            <select
              value={network}
              onChange={(event) => setNetwork(event.target.value as DepositNetwork)}
              style={labFieldStyle}
            >
              {networks.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </p>
        <p style={{ overflowWrap: "anywhere" }}>
          입금 주소: {depositAddress ?? (isLoading ? "확인 중" : "표시할 수 없음")}
        </p>
        <button
          type="button"
          disabled={!depositAddress}
          onClick={() => void onCopyAddress()}
          style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
        >
          {copied ? "복사 완료" : "주소 복사"}
        </button>
        <p>
          <Link href="/lab">Lab으로 돌아가기</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="wallet-page">
      <div className="wallet-title-row">
        <Link href="/product/transfer" className="wallet-back" aria-label="입출금으로 돌아가기">
          <Image src="/figma/chevron-down.svg" alt="" width={24} height={24} />
        </Link>
        <h1>입금</h1>
      </div>
      <p className="wallet-description">
        토큰과 네트워크를 고르면 이 주소로 입금할 수 있어요.
      </p>
      <div className="wallet-field">
        <label htmlFor="deposit-token">입금할 토큰</label>
        <select
          id="deposit-token"
          value={token}
          onChange={(event) => onTokenChange(event.target.value as DepositToken)}
        >
          <option value="USDC">USDC</option>
          <option value="USDT">USDT</option>
        </select>
      </div>
      <div className="wallet-field">
        <label htmlFor="deposit-network">네트워크</label>
        <select
          id="deposit-network"
          value={network}
          onChange={(event) => setNetwork(event.target.value as DepositNetwork)}
        >
          {networks.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="wallet-warning">
        <span>
          <strong>꼭 {network} 네트워크로 보내주세요.</strong>
          <br />
          다른 네트워크로 보내면 되찾을 수 없어요. 본인 명의 거래소 계정에서만
          보내주세요.
        </span>
      </div>
      <section className="wallet-qr" aria-label="입금 주소 QR 코드">
        {depositAddress ? (
          <>
            <QRCodeSVG
              value={depositAddress}
              size={112}
              bgColor="#ffffff"
              fgColor="#1f1f24"
              title={`${network} ${token} 입금 주소`}
            />
            <p className="wallet-helper">거래소 앱에서 QR을 찍어도 돼요</p>
          </>
        ) : (
          <p className="wallet-helper" role="status">
            {isLoading ? "입금 주소를 준비하고 있어요." : "입금 주소를 확인하지 못했어요."}
          </p>
        )}
      </section>
      <div className="wallet-address-box">
        <div>
          <span className="wallet-field-label">입금 주소</span>
          <div className="wallet-address-value">
            {depositAddress ?? (isLoading ? "확인 중" : "주소 없음")}
          </div>
        </div>
        <button
          type="button"
          className="wallet-icon-button"
          disabled={!depositAddress}
          onClick={() => void onCopyAddress()}
          aria-label={copied ? "주소 복사 완료" : "입금 주소 복사"}
        >
          <Image src="/figma/copy.svg" alt="" width={20} height={20} />
        </button>
      </div>
      {copied && (
        <p className="wallet-helper" role="status">
          주소를 복사했어요.
        </p>
      )}
    </main>
  );
}

