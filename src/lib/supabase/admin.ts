import { createClient as createRawClient, type SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────
// Service-role client — bypasses RLS. ONLY use in:
//   - Daemon / token-authenticated endpoints (e.g. local-agent runner)
//   - Server-side cron jobs that need to read across users
// Never expose to the browser. The caller is responsible for manually
// scoping queries by user_id.
// ─────────────────────────────────────────────────
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not set')
  }
  return createRawClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
