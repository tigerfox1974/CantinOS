import { useState, type FormEvent } from 'react'
import { ErrorAlert } from '../../components/Feedback'
import { publicApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { formatMoney, localTime } from '../../lib/format'
import { usePolling } from '../../lib/polling'
import type { DeliverySlot, OnlineOrderInput, OnlineOrderResult } from '../../types/domain'
import {
  cartTotal,
  MAX_CUSTOMER_NAME,
  MAX_CUSTOMER_PHONE,
  MAX_GENERAL_NOTE,
  type CartLine,
  type OrderSnapshot,
} from './cart'

type DeliveryType = 'NONE' | 'NOW' | 'SLOT' | 'CUSTOM'

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function slotIsAvailable(slot: DeliverySlot): boolean {
  return slot.available && new Date(slot.targetAt).getTime() > Date.now()
}

function isValidCustomTime(value: string): boolean {
  return TIME_PATTERN.test(value) && value > localTime()
}

interface CheckoutFormProps {
  lines: CartLine[]
  orderingEnabled: boolean
  onSuccess: (result: OnlineOrderResult, snapshot: OrderSnapshot) => void
}

export function CheckoutForm({ lines, orderingEnabled, onSuccess }: CheckoutFormProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [generalNote, setGeneralNote] = useState('')
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('NONE')
  const [slotId, setSlotId] = useState('')
  const [customTime, setCustomTime] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slotsState = usePolling(() => publicApi.getDeliverySlots(), { enabled: orderingEnabled })
  const slots = slotsState.data ?? []

  const nameValid = customerName.trim().length >= 2
  const phoneValid = customerPhone.trim().length >= 7
  const selectedSlot = slots.find((slot) => slot.id === slotId) ?? null
  const customTimeValid = isValidCustomTime(customTime)

  const deliveryValid =
    deliveryType === 'NOW'
      ? true
      : deliveryType === 'SLOT'
        ? Boolean(selectedSlot && slotIsAvailable(selectedSlot))
        : deliveryType === 'CUSTOM'
          ? customTimeValid
          : false

  const unavailableLines = lines.filter((line) => line.availabilityStatus !== 'ACTIVE')
  const hasItems = lines.length > 0
  const canSubmit = orderingEnabled && hasItems && unavailableLines.length === 0

  const nameError = submitted && !nameValid ? 'Ad Soyad en az 2 karakter olmalıdır.' : null
  const phoneError = submitted && !phoneValid ? 'Telefon en az 7 karakter olmalıdır.' : null

  let deliveryError: string | null = null
  if (submitted && !deliveryValid) {
    if (deliveryType === 'CUSTOM') deliveryError = 'Bugün için ileri bir saat seçin.'
    else if (deliveryType === 'SLOT') deliveryError = 'Seçilen teneffüs saati kullanılamıyor. Lütfen başka bir saat seçin.'
    else deliveryError = 'Teslim zamanı seçin.'
  }

  const selectedDeliveryLabel =
    deliveryType === 'NOW'
      ? 'Hemen'
      : deliveryType === 'SLOT'
        ? selectedSlot?.label ?? null
        : deliveryType === 'CUSTOM' && customTime
          ? `${customTime} (Özel saat)`
          : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    setError(null)

    if (!orderingEnabled || submitting || !canSubmit) return
    if (!nameValid || !phoneValid || !deliveryValid) return

    const delivery: OnlineOrderInput['delivery'] =
      deliveryType === 'NOW'
        ? { type: 'NOW' }
        : deliveryType === 'SLOT'
          ? { type: 'SLOT', slotId }
          : { type: 'CUSTOM', time: customTime }

    const trimmedNote = generalNote.trim()
    const input: OnlineOrderInput = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      generalNote: trimmedNote ? trimmedNote : undefined,
      delivery,
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        lineNote: line.lineNote.trim() ? line.lineNote.trim() : undefined,
      })),
    }

    setSubmitting(true)
    try {
      const result = await publicApi.createOnlineOrder(input)
      const snapshot: OrderSnapshot = {
        items: lines.map((line) => ({
          productName: line.name,
          quantity: line.quantity,
          lineNote: line.lineNote.trim() ? line.lineNote.trim() : null,
          unitPrice: line.unitPrice,
          lineTotal: Math.round(line.unitPrice * line.quantity * 100) / 100,
        })),
        generalNote: trimmedNote ? trimmedNote : null,
      }
      setSubmitting(false)
      onSuccess(result, snapshot)
    } catch (cause) {
      setError(toUserMessage(cause))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2 className="h6 mb-3">Sipariş Bilgileri</h2>

      {!orderingEnabled ? (
        <div className="alert alert-warning py-2 small mb-3" role="status">
          Şu an online siparişe kapalıyız. Menüyü inceleyebilirsiniz; sipariş vermek için daha sonra tekrar deneyin.
        </div>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      <fieldset disabled={!orderingEnabled || submitting} className="border-0 p-0 m-0">
        <div className="mb-3">
          <label htmlFor="customer-name" className="form-label">
            Ad Soyad
          </label>
          <input
            id="customer-name"
            type="text"
            className={`form-control${nameError ? ' is-invalid' : ''}`}
            autoComplete="name"
            maxLength={MAX_CUSTOMER_NAME}
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
          {nameError ? <div className="invalid-feedback d-block">{nameError}</div> : null}
        </div>

        <div className="mb-3">
          <label htmlFor="customer-phone" className="form-label">
            Telefon
          </label>
          <input
            id="customer-phone"
            type="tel"
            inputMode="tel"
            className={`form-control${phoneError ? ' is-invalid' : ''}`}
            autoComplete="tel"
            maxLength={MAX_CUSTOMER_PHONE}
            placeholder="05xx xxx xx xx"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
          />
          {phoneError ? <div className="invalid-feedback d-block">{phoneError}</div> : null}
        </div>

        <div className="mb-3">
          <span className="form-label d-block">Teslim Zamanı</span>

          <div className="d-grid gap-2">
            <div className="form-check border rounded p-2 ps-4">
              <input
                className="form-check-input"
                type="radio"
                name="delivery"
                id="delivery-now"
                checked={deliveryType === 'NOW'}
                onChange={() => setDeliveryType('NOW')}
              />
              <label className="form-check-label w-100" htmlFor="delivery-now">
                <span className="fw-semibold">Hemen</span>
                <span className="d-block small text-body-secondary">Siparişiniz en kısa sürede hazırlanır.</span>
              </label>
            </div>

            {slots.map((slot) => {
              const available = slotIsAvailable(slot)
              return (
                <div className="form-check border rounded p-2 ps-4" key={slot.id}>
                  <input
                    className="form-check-input"
                    type="radio"
                    name="delivery"
                    id={`delivery-slot-${slot.id}`}
                    checked={deliveryType === 'SLOT' && slotId === slot.id}
                    disabled={!available}
                    onChange={() => {
                      setDeliveryType('SLOT')
                      setSlotId(slot.id)
                    }}
                  />
                  <label className="form-check-label w-100" htmlFor={`delivery-slot-${slot.id}`}>
                    <span className="fw-semibold">{slot.label}</span>
                    <span className="small text-body-secondary ms-2">{slot.targetTime}</span>
                    {!available ? <span className="badge text-bg-secondary ms-2">Geçti</span> : null}
                  </label>
                </div>
              )
            })}

            <div className="form-check border rounded p-2 ps-4">
              <input
                className="form-check-input"
                type="radio"
                name="delivery"
                id="delivery-custom"
                checked={deliveryType === 'CUSTOM'}
                onChange={() => setDeliveryType('CUSTOM')}
              />
              <label className="form-check-label w-100" htmlFor="delivery-custom">
                <span className="fw-semibold">Özel saat</span>
                <span className="d-block small text-body-secondary">Bugün için ileri bir saat seçin.</span>
              </label>
              {deliveryType === 'CUSTOM' ? (
                <div className="mt-2">
                  <input
                    type="time"
                    className={`form-control${deliveryError ? ' is-invalid' : ''}`}
                    value={customTime}
                    min={localTime()}
                    max="23:59"
                    aria-label="Özel teslim saati"
                    onChange={(event) => {
                      setDeliveryType('CUSTOM')
                      setCustomTime(event.target.value)
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {slotsState.error ? (
            <div className="mt-2">
              <ErrorAlert
                message={slotsState.error}
                onRetry={() => {
                  void slotsState.refresh()
                }}
              />
            </div>
          ) : null}

          {orderingEnabled && slotsState.loading && slots.length === 0 ? (
            <div className="form-text">Teneffüs saatleri yükleniyor…</div>
          ) : null}

          {orderingEnabled && !slotsState.loading && slots.length === 0 ? (
            <div className="form-text">Aktif teneffüs saati tanımlı değil.</div>
          ) : null}

          {deliveryError ? <div className="text-danger small mt-1">{deliveryError}</div> : null}
          {selectedDeliveryLabel ? (
            <div className="form-text">
              Seçilen teslim: <strong>{selectedDeliveryLabel}</strong>
            </div>
          ) : null}
        </div>

        <div className="mb-3">
          <label htmlFor="general-note" className="form-label">
            Sipariş notu <span className="text-body-secondary fw-normal">(isteğe bağlı)</span>
          </label>
          <textarea
            id="general-note"
            className="form-control"
            rows={2}
            maxLength={MAX_GENERAL_NOTE}
            placeholder="Siparişinizle ilgili eklemek istedikleriniz"
            value={generalNote}
            onChange={(event) => setGeneralNote(event.target.value)}
          />
          <div className="form-text text-end">
            {generalNote.length}/{MAX_GENERAL_NOTE}
          </div>
        </div>

        {!hasItems ? (
          <div className="alert alert-secondary py-2 small mb-2" role="status">
            Sepetinizde ürün yok. Sipariş vermek için menüden ürün ekleyin.
          </div>
        ) : null}

        {unavailableLines.length > 0 ? (
          <div className="alert alert-warning py-2 small mb-2" role="alert">
            {unavailableLines.map((line) => line.name).join(', ')} şu anda satışta değil. Lütfen sepetten kaldırın.
          </div>
        ) : null}

        <div className="alert alert-info py-2 small mb-3" role="note">
          Ödeme teslim alınırken nakit veya kart ile yapılır.
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={!canSubmit || submitting}>
          {submitting ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
          Siparişi Gönder · {formatMoney(cartTotal(lines))}
        </button>
      </fieldset>
    </form>
  )
}
