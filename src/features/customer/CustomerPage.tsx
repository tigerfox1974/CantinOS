import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorAlert, LoadingBlock } from '../../components/Feedback'
import { publicApi } from '../../lib/api'
import { formatTime } from '../../lib/format'
import { usePolling } from '../../lib/polling'
import type { MenuProduct, OnlineOrderResult, PublicMenu } from '../../types/domain'
import { CartPanel } from './CartPanel'
import { CheckoutForm } from './CheckoutForm'
import { OrderSuccessModal } from './OrderSuccessModal'
import { ProductCard } from './ProductCard'
import {
  MAX_LINE_NOTE,
  MAX_LINE_QUANTITY,
  type CartLine,
  type OrderSnapshot,
} from './cart'

function findProduct(menu: PublicMenu, productId: string): MenuProduct | null {
  for (const category of menu.categories) {
    const product = category.products.find((entry) => entry.id === productId)
    if (product) return product
  }
  return null
}

function clampLineQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(value)))
}

export function CustomerPage() {
  const menuState = usePolling(() => publicApi.getMenu())
  const menu = menuState.data

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [successResult, setSuccessResult] = useState<OnlineOrderResult | null>(null)
  const [successSnapshot, setSuccessSnapshot] = useState<OrderSnapshot | null>(null)
  const [successOpen, setSuccessOpen] = useState(false)
  const [formVersion, setFormVersion] = useState(0)

  // Menü canlı güncellenirken sepet satırlarını güncel ad/fiyat/durum ile eşitle.
  // Sepet, adetler ve notlar korunur; yalnız ürün bilgileri tazelenir.
  useEffect(() => {
    if (!menu) return
    setCart((current) => {
      let changed = false
      const next = current.map((line) => {
        const product = findProduct(menu, line.productId)
        if (!product) {
          if (line.availabilityStatus === 'ARCHIVED') return line
          changed = true
          return { ...line, availabilityStatus: 'ARCHIVED' as const, availabilityNote: null }
        }
        if (
          line.name === product.name &&
          line.unitPrice === product.price &&
          line.availabilityStatus === product.availabilityStatus &&
          line.availabilityNote === product.availabilityNote &&
          line.imageUrl === product.imageUrl
        ) {
          return line
        }
        changed = true
        return {
          ...line,
          name: product.name,
          unitPrice: product.price,
          availabilityStatus: product.availabilityStatus,
          availabilityNote: product.availabilityNote,
          imageUrl: product.imageUrl,
        }
      })
      return changed ? next : current
    })
  }, [menu])

  function handleAdd(product: MenuProduct, quantity: number) {
    if (!menu?.onlineOrderingEnabled || product.availabilityStatus !== 'ACTIVE') return
    const clamped = clampLineQuantity(quantity)

    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                name: product.name,
                unitPrice: product.price,
                quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + clamped),
                availabilityStatus: product.availabilityStatus,
                availabilityNote: product.availabilityNote,
                imageUrl: product.imageUrl,
              }
            : line,
        )
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: clamped,
          lineNote: '',
          availabilityStatus: product.availabilityStatus,
          availabilityNote: product.availabilityNote,
          imageUrl: product.imageUrl,
        },
      ]
    })
  }

  function handleQuantityChange(productId: string, quantity: number) {
    const next = clampLineQuantity(quantity)
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, quantity: next } : line)),
    )
  }

  function handleNoteChange(productId: string, note: string) {
    setCart((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, lineNote: note.slice(0, MAX_LINE_NOTE) } : line,
      ),
    )
  }

  function handleRemove(productId: string) {
    setCart((current) => current.filter((line) => line.productId !== productId))
  }

  function handleSuccess(result: OnlineOrderResult, snapshot: OrderSnapshot) {
    setSuccessResult(result)
    setSuccessSnapshot(snapshot)
    setSuccessOpen(true)
    setCart([])
    setFormVersion((version) => version + 1)
  }

  const categories = menu?.categories ?? []
  const activeCategory = categories.find((category) => category.id === selectedCategoryId) ?? categories[0] ?? null
  const products = activeCategory?.products ?? []

  let menuContent: ReactNode
  if (!menu) {
    menuContent = menuState.loading ? (
      <LoadingBlock label="Menü yükleniyor…" />
    ) : menuState.error ? null : (
      <EmptyState title="Menü henüz yayınlanmadı" description="Ürünler eklendiğinde burada görünecek." />
    )
  } else if (categories.length === 0) {
    menuContent = (
      <EmptyState title="Menü henüz yayınlanmadı" description="Ürünler eklendiğinde burada görünecek." />
    )
  } else {
    menuContent = (
      <>
        <div className="category-strip" aria-label="Menü kategorileri">
          {categories.map((category) => {
            const active = category.id === activeCategory?.id
            return (
              <button
                key={category.id}
                type="button"
                className={`category-pill${active ? ' active' : ''}`}
                aria-pressed={active}
                onClick={() => setSelectedCategoryId(category.id)}
              >
                {category.name}
              </button>
            )
          })}
        </div>

        <div className="customer-layout">
          <section aria-labelledby="menu-heading">
            <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-3">
              <h2 id="menu-heading" className="h4 mb-0">
                {activeCategory?.name ?? 'Menü'}
              </h2>
              <span className="text-body-secondary small">{products.length} ürün</span>
            </div>

            {products.length === 0 ? (
              <EmptyState title="Bu kategoride ürün yok" description="Başka bir kategori seçebilirsiniz." />
            ) : (
              <div className="product-grid">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    orderingEnabled={menu.onlineOrderingEnabled}
                    onAdd={handleAdd}
                  />
                ))}
              </div>
            )}
          </section>

          <CartPanel
            lines={cart}
            onQuantityChange={handleQuantityChange}
            onNoteChange={handleNoteChange}
            onRemove={handleRemove}
          >
            <CheckoutForm
              key={formVersion}
              lines={cart}
              orderingEnabled={menu.onlineOrderingEnabled}
              onSuccess={handleSuccess}
            />
          </CartPanel>
        </div>
      </>
    )
  }

  return (
    <div className="customer-page">
      <header className="customer-hero">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div>
            <div className="text-uppercase small fw-semibold" style={{ letterSpacing: '0.12em', opacity: 0.85 }}>
              CantinOS
            </div>
            <h1 className="display-6 mb-2">Teneffüste hazır olsun</h1>
            <p className="lead mb-0">
              Menüden seçin, teslim saatini belirleyin. Ödeme teslim alınırken nakit veya kart ile yapılır.
            </p>
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="live-indicator text-white">
              <span className="live-dot" aria-hidden="true" />
              {menuState.lastUpdatedAt ? `Canlı menü · ${formatTime(menuState.lastUpdatedAt)}` : 'Canlı menü'}
            </span>
            <Link to="/bekleme" className="btn btn-sm btn-outline-light ms-2">
              📺 Bekleme Ekranı
            </Link>
            <Link to="/personel" className="btn btn-sm btn-light">
              👤 Personel Girişi
            </Link>
          </div>
        </div>
      </header>

      {menuState.error ? (
        <ErrorAlert
          message={menuState.error}
          onRetry={() => {
            void menuState.refresh()
          }}
        />
      ) : null}

      {menu && !menu.onlineOrderingEnabled ? (
        <div className="closed-banner mb-3 d-flex flex-wrap align-items-center gap-2" role="status">
          <strong>Şu an online siparişe kapalıyız.</strong>
          <span>Menüyü inceleyebilirsiniz; sipariş vermek için daha sonra tekrar deneyin.</span>
        </div>
      ) : null}

      {successResult && !successOpen ? (
        <div className="alert alert-success d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <div className="fw-semibold">
              Siparişiniz alındı. Sipariş No: <span className="text-tabular">#{successResult.orderNumber}</span>
            </div>
            <div className="small">Takip bağlantınızı kaybettiyseniz işletme desteğine başvurun.</div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => setSuccessOpen(true)}
            >
              Sipariş özeti
            </button>
            <Link to={successResult.trackingPath} className="btn btn-sm btn-success">
              Takip ekranını aç
            </Link>
          </div>
        </div>
      ) : null}

      {menuContent}

      {successResult && successSnapshot ? (
        <OrderSuccessModal
          key={successResult.orderId}
          open={successOpen}
          result={successResult}
          snapshot={successSnapshot}
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
    </div>
  )
}
