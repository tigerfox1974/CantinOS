import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../../components/Dialogs'
import { ErrorAlert, LoadingBlock } from '../../components/Feedback'
import { staffAdminApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { formatDuration, formatMoney, formatTime } from '../../lib/format'
import { usePolling } from '../../lib/polling'
import type { DailySummary } from '../../types/domain'

type StatTone = 'alert' | 'ok'

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: StatTone
}) {
  const toneClass = tone === 'alert' ? ' is-alert' : tone === 'ok' ? ' is-ok' : ''
  return (
    <div className={`stat-card${toneClass}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="small text-body-secondary mt-1">{hint}</div> : null}
    </div>
  )
}

function CashDifferenceValue({ difference }: { difference: number | null }) {
  if (difference === null) {
    return (
      <span className="fw-normal text-body-secondary" style={{ fontSize: '1rem' }}>
        Kapanış yapılmadı
      </span>
    )
  }

  const label = difference < 0 ? 'açık' : difference > 0 ? 'fazla' : 'denk'
  const badgeClass =
    difference < 0 ? 'text-bg-danger' : difference > 0 ? 'text-bg-warning' : 'text-bg-success'

  return (
    <span className="d-inline-flex flex-wrap align-items-center gap-2">
      <span>{formatMoney(difference)}</span>
      <span className={`badge ${badgeClass}`} style={{ fontSize: '0.8rem' }}>
        {label}
      </span>
    </span>
  )
}

export function OverviewTab({ token }: { token: string }) {
  const { data, error, loading, refresh } = usePolling<DailySummary>(
    () => staffAdminApi.dailySummary(token),
    { enabled: Boolean(token) },
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading && !data) {
    return <LoadingBlock label="Günlük özet yükleniyor…" />
  }

  if (!data) {
    return <ErrorAlert message={error ?? 'Günlük özet yüklenemedi.'} onRetry={() => void refresh()} />
  }

  const online = data.onlineOrderingEnabled

  const handleToggleOnline = async () => {
    setToggling(true)
    setActionError(null)
    try {
      await staffAdminApi.toggleOnlineOrdering(token, !online)
      setConfirmOpen(false)
      await refresh()
    } catch (cause) {
      setActionError(toUserMessage(cause))
    } finally {
      setToggling(false)
    }
  }

  const closeConfirm = () => {
    if (toggling) return
    setConfirmOpen(false)
    setActionError(null)
  }

  return (
    <div>
      {error ? <ErrorAlert message={error} onRetry={() => void refresh()} /> : null}

      {data.openProblems > 0 ? (
        <div className="alert alert-danger" role="alert">
          <strong>{data.openProblems} açık sorun</strong> bildirimi var. Ayrıntılar için Siparişler sekmesine
          bakın.
        </div>
      ) : null}

      <div className="manager-stats">
        <StatCard
          label="Aktif sipariş"
          value={data.activeOrders}
          hint={`${data.preparingOrders} hazırlanıyor · ${data.readyOrders} hazır`}
        />
        <StatCard label="Hazırlanan" value={data.preparingOrders} />
        <StatCard label="Hazır" value={data.readyOrders} tone={data.readyOrders > 0 ? 'ok' : undefined} />
        <StatCard
          label="Ödeme bekleyen"
          value={data.waitingPaymentOrders}
          tone={data.waitingPaymentOrders > 0 ? 'alert' : undefined}
        />
        <StatCard
          label="Bugünkü tahsilat"
          value={formatMoney(data.collections)}
          hint={data.refunds > 0 ? `İade: ${formatMoney(data.refunds)}` : undefined}
        />
        <StatCard label="Bugünkü ciro" value={formatMoney(data.revenue)} />
        <StatCard label="Nakit tahsilat" value={formatMoney(data.cashCollections)} />
        <StatCard label="Kart tahsilat" value={formatMoney(data.cardCollections)} />
        <StatCard label="Ortalama hazırlık süresi" value={formatDuration(data.averagePrepMinutes)} />
        <StatCard
          label="Günlük kasa farkı"
          value={<CashDifferenceValue difference={data.cashDifference} />}
          tone={data.cashDifference === null ? undefined : data.cashDifference === 0 ? 'ok' : 'alert'}
        />
        <StatCard
          label="Açık sorun"
          value={data.openProblems}
          tone={data.openProblems > 0 ? 'alert' : 'ok'}
        />
        <StatCard
          label="Online sipariş durumu"
          value={online ? 'Açık' : 'Kapalı'}
          tone={online ? 'ok' : 'alert'}
        />
        <StatCard
          label="Gün sonu kasa durumu"
          value={data.cashClosed ? 'Kapatıldı' : 'Kapanış yapılmadı'}
          hint={data.cashClosed && data.cashClosedAt ? formatTime(data.cashClosedAt) : undefined}
          tone={data.cashClosed ? 'ok' : undefined}
        />
      </div>

      <p className="small text-body-secondary mt-3 mb-0">
        Tahsilat, ödemesi alınmış siparişlerin toplamıdır. Ciro ise teslim edilmiş siparişlerin toplamıdır.
      </p>

      <div className="surface-card p-3 p-lg-4 mt-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <h2 className="h6 mb-1">Online sipariş</h2>
            <p className="text-body-secondary small mb-0">
              Kapatıldığında müşteri menüsünden yeni online sipariş alınamaz; kasadan satış devam eder.
            </p>
          </div>
          <div className="form-check form-switch m-0">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="online-ordering-switch"
              checked={online}
              disabled={toggling}
              onChange={() => {
                setActionError(null)
                setConfirmOpen(true)
              }}
            />
            <label className="form-check-label fw-semibold" htmlFor="online-ordering-switch">
              {online ? 'Açık' : 'Kapalı'}
            </label>
          </div>
        </div>
        {actionError && !confirmOpen ? (
          <div className="mt-3">
            <ErrorAlert message={actionError} />
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={online ? 'Online siparişi kapat' : 'Online siparişi aç'}
        message={
          online
            ? 'Online siparişler kapatılacak. Müşteriler menüden yeni sipariş oluşturamayacak; kasadan satış devam eder.'
            : 'Online siparişler açılacak. Müşteriler menüden yeniden sipariş oluşturabilecek.'
        }
        confirmLabel={online ? 'Kapat' : 'Aç'}
        variant={online ? 'danger' : 'success'}
        busy={toggling}
        onConfirm={() => void handleToggleOnline()}
        onCancel={closeConfirm}
      >
        {actionError ? (
          <div className="mt-3">
            <ErrorAlert message={actionError} />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
