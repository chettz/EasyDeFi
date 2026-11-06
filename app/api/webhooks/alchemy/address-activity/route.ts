import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { Hash } from "viem";
import type { DepositToken } from "@/lib/deposit/networks";
import { getTokenContract } from "@/lib/deposit/token-contracts";
import {
  EVM_DEPOSIT_NETWORKS,
  recordEvmTokenDeposit,
} from "@/lib/transactions/base-usdc-deposit";

export const runtime = "nodejs";

const NETWORKS = {
  ETH_MAINNET: {
    signingKey: process.env.ALCHEMY_ETHEREUM_MAINNET_WEBHOOK_SIGNING_KEY,
  },
  ETH_SEPOLIA: {
    signingKey: process.env.ALCHEMY_ETHEREUM_SEPOLIA_WEBHOOK_SIGNING_KEY,
  },
  BASE_MAINNET: {
    signingKey: process.env.ALCHEMY_BASE_MAINNET_WEBHOOK_SIGNING_KEY,
  },
  BASE_SEPOLIA: {
    signingKey: process.env.ALCHEMY_BASE_SEPOLIA_WEBHOOK_SIGNING_KEY,
  },
} as const;

type AlchemyActivity = {
  category?: string;
  fromAddress?: string;
  toAddress?: string;
  hash?: string;
  rawContract?: {
    address?: string;
    rawValue?: string;
  };
};

type AlchemyPayload = {
  type?: string;
  event?: {
    network?: string;
    activity?: AlchemyActivity[];
  };
};

function validSignature(body: string, signature: string | null, signingKey: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", signingKey).update(body).digest("hex");
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const payload = JSON.parse(rawBody) as AlchemyPayload;
    const networkName = payload.event?.network;
    const config =
      networkName && networkName in NETWORKS
        ? NETWORKS[networkName as keyof typeof NETWORKS]
        : null;
    if (payload.type !== "ADDRESS_ACTIVITY" || !config) {
      return NextResponse.json({ error: "Unsupported webhook." }, { status: 400 });
    }
    if (!config.signingKey) {
      console.error(`${networkName} webhook signing key is not configured.`);
      return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
    }
    if (!validSignature(rawBody, request.headers.get("x-alchemy-signature"), config.signingKey)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const depositConfig = EVM_DEPOSIT_NETWORKS[networkName as keyof typeof EVM_DEPOSIT_NETWORKS];
    const tokenContracts = depositConfig.tokens.map((token) => ({
      token,
      contract: getTokenContract(token, depositConfig.network),
    }));
    const candidates = (payload.event?.activity ?? []).flatMap((activity) => {
      const matched = tokenContracts.find(
        ({ contract }) =>
          contract?.kind === "erc20" &&
          activity.rawContract?.address?.toLowerCase() === contract.address.toLowerCase(),
      );
      return activity.category === "token" &&
        activity.hash?.match(/^0x[0-9a-fA-F]{64}$/) &&
        activity.toAddress &&
        matched
        ? [{ activity, token: matched.token as DepositToken }]
        : [];
    });
    let recorded = 0;

    for (const { activity: candidate, token } of candidates) {
      let expectedRaw: bigint | undefined;
      try {
        expectedRaw = candidate.rawContract?.rawValue
          ? BigInt(candidate.rawContract.rawValue)
          : undefined;
      } catch {
        expectedRaw = undefined;
      }
      const saved = await recordEvmTokenDeposit({
        network: networkName as keyof typeof EVM_DEPOSIT_NETWORKS,
        token,
        hash: candidate.hash as Hash,
        recipient: candidate.toAddress!,
        expectedRaw,
        source: "alchemy_address_activity",
      });
      if (saved) recorded += 1;
    }

    return NextResponse.json({ recorded });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Webhook could not be processed." }, { status: 500 });
  }
}
