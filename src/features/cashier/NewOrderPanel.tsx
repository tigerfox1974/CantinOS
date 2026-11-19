import { useRef, useState, type FormEvent } from 'react'
import { EmptyState, LoadingBlock } from '../../components/Feedback'
import { AvailabilityBadge } from '../../components/StatusBadge'
import { staffOrderApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { formatMoney, parseMoneyInput } from '../../lib/format'
import type {
  CashierOrderResult,
  MenuProduct,
  PaymentMethod,
  PublicMenu,
} from '../../types/domain'
import {
  MAX_CUSTOMER_NAME,
  MAX_GENERAL_NOTE,
  MAX_LINE_NOTE,
  MAX_QUANTITY,
  MIN_QUANTITY,
  addProductToCart,
  buildCashierOrderInput,
  calculateChange,
  cartItemCount,
  cartTotal,
  isCashSufficient,
  lineTotal,
  removeCartLine,
  updateCartLineNote,
  updateCartQuantity,
  validateOrderForm,
  type CartLine,
} from './cashier-utils'

interface NewOrderPanelProps {
  token: string
  menu: PublicMenu | null
  loading?: boolean
  onCreated: (result: CashierOrderResult) => void
}

export function NewOrderPanel({ token, menu, loading = false, onCreated }: NewOrderPanelProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [receivedText, setReceivedText] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [generalNote, setGeneralNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lineKeyRef = useRef(0)

  const categories = menu?.categories ?? []
  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ?? categories[0] ?? null

  const total = cartTotal(cart)
  const itemCount = cartItemCount(cart)
  const receivedValue = parseMoneyInput(receivedText)
  const change = calculateChange(receivedValue, total)
  const validationMessage = validateOrderForm({
    lines: cart,
    paymentMethod,
    receivedText,
    customerName,
    generalNote,
  })

  function addProduct(product: MenuProduct) {
    if (product.availabilityStatus !== 'ACTIVE') return
    lineKeyRef.current += 1
    const key = `${product.id}-${lineKeyRef.current}`
    setCart((current) => addProductToCart(current, product, key))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const message = validateOrderForm({
      lines: cart,
      paymentMethod,
      receivedText,
      customerName,
      generalNote,
    })

    if (message) {
      setError(message)
      return
    }

    if (!paymentMethod) return

    setBusy(true)
    setError(null)
    try {
      const result = await staffOrderApi.createCashierOrder(
        token,
        buildCashierOrderInput(cart, paymentMethod, receivedText, customerName, generalNote),
      )
      setCart([])
      setPaymentMethod(null)
      setReceivedText('')
      setCustomerName('')
      setGeneralNote('')
      onCreated(result)
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!menu) {
    return loading ? (
      <LoadingBlock label="Menü yükleniyor…" />
    ) : (
      <EmptyState
        title="Menü yüklenemedi"
        description="Bağlantıyı kontrol edip Yenile düğmesiyle tekrar deneyin."
      />
    )
  }

  if (categories.length === 0) {
    return <EmptyState title="Menü boş" description="Satışa açık ürün bulunmuyor." />
  }

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-7">
        <section className="surface-card p-3" aria-labelledby="cashier-menu-heading">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 id="cashier-menu-heading" className="h5 mb-0">
              Menü
            </h2>
            <span className="small muted">{itemCount} ürün sepette</span>
          </div>

          <div className="category-strip" role="group" aria-label="Menü kategorileri">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`category-pill${activeCategory?.id === category.id ? ' active' : ''}`}
                aria-pressed={activeCategory?.id === category.id}
                onClick={() => setActiveCategoryId(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="d-flex flex-column gap-2">
            {(activeCategory?.products ?? []).map((product) => {
              const closed = product.availabilityStatus !== 'ACTIVE'
              return (
                <div
                  key={product.id}
                  className="border rounded-3 p-2 d-flex flex-wrap align-items-center justify-content-between gap-2"
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className="fw-semibold">{product.name}</span>
                      {closed ? <AvailabilityBadge status={product.availabilityStatus} /> : null}
                    </div>
                    {product.description ? (
                      <div className="small muted">{product.description}</div>
                    ) : null}
                    {closed && product.availabilityNote ? (
                      <div className="product-closed-note mt-1">{product.availabilityNote}</div>
                    ) : null}
                  </div>

                  <div className="d-flex align-items-center gap-2 ms-auto">
                    <span className="product-price">{formatMoney(product.price)}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={closed}
                      onClick={() => addProduct(product)}
                      aria-label={`${product.name} ekle`}
                    >
                      Ekle
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="col-12 col-xl-5">
        <form className="cashier-cart surface-card p-3" onSubmit={handleSubmit} noValidate>
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h2 className="h5 mb-0">Sepet</h2>
            <span className="badge text-bg-secondary">{cart.length} satır</span>
          </div>

          {cart.length === 0 ? (
            <p className="small muted mb-0">Sepet boş. Menüden ürün ekleyin.</p>
          ) : (
            <div className="mb-2">
              {cart.map((line) => (
                <div className="cart-line" key={line.key}>
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-semibold small">{line.productName}</div>
                    <div className="small muted">{formatMoney(line.unitPrice)}</div>
                    <input
                      type="text"
                      className="form-control form-control-sm mt-1"
                      maxLength={MAX_LINE_NOTE}
                      value={line.lineNote}
                      placeholder="Satır notu (isteğe bağlı)"
                      aria-label={`${line.productName} satır notu`}
                      onChange={(event) =>
                        setCart((current) =>
                          updateCartLineNote(current, line.key, event.target.value),
                        )
                      }
                    />
                  </div>

                  <div className="text-end">
                    <div className="qty-control mb-1">
                      <button
                        type="button"
                        aria-label={`${line.productName} adedini azalt`}
                        disabled={line.quantity <= MIN_QUANTITY}
                        onClick={() =>
                          setCart((current) =>
                            updateCartQuantity(current, line.key, line.quantity - 1),
                          )
                        }
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={MIN_QUANTITY}
                        max={MAX_QUANTITY}
                        value={line.quantity}
                        aria-label={`${line.productName} adedi`}
                        onChange={(event) => {
                          const next = event.target.value === '' ? MIN_QUANTITY : Number(event.target.value)
                          setCart((current) => updateCartQuantity(current, line.key, next))
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`${line.productName} adedini artır`}
                        disabled={line.quantity >= MAX_QUANTITY}
                        onClick={() =>
                          setCart((current) =>
                            updateCartQuantity(current, line.key, line.quantity + 1),
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                    <div className="small fw-semibold text-tabular">{formatMoney(lineTotal(line))}</div>
                    <button
                      type="button"
                      className="btn btn-link btn-sm text-danger p-0 mt-1"
                      onClick={() => setCart((current) => removeCartLine(current, line.key))}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="total-row border-top pt-3 mt-2">
            <span>Toplam</span>
            <span className="amount">{formatMoney(total)}</span>
          </div>

          <div className="mt-3">
            <span className="form-label d-block">Ödeme yöntemi</span>
            <div className="btn-group w-100" role="group" aria-label="Ödeme yöntemi">
              <button
                type="button"
                className={`btn ${paymentMethod === 'CASH' ? 'btn-primary' : 'btn-outline-primary'}`}
                aria-pressed={paymentMethod === 'CASH'}
                onClick={() => setPaymentMethod('CASH')}
              >
                Nakit
              </button>
              <button
                type="button"
                className={`btn ${paymentMethod === 'CARD' ? 'btn-primary' : 'btn-outline-primary'}`}
                aria-pressed={paymentMethod === 'CARD'}
                onClick={() => setPaymentMethod('CARD')}
              >
                Kart
              </button>
            </div>
          </div>

          {paymentMethod === 'CASH' ? (
            <div className="mt-3">
              <label className="form-label" htmlFor="cashier-received-amount">
                Alınan para
              </label>
              <input
                id="cashier-received-amount"
                type="text"
                className="form-control"
                inputMode="decimal"
                placeholder="0,00"
                value={receivedText}
                onChange={(event) => setReceivedText(event.target.value)}
              />
              <div className="total-row mt-2">
                <span>Para üstü</span>
                <span className="amount">{formatMoney(change)}</span>
              </div>
              {total > 0 && !isCashSufficient(receivedValue, total) ? (
                <div className="form-text text-danger">
                  Alınan para toplamdan düşük olamaz. En az {formatMoney(total)} girin.
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3">
            <label className="form-label" htmlFor="cashier-customer-name">
              Müşteri adı <span className="muted small">(isteğe bağlı)</span>
            </label>
            <input
              id="cashier-customer-name"
              type="text"
              className="form-control"
              maxLength={MAX_CUSTOMER_NAME}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </div>

          <div className="mt-3">
            <label className="form-label" htmlFor="cashier-general-note">
              Sipariş notu <span className="muted small">(isteğe bağlı)</span>
            </label>
            <textarea
              id="cashier-general-note"
              className="form-control"
              rows={2}
              maxLength={MAX_GENERAL_NOTE}
              value={generalNote}
              onChange={(event) => setGeneralNote(event.target.value)}
            />
            <div className="form-text text-end">
              {generalNote.length}/{MAX_GENERAL_NOTE}
            </div>
          </div>

          {error ? (
            <div className="alert alert-danger py-2 small mt-3" role="alert">
              {error}
            </div>
          ) : null}

          {validationMessage ? (
            <div className={`small mt-3 ${cart.length === 0 ? 'muted' : 'text-danger'}`}>
              {validationMessage}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn-success w-100 mt-3"
            disabled={busy || validationMessage !== null}
          >
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
            Siparişi Oluştur ve Ödemeyi Al
          </button>
        </form>
      </div>
    </div>
  )
}
