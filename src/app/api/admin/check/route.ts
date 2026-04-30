import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ is_admin: false })
  return Response.json({ is_admin: isAdmin(user.id), user_id: user.id })
}
