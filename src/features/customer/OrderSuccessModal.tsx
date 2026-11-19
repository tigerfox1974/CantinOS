import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/Modal'
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/StatusBadge'
import { publicApi } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'
import { LIVE_INTERVAL_MS, usePolling } from '../../lib/polling'
import type { OnlineOrderResult, TrackingOrder } from '../../types/domain'
import type { OrderSnapshot } from './cart'
import { OrderTimeline } from './OrderTimeline'

interface SummaryItem {
  productName: string
  quantity: number
  lineNote: string | null
  unitPrice: number
}

interface OrderSuccessModalProps {
  open: boolean
  result: OnlineOrderResult
  snapshot: OrderSnapshot
  onClose: () => void
}

export function OrderSuccessModal({ open, result, snapshot, onClose }: OrderSuccessModalProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const trackingUrl = `${window.location.origin}${result.trackingPath}`

  const trackState = usePolling(() => publicApi.trackOrder(result.orderNumber, result.trackingToken), {
    intervalMs: LIVE_INTERVAL_MS,
    enabled: open,
  })

  const liveOrder: TrackingOrder | null =
    trackState.data && !trackState.data.expired ? trackState.data.order : null

  const lastOrderRef = useRef<TrackingOrder | null>(null)
  useEffect(() => {
    if (liveOrder) lastOrderRef.current = liveOrder
  }, [liveOrder])

  const order = liveOrder ?? lastOrderRef.current
  const summaryItems: SummaryItem[] = order ? order.items : snapshot.items
  const generalNote = order?.generalNote ?? snapshot.generalNote
  const status = order?.status ?? 'NEW'
  const paymentStatus = order?.paymentStatus ?? 'WAITING'

  async function handleCopy() {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard-unavailable')
      }
      await navigator.clipboard.writeText(trackingUrl)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopied(false)
      setCopyFailed(true)
    }
  }

  return (
    <Modal
      open={open}
      title="Siparişiniz alındı"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Link to={result.trackingPath} className="btn btn-outline-primary">
            Takip ekranını aç
          </Link>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      <div className="text-center mb-3">
        <div className="display-5 text-success" aria-hidden="true">
          ✓
        </div>
        <p className="mb-1">Siparişiniz başarıyla oluşturuldu.</p>
        <div className="h4 mb-0">
          Sipariş No: <span className="text-tabular">#{result.orderNumber}</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="form-label">Gizli takip bağlantınız</div>
        <div className="success-link-box">{trackingUrl}</div>
        <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => {
              void handleCopy()
            }}
          >
            {copied ? 'Kopyalandı' : 'Takip bağlantısını kopyala'}
          </button>
          {copyFailed ? (
            <span className="small text-danger">Otomatik kopyalama yapılamadı. Aşağıdaki metni seçip elle kopyalayın.</span>
          ) : null}
        </div>
        {copyFailed ? (
          <input
            readOnly
            className="form-control form-control-sm mt-2"
            value={trackingUrl}
            aria-label="Takip bağlantısı"
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        ) : null}
        <p className="form-text mb-0">
          Bu bağlantı gizlidir; siparişinizi takip etmek için saklayın. Müşteri takip bağlantısını kaybederse işletme
          desteğine başvurmalıdır.
        </p>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <OrderStatusBadge status={status} />
        <PaymentStatusBadge status={paymentStatus} />
        <span className="small text-body-secondary">
          Son güncelleme: {formatDateTime(order?.updatedAt ?? result.createdAt)}
        </span>
      </div>

      {status === 'CANCELLED' ? (
        <div className="alert alert-danger py-2 small mt-2" role="alert">
          Sipariş iptal edildi. Ayrıntılı bilgi için işletmeye başvurun.
        </div>
      ) : order ? (
        <OrderTimeline status={order.status} />
      ) : null}

      {trackState.error ? (
        <div className="small text-body-secondary mb-2">
          Canlı durum şu an güncellenemiyor; sipariş özetiniz aşağıda.
        </div>
      ) : null}

      <h3 className="h6 mt-3">Sipariş özeti</h3>
      <ul className="list-unstyled mb-2">
        {summaryItems.map((item, index) => (
          <li
            key={`${item.productName}-${index}`}
            className="d-flex justify-content-between gap-3 py-2 border-bottom"
          >
            <div>
              <div className="fw-semibold">{item.productName}</div>
              {item.lineNote ? <div className="small text-body-secondary">Not: {item.lineNote}</div> : null}
            </div>
            <div className="text-end">
              <div className="text-tabular">{item.quantity} adet</div>
              <div className="small text-body-secondary text-tabular">
                {formatMoney(item.unitPrice * item.quantity)}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {generalNote ? (
        <div className="small text-body-secondary mb-2">
          <span className="fw-semibold">Sipariş notu:</span> {generalNote}
        </div>
      ) : null}

      <div className="d-flex justify-content-between gap-3 small">
        <span className="text-body-secondary">Teslim</span>
        <span className="fw-semibold text-end">
          {order?.deliveryLabel ?? result.deliveryLabel}
          <br />
          <span className="text-tabular">
            {formatDateTime(order?.targetDeliveryAt ?? result.targetDeliveryAt)}
          </span>
        </span>
      </div>

      <div className="total-row mt-2 pt-2 border-top">
        <span>Toplam</span>
        <span className="amount text-tabular">{formatMoney(order?.totalAmount ?? result.totalAmount)}</span>
      </div>
    </Modal>
  )
}
