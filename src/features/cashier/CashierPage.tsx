import { useMemo, useState } from 'react'
import { ErrorAlert, PageHeader } from '../../components/Feedback'
import { publicApi, staffOrderApi } from '../../lib/api'
import { formatTime } from '../../lib/format'
import { usePolling } from '../../lib/polling'
import type { CashierOrderResult } from '../../types/domain'
import { useAuth } from '../staff-auth/AuthProvider'
import { NewOrderPanel } from './NewOrderPanel'
import { ReadyOrdersPanel } from './ReadyOrdersPanel'
import { Receipt } from './Receipt'
import { ReceiptModal } from './ReceiptModal'
import type { ReceiptSize } from './cashier-utils'

export function CashierPage() {
  const { session } = useAuth()
  const token = session?.token ?? ''

  const menuPoll = usePolling(() => publicApi.getMenu(), { enabled: token.length > 0 })
  const ordersPoll = usePolling(() => staffOrderApi.list(token), { enabled: token.length > 0 })

  const [receipt, setReceipt] = useState<CashierOrderResult | null>(null)
  const [receiptSize, setReceiptSize] = useState<ReceiptSize>('80')
  const [deliveryDrawerOpen, setDeliveryDrawerOpen] = useState(false)

  const orders = useMemo(() => ordersPoll.data ?? [], [ordersPoll.data])
  const readyCount = useMemo(() => orders.filter((o) => o.status === 'READY').length, [orders])
  const preparingCount = useMemo(() => orders.filter((o) => o.status === 'PREPARING').length, [orders])

  function handleCreated(result: CashierOrderResult) {
    setReceipt(result)
  }

  function closeReceipt() {
    setReceipt(null)
  }

  if (!token) {
    return <ErrorAlert message="Oturum bulunamadı. Lütfen yeniden giriş yapın." />
  }

  return (
    <>
      <PageHeader
        title="Kasa (POS)"
        subtitle={
          <span className="d-inline-flex flex-wrap align-items-center gap-2">
            <span>Kasiyer: <strong>{session?.staff.displayName ?? '—'}</strong></span>
            <span className="live-indicator">
              <span className="live-dot" aria-hidden="true" />
              Canlı · {formatTime(ordersPoll.lastUpdatedAt)}
            </span>
          </span>
        }
        actions={
          <div className="d-flex align-items-center gap-2">
            {/* Teslimat İstasyonu Çekmece Butonu (Hazır sipariş olunca yeşil nabız atar) */}
            <button
              type="button"
              className={`btn ${
                readyCount > 0 ? 'btn-success cashier-delivery-alert-btn' : 'btn-outline-secondary'
              } d-inline-flex align-items-center gap-2`}
              onClick={() => setDeliveryDrawerOpen(true)}
              aria-label={`Teslimat İstasyonu (${readyCount} hazır, ${preparingCount} hazırlanıyor)`}
            >
              <span aria-hidden="true">🔔</span>
              <span className="fw-semibold">Teslimatlar</span>
              <span
                className={`badge rounded-pill ${
                  readyCount > 0 ? 'text-bg-light text-success fw-bold' : 'text-bg-secondary'
                }`}
              >
                {readyCount}
              </span>
            </button>

            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => {
                void menuPoll.refresh()
                void ordersPoll.refresh()
              }}
              title="Menü ve siparişleri yenile"
            >
              Yenile
            </button>
          </div>
        }
      />

      {menuPoll.error ? (
        <ErrorAlert message={menuPoll.error} onRetry={() => void menuPoll.refresh()} />
      ) : null}

      {ordersPoll.error ? (
        <ErrorAlert message={ordersPoll.error} onRetry={() => void ordersPoll.refresh()} />
      ) : null}

      {/* 2 SÜTUNLU KASA DÜZENİ: Sol Menü (%68) + Sağ Canlı Sepet/Ödeme (%32) */}
      <div className="cashier-layout-wrapper pb-3">
        <NewOrderPanel
          token={token}
          menu={menuPoll.data}
          loading={menuPoll.loading}
          onCreated={handleCreated}
        />
      </div>

      {/* SAĞDAN KAYAN TESLİMAT ÇEKMECESİ (Slide-Over Drawer - 520px) */}
      {deliveryDrawerOpen ? (
        <div
          className="cart-drawer-backdrop"
          onClick={() => setDeliveryDrawerOpen(false)}
        >
          <div
            className="cart-drawer-panel"
            style={{ width: '540px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cart-drawer-header">
              <div className="d-flex align-items-center gap-2">
                <span style={{ fontSize: '1.4rem' }}>🔔</span>
                <h3 className="h5 mb-0 fw-bold">Teslimat İstasyonu</h3>
                {readyCount > 0 ? (
                  <span className="badge text-bg-success">{readyCount} Hazır</span>
                ) : (
                  <span className="badge text-bg-secondary">{orders.length} Sipariş</span>
                )}
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setDeliveryDrawerOpen(false)}
                aria-label="Kapat"
              />
            </div>
            <div className="cart-drawer-body">
              <ReadyOrdersPanel
                token={token}
                orders={orders}
                loading={ordersPoll.loading}
                cashierName={session?.staff.displayName ?? 'Kasiyer'}
                onChanged={ordersPoll.refresh}
                onShowReceipt={setReceipt}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Fiş Yazdırma Alanı & Fiş Modal */}
      <div className="print-area">
        {receipt ? <Receipt receipt={receipt} size={receiptSize} /> : null}
      </div>

      <ReceiptModal
        open={receipt !== null}
        receipt={receipt}
        size={receiptSize}
        onSizeChange={setReceiptSize}
        onClose={closeReceipt}
      />
    </>
  )
}
