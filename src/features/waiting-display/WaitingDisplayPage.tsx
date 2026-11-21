import { useMemo } from 'react'
import { AnimatedCounter } from '../../components/AnimatedCounter'
import { ErrorAlert } from '../../components/Feedback'
import { publicApi } from '../../lib/api'
import { formatDate, formatTime, formatWeekday } from '../../lib/format'
import { useClock, usePolling } from '../../lib/polling'

function toTime(value: string): number {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

export function WaitingDisplayPage() {
  const { data, error, loading, refresh, lastUpdatedAt } = usePolling(() => publicApi.displayOrders())
  const now = useClock(1000)

  const orders = useMemo(() => data ?? [], [data])

  const preparing = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'PREPARING')
        .sort((a, b) => a.orderNumber - b.orderNumber),
    [orders],
  )

  const ready = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'READY')
        .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt)),
    [orders],
  )

  const total = preparing.length + ready.length

  return (
    <div className="waiting-screen">
      <header className="waiting-header">
        <div className="d-flex align-items-center gap-3">
          <img
            src="/CantinOS_anim.gif"
            alt="CantinOS"
            style={{ height: '52px', width: 'auto', borderRadius: '8px', objectFit: 'contain' }}
          />
          <div>
            <p className="text-uppercase small mb-0" style={{ letterSpacing: '0.18em', color: 'rgba(255,255,255,0.6)' }}>
              CantinOS
            </p>
            <h1 className="h2 fw-bold mb-0">Sipariş Ekranı</h1>
          </div>
        </div>
        <div className="text-end">
          <div className="display-4 fw-bold text-tabular lh-1">{formatTime(now)}</div>
          <div className="mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {formatDate(now)} · {formatWeekday(now)}
          </div>
        </div>
      </header>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <span className="live-indicator" style={{ color: 'rgba(255,255,255,0.75)' }}>
          <span className="live-dot" aria-hidden="true" />
          Canlı
        </span>
        <span className="small" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Son güncelleme: {lastUpdatedAt ? formatTime(lastUpdatedAt) : '—'}
        </span>
      </div>

      {error ? (
        <ErrorAlert
          message={error}
          onRetry={() => {
            void refresh()
          }}
        />
      ) : null}

      {loading && !data ? (
        <div className="text-center py-5" style={{ color: 'rgba(255,255,255,0.75)' }}>
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Siparişler yükleniyor…
        </div>
      ) : !data ? null : total === 0 ? (
        <div className="text-center py-5">
          <p className="display-6 fw-bold mb-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Şu an hazırlanan sipariş yok
          </p>
          <p className="mb-0" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Siparişler hazırlanmaya başladığında numaralar burada görünür.
          </p>
        </div>
      ) : (
        <div className="waiting-grid">
          <section className="waiting-column" aria-label="Hazırlanıyor">
            <h2>Hazırlanıyor</h2>
            {preparing.length === 0 ? (
              <p className="small mb-0" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Bekleyen sipariş yok
              </p>
            ) : (
              <div className="waiting-numbers">
                {preparing.map((order) => (
                  <div key={order.orderNumber} className="waiting-number is-preparing">
                    {order.orderNumber}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="waiting-column" aria-label="Hazır">
            <h2>Hazır</h2>
            {ready.length === 0 ? (
              <p className="small mb-0" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Hazır sipariş yok
              </p>
            ) : (
              <div className="waiting-numbers">
                {ready.map((order) => (
                  <div key={order.orderNumber} className="waiting-number is-ready">
                    <AnimatedCounter value={order.orderNumber} duration={0.9} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <p className="text-center mt-5 mb-0" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Numaranız “Hazır” bölümünde göründüğünde siparişinizi teslim alabilirsiniz.
      </p>
    </div>
  )
}
