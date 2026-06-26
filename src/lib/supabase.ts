import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

// Service-role client — used server-side to verify JWTs and perform
// privileged operations. NEVER expose the service role key to the frontend.
let serviceClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return serviceClient;
}

/**
 * Verify a Supabase access token and return the associated auth user.
 * Returns null if the token is missing or invalid.
 */
export async function verifySupabaseToken(accessToken: string) {
  const { data, error } = await getSupabaseAdmin().auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}
