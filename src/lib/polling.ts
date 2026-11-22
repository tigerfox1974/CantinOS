import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidateStore } from './mock-rpc'

export const LIVE_INTERVAL_MS = 2500

interface PollingState<T> {
  data: T | null
  error: string | null
  loading: boolean
  refresh: () => Promise<void>
  lastUpdatedAt: Date | null
}

/**
 * 2,5 saniyelik sessiz canlı güncelleme.
 * - Önceki veriyi korur (ekran boşalmaz).
 * - Aynı içerik geldiğinde state'i değiştirmez (gereksiz yeniden render olmaz).
 * - Sekme gizliyken istek atmaz.
 */
export function usePolling<T>(
  loader: () => Promise<T>,
  options: { intervalMs?: number; enabled?: boolean } = {},
): PollingState<T> {
  const { intervalMs = LIVE_INTERVAL_MS, enabled = true } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const mountedRef = useRef(true)
  const inFlightRef = useRef(false)
  const serializedRef = useRef<string>('')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async (force = false) => {
    if (!enabled || inFlightRef.current) return
    if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    inFlightRef.current = true
    try {
      const result = await loaderRef.current()
      if (!mountedRef.current) return
      const serialized = JSON.stringify(result)
      if (serialized !== serializedRef.current) {
        serializedRef.current = serialized
        setData(result)
      }
      setError(null)
      setLastUpdatedAt(new Date())
    } catch (cause) {
      if (!mountedRef.current) return
      const message = cause instanceof Error ? cause.message : 'Veriler güncellenemedi.'
      setError(message)
    } finally {
      inFlightRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void run(true)
    const timer = window.setInterval(() => {
      invalidateStore()
      void run()
    }, intervalMs)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        invalidateStore()
        void run(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Çoklu sekme ve anlık canlı güncelleme senkronizasyonu
    let channel: BroadcastChannel | null = null
    const handleSync = () => {
      invalidateStore()
      void run(true)
    }

    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        try {
          channel = new BroadcastChannel('cantinos_live_sync')
          channel.addEventListener('message', handleSync)
        } catch {
          channel = null
        }
      }
      window.addEventListener('storage', handleSync)
      window.addEventListener('cantinos_local_sync', handleSync)
    }

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      if (channel) {
        channel.removeEventListener('message', handleSync)
        channel.close()
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleSync)
        window.removeEventListener('cantinos_local_sync', handleSync)
      }
    }
  }, [enabled, intervalMs, run])

  const refresh = useCallback(() => {
    invalidateStore()
    return run(true)
  }, [run])

  return {
    data,
    error,
    loading,
    refresh,
    lastUpdatedAt,
  }
}

/** Canlı ekranlarda "x sn önce" göstergesi için hafif saat. */
export function useClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
