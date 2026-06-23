/**
 * auth.ts
 *
 * Anonymous identity bootstrap.
 * Every browser gets a real (passwordless) Supabase Auth user on first load —
 * this is what tabs.owner_id and the owner-only RLS policies key off.
 * Resolved once in main.tsx before the app renders, so the rest of the app
 * (TabContext, Home) can read the user ID synchronously, the same way the
 * old creator_token comparison worked.
 */

import { supabase } from './supabase'

let cachedUserId: string | null = null

export function getUserId(): string | null {
  return cachedUserId
}

export async function ensureSession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    cachedUserId = session.user.id
    return cachedUserId
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  cachedUserId = data.user.id
  return cachedUserId
}
