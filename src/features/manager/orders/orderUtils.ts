import type {
  AdminProduct,
  OrderStatus,
  PaymentMethod,
  PaymentRecord,
  StaffOrder,
} from '../../../types/domain'

export interface ProductOption {
  id: string
  name: string
  categoryName: string
  price: number
  availability: AdminProduct['availabilityStatus']
}

const ADJUSTABLE_STATUSES: readonly OrderStatus[] = ['NEW', 'PREPARING', 'READY']

/** Düzeltme yalnız hazırlanmamış / teslim edilmemiş siparişlerde yapılabilir. */
export function isAdjustable(status: OrderStatus): boolean {
  return ADJUSTABLE_STATUSES.includes(status)
}

/** Teslim edilmiş ve iptal edilmiş siparişler iptal edilemez. */
export function isCancellable(status: OrderStatus): boolean {
  return status !== 'DELIVERED' && status !== 'CANCELLED'
}

/** İade yalnız ödenmiş tutar bulunan siparişlerde yapılabilir. */
export function isRefundable(order: StaffOrder): boolean {
  return order.paidAmount > 0
}

export function openProblemCount(order: StaffOrder): number {
  return order.problems.filter((problem) => !problem.clearedAt).length
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return method === 'CASH' ? 'Nakit' : 'Kart'
}

export function paymentTypeLabel(type: PaymentRecord['paymentType']): string {
  return type === 'REFUND' ? 'İade' : 'Tahsilat'
}

/** Para tutarını düzenlenebilir metne çevirir (TL simgesi yok). */
export function toMoneyInput(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function parseAvailability(value: unknown): AdminProduct['availabilityStatus'] {
  if (value === 'CLOSED' || value === 'ARCHIVED') return value
  return 'ACTIVE'
}

/**
 * `staffAdminApi.adminProducts` yanıtını güvenli biçimde ürün seçeneklerine çevirir.
 * Beklenmeyen alanlar sessizce atlanır; ekran çökmez.
 */
export function parseProductOptions(value: unknown): ProductOption[] {
  if (!Array.isArray(value)) return []

  const options: ProductOption[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const { id, name, price } = record
    if (typeof id !== 'string' || id.length === 0) continue
    if (typeof name !== 'string' || name.length === 0) continue
    if (typeof price !== 'number' || !Number.isFinite(price)) continue

    options.push({
      id,
      name,
      categoryName: typeof record.categoryName === 'string' ? record.categoryName : 'Diğer',
      price,
      availability: parseAvailability(record.availabilityStatus),
    })
  }

  return options.sort((first, second) => first.name.localeCompare(second.name, 'tr'))
}
