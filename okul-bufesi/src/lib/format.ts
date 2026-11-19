export const TIME_ZONE = 'Asia/Nicosia'
export const CURRENCY_SUFFIX = 'TL'

const moneyFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(value: number | string | null | undefined): string {
  const numeric = typeof value === 'string' ? Number(value) : (value ?? 0)
  const safe = Number.isFinite(numeric) ? numeric : 0
  return `${moneyFormatter.format(safe)} ${CURRENCY_SUFFIX}`
}

export function parseMoneyInput(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : 0
}

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const weekdayFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
})

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return timeFormatter.format(date)
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

export function formatWeekday(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return weekdayFormatter.format(date)
}

/** Asia/Nicosia takvimine göre YYYY-MM-DD döndürür. */
export function businessDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Asia/Nicosia saatine göre HH:MM döndürür. */
export function localTime(value: Date = new Date()): string {
  return timeFormatter.format(value)
}

export function minutesSince(value: string | Date, now: Date = new Date()): number {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000))
}

export function formatDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || !Number.isFinite(totalMinutes)) {
    return '—'
  }
  const rounded = Math.max(0, Math.round(totalMinutes))
  if (rounded < 60) return `${rounded} dk`
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`
}

export function formatDateInput(date: Date): string {
  return businessDate(date)
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}
