import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Cliente com service role — IGNORA RLS. Só pode ser importado em código
 * server-side (webhooks, engine de agentes, cron). Nunca no client.
 */
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv().serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
