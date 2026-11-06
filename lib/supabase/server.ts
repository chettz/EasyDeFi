import "server-only";

import { createClient } from "@supabase/supabase-js";

function getEnv(name: "SUPABASE_URL" | "SUPABASE_SECRET_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export const supabaseAdmin = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SECRET_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
