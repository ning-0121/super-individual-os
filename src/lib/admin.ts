/**
 * V1.7 — Admin authorization helper.
 *
 * Admin user IDs are configured via ADMIN_USER_IDS env var (comma-separated UUIDs).
 * Example:
 *   ADMIN_USER_IDS=11111111-2222-3333-4444-555555555555,aaaa-bbbb-...
 *
 * Find your user_id in Supabase → Authentication → Users.
 */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false
  const raw = process.env.ADMIN_USER_IDS ?? ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean)
  return ids.includes(userId)
}

export function adminCount(): number {
  const raw = process.env.ADMIN_USER_IDS ?? ''
  return raw.split(',').map(s => s.trim()).filter(Boolean).length
}
