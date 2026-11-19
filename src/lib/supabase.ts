import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
const envDemoMode = (import.meta.env.VITE_DEMO_MODE ?? '').trim().toLowerCase() === 'true'

export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0

export function getIsDemoActive(): boolean {
  if (typeof window !== 'undefined') {
    const forced = window.localStorage.getItem('okulbufesi.force_demo')
    if (forced === 'true') return true
    if (forced === 'false' && isSupabaseConfigured) return false
  }
  return envDemoMode || !isSupabaseConfigured
}

export const isDemoActive = getIsDemoActive()

export function setForceDemo(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('okulbufesi.force_demo', enabled ? 'true' : 'false')
    window.location.reload()
  }
}

export const supabase: SupabaseClient | null =
  isSupabaseConfigured && !envDemoMode
    ? createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase yapılandırması eksik. .env dosyasını kontrol edin.')
  }
  return supabase
}
