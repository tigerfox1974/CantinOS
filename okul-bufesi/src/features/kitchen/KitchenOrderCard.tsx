import { memo } from 'react'
import { SourceBadge } from '../../components/StatusBadge'
import { formatDuration, formatTime } from '../../lib/format'
import type { StaffOrder } from '../../types/domain'
import { kitchenUrgency, type KitchenThresholds } from './kitchen-utils'

interface KitchenOrderCardProps {
  order: StaffOrder
  elapsedMinutes: number
  thresholds: KitchenThresholds
  busy: boolean
  onStart: (orderId: string) => void
  onReady: (orderId: string) => void
  onRevert: (orderId: string, orderNumber: number) => void
  onReportProblem: (orderId: string, orderNumber: number) => void
}

function KitchenOrderCardBase({
  order,
  elapsedMinutes,
  thresholds,
  busy,
  onStart,
  onReady,
  onRevert,
  onReportProblem,
}: KitchenOrderCardProps) {
  const urgency = order.status === 'READY' ? 'normal' : kitchenUrgency(elapsedMinutes, thresholds)

  const cardClassName = [
    'order-card',
    urgency === 'late' ? 'is-late' : '',
    urgency === 'attention' ? 'is-attention' : '',
    order.status === 'READY' ? 'is-ready' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const spinner = busy ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" /> : null

  return (
    <article className={cardClassName} aria-label={`Sipariş ${order.orderNumber}`}>
      <div className="order-card-head">
        <div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="order-number">#{order.orderNumber}</span>
            <SourceBadge source={order.source} />
          </div>
          <div className="order-meta mt-1">
            <span>{order.deliveryLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="text-tabular">{formatTime(order.targetDeliveryAt)}</span>
          </div>
        </div>
        <div className="text-end">
          <div className="elapsed" title="Siparişin oluşturulmasından bu yana geçen süre">
            {formatDuration(elapsedMinutes)}
          </div>
          {urgency === 'late' ? <span className="badge text-bg-danger mt-1">Gecikiyor</span> : null}
          {urgency === 'attention' ? <span className="badge text-bg-warning mt-1">Dikkat</span> : null}
        </div>
      </div>

      {order.priorityOverride ? (
        <div className="mb-2 d-flex flex-wrap align-items-center gap-2">
          <span className="badge text-bg-danger">Öncelikli</span>
          {order.priorityOverrideReason ? (
            <span className="small text-body-secondary">{order.priorityOverrideReason}</span>
          ) : null}
        </div>
      ) : null}

      <ul className="order-items">
        {order.items.map((item, index) => (
          <li key={`${item.productId}-${index}`}>
            <span className="fw-semibold text-tabular">{item.quantity}×</span> {item.productName}
            {item.lineNote ? <span className="line-note">Not: {item.lineNote}</span> : null}
          </li>
        ))}
      </ul>

      {order.generalNote ? (
        <div className="order-general-note">
          <strong>Sipariş notu:</strong> {order.generalNote}
        </div>
      ) : null}

      <div className="order-actions">
        {order.status === 'NEW' ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy}
            onClick={() => onStart(order.id)}
          >
            {spinner}
            Hazırlamaya Başla
          </button>
        ) : null}

        {order.status === 'PREPARING' ? (
          <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => onReady(order.id)}>
            {spinner}
            Hazır
          </button>
        ) : null}

        {order.status === 'READY' ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy}
            onClick={() => onRevert(order.id, order.orderNumber)}
          >
            {spinner}
            Geri Al
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-sm btn-outline-warning"
          disabled={busy}
          onClick={() => onReportProblem(order.id, order.orderNumber)}
        >
          Sorun Bildir
        </button>
      </div>
    </article>
  )
}

export const KitchenOrderCard = memo(KitchenOrderCardBase)
