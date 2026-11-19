import { minutesSince } from '../../lib/format'
import type { StaffOrder } from '../../types/domain'

export const KITCHEN_SOUND_STORAGE_KEY = 'okulbufesi.kitchen.sound'

export const DEFAULT_WARNING_MINUTES = 5
export const DEFAULT_LATE_MINUTES = 10

export type KitchenUrgency = 'normal' | 'attention' | 'late'

export interface KitchenThresholds {
  warningMinutes: number
  lateMinutes: number
}

export const DEFAULT_THRESHOLDS: KitchenThresholds = {
  warningMinutes: DEFAULT_WARNING_MINUTES,
  lateMinutes: DEFAULT_LATE_MINUTES,
}

function toTime(value: string): number {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** Öncelikli siparişler önce, sonra teslim saatine, en son oluşturma saatine göre sıralar. */
export function sortKitchenOrders(orders: StaffOrder[]): StaffOrder[] {
  return [...orders].sort((a, b) => {
    if (a.priorityOverride !== b.priorityOverride) return a.priorityOverride ? -1 : 1
    const targetDiff = toTime(a.targetDeliveryAt) - toTime(b.targetDeliveryAt)
    if (targetDiff !== 0) return targetDiff
    return toTime(a.createdAt) - toTime(b.createdAt)
  })
}

export interface KitchenColumns {
  newOrders: StaffOrder[]
  preparing: StaffOrder[]
  ready: StaffOrder[]
}

/** Sunucu yalnız aktif siparişleri döndürür; yine de kapalı durumlar süzülür. */
export function groupKitchenOrders(orders: StaffOrder[]): KitchenColumns {
  const columns: KitchenColumns = { newOrders: [], preparing: [], ready: [] }
  for (const order of orders) {
    if (order.status === 'NEW') columns.newOrders.push(order)
    else if (order.status === 'PREPARING') columns.preparing.push(order)
    else if (order.status === 'READY') columns.ready.push(order)
  }
  columns.newOrders = sortKitchenOrders(columns.newOrders)
  columns.preparing = sortKitchenOrders(columns.preparing)
  columns.ready = sortKitchenOrders(columns.ready)
  return columns
}

export function kitchenUrgency(elapsedMinutes: number, thresholds: KitchenThresholds): KitchenUrgency {
  if (elapsedMinutes >= thresholds.lateMinutes) return 'late'
  if (elapsedMinutes >= thresholds.warningMinutes) return 'attention'
  return 'normal'
}

export function orderElapsedMinutes(order: StaffOrder, now: Date): number {
  return minutesSince(order.createdAt, now)
}

/** Sunucudan gelen eşikleri güvenli aralığa çeker; geçersiz değerde varsayılan kullanılır. */
export function normalizeThresholds(raw: {
  kitchenWarningMinutes: number
  kitchenLateMinutes: number
}): KitchenThresholds {
  const rawWarning = Number.isFinite(raw.kitchenWarningMinutes)
    ? Math.round(raw.kitchenWarningMinutes)
    : DEFAULT_WARNING_MINUTES
  const warningMinutes = Math.max(1, rawWarning)

  const rawLate = Number.isFinite(raw.kitchenLateMinutes) ? Math.round(raw.kitchenLateMinutes) : DEFAULT_LATE_MINUTES
  const lateMinutes = Math.max(warningMinutes + 1, rawLate)

  return { warningMinutes, lateMinutes }
}

export function readSoundPreference(): boolean {
  try {
    return localStorage.getItem(KITCHEN_SOUND_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveSoundPreference(enabled: boolean): void {
  try {
    localStorage.setItem(KITCHEN_SOUND_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Depolama kapalıysa tercih yalnız bu oturum için geçerli olur.
  }
}
