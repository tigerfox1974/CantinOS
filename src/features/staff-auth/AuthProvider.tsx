import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { staffAuthApi } from '../../lib/api'
import { logTechnicalError } from '../../lib/errors'
import { isDemoActive, isSupabaseConfigured } from '../../lib/supabase'
import type { LoginResult, StaffRole } from '../../types/domain'

const STORAGE_KEY = 'okulbufesi.staff.session'

interface StoredSession {
  token: string
  staff: LoginResult['staff']
}

interface AuthContextValue {
  session: StoredSession | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.token || !parsed?.staff?.role) return null
    return parsed
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => readStored())
  const [loading, setLoading] = useState(() => Boolean(readStored()))

  useEffect(() => {
    if (!isSupabaseConfigured && !isDemoActive) {
      setLoading(false)
      return
    }
    const stored = readStored()
    if (!stored) {
      setLoading(false)
      return
    }

    let active = true
    staffAuthApi
      .me(stored.token)
      .then((staff) => {
        if (!active) return
        const next = { token: stored.token, staff }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        setSession(next)
      })
      .catch((error) => {
        logTechnicalError('auth:restore', error)
        if (!active) return
        localStorage.removeItem(STORAGE_KEY)
        setSession(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await staffAuthApi.login(email, password)
    const next: StoredSession = { token: result.token, staff: result.staff }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSession(next)
    return result
  }, [])

  const logout = useCallback(async () => {
    const current = session
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    if (current) {
      try {
        await staffAuthApi.logout(current.token)
      } catch (error) {
        logTechnicalError('auth:logout', error)
      }
    }
  }, [session])

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, login, logout }),
    [session, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth yalnız AuthProvider içinde kullanılabilir.')
  return context
}

export function roleHome(role: StaffRole): string {
  if (role === 'KITCHEN') return '/personel/mutfak'
  if (role === 'CASHIER') return '/personel/kasa'
  return '/personel/yonetim'
}

export function roleLabel(role: StaffRole): string {
  if (role === 'KITCHEN') return 'Mutfak'
  if (role === 'CASHIER') return 'Kasa'
  return 'Yönetici'
}
