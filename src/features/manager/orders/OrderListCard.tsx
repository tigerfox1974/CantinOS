import {
  OrderStatusBadge,
  PaymentStatusBadge,
  SourceBadge,
} from '../../../components/StatusBadge'
import { formatDateTime, formatMoney } from '../../../lib/format'
import type { StaffOrder } from '../../../types/domain'
import {
  isAdjustable,
  isCancellable,
  isRefundable,
  openProblemCount,
} from './orderUtils'

interface OrderListCardProps {
  order: StaffOrder
  onOpenDetail: () => void
  onTogglePriority: () => void
  onAdjust: () => void
  onCancel: () => void
  onRefund: () => void
}

export function OrderListCard({
  order,
  onOpenDetail,
  onTogglePriority,
  onAdjust,
  onCancel,
  onRefund,
}: OrderListCardProps) {
  const problemCount = openProblemCount(order)
  const adjustDisabled = !isAdjustable(order.status)
  const cancelDisabled = !isCancellable(order.status)
  const refundDisabled = !isRefundable(order)

  return (
    <article className={`surface-card p-3${order.priorityOverride ? ' border-warning' : ''}`}>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fw-bold fs-5 text-tabular">#{order.orderNumber}</span>
          <SourceBadge source={order.source} />
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
          {order.priorityOverride ? <span className="badge text-bg-warning">Öncelikli</span> : null}
          {problemCount > 0 ? (
            <span className="badge text-bg-danger">{problemCount} açık sorun</span>
          ) : null}
        </div>
        <span className="small text-body-secondary text-tabular">{formatDateTime(order.createdAt)}</span>
      </div>

      <div className="row g-2 mt-1 small">
        <div className="col-12 col-lg-7">
          <div className="d-flex flex-wrap gap-1">
            <span className="text-body-secondary">Müşteri:</span>
            <span className="fw-semibold">{order.customerName ?? '—'}</span>
            {order.customerPhone ? <span className="text-body-secondary">· {order.customerPhone}</span> : null}
          </div>
          <div className="d-flex flex-wrap gap-1">
            <span className="text-body-secondary">Teslim:</span>
            <span>{order.deliveryLabel}</span>
            <span className="text-body-secondary">· {formatDateTime(order.targetDeliveryAt)}</span>
          </div>
        </div>
        <div className="col-12 col-lg-5">
          <div className="d-flex flex-wrap justify-content-lg-end gap-3">
            <span>
              Toplam <strong className="text-tabular">{formatMoney(order.totalAmount)}</strong>
            </span>
            <span>
              Ödenen <strong className="text-tabular">{formatMoney(order.paidAmount)}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mt-3">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onOpenDetail}>
          Detay
        </button>
        <button type="button" className="btn btn-sm btn-outline-warning" onClick={onTogglePriority}>
          {order.priorityOverride ? 'Önceliği kaldır' : 'Öncelik ver'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={onAdjust}
          disabled={adjustDisabled}
          title={
            adjustDisabled
              ? 'Yalnız yeni, hazırlanıyor veya hazır siparişler düzeltilebilir.'
              : 'Ürün ve tutar düzeltmesi yap'
          }
        >
          Düzelt
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={onCancel}
          disabled={cancelDisabled}
          title={cancelDisabled ? 'Teslim edilmiş veya iptal edilmiş sipariş iptal edilemez.' : 'Siparişi iptal et'}
        >
          İptal
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-dark"
          onClick={onRefund}
          disabled={refundDisabled}
          title={refundDisabled ? 'İade için ödenmiş tutar bulunmalıdır.' : 'İade kaydı oluştur'}
        >
          İade
        </button>
      </div>
    </article>
  )
}
