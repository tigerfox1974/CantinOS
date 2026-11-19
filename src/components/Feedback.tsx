import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div>
        <h1 className="h3 mb-1">{title}</h1>
        {subtitle ? <p className="text-body-secondary mb-0">{subtitle}</p> : null}
      </div>
      {actions ? <div className="d-flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function LoadingBlock({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <div className="d-flex align-items-center gap-2 text-body-secondary py-5 justify-content-center">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={onRetry}>
          Tekrar dene
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center text-body-secondary py-5">
      <div className="display-6 mb-2" aria-hidden="true">
        🍽️
      </div>
      <p className="fw-semibold mb-1">{title}</p>
      {description ? <p className="mb-0 small">{description}</p> : null}
    </div>
  )
}

export function ConfigMissing() {
  return (
    <div className="container py-5" style={{ maxWidth: 720 }}>
      <div className="alert alert-warning">
        <h2 className="h5">Sistem yapılandırması eksik</h2>
        <p className="mb-2">
          Uygulama Supabase bağlantısı olmadan çalışamaz. Proje kökünde <code>.env</code> dosyası oluşturup
          aşağıdaki değerleri doldurun:
        </p>
        <pre className="mb-0 small bg-body-tertiary p-3 rounded">
          VITE_SUPABASE_URL=...{'\n'}VITE_SUPABASE_ANON_KEY=...
        </pre>
      </div>
    </div>
  )
}
