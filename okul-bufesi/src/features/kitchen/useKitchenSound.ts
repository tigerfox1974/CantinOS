import { useCallback, useEffect, useRef, useState } from 'react'
import { readSoundPreference, saveSoundPreference } from './kitchen-utils'

const FIRST_TONE_HZ = 880
const SECOND_TONE_HZ = 660
const TONE_GAIN = 0.2
const FIRST_TONE_DURATION = 0.12
const SECOND_TONE_OFFSET = 0.18
const SECOND_TONE_DURATION = 0.14

function scheduleTone(context: AudioContext, frequency: number, offset: number, duration: number): void {
  const startAt = context.currentTime + offset
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, startAt)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(TONE_GAIN, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration + 0.03)
}

function scheduleNewOrderPattern(context: AudioContext): void {
  scheduleTone(context, FIRST_TONE_HZ, 0, FIRST_TONE_DURATION)
  scheduleTone(context, SECOND_TONE_HZ, SECOND_TONE_OFFSET, SECOND_TONE_DURATION)
}

export interface KitchenSoundControls {
  enabled: boolean
  toggle: () => void
  playNewOrderBeep: () => void
}

/**
 * Mutfak sesli uyarısı.
 * - AudioContext yalnız kullanıcı etkileşimiyle (tıklama / tuş) oluşturulur veya çalıştırılır.
 * - Tercih localStorage'da saklanır; sayfa yenilendiğinde korunur.
 * - Ses kapalıyken veya tarayıcı sesi henüz açılmamışken bip çalınmaz.
 */
export function useKitchenSound(): KitchenSoundControls {
  const [enabled, setEnabled] = useState<boolean>(() => readSoundPreference())
  const contextRef = useRef<AudioContext | null>(null)

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null
    if (!contextRef.current) {
      try {
        contextRef.current = new AudioContext()
      } catch {
        return null
      }
    }
    const context = contextRef.current
    if (context.state === 'suspended') void context.resume()
    return context
  }, [])

  const playNewOrderBeep = useCallback(() => {
    if (!enabled) return
    const context = contextRef.current
    if (!context || context.state !== 'running') return
    scheduleNewOrderPattern(context)
  }, [enabled])

  const toggle = useCallback(() => {
    const next = !enabled
    setEnabled(next)
    saveSoundPreference(next)

    if (next) {
      const context = ensureContext()
      if (!context) return
      if (context.state === 'suspended') {
        void context
          .resume()
          .then(() => scheduleNewOrderPattern(context))
          .catch(() => undefined)
      } else {
        scheduleNewOrderPattern(context)
      }
    } else {
      const context = contextRef.current
      if (context && context.state === 'running') void context.suspend()
    }
  }, [enabled, ensureContext])

  // Ses tercihi açıkken ilk kullanıcı etkileşiminde AudioContext'i hazırla.
  useEffect(() => {
    if (!enabled) return

    const unlock = () => {
      const context = ensureContext()
      if (context && context.state === 'suspended') void context.resume()
    }

    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [enabled, ensureContext])

  useEffect(() => {
    return () => {
      const context = contextRef.current
      contextRef.current = null
      if (context) void context.close()
    }
  }, [])

  return { enabled, toggle, playNewOrderBeep }
}
