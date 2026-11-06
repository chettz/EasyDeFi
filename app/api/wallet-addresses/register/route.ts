import { NextResponse } from "next/server";
import type { WalletWithMetadata } from "@privy-io/server-auth";
import { isAddress } from "viem";
import { addAlchemyWebhookAddress } from "@/lib/alchemy/notify";
import { getKernelAddressesFromOwner } from "@/lib/deposit/kernel-address";
import { privyServer, verifyPrivyRequest } from "@/lib/privy/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AddressRow = {
  user_id: string;
  network: string;
  chain_namespace: string;
  address: string;
  address_normalized: string;
};

export async function POST(request: Request) {
  const claims = await verifyPrivyRequest(request);
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const privyUser = await privyServer.getUser(claims.userId);
    const evmWallet = privyUser.linkedAccounts.find(
      (account): account is WalletWithMetadata =>
        account.type === "wallet" &&
        account.chainType === "ethereum" &&
        account.walletClientType === "privy",
    );
    if (!evmWallet || !isAddress(evmWallet.address)) {
      return NextResponse.json({ error: "Privy embedded wallet was not found." }, { status: 409 });
    }

    const solanaWallet = privyUser.linkedAccounts.find(
      (account): account is WalletWithMetadata =>
        account.type === "wallet" && account.chainType === "solana",
    );
    const kernels = await getKernelAddressesFromOwner(evmWallet.address);

    const { data: appUser, error: userError } = await supabaseAdmin
      .from("app_users")
      .upsert({ privy_user_id: claims.userId }, { onConflict: "privy_user_id" })
      .select("id")
      .single();
    if (userError) throw userError;

    const evm = (network: string, chainId: number, address: string | undefined): AddressRow | null =>
      address
        ? {
            user_id: appUser.id,
            network,
            chain_namespace: `eip155:${chainId}`,
            address,
            address_normalized: address.toLowerCase(),
          }
        : null;
    const solana = (network: string, cluster: string): AddressRow | null =>
      solanaWallet
        ? {
            user_id: appUser.id,
            network,
            chain_namespace: `solana:${cluster}`,
            address: solanaWallet.address,
            address_normalized: solanaWallet.address,
          }
        : null;

    const rows = [
      evm("이더리움", 1, kernels.ethereum),
      evm("sepolia", 11155111, kernels.sepolia),
      evm("카이아", 8217, evmWallet.address),
      evm("kaiaKairos", 1001, evmWallet.address),
      evm("아크", 5042, kernels.arc),
      evm("arcTestnet", 5042002, kernels.arcTestnet),
      evm("base", 8453, kernels.base),
      evm("baseSepolia", 84532, kernels.baseSepolia),
      solana("솔라나", "mainnet"),
      solana("Devnet", "devnet"),
    ].filter((row): row is AddressRow => row !== null);

    const { error: addressError } = await supabaseAdmin
      .from("wallet_addresses")
      .upsert(rows, {
        onConflict: "chain_namespace,address_normalized",
        ignoreDuplicates: true,
      });
    if (addressError) throw addressError;

    await Promise.all([
      kernels.ethereum
        ? addAlchemyWebhookAddress("ethereum", kernels.ethereum)
        : Promise.resolve(),
      kernels.sepolia
        ? addAlchemyWebhookAddress("sepolia", kernels.sepolia)
        : Promise.resolve(),
      kernels.base ? addAlchemyWebhookAddress("base", kernels.base) : Promise.resolve(),
      kernels.baseSepolia
        ? addAlchemyWebhookAddress("baseSepolia", kernels.baseSepolia)
        : Promise.resolve(),
    ]);

    const { data: saved, error: readError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("network, chain_namespace, address")
      .eq("user_id", appUser.id)
      .order("network");
    if (readError) throw readError;

    return NextResponse.json({ addresses: saved });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Wallet addresses could not be registered." }, { status: 500 });
  }
}
