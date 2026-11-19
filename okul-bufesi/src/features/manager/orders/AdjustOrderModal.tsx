import { useEffect, useState } from 'react'
import { ReasonDialog } from '../../../components/Dialogs'
import { ErrorAlert } from '../../../components/Feedback'
import { Modal } from '../../../components/Modal'
import { AvailabilityBadge } from '../../../components/StatusBadge'
import { staffAdminApi, staffOrderApi } from '../../../lib/api'
import { toUserMessage } from '../../../lib/errors'
import { formatMoney } from '../../../lib/format'
import type { StaffOrder } from '../../../types/domain'
import { parseProductOptions, type ProductOption } from './orderUtils'

interface AdjustLine {
  key: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  lineNote: string | null
}

interface AdjustOrderModalProps {
  order: StaffOrder
  token: string
  onClose: () => void
  onSuccess: (result: { totalAmount: number }) => void
}

const MAX_QUANTITY = 99

let lineCounter = 0

function nextLineKey(): string {
  lineCounter += 1
  return `adjust-line-${lineCounter}`
}

function toLines(order: StaffOrder): AdjustLine[] {
  return order.items.map((item) => ({
    key: nextLineKey(),
    productId: item.productId,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineNote: item.lineNote,
  }))
}

function signature(lines: Array<{ productId: string; quantity: number }>): string {
  return lines
    .map((line) => `${line.productId}:${line.quantity}`)
    .sort()
    .join('|')
}

export function AdjustOrderModal({ order, token, onClose, onSuccess }: AdjustOrderModalProps) {
  const [lines, setLines] = useState<AdjustLine[]>(() => toLines(order))
  const [baseline] = useState(() => signature(order.items))
  const [products, setProducts] = useState<ProductOption[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    staffAdminApi
      .adminProducts(token)
      .then((value) => {
        if (!active) return
        setProducts(parseProductOptions(value))
        setProductsError(null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setProductsError(toUserMessage(cause))
      })
      .finally(() => {
        if (active) setProductsLoading(false)
      })

    return () => {
      active = false
    }
  }, [token])

  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const difference = total - order.totalAmount
  const changed = signature(lines) !== baseline
  const showBalanceWarning = order.paidAmount > 0 && Math.abs(difference) > 0.005

  const query = productSearch.trim().toLocaleLowerCase('tr-TR')
  const filteredProducts =
    query.length === 0
      ? []
      : products
          .filter(
            (product) =>
              product.name.toLocaleLowerCase('tr-TR').includes(query) ||
              product.categoryName.toLocaleLowerCase('tr-TR').includes(query),
          )
          .slice(0, 8)

  const updateQuantity = (key: string, next: number) => {
    const safe = Number.isFinite(next)
      ? Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(next)))
      : 1
    setLines((current) => current.map((line) => (line.key === key ? { ...line, quantity: safe } : line)))
  }

  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  const addProduct = (product: ProductOption) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line.key === existing.key
            ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) }
            : line,
        )
      }
      return [
        ...current,
        {
          key: nextLineKey(),
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          quantity: 1,
          lineNote: null,
        },
      ]
    })
  }

  const submit = async (reason: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await staffOrderApi.adjust(
        token,
        order.id,
        lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          lineNote: line.lineNote ?? undefined,
        })),
        reason,
      )
      onSuccess(result)
    } catch (cause) {
      setReasonOpen(false)
      setError(toUserMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  if (reasonOpen) {
    return (
      <ReasonDialog
        open
        title={`Sipariş #${order.orderNumber} düzeltme nedeni`}
        description={
          <div className="small">
            <div>
              Yeni toplam: <strong className="text-tabular">{formatMoney(total)}</strong>
            </div>
            {showBalanceWarning ? (
              <div className="text-danger mt-1">
                Bakiye farkı tahsilat/iade tamamlanmadan teslim edilemez.
              </div>
            ) : null}
          </div>
        }
        confirmLabel="Düzeltmeyi kaydet"
        busy={busy}
        onConfirm={(reason) => {
          void submit(reason)
        }}
        onCancel={() => {
          if (!busy) setReasonOpen(false)
        }}
      />
    )
  }

  return (
    <Modal
      open
      title={`Sipariş #${order.orderNumber} düzelt`}
      onClose={busy ? () => undefined : onClose}
      closeOnBackdrop={!busy}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setReasonOpen(true)}
            disabled={busy || lines.length === 0 || !changed}
          >
            Düzeltmeyi kaydet
          </button>
        </>
      }
    >
      <div className="alert alert-info small">
        Yönetici olarak sipariş ürünlerini ve tutarını değiştirebilirsiniz. Her düzeltme, neden bilgisiyle
        birlikte kaydedilir.
      </div>

      {showBalanceWarning ? (
        <div className="alert alert-warning small">
          <div className="fw-semibold">Bakiye farkı tahsilat/iade tamamlanmadan teslim edilemez.</div>
          <div className="mt-1">
            Ödenen: {formatMoney(order.paidAmount)} · Yeni toplam: {formatMoney(total)} · Fark:{' '}
            {formatMoney(Math.abs(difference))} {difference > 0 ? 'tahsil edilecek' : 'iade edilecek'}
          </div>
        </div>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      <h3 className="h6">Sipariş ürünleri</h3>
      {lines.length === 0 ? (
        <p className="small text-danger">
          En az bir ürün kalmalı. Tüm siparişi kapatmak için İptal işlemini kullanın.
        </p>
      ) : (
        <ul className="list-group list-group-flush mb-3">
          {lines.map((line) => (
            <li key={line.key} className="list-group-item px-0">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <div className="flex-grow-1">
                  <div className="fw-semibold">{line.productName}</div>
                  <div className="small text-body-secondary">
                    {formatMoney(line.unitPrice)} / adet
                    {line.lineNote ? ` · Not: ${line.lineNote}` : ''}
                  </div>
                </div>
                <div className="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => updateQuantity(line.key, line.quantity - 1)}
                    disabled={line.quantity <= 1}
                    aria-label={`${line.productName} adedini azalt`}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    className="form-control form-control-sm text-center text-tabular"
                    style={{ width: 72 }}
                    min={1}
                    max={MAX_QUANTITY}
                    value={line.quantity}
                    onChange={(event) => updateQuantity(line.key, Number(event.target.value))}
                    aria-label={`${line.productName} adedi`}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => updateQuantity(line.key, line.quantity + 1)}
                    disabled={line.quantity >= MAX_QUANTITY}
                    aria-label={`${line.productName} adedini artır`}
                  >
                    +
                  </button>
                </div>
                <div className="text-end text-tabular fw-semibold" style={{ minWidth: 96 }}>
                  {formatMoney(line.unitPrice * line.quantity)}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => removeLine(line.key)}
                >
                  Kaldır
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex justify-content-between small">
        <span className="text-body-secondary">Eski toplam</span>
        <span className="text-tabular">{formatMoney(order.totalAmount)}</span>
      </div>
      <div className="d-flex justify-content-between fw-semibold">
        <span>Yeni toplam</span>
        <span className="text-tabular">{formatMoney(total)}</span>
      </div>
      {Math.abs(difference) > 0.005 ? (
        <div className="d-flex justify-content-between small">
          <span className="text-body-secondary">Fark</span>
          <span className={`text-tabular ${difference > 0 ? 'text-danger' : 'text-success'}`}>
            {difference > 0 ? '+' : '-'}
            {formatMoney(Math.abs(difference))}
          </span>
        </div>
      ) : null}
      {!changed && lines.length > 0 ? (
        <div className="form-text">Kaydetmek için en az bir ürün veya adet değişikliği yapın.</div>
      ) : null}

      <hr />

      <h3 className="h6">Ürün ekle</h3>
      <label className="form-label small text-body-secondary" htmlFor="adjust-product-search">
        Ürün adı veya kategori
      </label>
      <input
        id="adjust-product-search"
        type="search"
        className="form-control"
        value={productSearch}
        onChange={(event) => setProductSearch(event.target.value)}
        placeholder="Örn. simit, tost, içecek"
        autoComplete="off"
      />

      {productsLoading ? (
        <div className="small text-body-secondary mt-2">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Ürün listesi yükleniyor…
        </div>
      ) : null}
      {productsError ? <ErrorAlert message={productsError} /> : null}

      {!productsLoading && !productsError ? (
        query.length === 0 ? (
          <p className="small text-body-secondary mt-2 mb-0">Eklemek için ürün adı veya kategori yazın.</p>
        ) : filteredProducts.length === 0 ? (
          <p className="small text-body-secondary mt-2 mb-0">Eşleşen ürün bulunamadı.</p>
        ) : (
          <ul className="list-group mt-2">
            {filteredProducts.map((product) => (
              <li
                key={product.id}
                className="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2 py-2"
              >
                <div className="flex-grow-1">
                  <div className="fw-semibold">
                    {product.name}{' '}
                    {product.availability !== 'ACTIVE' ? (
                      <AvailabilityBadge status={product.availability} />
                    ) : null}
                  </div>
                  <div className="small text-body-secondary">
                    {product.categoryName} · {formatMoney(product.price)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => addProduct(product)}
                >
                  Ekle
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Modal>
  )
}
