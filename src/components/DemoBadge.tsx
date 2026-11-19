import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resetDemoStore } from '../lib/mock-rpc'

export function DemoBadge() {
  const [open, setOpen] = useState(false)

  function handleReset() {
    if (window.confirm('Demo verileri ilk haline sıfırlansın mı?')) {
      resetDemoStore()
      window.location.reload()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      className="d-print-none"
    >
      {open ? (
        <div
          className="card shadow-lg border-primary mb-2"
          style={{ width: 320, fontSize: '0.875rem' }}
        >
          <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center py-2">
            <span className="fw-semibold">🧪 CantinOS Yerel Demo Modu</span>
            <button
              type="button"
              className="btn-close btn-close-white"
              style={{ fontSize: '0.7rem' }}
              onClick={() => setOpen(false)}
              aria-label="Kapat"
            />
          </div>
          <div className="card-body p-3">
            <div className="mb-3">
              <div className="fw-semibold small text-secondary mb-1">Hızlı Ekran Geçişleri:</div>
              <div className="d-flex flex-wrap gap-1">
                <Link to="/" className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(false)}>
                  🍔 Müşteri
                </Link>
                <Link to="/bekleme" className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(false)}>
                  📺 TV Bekleme
                </Link>
                <Link to="/personel" className="btn btn-sm btn-outline-primary" onClick={() => setOpen(false)}>
                  👤 Personel Girişi
                </Link>
              </div>
            </div>

            <div className="bg-body-tertiary p-2 rounded mb-3 small">
              <div className="fw-semibold mb-1">Demo Giriş Bilgileri:</div>
              <div>• Kasa: <code>kasa@cantinos.demo</code> / <code>Kasa123!</code></div>
              <div>• Mutfak: <code>mutfak@cantinos.demo</code> / <code>Mutfak123!</code></div>
              <div>• Yönetici: <code>yonetici@cantinos.demo</code> / <code>Yonetici123!</code></div>
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-danger w-100"
                onClick={handleReset}
              >
                Verileri Sıfırla
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setOpen(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn-sm btn-primary shadow rounded-pill d-flex align-items-center gap-2 px-3 py-2"
        onClick={() => setOpen((prev) => !prev)}
        title="Demo modu bilgileri ve hesaplar"
      >
        <span className="spinner-grow spinner-grow-sm text-warning" style={{ width: 8, height: 8 }} />
        <span className="fw-semibold">Demo Modu</span>
      </button>
    </div>
  )
}
