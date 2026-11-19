import { useState } from 'react'
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

export function ReadyOrdersPanel({
  token,
  orders,
  loading = false,
  cashierName = 'Kasiyer',
  onChanged,
  onShowReceipt,
}: ReadyOrdersPanelProps) {
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
    <section aria-labelledby="ready-orders-heading">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <h2 id="ready-orders-heading" className="h5 mb-0">
          Hazır / Teslim Bekleyenler
        </h2>
        <span className="badge text-bg-secondary">{orders.length}</span>
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
          description="Mutfak siparişi hazır olarak işaretlediğinde burada görünür."
        />
      ) : null}

      <div className="d-flex flex-column gap-3">
        {orders.map((order) => {
          const problems = openProblems(order)
          const remaining = remainingAmount(order)

          return (
            <article
              key={order.id}
              className={`ready-order-card${problems.length > 0 ? ' has-problem' : ''}`}
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
                    {order.customerName ? `Müşteri: ${order.customerName}` : 'Müşteri adı belirtilmedi'}
                  </div>
                </div>
                <div className="text-end">
                  <div className="small muted">Toplam</div>
                  <div className="fw-bold text-tabular">{formatMoney(order.totalAmount)}</div>
                </div>
              </div>

              {order.generalNote ? <div className="order-general-note">{order.generalNote}</div> : null}

              <ul className="order-items">
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

              <div className="total-row mb-2">
                <span>Toplam</span>
                <span className="amount">{formatMoney(order.totalAmount)}</span>
              </div>

              {remaining > 0 && order.paidAmount > 0 ? (
                <div className="small muted mb-2">
                  Ödenen: {formatMoney(order.paidAmount)} · Kalan: {formatMoney(remaining)}
                </div>
              ) : null}

              {problems.map((problem) => (
                <div
                  key={problem.id}
                  className={`problem-box mb-2${problem.informedAt ? ' is-cleared' : ''}`}
                >
                  <div className="fw-semibold">{problemLabel(problem.problemType)}</div>
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

              <div className="order-actions">
                {order.paymentStatus === 'WAITING' ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      disabled={busy}
                      onClick={() => openCashDialog(order)}
                    >
                      Nakit Ödeme Al
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() => void takeCardPayment(order)}
                    >
                      Kart Ödemesi Al
                    </button>
                  </>
                ) : null}

                {canDeliver(order) ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success"
                    disabled={busy}
                    onClick={() => {
                      setError(null)
                      setDeliverOrder(order)
                    }}
                  >
                    Teslim Edildi
                  </button>
                ) : null}

                {order.paymentStatus === 'PAID' && order.status !== 'READY' ? (
                  <span className="small muted">Mutfak hazır olunca teslim edilebilir.</span>
                ) : null}

                {order.paymentStatus === 'REFUND_PENDING' ? (
                  <span className="small text-danger">İade bekliyor.</span>
                ) : null}

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
            </article>
          )
        })}
      </div>

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
          className="form-control form-control-lg"
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

      <ConfirmDialog
        open={deliverOrder !== null}
        title="Teslim Edildi"
        message={
          deliverOrder ? (
            <div>
              <strong>#{deliverOrder.orderNumber}</strong> numaralı sipariş teslim edildi olarak
              işaretlensin mi?
            </div>
          ) : null
        }
        confirmLabel="Teslim Edildi"
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
