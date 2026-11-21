import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { EmptyState, LoadingBlock } from '../../components/Feedback'
import { AvailabilityBadge } from '../../components/StatusBadge'
import { staffOrderApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { formatMoney, parseMoneyInput } from '../../lib/format'
import { getCategoryIcon } from '../../lib/utils'
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
  getProductQuickModifiers,
  getQuickCashPresets,
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
  const [activeCategoryId, setActiveCategoryId] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [receivedText, setReceivedText] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [generalNote, setGeneralNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lineKeyRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const categoryStripRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const scrollLeftStartRef = useRef(0)

  // '/' tuşuna basıldığında doğrudan arama çubuğuna odaklan (kasiyer hızlı erişim kısayolu)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fare tekerleğiyle kategori şeridini pürüzsüz yatay kaydırma
  const handleCategoryWheel = (e: React.WheelEvent) => {
    if (e.deltaY !== 0 && categoryStripRef.current) {
      categoryStripRef.current.scrollLeft += e.deltaY
    }
  }

  // Fare ile tut-çek (mouse drag-to-scroll) olayları (PC için dokunmatik benzeri deneyim)
  const handleCategoryMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !categoryStripRef.current) return
    isDraggingRef.current = true
    startXRef.current = e.pageX - categoryStripRef.current.offsetLeft
    scrollLeftStartRef.current = categoryStripRef.current.scrollLeft
  }

  const handleCategoryMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !categoryStripRef.current) return
    e.preventDefault()
    const x = e.pageX - categoryStripRef.current.offsetLeft
    const walk = (x - startXRef.current) * 1.5
    categoryStripRef.current.scrollLeft = scrollLeftStartRef.current - walk
  }

  const handleCategoryMouseUpOrLeave = () => {
    isDraggingRef.current = false
  }

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryStripRef.current) {
      const amount = direction === 'left' ? -220 : 220
      categoryStripRef.current.scrollBy({ left: amount, behavior: 'smooth' })
    }
  }

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

    if (!activeCategoryId || activeCategoryId === 'ALL') {
      return allProducts
    }

    const category = categories.find((cat) => cat.id === activeCategoryId)
    return category ? category.products : allProducts
  }, [allProducts, categories, isSearching, normalizedSearch, activeCategoryId])

  // Sepetteki ürün adet haritası (ürün kartının köşesinde kaç adet eklendiğini göstermek için)
  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of cart) {
      map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity)
    }
    return map
  }, [cart])

  const total = cartTotal(cart)
  const itemCount = cartItemCount(cart)
  const receivedValue = parseMoneyInput(receivedText)
  const change = calculateChange(receivedValue, total)
  const quickCashPresets = useMemo(() => getQuickCashPresets(total), [total])

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

  function handleClearCart() {
    setCart([])
    setReceivedText('')
    setError(null)
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
      {/* SOL: POS Menü ve Canlı Ürün Arama (%68 - %70 Genişlik) */}
      <div className="col-12 col-lg-7 col-xl-8">
        <section className="pos-menu-card surface-card p-3 h-100 d-flex flex-column" aria-labelledby="cashier-menu-heading">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 id="cashier-menu-heading" className="h5 mb-0 d-flex align-items-center gap-2">
              <span>Menü</span>
              <span className="badge text-bg-primary rounded-pill small" style={{ fontSize: '0.78rem' }}>
                {displayedProducts.length} Ürün
              </span>
            </h2>
            <span className="small muted">
              Sepette: <strong>{itemCount} ürün</strong> ({formatMoney(total)})
            </span>
          </div>

          {/* Hızlı Arama Çubuğu */}
          <div className="pos-search-wrapper mb-3">
            <div className="menu-search-input-group">
              <span className="menu-search-icon" aria-hidden="true">🔍</span>
              <input
                ref={searchInputRef}
                type="search"
                className="menu-search-input"
                placeholder="Ürün veya kategori ara... ('/' kısayolu)"
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
              ) : (
                <span className="pos-search-kbd" title="Aramaya odaklanmak için '/' tuşuna basın">/</span>
              )}
            </div>
          </div>

          {/* Kategori Hapları (Tam genişlikte yatay kaydırılabilir + PC için Sol/Sağ Ok Tuşları) */}
          <div className="pos-category-nav-wrapper mb-3">
            <div className="category-scroll-container">
              <button
                type="button"
                className="category-nav-arrow left"
                onClick={() => scrollCategories('left')}
                aria-label="Kategorileri sola kaydır"
                title="Sola kaydır"
              >
                ‹
              </button>

              <div
                ref={categoryStripRef}
                className="category-strip"
                role="group"
                aria-label="Menü kategorileri"
                onWheel={handleCategoryWheel}
                onMouseDown={handleCategoryMouseDown}
                onMouseMove={handleCategoryMouseMove}
                onMouseUp={handleCategoryMouseUpOrLeave}
                onMouseLeave={handleCategoryMouseUpOrLeave}
              >
                <button
                  type="button"
                  className={`category-pill${!isSearching && activeCategoryId === 'ALL' ? ' active' : ''}`}
                  aria-pressed={!isSearching && activeCategoryId === 'ALL'}
                  onClick={() => {
                    setActiveCategoryId('ALL')
                    if (isSearching) setSearchQuery('')
                  }}
                >
                  <span className="category-pill-icon" aria-hidden="true">✨</span>
                  <span className="category-pill-name">Tümü</span>
                  <span className="category-pill-count">{totalProductCount}</span>
                </button>

                {categories.map((category) => {
                  const active = !isSearching && activeCategoryId === category.id
                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={`category-pill${active ? ' active' : ''}`}
                      aria-pressed={active}
                      onClick={() => {
                        setActiveCategoryId(category.id)
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

              <button
                type="button"
                className="category-nav-arrow right"
                onClick={() => scrollCategories('right')}
                aria-label="Kategorileri sağa kaydır"
                title="Sağa kaydır"
              >
                ›
              </button>
            </div>
          </div>

          {/* Dokunmatik / Ergonomik POS Ürün Karoları (Tiles) */}
          {displayedProducts.length === 0 ? (
            <div className="text-center py-5 border rounded-3 bg-light my-auto">
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔍</div>
              <div className="fw-semibold">Aradığınız kriterde ürün bulunamadı</div>
              <div className="small muted mb-3">Farklı bir arama terimi deneyin veya filtreyi sıfırlayın.</div>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  setSearchQuery('')
                  setActiveCategoryId('ALL')
                }}
              >
                Filtreyi Temizle
              </button>
            </div>
          ) : (
            <div className="pos-product-grid flex-grow-1">
              {displayedProducts.map((product) => {
                const closed = product.availabilityStatus !== 'ACTIVE'
                const qtyInCart = cartQtyMap.get(product.id) ?? 0

                return (
                  <button
                    key={product.id}
                    type="button"
                    className={`pos-product-tile${closed ? ' is-closed' : ''}${qtyInCart > 0 ? ' in-cart' : ''}`}
                    disabled={closed}
                    onClick={() => addProduct(product)}
                    aria-label={`${product.name} - ${formatMoney(product.price)} ${closed ? '(Tükendi)' : 'Sepete ekle'}`}
                  >
                    {qtyInCart > 0 ? (
                      <span className="pos-tile-badge" title="Sepetteki adet">
                        {qtyInCart}
                      </span>
                    ) : null}

                    <div className="pos-tile-top">
                      <span className="pos-tile-icon" aria-hidden="true">
                        {getCategoryIcon(product.name)}
                      </span>
                      <span className="pos-tile-price text-tabular">{formatMoney(product.price)}</span>
                    </div>

                    <div className="pos-tile-name">{product.name}</div>

                    {closed ? (
                      <div className="pos-tile-status">
                        <AvailabilityBadge status={product.availabilityStatus} />
                      </div>
                    ) : product.description ? (
                      <div className="pos-tile-desc">{product.description}</div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* SAĞ: Canlı Sepet ve Ödeme Paneli (%30 - %32 Genişlik - Her Zaman Açık) */}
      <div className="col-12 col-lg-5 col-xl-4">
        <form className="cashier-cart surface-card p-3" onSubmit={handleSubmit} noValidate>
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2 pb-2 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <h2 className="h5 mb-0">Sepet</h2>
              <span className="badge text-bg-secondary">{cart.length} satır</span>
            </div>

            {cart.length > 0 ? (
              <button
                type="button"
                className="btn btn-link btn-sm text-danger text-decoration-none p-0"
                onClick={handleClearCart}
                title="Sepeti boşalt"
              >
                🗑 Sepeti Temizle
              </button>
            ) : null}
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-4 text-muted">
              <div style={{ fontSize: '2rem', opacity: 0.6, marginBottom: '6px' }}>🛒</div>
              <p className="small mb-0">Sepet boş. Soldaki menüden ürünlere dokunarak hızlıca ekleyin.</p>
            </div>
          ) : (
            <div className="pos-cart-list mb-2">
              {cart.map((line) => {
                const quickMods = getProductQuickModifiers(line.productName)

                return (
                  <div className="cart-line" key={line.key}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="fw-semibold small d-flex align-items-center gap-2">
                        <span>{line.productName}</span>
                      </div>
                      <div className="small muted">{formatMoney(line.unitPrice)}</div>

                      {/* Hızlı Hazır Opsiyon/Not Rozetleri (Quick Modifiers) */}
                      <div className="pos-quick-modifiers mt-1 d-flex flex-wrap gap-1">
                        {quickMods.map((mod) => {
                          const isSelected = line.lineNote.includes(mod)
                          return (
                            <button
                              key={mod}
                              type="button"
                              className={`badge border text-decoration-none btn-mod-chip ${
                                isSelected ? 'bg-primary text-white border-primary' : 'bg-white text-secondary'
                              }`}
                              onClick={() => {
                                let nextNote = line.lineNote.trim()
                                if (isSelected) {
                                  nextNote = nextNote
                                    .replace(mod, '')
                                    .replace(/\s*,\s*,/g, ',')
                                    .replace(/^,\s*/, '')
                                    .replace(/,\s*$/, '')
                                    .trim()
                                } else {
                                  nextNote = nextNote ? `${nextNote}, ${mod}` : mod
                                }
                                setCart((current) => updateCartLineNote(current, line.key, nextNote))
                              }}
                              title={`Not ekle: ${mod}`}
                            >
                              {mod}
                            </button>
                          )
                        })}
                      </div>

                      {/* Serbest Not Girişi */}
                      <input
                        type="text"
                        className="form-control form-control-sm pos-cart-line-note mt-1"
                        maxLength={MAX_LINE_NOTE}
                        value={line.lineNote}
                        placeholder="Özel satır notu..."
                        aria-label={`${line.productName} satır notu`}
                        onChange={(event) =>
                          setCart((current) =>
                            updateCartLineNote(current, line.key, event.target.value),
                          )
                        }
                      />
                    </div>

                    <div className="text-end ms-2">
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
                      <div className="small fw-bold text-tabular">{formatMoney(lineTotal(line))}</div>
                      <button
                        type="button"
                        className="btn btn-link btn-sm text-danger p-0 mt-1"
                        onClick={() => setCart((current) => removeCartLine(current, line.key))}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Toplam Çubuğu */}
          <div className="pos-total-box mt-3 p-2 rounded-3 bg-light border">
            <div className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold text-secondary">Genel Toplam</span>
              <span className="h4 mb-0 fw-bold text-primary text-tabular">{formatMoney(total)}</span>
            </div>
          </div>

          {/* Ödeme Yöntemi */}
          <div className="mt-3">
            <span className="form-label d-block fw-semibold mb-2">Ödeme Yöntemi</span>
            <div className="row g-2" role="group" aria-label="Ödeme yöntemi">
              <div className="col-6">
                <button
                  type="button"
                  className={`btn w-100 py-2 d-flex align-items-center justify-content-center gap-2 ${
                    paymentMethod === 'CASH' ? 'btn-primary' : 'btn-outline-primary'
                  }`}
                  aria-pressed={paymentMethod === 'CASH'}
                  onClick={() => setPaymentMethod('CASH')}
                >
                  <span aria-hidden="true">💵</span>
                  <span className="fw-semibold">Nakit</span>
                </button>
              </div>
              <div className="col-6">
                <button
                  type="button"
                  className={`btn w-100 py-2 d-flex align-items-center justify-content-center gap-2 ${
                    paymentMethod === 'CARD' ? 'btn-primary' : 'btn-outline-primary'
                  }`}
                  aria-pressed={paymentMethod === 'CARD'}
                  onClick={() => setPaymentMethod('CARD')}
                >
                  <span aria-hidden="true">💳</span>
                  <span className="fw-semibold">Banka/Kart</span>
                </button>
              </div>
            </div>
          </div>

          {/* Hızlı Nakit / Banknot ve Para Üstü Motoru */}
          {paymentMethod === 'CASH' ? (
            <div className="mt-3 p-3 rounded-3 bg-light border">
              <label className="form-label fw-semibold d-block mb-1" htmlFor="cashier-received-amount">
                Alınan Para
              </label>

              {/* Hızlı Banknot Butonları */}
              {quickCashPresets.length > 0 ? (
                <div className="pos-quick-cash-bar mb-2">
                  <div className="d-flex flex-wrap gap-1">
                    {quickCashPresets.map((amount) => {
                      const isSelected = receivedValue === amount
                      const isExact = amount === total
                      return (
                        <button
                          key={amount}
                          type="button"
                          className={`btn btn-sm ${
                            isSelected
                              ? 'btn-success fw-bold'
                              : isExact
                              ? 'btn-outline-primary fw-semibold'
                              : 'btn-outline-secondary'
                          }`}
                          onClick={() => setReceivedText(amount.toFixed(2))}
                        >
                          {isExact ? `${formatMoney(amount)} (Tam)` : formatMoney(amount)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="input-group">
                <span className="input-group-text">₺</span>
                <input
                  id="cashier-received-amount"
                  type="text"
                  className="form-control form-control-lg text-tabular fw-bold"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={receivedText}
                  onChange={(event) => setReceivedText(event.target.value)}
                />
              </div>

              {/* Para Üstü Göstergesi */}
              <div className="pos-change-display mt-2 p-2 rounded-2 d-flex justify-content-between align-items-center">
                <span className="fw-semibold text-secondary">Para Üstü:</span>
                <span
                  className={`h5 mb-0 fw-bold text-tabular ${
                    receivedValue > 0 && isCashSufficient(receivedValue, total) ? 'text-success' : 'text-muted'
                  }`}
                >
                  {formatMoney(change)}
                </span>
              </div>

              {total > 0 && receivedValue > 0 && !isCashSufficient(receivedValue, total) ? (
                <div className="form-text text-danger mt-1">
                  Alınan para toplamdan düşük. En az {formatMoney(total)} girin.
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Müşteri Adı ve Sipariş Notu (Kompakt ve Kusursuz Yatay Hiza) */}
          <div className="row g-2 mt-2">
            <div className="col-6">
              <label
                className="form-label small text-secondary mb-1 text-truncate d-block"
                htmlFor="cashier-customer-name"
                title="Müşteri Adı (isteğe bağlı)"
              >
                Müşteri Adı
              </label>
              <input
                id="cashier-customer-name"
                type="text"
                className="form-control form-control-sm"
                maxLength={MAX_CUSTOMER_NAME}
                placeholder="Örn: Ahmet"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </div>
            <div className="col-6">
              <label
                className="form-label small text-secondary mb-1 text-truncate d-block"
                htmlFor="cashier-general-note"
                title="Sipariş Notu (isteğe bağlı)"
              >
                Sipariş Notu
              </label>
              <input
                id="cashier-general-note"
                type="text"
                className="form-control form-control-sm"
                maxLength={MAX_GENERAL_NOTE}
                placeholder="Örn: Ketçapsız"
                value={generalNote}
                onChange={(event) => setGeneralNote(event.target.value)}
              />
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

          {/* Siparişi Tamamla Butonu */}
          <button
            type="submit"
            className="btn btn-success btn-lg w-100 cashier-submit-btn d-flex align-items-center justify-content-center gap-2 fw-bold"
            disabled={busy || validationMessage !== null}
          >
            {busy ? (
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">⚡</span>
            )}
            <span>Siparişi Tamamla ve Fiş Ver · {formatMoney(total)}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
