/**
 * 카이아·kaiaKairos에서 Privy EOA로 USDT를 보낸다.
 * 승인과 스왑은 서명만 받아 kaia_sendRawTransactions로 함께 넣는다.
 * 스왑이 들어간 뒤 USDT를 전송한다.
 */

import { encodeFunctionData, erc20Abi, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { KAIA_APPROVE_GAS, KAIA_SWAP_GAS, openKaiaClient, prepareKaiaSendFee, type KaiaFeeNetwork } from "./quote-kaia-send-fee";

const MAX_UINT256 = BigInt(2) ** BigInt(256) - BigInt(1);
const DEADLINE_BUFFER_SECONDS = BigInt(1800);

const swapForGasAbi = [
  {
    name: "swapForGas",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "amountRepay", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

type KaiaSignedCall = {
  from: Address;
  to: Address;
  data: Hex;
  nonce: bigint;
  gas: bigint;
  gasPrice: bigint;
  chainId: number;
};

function asHashList(value: unknown): Hash[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.startsWith("0x"))) {
    throw new Error("Kaia bundle hashes were not returned.");
  }
  return value as Hash[];
}

// 승인과 스왑이 한 트랜잭션 안에 들어가야 함
async function submitKaiaBundle(client: PublicClient, signed: Hex[]) {
  const hashes = await client.transport.request({
    method: "kaia_sendRawTransactions",
    params: [signed],
  });
  const list = asHashList(hashes);
  const swapHash = list[list.length - 1];
  if (!swapHash) throw new Error("Kaia bundle hashes were not returned.");
  return swapHash;
}

export async function sendKaiaTransfer(parameters: {
  network: KaiaFeeNetwork;
  sender: Address;
  recipient: Address;
  amount: bigint;
  switchChain: (chainId: number) => Promise<void>;
  signTransaction: (tx: KaiaSignedCall) => Promise<Hex>;
  sendTransaction: (tx: {
    from: Address;
    to: Address;
    data: Hex;
    nonce: bigint;
    gas: bigint;
    gasPrice: bigint;
    chainId: number;
  }) => Promise<Hash>;
}) {
  const prepared = await prepareKaiaSendFee(parameters);
  const { client } = openKaiaClient(parameters.network);
  await parameters.switchChain(prepared.chainId);

  const block = await client.getBlock();
  const nonce = BigInt(await client.getTransactionCount({ address: parameters.sender, blockTag: "pending" }));
  const signed: Hex[] = [];
  let nextNonce = nonce;

  if (prepared.approveRequired) {
    signed.push(
      await parameters.signTransaction({
        from: parameters.sender,
        to: prepared.token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [prepared.router, MAX_UINT256],
        }),
        nonce: nextNonce,
        gas: KAIA_APPROVE_GAS,
        gasPrice: prepared.gasPrice,
        chainId: prepared.chainId,
      }),
    );
    nextNonce += BigInt(1);
  }

  signed.push(
    await parameters.signTransaction({
      from: parameters.sender,
      to: prepared.router,
      data: encodeFunctionData({
        abi: swapForGasAbi,
        functionName: "swapForGas",
        args: [
          prepared.token,
          prepared.amountIn,
          prepared.minAmountOut,
          prepared.amountRepay,
          block.timestamp + DEADLINE_BUFFER_SECONDS,
        ],
      }),
      nonce: nextNonce,
      gas: KAIA_SWAP_GAS,
      gasPrice: prepared.gasPrice,
      chainId: prepared.chainId,
    }),
  );

  const swapHash = await submitKaiaBundle(client, signed);
  await client.waitForTransactionReceipt({ hash: swapHash });

  // 스왑으로 들어온 KAIA로 전송 가스를 낸다. nonce는 묶음 다음 번호다.
  const transferHash = await parameters.sendTransaction({
    from: parameters.sender,
    to: prepared.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [parameters.recipient, parameters.amount],
    }),
    nonce: nextNonce + BigInt(1),
    gas: prepared.transferGas,
    gasPrice: prepared.gasPrice,
    chainId: prepared.chainId,
  });
  await client.waitForTransactionReceipt({ hash: transferHash });

  // 실제 수수료는 스왑에 넣은 USDT다.
  return { hash: transferHash, gas: prepared.amountIn };
}
