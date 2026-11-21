import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../../components/Dialogs'
import { EmptyState, ErrorAlert, LoadingBlock } from '../../components/Feedback'
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  SourceBadge,
  problemLabel,
} from '../../components/StatusBadge'
import { staffOrderApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { formatDateTime, formatMoney, parseMoneyInput } from '../../lib/format'
import type { CashierOrderResult, OrderProblem, StaffOrder } from '../../types/domain'
import {
  buildOrderReceipt,
  calculateChange,
  canDeliver,
  isCashSufficient,
  openProblems,
  remainingAmount,
} from './cashier-utils'

interface ReadyOrdersPanelProps {
  token: string
  orders: StaffOrder[]
  loading?: boolean
  cashierName?: string
  onChanged: () => Promise<void>
  onShowReceipt: (receipt: CashierOrderResult) => void
}

type TabFilter = 'ALL' | 'READY' | 'PREPARING'

export function ReadyOrdersPanel({
  token,
  orders,
  loading = false,
  cashierName = 'Kasiyer',
  onChanged,
  onShowReceipt,
}: ReadyOrdersPanelProps) {
  const [tabFilter, setTabFilter] = useState<TabFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [cashOrder, setCashOrder] = useState<StaffOrder | null>(null)
  const [cashReceived, setCashReceived] = useState('')
  const [deliverOrder, setDeliverOrder] = useState<StaffOrder | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const busy = busyKey !== null
  const cashRemaining = cashOrder ? remainingAmount(cashOrder) : 0
  const cashReceivedValue = parseMoneyInput(cashReceived)
  const cashChange = calculateChange(cashReceivedValue, cashRemaining)
  const cashInsufficient = cashOrder !== null && !isCashSufficient(cashReceivedValue, cashRemaining)

  const readyCount = useMemo(() => orders.filter((o) => o.status === 'READY').length, [orders])
  const preparingCount = useMemo(() => orders.filter((o) => o.status === 'PREPARING').length, [orders])

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (tabFilter === 'READY' && order.status !== 'READY') return false
      if (tabFilter === 'PREPARING' && order.status !== 'PREPARING') return false

      if (searchQuery.trim().length > 0) {
        const query = searchQuery.trim().toLocaleLowerCase('tr-TR')
        const matchNum = order.orderNumber.toString().includes(query)
        const matchName = order.customerName
          ? order.customerName.toLocaleLowerCase('tr-TR').includes(query)
          : false
        return matchNum || matchName
      }

      return true
    })
  }, [orders, tabFilter, searchQuery])

  function openCashDialog(order: StaffOrder) {
    setError(null)
    setCashReceived(remainingAmount(order).toFixed(2))
    setCashOrder(order)
  }

  function closeCashDialog() {
    if (busy) return
    setCashOrder(null)
    setCashReceived('')
  }

  async function takeCashPayment() {
    if (!cashOrder || busy) return
    if (cashInsufficient) {
      setError('Alınan para kalan tutardan düşük olamaz.')
      return
    }

    setBusyKey(`cash-${cashOrder.id}`)
    setError(null)
    const targetOrder = cashOrder
    const received = cashReceivedValue
    const change = cashChange
    try {
      await staffOrderApi.takePayment(token, targetOrder.id, 'CASH', received)
      setCashOrder(null)
      setCashReceived('')
      await onChanged()
      // Ödeme alındığında fiş ekranını aç
      onShowReceipt(
        buildOrderReceipt(targetOrder, cashierName, {
          method: 'CASH',
          receivedAmount: received,
          changeAmount: change,
        }),
      )
    } catch (cause) {
      setError(toUserMessage(cause))
      setCashOrder(null)
    } finally {
      setBusyKey(null)
    }
  }

  async function takeCardPayment(order: StaffOrder) {
    if (busy) return
    setBusyKey(`card-${order.id}`)
    setError(null)
    try {
      await staffOrderApi.takePayment(token, order.id, 'CARD', remainingAmount(order))
      await onChanged()
      // Ödeme alındığında fiş ekranını aç
      onShowReceipt(
        buildOrderReceipt(order, cashierName, {
          method: 'CARD',
          receivedAmount: remainingAmount(order),
          changeAmount: 0,
        }),
      )
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setBusyKey(null)
    }
  }

  async function confirmDelivered() {
    if (!deliverOrder || busy) return
    setBusyKey(`deliver-${deliverOrder.id}`)
    setError(null)
    const targetOrder = deliverOrder
    try {
      await staffOrderApi.setStatus(token, targetOrder.id, 'DELIVERED')
      const receipt = buildOrderReceipt(targetOrder, cashierName)
      setDeliverOrder(null)
      await onChanged()
      // Teslim edilen her siparişte fiş ekranını otomatik aç
      onShowReceipt(receipt)
    } catch (cause) {
      setError(toUserMessage(cause))
      setDeliverOrder(null)
    } finally {
      setBusyKey(null)
    }
  }

  async function markInformed(problem: OrderProblem) {
    if (busy) return
    setBusyKey(`informed-${problem.id}`)
    setError(null)
    try {
      await staffOrderApi.markInformed(token, problem.id)
      await onChanged()
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setBusyKey(null)
    }
  }

  async function clearProblem(problem: OrderProblem) {
    if (busy) return
    setBusyKey(`clear-${problem.id}`)
    setError(null)
    try {
      await staffOrderApi.clearProblem(token, problem.id)
      await onChanged()
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section className="ready-orders-station surface-card p-3" aria-labelledby="ready-orders-heading">
      {/* Başlık ve Sayaç */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2 pb-2 border-bottom">
        <h2 id="ready-orders-heading" className="h5 mb-0 d-flex align-items-center gap-2">
          <span>Hazır / Teslim Bekleyenler</span>
          <span className="badge text-bg-secondary">{orders.length}</span>
        </h2>
      </div>

      {/* Canlı Filtre Sekmeleri: Tümü, Hazır, Hazırlanıyor */}
      <div className="d-flex flex-wrap gap-1 mb-2" role="tablist" aria-label="Sipariş durumu filtreleri">
        <button
          type="button"
          role="tab"
          className={`btn btn-sm ${tabFilter === 'ALL' ? 'btn-primary' : 'btn-outline-secondary'}`}
          aria-selected={tabFilter === 'ALL'}
          onClick={() => setTabFilter('ALL')}
        >
          Tümü ({orders.length})
        </button>
        <button
          type="button"
          role="tab"
          className={`btn btn-sm ${
            tabFilter === 'READY'
              ? 'btn-success fw-bold'
              : readyCount > 0
              ? 'btn-outline-success fw-semibold'
              : 'btn-outline-secondary'
          }`}
          aria-selected={tabFilter === 'READY'}
          onClick={() => setTabFilter('READY')}
        >
          🟢 Hazır ({readyCount})
        </button>
        <button
          type="button"
          role="tab"
          className={`btn btn-sm ${
            tabFilter === 'PREPARING'
              ? 'btn-warning fw-bold text-dark'
              : preparingCount > 0
              ? 'btn-outline-warning text-dark'
              : 'btn-outline-secondary'
          }`}
          aria-selected={tabFilter === 'PREPARING'}
          onClick={() => setTabFilter('PREPARING')}
        >
          🟡 Hazırlanıyor ({preparingCount})
        </button>
      </div>

      {/* Hızlı Sipariş No / Müşteri Arama */}
      <div className="input-group input-group-sm mb-3">
        <span className="input-group-text bg-white">🔍</span>
        <input
          type="search"
          className="form-control"
          placeholder="# Sipariş No veya müşteri ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Siparişlerde ara"
        />
        {searchQuery ? (
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setSearchQuery('')}
            aria-label="Aramayı temizle"
          >
            ✕
          </button>
        ) : null}
      </div>

      {error ? (
        <ErrorAlert
          message={error}
          onRetry={() => {
            setError(null)
            void onChanged()
          }}
        />
      ) : null}

      {loading && orders.length === 0 ? <LoadingBlock label="Siparişler yükleniyor…" /> : null}

      {!loading && orders.length === 0 ? (
        <EmptyState
          title="Teslim bekleyen sipariş yok"
          description="Mutfak siparişi hazır olarak işaretlediğinde burada görünecektir."
        />
      ) : null}

      {!loading && orders.length > 0 && filteredOrders.length === 0 ? (
        <div className="text-center py-4 text-muted border rounded-3 bg-light">
          <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🔍</div>
          <div className="small fw-semibold">Filtreye uygun sipariş bulunamadı</div>
          <button
            type="button"
            className="btn btn-sm btn-link mt-1"
            onClick={() => {
              setTabFilter('ALL')
              setSearchQuery('')
            }}
          >
            Filtreleri Sıfırla
          </button>
        </div>
      ) : null}

      {/* Sipariş Kartları Listesi */}
      <div className="ready-orders-scroll-list d-flex flex-column gap-3">
        {filteredOrders.map((order) => {
          const problems = openProblems(order)
          const remaining = remainingAmount(order)
          const isReady = order.status === 'READY'

          return (
            <article
              key={order.id}
              className={`ready-order-card${isReady ? ' is-ready-active' : ''}${
                problems.length > 0 ? ' has-problem' : ''
              }`}
            >
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="order-number">#{order.orderNumber}</span>
                    <SourceBadge source={order.source} />
                    <OrderStatusBadge status={order.status} />
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </div>
                  <div className="small muted mt-1">
                    {order.customerName ? (
                      <span>Müşteri: <strong>{order.customerName}</strong></span>
                    ) : (
                      'Müşteri adı belirtilmedi'
                    )}
                  </div>
                </div>
                <div className="text-end">
                  <div className="small muted">Toplam</div>
                  <div className="fw-bold text-tabular text-primary" style={{ fontSize: '1.1rem' }}>
                    {formatMoney(order.totalAmount)}
                  </div>
                </div>
              </div>

              {order.generalNote ? <div className="order-general-note mb-2">{order.generalNote}</div> : null}

              {/* Sipariş Ürünleri */}
              <ul className="order-items mb-2">
                {order.items.map((item, index) => (
                  <li key={`${item.productId}-${index}`}>
                    <div className="d-flex justify-content-between gap-2">
                      <span>
                        <span className="fw-semibold">{item.quantity} ×</span> {item.productName}
                      </span>
                      <span className="text-tabular">{formatMoney(item.lineTotal)}</span>
                    </div>
                    {item.lineNote ? <span className="line-note">{item.lineNote}</span> : null}
                  </li>
                ))}
              </ul>

              {remaining > 0 && order.paidAmount > 0 ? (
                <div className="small muted mb-2">
                  Ödenen: {formatMoney(order.paidAmount)} · Kalan: <strong>{formatMoney(remaining)}</strong>
                </div>
              ) : null}

              {/* Mutfak Problemleri */}
              {problems.map((problem) => (
                <div
                  key={problem.id}
                  className={`problem-box mb-2${problem.informedAt ? ' is-cleared' : ''}`}
                >
                  <div className="fw-semibold text-danger">{problemLabel(problem.problemType)}</div>
                  {problem.note ? <div>{problem.note}</div> : null}
                  <div className="small muted">
                    {formatDateTime(problem.reportedAt)} · {problem.reportedByName ?? 'Mutfak'}
                  </div>
                  <div className="small mt-1">
                    {problem.informedAt
                      ? `Müşteri bilgilendirildi: ${formatDateTime(problem.informedAt)}`
                      : 'Müşteri henüz bilgilendirilmedi.'}
                  </div>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {!problem.informedAt ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={busy}
                        onClick={() => void markInformed(problem)}
                      >
                        Müşteri Bilgilendirildi
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={busy}
                      onClick={() => void clearProblem(problem)}
                    >
                      Sorunu Kapat
                    </button>
                  </div>
                </div>
              ))}

              {/* Hızlı Aksiyon Butonları */}
              <div className="order-actions pt-2 border-top mt-2">
                {/* Ödeme Bekleniyorsa */}
                {order.paymentStatus === 'WAITING' ? (
                  <div className="d-flex flex-wrap gap-2 w-100 mb-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-success flex-fill"
                      disabled={busy}
                      onClick={() => openCashDialog(order)}
                    >
                      💵 Nakit Al
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary flex-fill"
                      disabled={busy}
                      onClick={() => void takeCardPayment(order)}
                    >
                      💳 Kart Al
                    </button>
                  </div>
                ) : null}

                {/* Teslime Hazır Sipariş için Dev Yeşil Buton */}
                {canDeliver(order) ? (
                  <button
                    type="button"
                    className="btn btn-success w-100 fw-bold py-2 mb-2 d-flex align-items-center justify-content-center gap-2"
                    disabled={busy}
                    onClick={() => {
                      setError(null)
                      setDeliverOrder(order)
                    }}
                  >
                    <span>✔</span>
                    <span>Siparişi Teslim Et</span>
                  </button>
                ) : null}

                <div className="d-flex align-items-center justify-content-between w-100">
                  {order.paymentStatus === 'PAID' && order.status !== 'READY' ? (
                    <span className="small text-warning-emphasis">⏳ Mutfak hazırlıyor...</span>
                  ) : order.paymentStatus === 'REFUND_PENDING' ? (
                    <span className="small text-danger">İade bekliyor.</span>
                  ) : <span />}

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy}
                    onClick={() => onShowReceipt(buildOrderReceipt(order, cashierName))}
                    title="Satış fişini görüntüle veya yazdır"
                  >
                    🧾 Fiş
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* Nakit Ödeme Modal */}
      <ConfirmDialog
        open={cashOrder !== null}
        title={cashOrder ? `Nakit Ödeme Al · #${cashOrder.orderNumber}` : 'Nakit Ödeme Al'}
        message={
          cashOrder ? (
            <div>
              Kalan tutar: <strong>{formatMoney(cashRemaining)}</strong>
            </div>
          ) : null
        }
        confirmLabel="Ödemeyi Al"
        variant="success"
        busy={busy}
        onConfirm={() => void takeCashPayment()}
        onCancel={closeCashDialog}
      >
        <label className="form-label" htmlFor="cash-payment-received">
          Alınan para
        </label>
        <input
          id="cash-payment-received"
          className="form-control form-control-lg text-tabular fw-bold"
          inputMode="decimal"
          value={cashReceived}
          onChange={(event) => setCashReceived(event.target.value)}
          autoFocus
        />
        <div className="total-row mt-3">
          <span>Para üstü</span>
          <span className="amount">{formatMoney(cashChange)}</span>
        </div>
        {cashInsufficient ? (
          <div className="form-text text-danger">
            Alınan para kalan tutardan düşük olamaz. En az {formatMoney(cashRemaining)} girin.
          </div>
        ) : null}
      </ConfirmDialog>

      {/* Teslim Et Onay Modalı */}
      <ConfirmDialog
        open={deliverOrder !== null}
        title="Siparişi Teslim Et"
        message={
          deliverOrder ? (
            <div>
              <strong>#{deliverOrder.orderNumber}</strong> numaralı sipariş teslim edilsin ve fişi açılsın mı?
            </div>
          ) : null
        }
        confirmLabel="Teslim Et & Fiş Aç"
        variant="success"
        busy={busy}
        onConfirm={() => void confirmDelivered()}
        onCancel={() => {
          if (!busy) setDeliverOrder(null)
        }}
      />
    </section>
  )
}
