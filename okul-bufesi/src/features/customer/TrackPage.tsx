import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorAlert, LoadingBlock } from '../../components/Feedback'
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/StatusBadge'
import { publicApi } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'
import { LIVE_INTERVAL_MS, usePolling } from '../../lib/polling'
import type { OrderStatus, TrackResult, TrackingOrder } from '../../types/domain'
import { OrderTimeline } from './OrderTimeline'

const STATUS_MESSAGES: Record<OrderStatus, string> = {
  NEW: 'Siparişiniz alındı. Mutfak en kısa sürede hazırlamaya başlayacak.',
  PREPARING: 'Siparişiniz hazırlanıyor.',
  READY: 'Siparişiniz hazır. Teslim noktasından alabilirsiniz.',
  DELIVERED: 'Siparişiniz teslim edildi. Afiyet olsun!',
  CANCELLED: 'Bu sipariş iptal edilmiştir.',
}

function TrackNotice({ title, description }: { title: string; description?: string }) {
  return (
    <div className="surface-card p-4 text-center">
      <div className="display-6 mb-2" aria-hidden="true">
        🔎
      </div>
      <h1 className="h5">{title}</h1>
      {description ? <p className="text-body-secondary mb-3">{description}</p> : null}
      <Link to="/" className="btn btn-primary">
        Menüye dön
      </Link>
    </div>
  )
}

function TrackOrderCard({ order }: { order: TrackingOrder }) {
  const cancelled = order.status === 'CANCELLED'

  return (
    <div className="surface-card p-4">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          <div className="small text-body-secondary">Sipariş numarası</div>
          <div className="h3 mb-0 text-tabular">#{order.orderNumber}</div>
        </div>
        <div className="text-end">
          <OrderStatusBadge status={order.status} />
          <div className="mt-1">
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>
      </div>

      {cancelled ? (
        <div className="alert alert-danger mt-3 mb-0" role="alert">
          <strong>Bu sipariş iptal edilmiştir.</strong> Ayrıntılı bilgi için işletmeye başvurun.
        </div>
      ) : (
        <>
          <p className="text-body-secondary mt-3 mb-0">{STATUS_MESSAGES[order.status]}</p>
          <OrderTimeline status={order.status} />
        </>
      )}

      <div className="row g-3 mt-1">
        <div className="col-sm-7">
          <div className="small text-body-secondary">Teslim zamanı</div>
          <div className="fw-semibold">{order.deliveryLabel}</div>
          <div className="text-tabular">{formatDateTime(order.targetDeliveryAt)}</div>
        </div>
        <div className="col-sm-5 text-sm-end">
          <div className="small text-body-secondary">Toplam</div>
          <div className="h4 mb-0 text-tabular">{formatMoney(order.totalAmount)}</div>
        </div>
      </div>

      <hr />

      <h2 className="h6">Sipariş içeriği</h2>
      {order.items.length === 0 ? (
        <p className="text-body-secondary small mb-0">Sipariş içeriği görüntülenemiyor.</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {order.items.map((item, index) => (
            <li
              key={`${item.productName}-${index}`}
              className="d-flex justify-content-between gap-3 py-2 border-bottom"
            >
              <div>
                <div className="fw-semibold">{item.productName}</div>
                {item.lineNote ? <div className="small text-body-secondary">Not: {item.lineNote}</div> : null}
              </div>
              <div className="text-tabular fw-semibold">{item.quantity} adet</div>
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex flex-wrap justify-content-between gap-2 small text-body-secondary mt-3">
        <span>Son güncelleme</span>
        <span className="text-tabular">{formatDateTime(order.updatedAt)}</span>
      </div>
    </div>
  )
}

export function TrackPage() {
  const { siparisNo, trackingToken } = useParams<{ siparisNo: string; trackingToken: string }>()

  const rawNumber = siparisNo ?? ''
  const token = (trackingToken ?? '').trim()
  const orderNumber = Number(rawNumber)
  const paramsValid = /^\d+$/.test(rawNumber) && orderNumber > 0 && token.length >= 16

  const state = usePolling<TrackResult | null>(() => publicApi.trackOrder(orderNumber, token), {
    intervalMs: LIVE_INTERVAL_MS,
    enabled: paramsValid,
  })

  let content: ReactNode
  if (!paramsValid) {
    content = (
      <TrackNotice
        title="Bu takip bağlantısı geçersiz."
        description="Bağlantı eksik veya hatalı görünüyor. İşletmeden aldığınız bağlantıyı kontrol edin."
      />
    )
  } else if (state.loading && state.data === null) {
    content = <LoadingBlock label="Sipariş durumu yükleniyor…" />
  } else if (state.data === null) {
    content = state.error ? (
      <ErrorAlert
        message={state.error}
        onRetry={() => {
          void state.refresh()
        }}
      />
    ) : (
      <TrackNotice
        title="Bu takip bağlantısı geçersiz."
        description="Bağlantı eksik veya hatalı görünüyor. İşletmeden aldığınız bağlantıyı kontrol edin."
      />
    )
  } else if (state.data.expired) {
    content = (
      <TrackNotice
        title="Bu takip bağlantısının süresi dolmuştur."
        description="Güncel sipariş bilgisi için işletmeye başvurun."
      />
    )
  } else if (!state.data.order) {
    content = (
      <TrackNotice
        title="Bu takip bağlantısı geçersiz."
        description="Bağlantı eksik veya hatalı görünüyor. İşletmeden aldığınız bağlantıyı kontrol edin."
      />
    )
  } else {
    content = <TrackOrderCard order={state.data.order} />
  }

  const inlineError = state.error && state.data ? state.error : null

  return (
    <div className="customer-page" style={{ maxWidth: 760 }}>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-3">
        <Link to="/" className="d-flex align-items-center gap-2 text-reset">
          <span className="fs-4" aria-hidden="true">
            🍽️
          </span>
          <span className="fw-semibold">Okul Büfesi</span>
        </Link>
        <span className="live-indicator">
          <span className="live-dot" aria-hidden="true" />
          Canlı takip
        </span>
      </div>

      {inlineError ? (
        <ErrorAlert
          message={inlineError}
          onRetry={() => {
            void state.refresh()
          }}
        />
      ) : null}

      {content}

      <p className="text-center text-body-secondary small mt-4 mb-0">
        Bu sayfa 2,5 saniyede bir sessizce güncellenir. Sipariş bilgileriniz yalnızca bu gizli bağlantı ile
        görüntülenir.
      </p>
    </div>
  )
}
