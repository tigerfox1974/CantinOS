import type {
  AvailabilityStatus,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  ProblemType,
} from '../types/domain'

const ORDER_LABELS: Record<OrderStatus, string> = {
  NEW: 'Yeni',
  PREPARING: 'Hazırlanıyor',
  READY: 'Hazır',
  DELIVERED: 'Teslim edildi',
  CANCELLED: 'İptal',
}

const ORDER_CLASSES: Record<OrderStatus, string> = {
  NEW: 'text-bg-info',
  PREPARING: 'text-bg-warning',
  READY: 'text-bg-success',
  DELIVERED: 'text-bg-secondary',
  CANCELLED: 'text-bg-danger',
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  WAITING: 'Ödeme bekliyor',
  PAID: 'Ödendi',
  REFUND_PENDING: 'İade bekliyor',
  REFUNDED: 'İade edildi',
}

const PAYMENT_CLASSES: Record<PaymentStatus, string> = {
  WAITING: 'text-bg-warning',
  PAID: 'text-bg-success',
  REFUND_PENDING: 'text-bg-danger',
  REFUNDED: 'text-bg-secondary',
}

const SOURCE_LABELS: Record<OrderSource, string> = {
  ONLINE: 'Online',
  CASHIER: 'Kasadan',
}

const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  ACTIVE: 'Satışta',
  CLOSED: 'Geçici kapalı',
  ARCHIVED: 'Arşivde',
}

export const PROBLEM_LABELS: Record<ProblemType, string> = {
  OUT_OF_STOCK: 'Ürün tükendi',
  MISSING_INGREDIENT: 'Malzeme / ekmek eksik',
  NOTE_UNCLEAR: 'Sipariş notu anlaşılmadı',
  EQUIPMENT_BUSY: 'Ocak / ekipman yoğunluğu',
  WONT_MAKE_BREAK: 'Teneffüse yetişmeyecek',
  OTHER: 'Diğer',
}

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_LABELS[status] ?? status
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${ORDER_CLASSES[status] ?? 'text-bg-secondary'}`}>{orderStatusLabel(status)}</span>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={`badge ${PAYMENT_CLASSES[status] ?? 'text-bg-secondary'}`}>{PAYMENT_LABELS[status] ?? status}</span>
}

export function SourceBadge({ source }: { source: OrderSource }) {
  return (
    <span className={`badge ${source === 'ONLINE' ? 'text-bg-primary' : 'text-bg-dark'}`}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  const cls = status === 'ACTIVE' ? 'text-bg-success' : status === 'CLOSED' ? 'text-bg-warning' : 'text-bg-secondary'
  return <span className={`badge ${cls}`}>{AVAILABILITY_LABELS[status] ?? status}</span>
}

export function problemLabel(type: ProblemType): string {
  return PROBLEM_LABELS[type] ?? type
}
