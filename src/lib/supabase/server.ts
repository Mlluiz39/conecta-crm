import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase server-side com a sessão do usuário (RLS aplica).
 * Use em Server Components e Route Handlers que agem em nome do usuário.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component: ignorável quando o middleware
            // já cuida do refresh de sessão.
          }
        },
      },
    },
  );
}
