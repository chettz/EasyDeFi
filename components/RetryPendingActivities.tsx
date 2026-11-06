"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { flushPendingActivities } from "@/features/transactions/pending-activities";

export function RetryPendingActivities() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  useEffect(() => {
    if (!ready || !authenticated) return;
    const retry = () => void flushPendingActivities(getAccessToken);

    retry();
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("online", retry);
    };
  }, [authenticated, getAccessToken, ready]);

  return null;
}
