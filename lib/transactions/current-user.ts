import "server-only";

import { verifyPrivyRequest } from "@/lib/privy/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function getCurrentAppUser(request: Request) {
  const claims = await verifyPrivyRequest(request);
  if (!claims) return null;

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .upsert({ privy_user_id: claims.userId }, { onConflict: "privy_user_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}
