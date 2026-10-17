"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { prepareUserOperationForErc20Paymaster } from "permissionless/experimental/pimlico";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddress,
  isHex,
  parseEther,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { baseSepolia } from "viem/chains";
import {
  TransactionModal,
  UsdcCompleteModal,
  UsdcSendingModal,
  type CompletedUsdcSend,
  type PendingSend,
} from "@/components/TransactionModal";
import { parseErc20PaymasterFee, type Erc20PaymasterCall } from "@/lib/parse-erc20-paymaster-fee";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});
const PIMLICO_URL = `https://api.pimlico.io/v2/${baseSepolia.id}/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`;
const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

// Pimlico client 생성
const pimlicoClient = createPimlicoClient({
  chain: baseSepolia,
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: entryPoint07Address,
    version: "0.7",
  },
});

export default function LabHome() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  // Privy embedded wallet 가져오기
  const { wallets, ready: walletsReady } = useWallets();
  const [kernelAddress, setKernelAddress] = useState<Address | null>(null);
  const [kernelError, setKernelError] = useState<string | null>(null);
  const [client, setClient] = useState<SmartAccountClient | null>(null);
  const [nativeTxHash, setNativeTxHash] = useState<string | null>(null);
  const [usdcTxHash, setUsdcTxHash] = useState<string | null>(null);
  const [dataTxHash, setDataTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 예상 수수료 확인 전에 보관하는 호출. Confirm send 이후에만 전송된다.
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [completedUsdc, setCompletedUsdc] = useState<CompletedUsdcSend | null>(null);
  const [isUsdcSending, setIsUsdcSending] = useState(false);
  // Privy embedded EOA. Kernel의 signer
  // Privy embedded wallet 가져오기
  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy");

  // 로그인된 EOA로 Kernel 주소와 전송용 client를 만든다. 로그아웃하면 둘 다 비운다.
  useEffect(() => {
    if (!authenticated || !walletsReady || !embeddedWallet) {
      setClient(null);
      setKernelAddress(null);
      return;
    }

    let cancelled = false;
    const signer = embeddedWallet;

    async function createKernelAccount() {
      try {
        // privy EOA 서명 통로 가져오기(provider 가져오기)
        const provider = await signer.getEthereumProvider();
        // EOA를 signer(owner)로 하는 kernel account 생성(스마트 지갑 배포 X)
        const account = await toKernelSmartAccount({
          client: publicClient,
          // Privy provider의 추가 메서드를 빼고, 서명 요청에 쓰는 request만 owner로 전달
          owners: [{ request: (args) => provider.request(args) }],
          version: "0.3.3", // kernel 구현체 버전
          index: BigInt(0), // EOA를 signer로 하는 첫번째 kernel 생성
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
        });
        // kernel 스마트 지갑으로 userOp을 만들고 bundler로 전송할 client 생성
        const smartAccountClient = createSmartAccountClient({
          account,
          chain: baseSepolia,
          bundlerTransport: http(PIMLICO_URL),
          paymaster: pimlicoClient,
          userOperation: {
            estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
            // 전송 직전에 필요한 USDC 승인액만 계산해 approve 호출을 UserOperation에 삽입
            prepareUserOperation: prepareUserOperationForErc20Paymaster(pimlicoClient),
          },
        });
        if (cancelled) return;
        setKernelAddress(account.address);
        setClient(smartAccountClient);
        setKernelError(null);
      } catch (cause) {
        if (cancelled) return;
        setKernelAddress(null);
        setClient(null);
        setKernelError(cause instanceof Error ? cause.message : "Kernel account creation failed.");
      }
    }

    void createKernelAccount();
    return () => {
      cancelled = true;
    };
  }, [authenticated, walletsReady, embeddedWallet]);

  if (!ready) return <p>Loading...</p>;

  if (!authenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <button onClick={login}>Login</button>
      </main>
    );
  }

  const eoa = embeddedWallet?.address ?? user?.wallet?.address;

  // solana wallet 주소 가져오기(입출금용 주소)
  const solanaWallet = user?.linkedAccounts.find(
    (a) => a.type === "wallet" && a.chainType === "solana"
  );
  const solanaAddress =
    solanaWallet && "address" in solanaWallet ? solanaWallet.address : undefined;

  // 실제 전송, approve 호출은 client에 등록된 훅이 필요한 금액만큼 승인
  async function sendWithUsdcPaymaster(call: Erc20PaymasterCall) {
    if (!client) throw new Error("Kernel smart account is not ready.");

    return client.sendTransaction({
      calls: [call],
      paymasterContext: { token: USDC_ADDRESS }, // erc20 paymaster 사용 시 토큰 주소 전달
    });
  }

  // 영수증의 USDC Transfer 중, 수신자에게 보낸 금액을 제외한 차감이 paymaster 가스비
  async function readActualUsdcGas(hash: Hash, recipient: Address, amount: bigint) {
    if (!kernelAddress) return null;

    // 전송이 포함된 트랜잭션 영수증을 가져온다.
    const receipt = await publicClient.getTransactionReceipt({ hash });
    // 영수증 로그 중 ERC-20 Transfer 이벤트 필터링, 각 이벤트 객체들을 배열로 반환
    const transfers = parseEventLogs({ abi: ERC20_ABI, logs: receipt.logs, eventName: "Transfer" });
    // Kernel 계정이 USDC 컨트랙트에서 보낸 전송만 필터링(일반 전송, paymaster가 가져간 usdc 포함)
    const outgoing = transfers.filter(
      (log) =>
        log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() && // log.address = 이벤트를 발생시킨 토큰 주소
        log.args.from.toLowerCase() === kernelAddress.toLowerCase(),
    );
    // 수신자에게 보낸 usdc는 제외 => 사용자가 usdc로 지불한 가스비만 남음
    const gasLogs = outgoing.filter(
      (log) =>
        !(log.args.to.toLowerCase() === recipient.toLowerCase() && log.args.value === amount),
    );
    if (gasLogs.length === 0) {
      console.error("USDC gas transfer log was not found.", { hash, outgoing });
      return null;
    }
    // 남은 전송 수량을 더해 실제 가스비로 반환한다.
    // 배열.reduce((누적값, 현재값) => 누적값 + 현재값, 초기값)
    return gasLogs.reduce((sum, log) => sum + log.args.value, BigInt(0));
  }

  // 트랜잭션 전송없이 예상 최대 USDC/USD 수수료 계산
  async function previewUsdcPaymasterFee(call: Erc20PaymasterCall) {
    if (!client?.account) throw new Error("Kernel smart account is not ready.");
    const account = client.account;

    return parseErc20PaymasterFee({
      token: USDC_ADDRESS,
      tokenDecimals: 6,
      calls: [call], // 사용자가 전송하려는 호출
      prepareUserOperation: (args) => client.prepareUserOperation({ ...args, account }), 
      estimateErc20PaymasterCost: (args) => pimlicoClient.estimateErc20PaymasterCost(args),
    });
  }

  // ETH 전송
  async function onSendNative(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const to = String(form.get("to"));
    const amount = String(form.get("amount"));

    if (!isAddress(to)) {
      setError("Enter a valid recipient address.");
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      const call = { to, value: parseEther(amount) };
      setPendingSend({
        kind: "native",
        summary: `Send ${amount} ETH to ${to}`,
        call,
        preview: null,
        error: null,
      });
      const preview = await previewUsdcPaymasterFee(call);
      setPendingSend((current) => (current?.kind === "native" ? { ...current, preview } : current));
    } catch (error) {
      console.error(error);
      const message = "수수료를 계산하지 못했습니다.";
      setError(message);
      setPendingSend((current) => (current ? { ...current, error: message } : current));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Send USDC 제출은 전송이 아니다. 호출을 만들어 확인 팝업을 열고, 수수료만 먼저 계산한다.
  async function onSendUsdc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // 폼 제출의 기본 동작인 페이지 새로고침을 막는다.
    const form = new FormData(e.currentTarget);
    const to = String(form.get("to"));
    const amount = String(form.get("amount"));

    // 수신자 주소 유효성 검사
    if (!isAddress(to)) {
      setError("Enter a valid recipient address.");
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      // transfer(수신자, 수량)를 calldata로 인코딩한다. 호출 대상은 수신자가 아니라 USDC 컨트랙트다.
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, parseUnits(amount, 6)],
      });
      const call = { to: USDC_ADDRESS, data };
      // preview가 null인 상태로 먼저 저장해 팝업을 바로 연다. 화면에는 "계산 중"이 보인다.
      setPendingSend({
        kind: "usdc",
        summary: `Send ${amount} USDC to ${to}`,
        call,
        preview: null,
        error: null,
        usdc: { recipient: to, amount: parseUnits(amount, 6) },
      });
      // 예상 수수료 계산
      const preview = await previewUsdcPaymasterFee(call);
      // 계산이 끝나도 아직 USDC 팝업이 열려 있을 때만 수수료를 채움, Cancel로 닫혔으면 기존 pendingSend를 유지
      setPendingSend((current) => (current?.kind === "usdc" ? { ...current, preview } : current));
    } catch (error) {
      console.error(error);
      const message = "수수료를 계산하지 못했습니다.";
      setError(message);
      // 수수료 계산이 실패하면 팝업을 유지하고 짧은 문구만 표시, 긴 원문은 콘솔에 남김
      setPendingSend((current) => (current ? { ...current, error: message } : current));
    } finally {
      setIsSubmitting(false);
    }
  }

  // 컨트랙트 호출
  async function onSendData(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const to = String(form.get("to"));
    const data = String(form.get("data"));

    if (!isAddress(to) || !isHex(data)) {
      setError("Enter a valid contract address and hex data.");
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      const call = { to, data };
      setPendingSend({
        kind: "data",
        summary: `Call ${to}`,
        call,
        preview: null,
        error: null,
      });
      const preview = await previewUsdcPaymasterFee(call);
      setPendingSend((current) => (current?.kind === "data" ? { ...current, preview } : current));
    } catch (error) {
      console.error(error);
      const message = "수수료를 계산하지 못했습니다.";
      setError(message);
      setPendingSend((current) => (current ? { ...current, error: message } : current));
    } finally {
      setIsSubmitting(false);
    }

  }

  // Confirm send 버튼 클릭 시 트랜잭션 전송
  async function onConfirmSend() {
    if (!pendingSend) return;

    const sendingUsdc = pendingSend.kind === "usdc";

    try {
      setError(null);
      setIsSubmitting(true);
      if (sendingUsdc) setIsUsdcSending(true);
      // sendTransaction 호출
      const hash = await sendWithUsdcPaymaster(pendingSend.call);
      if (pendingSend.kind === "native") setNativeTxHash(hash);
      if (pendingSend.kind === "usdc" && pendingSend.usdc) {
        setUsdcTxHash(hash);
        let gas: bigint | null = null;
        try {
          gas = await readActualUsdcGas(hash, pendingSend.usdc.recipient, pendingSend.usdc.amount);
        } catch (cause) {
          console.error(cause);
        }
        setCompletedUsdc({ ...pendingSend.usdc, gas });
      }
      if (pendingSend.kind === "data") setDataTxHash(hash);
      setPendingSend(null);
    } catch (error) {
      console.error(error);
      const message = "전송에 실패했습니다.";
      setError(message);
      setPendingSend((current) => (current ? { ...current, error: message } : current));
    } finally {
      setIsSubmitting(false);
      if (sendingUsdc) setIsUsdcSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      {/* 로그인 계정과 체인별 지갑 주소 */}
      <p>Logged in as {user?.email?.address ?? user?.id}</p>
      <p>Kernel smart account: {kernelError ?? kernelAddress ?? "creating..."}</p>
      <p>Embdded Wallet(Signer): {eoa ?? "none"}</p>
      <p>Solana wallet: {solanaAddress ?? "creating..."}</p>

      {/* ETH 전송, 제출하면 바로 보내지 않고 수수료 확인 팝업 표시
      <fieldset style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #888" }}>
        <legend>Send Base Sepolia ETH with ERC20 Paymaster(USDC)</legend>
        <form onSubmit={onSendNative}>
          <p>
            <input
              name="to"
              placeholder="0x recipient"
              required
              style={{ border: "1px solid #888", padding: "0.5rem", width: "100%" }}
            />
          </p>
          <p>
            <input
              name="amount"
              placeholder="ETH amount"
              required
              style={{ border: "1px solid #888", padding: "0.5rem", width: "100%" }}
            />
          </p>
          <button
            type="submit"
            disabled={!client || isSubmitting}
            style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
          >
            Send ETH
          </button>
        </form>
        {nativeTxHash && <p>Native transfer tx: {nativeTxHash}</p>}
      </fieldset>
      */}

      {/* USDC 전송, 제출하면 바로 보내지 않고 수수료 확인 팝업 표시 */}
      <fieldset style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #888" }}>
        <legend>[거래정보 팝업창 테스트]<br/>Send USDC(Base Sepolia) with ERC20 Paymaster(USDC)</legend>
        <form onSubmit={onSendUsdc}>
          <p>
            <input
              name="to"
              placeholder="0x recipient"
              required
              style={{ border: "1px solid #888", padding: "0.5rem", width: "100%" }}
            />
          </p>
          <p>
            <input
              name="amount"
              placeholder="USDC amount"
              required
              style={{ border: "1px solid #888", padding: "0.5rem", width: "100%" }}
            />
          </p>
          <button
            type="submit"
            disabled={!client || isSubmitting}
            style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
          >
            Send USDC
          </button>
        </form>
        {usdcTxHash && <p>USDC transfer tx: {usdcTxHash}</p>}
      </fieldset>
      
      {/* 입출금 페이지 이동 */}
      <fieldset style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #888" }}>
        <legend>[입금 / 출금 테스트]</legend>
        <p style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/lab/deposit" style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}>
            입금
          </Link>
          <Link href="/lab/withdraw" style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}>
            출금
          </Link>
          <Link href="/lab/defi-list" style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}>
            DeFi list
          </Link>
        </p>
      </fieldset>

      {/* 컨트랙트 호출, 제출하면 바로 보내지 않고 수수료 확인 팝업 표시
      <fieldset style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #888" }}>
        <legend>Send contract call with ERC20 Paymaster(USDC)</legend>
        <form onSubmit={onSendData}>
          <p>
            <input
              name="to"
              placeholder="0x contract"
              required
              style={{ border: "1px solid #888", padding: "0.5rem", width: "100%" }}
            />
          </p>
          <p>
            <input
              name="data"
              placeholder="0x calldata"
              required
              style={{ border: "1px solid #888", padding: "0.5rem", width: "100%" }}
            />
          </p>
          <button
            type="submit"
            disabled={!client || isSubmitting}
            style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
          >
            Send data
          </button>
        </form>
        {dataTxHash && <p>Data transaction tx: {dataTxHash}</p>}
      </fieldset>
      */}

      {/* 전송 확인 팝업, pendingSend가 있을 때만 표시됨 */}
      {pendingSend && !isUsdcSending && (
        <TransactionModal
          pending={pendingSend}
          isSubmitting={isSubmitting}
          onConfirm={onConfirmSend} // 보관된 call을 실제로 전송하고, USDC는 전송 중 팝업을 거쳐 완료 팝업으로 넘어간다.
          onCancel={() => setPendingSend(null)} // pendingSend를 비워 팝업만 닫음, 전송은 하지 않음
        />
      )}
      {isUsdcSending && <UsdcSendingModal />}
      {completedUsdc && (
        <UsdcCompleteModal completed={completedUsdc} onClose={() => setCompletedUsdc(null)} />
      )}
      {/* 수수료 계산이나 전송 실패 메시지 */}
      {error && <p role="alert">{error}</p>}
      <button onClick={logout}>Logout</button>
    </main>
  );
}

