import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { formatMoney } from '../../lib/format'
import {
  cartCount,
  cartTotal,
  MAX_LINE_NOTE,
  MAX_LINE_QUANTITY,
  type CartLine,
} from './cart'

interface CartPanelProps {
  lines: CartLine[]
  onQuantityChange: (productId: string, quantity: number) => void
  onNoteChange: (productId: string, note: string) => void
  onRemove: (productId: string) => void
  children?: ReactNode
  isMobileDrawer?: boolean
}

export function CartPanel({
  lines,
  onQuantityChange,
  onNoteChange,
  onRemove,
  children,
  isMobileDrawer = false,
}: CartPanelProps) {
  const total = cartTotal(lines)
  const count = cartCount(lines)

  const containerRef = useRef<HTMLDivElement>(null)
  const [isDocked, setIsDocked] = useState(false)
  const [dockStyle, setDockStyle] = useState<CSSProperties>({})

  useEffect(() => {
    if (isMobileDrawer) return

    function updateDock() {
      if (window.innerWidth <= 992) {
        setIsDocked(false)
        setDockStyle({})
        return
      }

      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const TARGET_TOP = 130

      if (rect.top <= TARGET_TOP) {
        setIsDocked(true)
        setDockStyle({
          position: 'fixed',
          top: `${TARGET_TOP}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          maxHeight: `calc(100vh - ${TARGET_TOP + 16}px)`,
          overflowY: 'auto',
          zIndex: 20,
        })
      } else {
        setIsDocked(false)
        setDockStyle({})
      }
    }

    window.addEventListener('scroll', updateDock, { passive: true })
    window.addEventListener('resize', updateDock, { passive: true })
    updateDock()

    return () => {
      window.removeEventListener('scroll', updateDock)
      window.removeEventListener('resize', updateDock)
    }
  }, [isMobileDrawer])

  const content = (
    <>
      {!isMobileDrawer ? (
        <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
          <h2 className="h5 mb-0">Sepetim</h2>
          <span className="badge text-bg-primary">{count} ürün</span>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <p className="text-body-secondary small mb-0">
          Sepetiniz boş. Menüden ürün ekleyerek siparişinizi oluşturabilirsiniz.
        </p>
      ) : (
        <div>
          {lines.map((line) => {
            const unavailable = line.availabilityStatus !== 'ACTIVE'
            const unavailableText =
              line.availabilityStatus === 'CLOSED'
                ? 'Bu ürün şu anda satışta değil.'
                : 'Bu ürün artık menüde değil.'

            return (
              <div className="cart-line" key={line.productId}>
                <div>
                  <div className="fw-semibold">{line.name}</div>
                  <div className="small text-body-secondary">
                    {formatMoney(line.unitPrice)} × {line.quantity}
                  </div>
                  {unavailable ? (
                    <div className="small text-danger">
                      {unavailableText} Siparişi tamamlamak için sepetten kaldırın.
                    </div>
                  ) : null}
                </div>

                <div className="text-end">
                  <div className="fw-semibold text-tabular">{formatMoney(line.unitPrice * line.quantity)}</div>
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-danger p-0"
                    onClick={() => onRemove(line.productId)}
                  >
                    Kaldır
                  </button>
                </div>

                <div className="d-flex flex-wrap align-items-center gap-2" style={{ gridColumn: '1 / -1' }}>
                  <div className="qty-control" role="group" aria-label={`${line.name} adedi`}>
                    <button
                      type="button"
                      onClick={() => onQuantityChange(line.productId, line.quantity - 1)}
                      disabled={line.quantity <= 1}
                      aria-label={`${line.name} adedini azalt`}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_LINE_QUANTITY}
                      value={line.quantity}
                      aria-label={`${line.name} adedi`}
                      onChange={(event) => {
                        if (event.target.value === '') {
                          onQuantityChange(line.productId, 1)
                          return
                        }
                        const next = Number(event.target.value)
                        if (Number.isFinite(next)) onQuantityChange(line.productId, next)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onQuantityChange(line.productId, line.quantity + 1)}
                      disabled={line.quantity >= MAX_LINE_QUANTITY}
                      aria-label={`${line.name} adedini artır`}
                    >
                      +
                    </button>
                  </div>

                  <input
                    type="text"
                    className="form-control form-control-sm flex-grow-1"
                    style={{ minWidth: 140 }}
                    placeholder="Ürün notu (isteğe bağlı)"
                    maxLength={MAX_LINE_NOTE}
                    value={line.lineNote}
                    aria-label={`${line.name} için ürün notu`}
                    onChange={(event) => onNoteChange(line.productId, event.target.value)}
                  />
                </div>

                <div className="small text-body-secondary" style={{ gridColumn: '1 / -1' }}>
                  {line.lineNote.length}/{MAX_LINE_NOTE}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="total-row mt-3">
        <span>Toplam</span>
        <span className="amount text-tabular">{formatMoney(total)}</span>
      </div>

      {children ? <div className="mt-3">{children}</div> : null}
    </>
  )

  if (isMobileDrawer) {
    return (
      <div className="cart-panel in-drawer" aria-label="Sepet ve sipariş bilgileri">
        {content}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="cart-column">
      <aside
        className={`cart-panel${isDocked ? ' is-docked' : ''}`}
        style={isDocked ? dockStyle : undefined}
        aria-label="Sepet ve sipariş bilgileri"
      >
        {content}
      </aside>
    </div>
  )
}
