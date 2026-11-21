import { useEffect, useMemo, useState } from 'react'
import { SpinningCounter } from '../../components/SpinningCounter'
import { ErrorAlert } from '../../components/Feedback'
import { publicApi } from '../../lib/api'
import { formatDate, formatTime, formatWeekday } from '../../lib/format'
import { useClock, usePolling } from '../../lib/polling'

function toTime(value: string): number {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function ReadyOrderCard({ orderNumber, index }: { orderNumber: number; index: number }) {
  const [shaking, setShaking] = useState(false)
  const [spinKey, setSpinKey] = useState(0)

  useEffect(() => {
    // Her kart için ayrık başlangıç fazı (böylece 15 saniyelik zamanlayıcıları farklı anlarda başlar)
    const initialDelay = 1500 + ((index * 3600) % 10000)
    let intervalId: number
    let shakeTimerId: number

    const trigger = () => {
      setShaking(true)
      setSpinKey((prev) => prev + 1)
      shakeTimerId = window.setTimeout(() => {
        setShaking(false)
      }, 2000)
    }

    const startTimer = window.setTimeout(() => {
      trigger()
      // Sabit 15 saniyede bir (15000ms) periyodik olarak tekrarlanır
      intervalId = window.setInterval(trigger, 10000)
    }, initialDelay)

    return () => {
      clearTimeout(startTimer)
      clearInterval(intervalId)
      clearTimeout(shakeTimerId)
    }
  }, [index, orderNumber])

  return (
    <div className={`waiting-number is-ready ${shaking ? 'is-shaking' : ''}`}>
      <SpinningCounter value={orderNumber} triggerKey={spinKey} />
    </div>
  )
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
        <div className="waiting-fullscreen-empty" role="status" aria-label="Şu an hazırlanan sipariş yok">
          <div className="waiting-pulse-avatar-wrap">
            <div className="waiting-pulse-ring ring-1" aria-hidden="true" />
            <div className="waiting-pulse-ring ring-2" aria-hidden="true" />
            <div className="waiting-pulse-ring ring-3" aria-hidden="true" />
            <div className="waiting-avatar-card">
              <img
                src="/CantinOS_anim.gif"
                alt="CantinOS"
                className="waiting-avatar-img"
              />
            </div>
          </div>

          <div className="waiting-fullscreen-info">
            <div className="waiting-live-badge">
              <span className="live-dot" aria-hidden="true" />
              <span>Canlı Sipariş Sistemi Aktif</span>
            </div>
            <h2 className="waiting-fullscreen-title">Şu an hazırlanan sipariş yok</h2>
            <p className="waiting-fullscreen-desc">
              Siparişler mutfakta hazırlanmaya başladığında numaralar burada anlık olarak görünecektir.
            </p>
            <div className="waiting-steps-flow" aria-label="Sipariş adımları">
              <div className="waiting-step-item">
                <span className="step-circle">1</span>
                <span>Menüden Seçin</span>
              </div>
              <span className="step-arrow" aria-hidden="true">→</span>
              <div className="waiting-step-item">
                <span className="step-circle">2</span>
                <span>Siparişi Verin</span>
              </div>
              <span className="step-arrow" aria-hidden="true">→</span>
              <div className="waiting-step-item">
                <span className="step-circle">3</span>
                <span>Ekrandan Takip Edin</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="waiting-grid">
          <section className="waiting-column" aria-label="Hazırlanıyor">
            <h2 className="waiting-column-title is-preparing-title">Hazırlanıyor</h2>
            {preparing.length === 0 ? (
              <div className="waiting-empty-column-card is-preparing-empty" role="status" aria-label="Bekleyen sipariş yok">
                <div className="empty-icon-halo is-preparing-halo">
                  <svg
                    className="empty-column-svg"
                    viewBox="0 0 64 64"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path className="steam-line steam-1" d="M26 12c-1.5 2-1.5 4 0 6s1.5 4 0 6" />
                    <path className="steam-line steam-2" d="M32 9c-1.5 2-1.5 4 0 6s1.5 4 0 6" />
                    <path className="steam-line steam-3" d="M38 12c-1.5 2-1.5 4 0 6s1.5 4 0 6" />
                    <circle cx="32" cy="27" r="3" fill="currentColor" />
                    <path d="M14 46c0-9.94 8.06-18 18-18s18 8.06 18 18H14z" />
                    <line x1="10" y1="50" x2="54" y2="50" strokeWidth="3" />
                  </svg>
                </div>
                <div className="empty-column-title">Bekleyen sipariş yok</div>
                <div className="empty-column-sub">Yeni siparişler mutfağa ulaştığında burada sıralanır.</div>
                <div className="empty-column-tag is-preparing-tag">
                  <span className="empty-mini-dot is-amber" aria-hidden="true" />
                  <span>Mutfak Hazır</span>
                </div>
              </div>
            ) : (
              <div className="waiting-numbers">
                {preparing.map((order) => (
                  <div key={order.orderNumber} className="waiting-number is-preparing">
                    <div className="preparing-card-inner">
                      <span className="order-num-shine">{order.orderNumber}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="waiting-column" aria-label="Hazır">
            <h2 className="waiting-column-title is-ready-title">Hazır</h2>
            {ready.length === 0 ? (
              <div className="waiting-empty-column-card is-ready-empty" role="status" aria-label="Hazır sipariş yok">
                <div className="empty-icon-halo is-ready-halo">
                  <svg
                    className="empty-column-svg"
                    viewBox="0 0 64 64"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="32" cy="18" r="3" fill="currentColor" />
                    <line x1="32" y1="21" x2="32" y2="25" strokeWidth="3" />
                    <path d="M16 46c0-8.84 7.16-16 16-16s16 7.16 16 16H16z" />
                    <line x1="12" y1="50" x2="52" y2="50" strokeWidth="3" />
                    <path className="bell-wave wave-1" d="M12 28a24 24 0 0 0-4 12" />
                    <path className="bell-wave wave-2" d="M52 28a24 24 0 0 1 4 12" />
                  </svg>
                </div>
                <div className="empty-column-title">Hazır sipariş yok</div>
                <div className="empty-column-sub">Hazırlanan siparişler tamamlandığında burada duyurulur.</div>
                <div className="empty-column-tag is-ready-tag">
                  <span className="empty-mini-dot is-green" aria-hidden="true" />
                  <span>Teslimat Bekleniyor</span>
                </div>
              </div>
            ) : (
              <div className="waiting-numbers">
                {ready.map((order, index) => (
                  <ReadyOrderCard
                    key={order.orderNumber}
                    orderNumber={order.orderNumber}
                    index={index}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
