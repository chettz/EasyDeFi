"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";

export function RegisterWalletAddresses() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const registering = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || !user || registering.current) return;

    const storageKey = `easydefi:wallet-addresses:v3:${user.id}`;
    if (sessionStorage.getItem(storageKey)) return;
    registering.current = true;

    async function register() {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Privy access token was not returned.");

        const response = await fetch("/api/wallet-addresses/register", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Wallet registration failed: ${response.status}`);

        sessionStorage.setItem(storageKey, "registered");
      } catch (cause) {
        console.error(cause);
      } finally {
        registering.current = false;
      }
    }

    void register();
  }, [authenticated, getAccessToken, ready, user]);

  return null;
}
