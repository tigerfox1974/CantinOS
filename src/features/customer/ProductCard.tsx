import { useEffect, useState } from 'react'
import type { MenuProduct } from '../../types/domain'
import { formatMoney } from '../../lib/format'
import { MAX_LINE_QUANTITY } from './cart'

interface ProductCardProps {
  product: MenuProduct
  orderingEnabled: boolean
  onAdd: (product: MenuProduct, quantity: number) => void
}

function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(value)))
}

export function ProductCard({ product, orderingEnabled, onAdd }: ProductCardProps) {
  const [quantity, setQuantity] = useState(1)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [product.imageUrl])

  const closed = product.availabilityStatus !== 'ACTIVE'
  const canAdd = orderingEnabled && !closed

  let addLabel = 'Sepete Ekle'
  if (!orderingEnabled) addLabel = 'Siparişe kapalı'
  else if (closed) addLabel = 'Satışta değil'

  function decrease() {
    setQuantity((current) => clampQuantity(current - 1))
  }

  function increase() {
    setQuantity((current) => clampQuantity(current + 1))
  }

  return (
    <article className={`product-card${closed ? ' is-closed' : ''}`}>
      {product.imageUrl && !imageFailed ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="product-image"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="product-image-placeholder" aria-hidden="true">
          🍽️
        </div>
      )}

      <div className="product-body">
        <h3 className="product-name mb-0">{product.name}</h3>
        {product.description ? <p className="product-desc mb-0">{product.description}</p> : null}

        {product.availabilityStatus === 'CLOSED' && product.availabilityNote ? (
          <div className="product-closed-note">{product.availabilityNote}</div>
        ) : null}

        <div className="d-flex align-items-center justify-content-between gap-2">
          <div className="product-price">{formatMoney(product.price)}</div>
          {!orderingEnabled ? <span className="badge text-bg-secondary">Online kapalı</span> : null}
        </div>

        <div className="product-actions mt-2">
          <div className="qty-control" role="group" aria-label={`${product.name} adedi`}>
            <button type="button" onClick={decrease} disabled={!canAdd || quantity <= 1} aria-label="Adet azalt">
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_LINE_QUANTITY}
              value={quantity}
              disabled={!canAdd}
              aria-label={`${product.name} için adet`}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (event.target.value === '') {
                  setQuantity(1)
                  return
                }
                if (Number.isFinite(next)) setQuantity(clampQuantity(next))
              }}
            />
            <button type="button" onClick={increase} disabled={!canAdd || quantity >= MAX_LINE_QUANTITY} aria-label="Adet artır">
              +
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm btn-add-product"
            disabled={!canAdd}
            onClick={() => {
              onAdd(product, quantity)
              setQuantity(1)
            }}
          >
            {addLabel}
          </button>
        </div>
      </div>
    </article>
  )
}
