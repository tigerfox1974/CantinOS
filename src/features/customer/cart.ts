import type { AvailabilityStatus } from '../../types/domain'

export const MAX_LINE_QUANTITY = 50
export const MAX_LINE_NOTE = 200
export const MAX_GENERAL_NOTE = 500
export const MAX_CUSTOMER_NAME = 80
export const MAX_CUSTOMER_PHONE = 20

/**
 * Sepetteki bir satır, menü güncellemelerinde sıfırlanmaması için
 * eklendiği andaki ürün bilgilerinin bir kopyasını da taşır.
 */
export interface CartLine {
  productId: string
  name: string
  unitPrice: number
  quantity: number
  lineNote: string
  availabilityStatus: AvailabilityStatus
  availabilityNote: string | null
  imageUrl: string | null
}

export interface OrderSnapshotItem {
  productName: string
  quantity: number
  lineNote: string | null
  unitPrice: number
  lineTotal: number
}

/** Başarılı siparişten sonra modalda gösterilecek yerel özet. */
export interface OrderSnapshot {
  items: OrderSnapshotItem[]
  generalNote: string | null
}

export function cartTotal(lines: CartLine[]): number {
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  return Math.round(total * 100) / 100
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}
