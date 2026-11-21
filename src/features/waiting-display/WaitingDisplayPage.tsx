import { useMemo } from 'react'
import { DynamicCookingIcon } from '../../components/DynamicCookingIcon'
import { SpinningCounter } from '../../components/SpinningCounter'
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
        <div className="d-flex align-items-center gap-3 gap-md-4">
          <img
            src="/CantinOS_anim.gif"
            alt="CantinOS"
            style={{
              height: '96px',
              width: 'auto',
              borderRadius: '14px',
              objectFit: 'contain',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            }}
          />
          <div>
            <h1 className="display-6 fw-bold mb-0 text-white">Siparişler</h1>
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
            <h2 className="waiting-column-title is-preparing-title">Hazırlanıyor</h2>
            {preparing.length === 0 ? (
              <p className="text-center small mb-0 py-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Bekleyen sipariş yok
              </p>
            ) : (
              <div className="waiting-numbers">
                {preparing.map((order) => (
                  <div key={order.orderNumber} className="waiting-number is-preparing">
                    <span>{order.orderNumber}</span>
                    <DynamicCookingIcon />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="waiting-column" aria-label="Hazır">
            <h2 className="waiting-column-title is-ready-title">Hazır</h2>
            {ready.length === 0 ? (
              <p className="text-center small mb-0 py-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Hazır sipariş yok
              </p>
            ) : (
              <div className="waiting-numbers">
                {ready.map((order) => (
                  <div key={order.orderNumber} className="waiting-number is-ready">
                    <SpinningCounter value={order.orderNumber} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
