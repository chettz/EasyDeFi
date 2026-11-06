import "server-only";

import type { Address } from "viem";

const WEBHOOKS = {
  ethereum: process.env.ALCHEMY_ETHEREUM_MAINNET_WEBHOOK_ID,
  sepolia: process.env.ALCHEMY_ETHEREUM_SEPOLIA_WEBHOOK_ID,
  base: process.env.ALCHEMY_BASE_MAINNET_WEBHOOK_ID,
  baseSepolia: process.env.ALCHEMY_BASE_SEPOLIA_WEBHOOK_ID,
} as const;

export async function addAlchemyWebhookAddress(
  network: keyof typeof WEBHOOKS,
  address: Address,
) {
  const authToken = process.env.ALCHEMY_NOTIFY_AUTH_TOKEN;
  const webhookId = WEBHOOKS[network];
  if (!authToken || !webhookId) throw new Error(`Alchemy ${network} webhook is not configured.`);

  const response = await fetch("https://dashboard.alchemy.com/api/update-webhook-addresses", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-alchemy-token": authToken,
    },
    body: JSON.stringify({
      webhook_id: webhookId,
      addresses_to_add: [address],
      addresses_to_remove: [],
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Alchemy address registration failed (${response.status}): ${message}`);
  }
}
