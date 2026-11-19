import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../../components/Dialogs'
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '../../components/Feedback'
import { staffAdminApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import {
  businessDate,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  parseMoneyInput,
} from '../../lib/format'
import { usePolling } from '../../lib/polling'

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatDifference(value: number): string {
  return value > 0 ? `+${formatMoney(value)}` : formatMoney(value)
}

function differenceLabel(value: number): string {
  if (value === 0) return 'Dengede'
  return value > 0 ? 'Fazla nakit' : 'Nakit açığı'
}

function differenceClass(value: number): string {
  if (value === 0) return 'text-success'
  return value > 0 ? 'text-warning-emphasis' : 'text-danger'
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'alert' | 'ok'
}) {
  const toneClass = tone === 'alert' ? ' is-alert' : tone === 'ok' ? ' is-ok' : ''
  return (
    <div className={`stat-card${toneClass}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="small muted mt-1">{hint}</div> : null}
    </div>
  )
}

export function CashClosingTab({ token }: { token: string }) {
  const today = businessDate()
  const [date, setDate] = useState(today)
  const [actualCashInput, setActualCashInput] = useState('')
  const [note, setNote] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { data, error, loading, refresh } = usePolling(
    async () => {
      const [summary, closings, report] = await Promise.all([
        staffAdminApi.dailySummary(token, date),
        staffAdminApi.cashClosings(token, 30),
        staffAdminApi.analytics(token, { from: date, to: date }),
      ])
      return { summary, closings, report }
    },
    { enabled: true },
  )

  const dateRef = useRef(date)
  useEffect(() => {
    if (dateRef.current === date) return
    dateRef.current = date
    setActualCashInput('')
    setNote('')
    setActionError(null)
    setSuccessMessage(null)
    setConfirmOpen(false)
    void refresh()
  }, [date, refresh])

  const summary = data?.summary ?? null
  const closings = data?.closings ?? []
  const summaryMatchesDate = summary?.businessDate === date
  const selectedClosing = closings.find((closing) => closing.businessDate === date) ?? null
  const deliveredFromReport =
    data?.report.dailyRevenue.find((item) => item.date === date)?.orders ?? 0
  const deliveredOrders = selectedClosing?.deliveredOrders ?? deliveredFromReport
  const expectedCash = selectedClosing?.expectedCash ?? summary?.cashCollections ?? 0
  const expectedCard = selectedClosing?.expectedCard ?? summary?.cardCollections ?? 0
  const averagePrep = selectedClosing?.averagePrepMinutes ?? summary?.averagePrepMinutes ?? null

  const normalizedInput = actualCashInput.replace(/\s/g, '')
  const isAmountValid =
    /^[0-9]+(?:[.,][0-9]{1,2})?$/.test(normalizedInput) && parseMoneyInput(normalizedInput) >= 0
  const actualCash = isAmountValid ? parseMoneyInput(normalizedInput) : 0
  const hasAmount = normalizedInput.length > 0
  const difference = roundMoney(actualCash - expectedCash)
  const differenceReady = hasAmount && isAmountValid && summaryMatchesDate
  const isFutureDate = date > today

  const handleClose = async () => {
    if (!isAmountValid) {
      setActionError('Kasadaki gerçek nakit tutarını geçerli bir şekilde girin.')
      return
    }
    if (isFutureDate) {
      setActionError('Gelecek bir tarih için kasa kapanışı yapılamaz.')
      return
    }

    setBusy(true)
    setActionError(null)
    setSuccessMessage(null)
    try {
      const closing = await staffAdminApi.closeCashDay(
        token,
        date,
        actualCash,
        note.trim() ? note.trim() : undefined,
      )
      setSuccessMessage(
        `${formatDate(closing.businessDate)} kasa kapanışı kaydedildi. Fark: ${formatDifference(closing.differenceAmount)} (${differenceLabel(closing.differenceAmount)}).`,
      )
      setConfirmOpen(false)
      setActualCashInput('')
      setNote('')
      await refresh()
    } catch (cause) {
      setActionError(toUserMessage(cause))
      setConfirmOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Gün Sonu Kasa Kapanışı"
        subtitle="Seçilen işletme gününün nakit ve kart mutabakatını kapatın."
      />

      <div className="surface-card p-3 p-lg-4 mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="closing-date">
              İşletme Tarihi
            </label>
            <input
              id="closing-date"
              type="date"
              className="form-control"
              value={date}
              max={today}
              disabled={busy}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="col-12 col-md-8">
            <div className="small muted">
              Kasa kapanışı seçilen işletme günü için yapılır. Varsayılan tarih bugündür (
              {formatDate(today)}).
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorAlert
          message={error}
          onRetry={() => {
            void refresh()
          }}
        />
      ) : null}

      {actionError ? (
        <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
          <span>{actionError}</span>
          <button
            type="button"
            className="btn-close"
            aria-label="Kapat"
            onClick={() => setActionError(null)}
          />
        </div>
      ) : null}

      {successMessage ? (
        <div className="alert alert-success d-flex flex-wrap align-items-center justify-content-between gap-2" role="status">
          <span>{successMessage}</span>
          <button
            type="button"
            className="btn-close"
            aria-label="Kapat"
            onClick={() => setSuccessMessage(null)}
          />
        </div>
      ) : null}

      {isFutureDate ? (
        <div className="alert alert-warning py-2" role="alert">
          Gelecek bir tarih için kasa kapanışı yapılamaz.
        </div>
      ) : null}

      {loading && !data ? <LoadingBlock label="Kasa kapanış verileri yükleniyor…" /> : null}

      {!data && !loading && !error ? (
        <EmptyState
          title="Kasa verisi yok"
          description="Seçilen işletme günü için özet veya kapanış kaydı bulunamadı."
        />
      ) : null}

      {data ? (
        <>
          {!summaryMatchesDate && !loading ? (
            <div className="alert alert-secondary py-2 d-flex align-items-center gap-2">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              <span>Seçilen günün verileri yükleniyor…</span>
            </div>
          ) : null}

          <div className="manager-stats mb-4">
            <MetricCard
              label="Teslim Edilmiş Nakit"
              value={formatMoney(summary?.cashCollections ?? 0)}
              hint="Tahsil edilen nakit"
            />
            <MetricCard
              label="Teslim Edilmiş Kart"
              value={formatMoney(summary?.cardCollections ?? 0)}
              hint="Tahsil edilen kart"
            />
            <MetricCard
              label="Beklenen Nakit"
              value={formatMoney(expectedCash)}
              hint={
                selectedClosing
                  ? 'Kapanış kaydındaki beklenen tutar'
                  : 'Kapanışta teslim edilen siparişlere göre hesaplanır'
              }
            />
            <MetricCard
              label="Beklenen Kart"
              value={formatMoney(expectedCard)}
              hint={
                selectedClosing
                  ? 'Kapanış kaydındaki beklenen tutar'
                  : 'Kapanışta teslim edilen siparişlere göre hesaplanır'
              }
            />
            <MetricCard
              label="Teslim Edilmiş Sipariş"
              value={String(deliveredOrders)}
              hint="Seçilen işletme günü"
            />
            <MetricCard
              label="Ortalama Hazırlık"
              value={formatDuration(averagePrep)}
              hint="Teslim edilen siparişler"
            />
          </div>

          <div className="surface-card p-3 p-lg-4 mb-4">
            <h2 className="h5 mb-3">Kasa Kapanışı</h2>

            {summary ? (
              summary.cashClosed ? (
                <div className="alert alert-info">
                  Bu işletme günü kapatıldı
                  {summary.cashClosedAt ? ` (${formatDateTime(summary.cashClosedAt)})` : ''}. Yeni
                  kapanış <strong>düzeltme kaydı</strong> oluşturur.
                </div>
              ) : (
                <div className="alert alert-secondary">
                  Bu işletme günü için henüz kasa kapanışı yapılmadı.
                </div>
              )
            ) : null}

            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="actual-cash">
                  Kasadaki Gerçek Nakit (TL)
                </label>
                <input
                  id="actual-cash"
                  type="text"
                  inputMode="decimal"
                  className="form-control form-control-lg"
                  placeholder="0,00"
                  value={actualCashInput}
                  disabled={busy || isFutureDate}
                  aria-describedby="actual-cash-help"
                  onChange={(event) => setActualCashInput(event.target.value)}
                />
                <div id="actual-cash-help" className="form-text">
                  Kasadaki sayılan nakit tutarını yazın. Örnek: 1250,50
                </div>
                {hasAmount && !isAmountValid ? (
                  <div className="form-text text-danger">
                    Geçerli bir tutar girin (en fazla iki ondalık).
                  </div>
                ) : null}
              </div>

              <div className="col-12 col-md-4">
                <div
                  className={`stat-card ${
                    !differenceReady ? '' : difference === 0 ? 'is-ok' : difference < 0 ? 'is-alert' : ''
                  }`}
                >
                  <div className="stat-label">Fark</div>
                  <div
                    className={`stat-value ${
                      !differenceReady ? 'muted' : differenceClass(difference)
                    }`}
                  >
                    {differenceReady ? formatDifference(difference) : '—'}
                  </div>
                  <div className={`small mt-1 ${!differenceReady ? 'muted' : differenceClass(difference)}`}>
                    {differenceReady
                      ? differenceLabel(difference)
                      : 'Tutar girildiğinde canlı hesaplanır'}
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-4">
                <button
                  type="button"
                  className="btn btn-primary btn-lg w-100"
                  disabled={!isAmountValid || busy || isFutureDate || !summaryMatchesDate}
                  onClick={() => {
                    setActionError(null)
                    setConfirmOpen(true)
                  }}
                >
                  {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
                  Gün Sonu Kapanışını Tamamla
                </button>
              </div>
            </div>

            <div className="mt-3">
              <label className="form-label" htmlFor="closing-note">
                Kapanış Notu (isteğe bağlı)
              </label>
              <textarea
                id="closing-note"
                className="form-control"
                rows={2}
                maxLength={500}
                value={note}
                disabled={busy}
                placeholder="Kasa sayımına ilişkin not"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          <div className="surface-card p-3 p-lg-4 mb-4">
            <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-3">
              <h2 className="h5 mb-0">Geçmiş Kapanışlar</h2>
              <span className="small muted">{closings.length} kayıt</span>
            </div>

            {closings.length === 0 ? (
              <EmptyState
                title="Kapanış kaydı yok"
                description="Henüz kaydedilmiş bir kasa kapanışı bulunmuyor."
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover align-middle table-compact mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Tarih</th>
                      <th scope="col" className="text-end">
                        Beklenen Nakit
                      </th>
                      <th scope="col" className="text-end">
                        Beklenen Kart
                      </th>
                      <th scope="col" className="text-end">
                        Gerçek Nakit
                      </th>
                      <th scope="col" className="text-end">
                        Fark
                      </th>
                      <th scope="col">Kapatan</th>
                      <th scope="col">Kapanış Zamanı</th>
                      <th scope="col">Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closings.map((closing) => (
                      <tr
                        key={closing.id}
                        className={closing.businessDate === date ? 'table-active' : undefined}
                      >
                        <td>{formatDate(closing.businessDate)}</td>
                        <td className="text-end text-tabular">
                          {formatMoney(closing.expectedCash)}
                        </td>
                        <td className="text-end text-tabular">
                          {formatMoney(closing.expectedCard)}
                        </td>
                        <td className="text-end text-tabular">
                          {formatMoney(closing.actualCash)}
                        </td>
                        <td
                          className={`text-end text-tabular fw-semibold ${differenceClass(
                            closing.differenceAmount,
                          )}`}
                        >
                          {formatDifference(closing.differenceAmount)}
                        </td>
                        <td>{closing.closedByName ?? '—'}</td>
                        <td className="text-tabular">{formatDateTime(closing.closedAt)}</td>
                        <td>
                          <span title={closing.note ?? undefined}>{closing.note ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Gün Sonu Kapanışını Onayla"
        confirmLabel="Kapanışı Tamamla"
        variant="primary"
        busy={busy}
        onConfirm={() => {
          void handleClose()
        }}
        onCancel={() => {
          if (!busy) setConfirmOpen(false)
        }}
        message={
          <div>
            <p className="mb-2">
              <strong>{formatDate(date)}</strong> işletme günü için kasa kapanışı tamamlanacak.
            </p>
            <ul className="list-unstyled small mb-0">
              <li className="d-flex justify-content-between gap-3">
                <span>Beklenen nakit</span>
                <span className="text-tabular">{formatMoney(expectedCash)}</span>
              </li>
              <li className="d-flex justify-content-between gap-3">
                <span>Kasadaki gerçek nakit</span>
                <span className="text-tabular">{formatMoney(actualCash)}</span>
              </li>
              <li className="d-flex justify-content-between gap-3 fw-semibold">
                <span>Fark</span>
                <span className={`text-tabular ${differenceClass(difference)}`}>
                  {formatDifference(difference)}
                </span>
              </li>
            </ul>
            {selectedClosing ? (
              <div className="alert alert-warning mt-3 mb-0">
                Bu tarih için daha önce kapanış yapıldı. Yeni kayıt <strong>düzeltme kaydı</strong>{' '}
                olarak oluşturulacak.
              </div>
            ) : null}
            <p className="small text-body-secondary mt-3 mb-0">
              Kapanış kaydı oluşturulduktan sonra değiştirilemez veya silinemez.
            </p>
          </div>
        }
      />
    </>
  )
}
