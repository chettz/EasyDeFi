"use server";

import { getBaseUsdcReserveDetail, type AaveApyWindow } from "@/lib/aave/base-usdc-reserve";

export async function loadAaveApyHistory(window: AaveApyWindow) {
  const detail = await getBaseUsdcReserveDetail(window);
  return detail.apyHistory;
}
