import "server-only";

import { PrivyClient, type AuthTokenClaims } from "@privy-io/server-auth";

function getEnv(name: "PRIVY_APP_ID" | "PRIVY_APP_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export const privyServer = new PrivyClient(
  getEnv("PRIVY_APP_ID"),
  getEnv("PRIVY_APP_SECRET"),
);

export async function verifyPrivyRequest(request: Request): Promise<AuthTokenClaims | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    return await privyServer.verifyAuthToken(token);
  } catch {
    return null;
  }
}
