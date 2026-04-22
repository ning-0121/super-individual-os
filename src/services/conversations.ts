import { createClient } from '@/lib/supabase/client'
import { Conversation, Message, ChatMode } from '@/types'

const db = () => createClient()

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await db()
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createConversation(mode: ChatMode, firstMessage: string): Promise<Conversation> {
  const title = firstMessage.slice(0, 40) + (firstMessage.length > 40 ? '...' : '')
  const { data, error } = await db()
    .from('conversations')
    .insert({ mode, title })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const { error } = await db()
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })
  if (error) throw error

  await db()
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await db().from('conversations').delete().eq('id', id)
  if (error) throw error
}
