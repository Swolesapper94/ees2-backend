import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

// Service-role client — used server-side to verify JWTs and perform
// privileged operations. NEVER expose the service role key to the frontend.
let serviceClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!serviceClient) {
    const key = env.supabaseServiceRoleKey;
    if (!key) {
      throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY is required but not set in .env\n\n` +
        `To fix:\n` +
        `1. Sign in to https://supabase.com\n` +
        `2. Select your project (eytzzqeculldegxpsxak)\n` +
        `3. Go to Settings → API\n` +
        `4. Copy the "service_role" secret (looks like eyJ...)\n` +
        `5. Add to .env: SUPABASE_SERVICE_ROLE_KEY=<paste-the-key-here>\n` +
        `6. Restart backend: npm run dev:real\n`
      );
    }
    serviceClient = createClient(env.supabaseUrl, key, {
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
