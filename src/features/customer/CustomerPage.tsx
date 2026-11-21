import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { formatMoney } from '../../lib/format'
import { getCategoryIcon } from '../../lib/utils'
import {
  MAX_LINE_NOTE,
  MAX_LINE_QUANTITY,
  cartCount,
  cartTotal,
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

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false)
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
    setCartDrawerOpen(false)
    setSuccessResult(result)
    setSuccessSnapshot(snapshot)
    setSuccessOpen(true)
    setCart([])
    setFormVersion((version) => version + 1)
  }

  const mobileCount = cartCount(cart)
  const mobileTotal = cartTotal(cart)

  const categories = menu?.categories ?? []

  const allProducts = useMemo(() => {
    return categories.flatMap((cat) => cat.products)
  }, [categories])

  const totalProductCount = allProducts.length
  const isSearching = searchQuery.trim().length > 0
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('tr-TR')

  const displayedProducts = useMemo(() => {
    if (isSearching) {
      return allProducts.filter((product) => {
        const matchName = product.name.toLocaleLowerCase('tr-TR').includes(normalizedSearch)
        const matchDesc = product.description
          ? product.description.toLocaleLowerCase('tr-TR').includes(normalizedSearch)
          : false
        return matchName || matchDesc
      })
    }

    if (selectedCategoryId === 'ALL' || !selectedCategoryId) {
      return allProducts
    }

    const category = categories.find((cat) => cat.id === selectedCategoryId)
    return category ? category.products : allProducts
  }, [allProducts, categories, isSearching, normalizedSearch, selectedCategoryId])

  let headingTitle = 'Tüm Menü'
  if (isSearching) {
    headingTitle = `Arama: "${searchQuery.trim()}"`
  } else if (selectedCategoryId && selectedCategoryId !== 'ALL') {
    const category = categories.find((cat) => cat.id === selectedCategoryId)
    if (category) headingTitle = category.name
  }

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
        <div className="menu-nav-container" aria-label="Menü Gezintisi">
          {/* Arama ve Canlı Sepet Butonu */}
          <div className="menu-nav-top">
            <div className="menu-search-wrapper">
              <div className="menu-search-input-group">
                <span className="menu-search-icon" aria-hidden="true">🔍</span>
                <input
                  type="search"
                  className="menu-search-input"
                  placeholder="Menüde ara... (ör. Tost, ayran, çikolata)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Menüde ürün ara"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="menu-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Aramayı temizle"
                    title="Aramayı temizle"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>

            {/* Masaüstü Canlı Sepet Butonu */}
            <button
              type="button"
              className={`nav-cart-btn${mobileCount > 0 ? ' has-items' : ''}`}
              onClick={() => setCartDrawerOpen(true)}
              aria-label={`Sepeti aç (${mobileCount} ürün)`}
            >
              <span className="nav-cart-icon" aria-hidden="true">🛒</span>
              <span className="nav-cart-label">Sepetim</span>
              <span className="nav-cart-count">{mobileCount}</span>
              {mobileCount > 0 ? (
                <span className="nav-cart-total text-tabular">{formatMoney(mobileTotal)}</span>
              ) : null}
            </button>
          </div>

          {/* Kiosk Kategori Şeridi */}
          <div className="category-strip-wrapper">
            <div className="category-strip" role="tablist" aria-label="Menü kategorileri">
              <button
                type="button"
                role="tab"
                className={`category-pill${!isSearching && selectedCategoryId === 'ALL' ? ' active' : ''}`}
                aria-selected={!isSearching && selectedCategoryId === 'ALL'}
                onClick={() => {
                  setSelectedCategoryId('ALL')
                  if (isSearching) setSearchQuery('')
                }}
              >
                <span className="category-pill-icon" aria-hidden="true">✨</span>
                <span className="category-pill-name">Tümü</span>
                <span className="category-pill-count">{totalProductCount}</span>
              </button>

              {categories.map((category) => {
                const active = !isSearching && selectedCategoryId === category.id
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    className={`category-pill${active ? ' active' : ''}`}
                    aria-selected={active}
                    onClick={() => {
                      setSelectedCategoryId(category.id)
                      if (isSearching) setSearchQuery('')
                    }}
                  >
                    <span className="category-pill-icon" aria-hidden="true">
                      {getCategoryIcon(category.name)}
                    </span>
                    <span className="category-pill-name">{category.name}</span>
                    <span className="category-pill-count">{category.products.length}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="customer-layout">
          <section aria-labelledby="menu-heading" className="w-100">
            <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-3">
              <h2 id="menu-heading" className="h4 mb-0">
                {headingTitle}
              </h2>
              <span className="text-body-secondary small">{displayedProducts.length} ürün</span>
            </div>

            {displayedProducts.length === 0 ? (
              isSearching ? (
                <div className="empty-search-state text-center py-5">
                  <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
                  <h3 className="h5 mb-2">Aradığınız ürün bulunamadı</h3>
                  <p className="text-muted mb-3" style={{ maxWidth: '420px', margin: '0 auto 16px' }}>
                    &ldquo;{searchQuery}&rdquo; aramasına uygun bir ürün bulamadık. Farklı bir kelime deneyebilir veya kategorilerden seçim yapabilirsiniz.
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline-primary rounded-pill px-4"
                    onClick={() => setSearchQuery('')}
                  >
                    Aramayı Temizle
                  </button>
                </div>
              ) : (
                <EmptyState title="Bu kategoride ürün yok" description="Başka bir kategori seçebilirsiniz." />
              )
            ) : (
              <div className="product-grid">
                {displayedProducts.map((product) => (
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
        </div>
      </>
    )
  }

  return (
    <div className={`customer-page${mobileCount > 0 ? ' has-mobile-cart' : ''}`}>
      <header className="customer-hero">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div>
            <div className="d-flex align-items-center gap-3 mb-2">
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '6px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
                }}
              >
                <img
                  src="/CantinOS_anim_sidebar.gif"
                  alt="CantinOS"
                  style={{ height: '46px', width: 'auto', objectFit: 'contain' }}
                />
              </div>
              <span
                className="fw-bold text-white"
                style={{ fontSize: '1.9rem', letterSpacing: '0.03em', lineHeight: 1 }}
              >
                CantinOS
              </span>
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

      {/* Mobil Yüzen Sepet Çubuğu */}
      {mobileCount > 0 && !cartDrawerOpen ? (
        <aside className="mobile-cart-bar" aria-label="Mobil Sepet">
          <div className="mobile-cart-bar-info">
            <span className="mobile-cart-bar-badge">{mobileCount} ürün</span>
            <span className="mobile-cart-bar-total text-tabular">{formatMoney(mobileTotal)}</span>
          </div>
          <button
            type="button"
            className="btn btn-primary rounded-pill mobile-cart-bar-btn"
            onClick={() => setCartDrawerOpen(true)}
          >
            Sepeti Onayla ➔
          </button>
        </aside>
      ) : null}

      {/* Ortak Sepet & Checkout Çekmecesi (PC'de Sağdan Slide-Over, Mobilde Alttan Bottom Sheet) */}
      {cartDrawerOpen ? (
        <div
          className="cart-drawer-backdrop"
          onClick={() => setCartDrawerOpen(false)}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="cart-drawer-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cart-drawer-header">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-pill d-inline-flex align-items-center gap-1"
                onClick={() => setCartDrawerOpen(false)}
              >
                <span>←</span> Menüye Dön
              </button>
              <h3 className="h5 mb-0 fw-bold">Sepetim ({mobileCount})</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setCartDrawerOpen(false)}
                aria-label="Kapat"
              />
            </div>

            <div className="cart-drawer-body">
              <CartPanel
                lines={cart}
                onQuantityChange={handleQuantityChange}
                onNoteChange={handleNoteChange}
                onRemove={handleRemove}
              >
                <CheckoutForm
                  key={formVersion}
                  lines={cart}
                  orderingEnabled={menu?.onlineOrderingEnabled ?? false}
                  onSuccess={handleSuccess}
                />
              </CartPanel>
            </div>
          </div>
        </div>
      ) : null}

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
