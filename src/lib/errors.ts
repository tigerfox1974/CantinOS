const GENERIC_MESSAGE = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'

const KNOWN_MESSAGES: Record<string, string> = {
  '42501': 'Bu işlem için yetkiniz yok.',
  PGRST202: 'İstenen işlem bulunamadı. Sistem güncel değilse yöneticinize başvurun.',
  PGRST301: 'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.',
}

export class AppError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

interface PostgrestLikeError {
  message?: string
  code?: string
  details?: string
  hint?: string
}

/**
 * Teknik veritabanı metnini kullanıcıya göstermeden Türkçe mesaja çevirir.
 * Teknik ayrıntı yalnız geliştirme günlüğüne yazılır.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.message

  const candidate = error as PostgrestLikeError | null
  if (candidate && typeof candidate.message === 'string') {
    const code = candidate.code ?? ''
    if (code && KNOWN_MESSAGES[code]) return KNOWN_MESSAGES[code]

    // Veritabanı RPC'leri kullanıcıya gösterilecek Türkçe mesajı P0001 ile üretir.
    if (code === 'P0001' && candidate.message.trim().length > 0) {
      return candidate.message
    }

    const lower = candidate.message.toLowerCase()
    if (lower.includes('failed to fetch') || lower.includes('network')) {
      return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'
    }
    if (lower.includes('jwt') || lower.includes('apikey')) {
      return 'Sistem yapılandırması eksik. Yöneticinize başvurun.'
    }
    if (candidate.message.trim().length > 0 && !/[{}]/.test(candidate.message) && candidate.message.length < 160) {
      return candidate.message
    }
  }

  return GENERIC_MESSAGE
}

export function logTechnicalError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[CantinOS] ${context}`, error)
  }
}
