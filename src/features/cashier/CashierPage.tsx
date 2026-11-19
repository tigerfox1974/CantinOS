import { useState } from 'react'
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
        title="Kasa"
        subtitle={
          <span className="d-inline-flex flex-wrap align-items-center gap-2">
            <span>Kasiyer: {session?.staff.displayName ?? '—'}</span>
            <span className="live-indicator">
              <span className="live-dot" aria-hidden="true" />
              Canlı · {formatTime(ordersPoll.lastUpdatedAt)}
            </span>
          </span>
        }
        actions={
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => {
              void menuPoll.refresh()
              void ordersPoll.refresh()
            }}
          >
            Yenile
          </button>
        }
      />

      {menuPoll.error ? (
        <ErrorAlert message={menuPoll.error} onRetry={() => void menuPoll.refresh()} />
      ) : null}

      {ordersPoll.error ? (
        <ErrorAlert message={ordersPoll.error} onRetry={() => void ordersPoll.refresh()} />
      ) : null}

      <div className="cashier-grid">
        <NewOrderPanel
          token={token}
          menu={menuPoll.data}
          loading={menuPoll.loading}
          onCreated={handleCreated}
        />
        <ReadyOrdersPanel
          token={token}
          orders={ordersPoll.data ?? []}
          loading={ordersPoll.loading}
          onChanged={ordersPoll.refresh}
        />
      </div>

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
