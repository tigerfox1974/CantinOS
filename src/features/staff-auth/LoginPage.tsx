import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toUserMessage } from '../../lib/errors'
import { isDemoActive } from '../../lib/supabase'
import { roleHome, roleLabel, useAuth } from './AuthProvider'

export function LoginPage() {
  const { session, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) {
    return <Navigate to={roleHome(session.staff.role)} replace />
  }

  const from = (location.state as { from?: string } | null)?.from

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      navigate(from && from.startsWith('/personel') ? from : roleHome(result.staff.role), { replace: true })
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card card shadow-lg border-0">
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-4">
            <div className="login-mark" aria-hidden="true">
              🍽️
            </div>
            <h1 className="h4 mt-3 mb-1">Personel Girişi</h1>
            <p className="text-body-secondary mb-0">CantinOS İşletme Yönetimi</p>
          </div>

          {error ? (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          ) : null}

          {isDemoActive ? (
            <div className="bg-body-tertiary p-3 rounded mb-4">
              <div className="small fw-semibold text-secondary mb-2">⚡ Hızlı Demo Girişi:</div>
              <div className="d-flex flex-column gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary text-start d-flex justify-content-between align-items-center"
                  onClick={() => {
                    setEmail('kasa@cantinos.demo')
                    setPassword('Kasa123!')
                  }}
                >
                  <span>🛒 <strong>Kasa (Kantin)</strong></span>
                  <span className="small text-body-secondary">kasa@cantinos.demo</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning text-start d-flex justify-content-between align-items-center"
                  onClick={() => {
                    setEmail('mutfak@cantinos.demo')
                    setPassword('Mutfak123!')
                  }}
                >
                  <span>🍳 <strong>Mutfak</strong></span>
                  <span className="small text-body-secondary">mutfak@cantinos.demo</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success text-start d-flex justify-content-between align-items-center"
                  onClick={() => {
                    setEmail('yonetici@cantinos.demo')
                    setPassword('Yonetici123!')
                  }}
                >
                  <span>📊 <strong>Yönetici</strong></span>
                  <span className="small text-body-secondary">yonetici@cantinos.demo</span>
                </button>
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="login-email" className="form-label">
                E-posta
              </label>
              <input
                id="login-email"
                type="email"
                className="form-control form-control-lg"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="login-password" className="form-label">
                Parola
              </label>
              <input
                id="login-password"
                type="password"
                className="form-control form-control-lg"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg w-100" disabled={busy}>
              {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
              Giriş Yap
            </button>
          </form>

          <p className="text-center text-body-secondary small mt-4 mb-0">
            Yalnız yetkili personel giriş yapabilir.
          </p>
          <p className="text-center small mt-2 mb-0">
            <Link to="/">Müşteri menüsüne dön</Link>
          </p>
        </div>
      </div>
      {session ? null : (
        <p className="login-footer text-white-50 small">
          {roleLabel('MANAGER')} · {roleLabel('CASHIER')} · {roleLabel('KITCHEN')} erişimleri rol ile sınırlıdır.
        </p>
      )}
    </div>
  )
}
