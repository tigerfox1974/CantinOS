import { useState } from 'react'
import { ErrorAlert } from '../../../components/Feedback'
import { Modal } from '../../../components/Modal'
import { staffOrderApi } from '../../../lib/api'
import { toUserMessage } from '../../../lib/errors'
import { formatMoney, parseMoneyInput } from '../../../lib/format'
import type { PaymentMethod, StaffOrder } from '../../../types/domain'
import { toMoneyInput } from './orderUtils'

interface RefundOrderModalProps {
  order: StaffOrder
  token: string
  onClose: () => void
  onSuccess: (amount: number) => void
}

export function RefundOrderModal({ order, token, onClose, onSuccess }: RefundOrderModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [amountInput, setAmountInput] = useState(() => toMoneyInput(order.paidAmount))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseMoneyInput(amountInput)
  const amountValid = amount > 0 && amount <= order.paidAmount + 0.005
  const reasonValid = reason.trim().length >= 3
  const valid = amountValid && reasonValid && !busy

  const submit = async () => {
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      await staffOrderApi.refund(token, order.id, method, amount, reason.trim())
      onSuccess(amount)
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={`Sipariş #${order.orderNumber} iade`}
      onClose={busy ? () => undefined : onClose}
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void submit()} disabled={!valid}>
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
            İadeyi kaydet
          </button>
        </>
      }
    >
      <div className="alert alert-info small">
        Ödenen tutar: <strong className="text-tabular">{formatMoney(order.paidAmount)}</strong>. İade kaydı kasa
        hareketine işlenir ve ödeme durumu güncellenir.
      </div>

      {error ? <ErrorAlert message={error} /> : null}

      <div className="mb-3">
        <span className="form-label d-block">İade yöntemi</span>
        <div className="btn-group w-100" role="group" aria-label="İade yöntemi">
          <button
            type="button"
            className={`btn ${method === 'CASH' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMethod('CASH')}
            aria-pressed={method === 'CASH'}
          >
            Nakit
          </button>
          <button
            type="button"
            className={`btn ${method === 'CARD' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMethod('CARD')}
            aria-pressed={method === 'CARD'}
          >
            Kart
          </button>
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="refund-amount">
          İade tutarı (TL)
        </label>
        <input
          id="refund-amount"
          className="form-control text-tabular"
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          placeholder="0,00"
        />
        <div className="form-text">
          En fazla {formatMoney(order.paidAmount)} iade edilebilir.
        </div>
        {amountInput.trim().length > 0 && amount <= 0 ? (
          <div className="form-text text-danger">Tutar 0'dan büyük olmalı.</div>
        ) : null}
        {amount > order.paidAmount + 0.005 ? (
          <div className="form-text text-danger">Tutar ödenen miktarı aşamaz.</div>
        ) : null}
      </div>

      <div>
        <label className="form-label" htmlFor="refund-reason">
          İade nedeni
        </label>
        <textarea
          id="refund-reason"
          className="form-control"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="İade nedenini yazın (zorunlu)"
        />
        {reason.length > 0 && !reasonValid ? (
          <div className="form-text text-danger">En az 3 karakter yazın.</div>
        ) : null}
      </div>
    </Modal>
  )
}
