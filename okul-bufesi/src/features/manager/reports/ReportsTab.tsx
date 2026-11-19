import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '../../../components/Feedback'
import { OrderStatusBadge, PaymentStatusBadge, SourceBadge } from '../../../components/StatusBadge'
import { staffAdminApi } from '../../../lib/api'
import { toUserMessage } from '../../../lib/errors'
import { businessDate, formatDate, formatDateTime, formatMoney } from '../../../lib/format'
import { usePolling } from '../../../lib/polling'
import type {
  AdminCategory,
  AnalyticsFilters,
  AnalyticsReport,
  OrderSource,
  PaymentMethod,
} from '../../../types/domain'
import { exportAnalyticsToExcel } from './excel'

type RangeMode = 'today' | 'week' | 'month' | 'year' | 'custom'
type SourceFilter = '' | OrderSource
type PaymentFilter = '' | PaymentMethod

interface FilterDraft {
  mode: RangeMode
  month: string
  year: string
  from: string
  to: string
  categoryId: string
  source: SourceFilter
  paymentMethod: PaymentFilter
}

function startOfWeek(dateValue: string): string {
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  const offset = weekday === 0 ? 6 : weekday - 1
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function endOfMonth(monthValue: string): string {
  const [year, month] = monthValue.split('-').map(Number)
  const date = new Date(Date.UTC(year, month, 0))
  return date.toISOString().slice(0, 10)
}

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  )
}

function resolveRange(draft: FilterDraft): { from: string; to: string } | { error: string } {
  const today = businessDate()

  switch (draft.mode) {
    case 'today':
      return { from: today, to: today }
    case 'week':
      return { from: startOfWeek(today), to: today }
    case 'month': {
      if (!/^\d{4}-\d{2}$/.test(draft.month)) {
        return { error: 'Lütfen bir ay seçin.' }
      }
      return { from: `${draft.month}-01`, to: endOfMonth(draft.month) }
    }
    case 'year': {
      const year = Number(draft.year)
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return { error: 'Lütfen geçerli bir yıl seçin.' }
      }
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
    case 'custom': {
      if (!isValidDateInput(draft.from) || !isValidDateInput(draft.to)) {
        return { error: 'Lütfen başlangıç ve bitiş tarihlerini seçin.' }
      }
      if (draft.from > draft.to) {
        return { error: 'Bitiş tarihi başlangıçtan önce olamaz.' }
      }
      if (daysBetween(draft.from, draft.to) > 730) {
        return { error: 'Rapor aralığı en fazla iki yıl olabilir.' }
      }
      return { from: draft.from, to: draft.to }
    }
    default:
      return { error: 'Geçersiz tarih aralığı seçimi.' }
  }
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'alert' | 'ok'
}) {
  const toneClass = tone === 'alert' ? ' is-alert' : tone === 'ok' ? ' is-ok' : ''
  return (
    <div className={`stat-card${toneClass}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

export function ReportsTab({ token }: { token: string }) {
  const today = businessDate()
  const [draft, setDraft] = useState<FilterDraft>(() => ({
    mode: 'today',
    month: today.slice(0, 7),
    year: today.slice(0, 4),
    from: today,
    to: today,
    categoryId: '',
    source: '',
    paymentMethod: '',
  }))
  const [applied, setApplied] = useState<AnalyticsFilters>(() => ({ from: today, to: today }))
  const [filterError, setFilterError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [categoriesError, setCategoriesError] = useState<string | null>(null)

  const { data: report, error, loading, refresh, lastUpdatedAt } = usePolling<AnalyticsReport>(
    () => staffAdminApi.analytics(token, applied),
    { enabled: true },
  )

  const appliedRef = useRef(applied)
  useEffect(() => {
    if (appliedRef.current === applied) return
    appliedRef.current = applied
    void refresh()
  }, [applied, refresh])

  useEffect(() => {
    let active = true
    staffAdminApi
      .adminCategories(token)
      .then((raw) => {
        if (!active) return
        setCategories(Array.isArray(raw) ? (raw as AdminCategory[]) : [])
      })
      .catch((cause: unknown) => {
        if (active) setCategoriesError(toUserMessage(cause))
      })
    return () => {
      active = false
    }
  }, [token])

  const hours = useMemo<Array<{ hour: number; orders: number; revenue: number }>>(() => {
    const map = new Map<number, { hour: number; orders: number; revenue: number }>()
    report?.hourly.forEach((item) => map.set(item.hour, item))
    return Array.from({ length: 24 }, (_, hour) => map.get(hour) ?? { hour, orders: 0, revenue: 0 })
  }, [report])

  const maxHourlyRevenue = useMemo(
    () => hours.reduce((maximum, item) => Math.max(maximum, item.revenue), 0),
    [hours],
  )

  const dailyRows = useMemo(
    () => (report ? [...report.dailyRevenue].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [report],
  )

  const monthlyRows = useMemo(
    () =>
      report ? [...report.monthlyRevenue].sort((a, b) => b.month.localeCompare(a.month)) : [],
    [report],
  )

  const periodLabel =
    applied.from === applied.to
      ? formatDate(applied.from)
      : `${formatDate(applied.from)} – ${formatDate(applied.to)}`

  const hasAnyData = report
    ? report.orders.length > 0 ||
      report.topProducts.length > 0 ||
      report.dailyRevenue.length > 0 ||
      report.cashClosings.length > 0 ||
      report.paymentSummary.collections > 0 ||
      report.paymentSummary.revenue > 0
    : false

  const updateDraft = (patch: Partial<FilterDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }))
  }

  const handleApply = () => {
    const resolved = resolveRange(draft)
    if ('error' in resolved) {
      setFilterError(resolved.error)
      return
    }
    setFilterError(null)
    setApplied({
      from: resolved.from,
      to: resolved.to,
      categoryId: draft.categoryId || null,
      source: draft.source || null,
      paymentMethod: draft.paymentMethod || null,
    })
  }

  const handleReset = () => {
    setFilterError(null)
    setExportError(null)
    setDraft({
      mode: 'today',
      month: today.slice(0, 7),
      year: today.slice(0, 4),
      from: today,
      to: today,
      categoryId: '',
      source: '',
      paymentMethod: '',
    })
    setApplied({ from: today, to: today })
  }

  const handleExport = () => {
    if (!report) return
    setExportError(null)
    try {
      exportAnalyticsToExcel(report, {
        from: applied.from,
        to: applied.to,
        title: 'Satış ve Kasa Raporu',
      })
    } catch (cause) {
      setExportError(toUserMessage(cause))
    }
  }

  const peakHour = hours.reduce(
    (best, item) => (item.revenue > best.revenue ? item : best),
    hours[0],
  )
  const hourlyOrderTotal = hours.reduce((total, item) => total + item.orders, 0)
  const categoryRevenueTotal = report
    ? report.categoryDistribution.reduce((total, item) => total + item.revenue, 0)
    : 0

  return (
    <>
      <PageHeader
        title="Raporlar"
        subtitle={
          <span>
            {periodLabel}
            {report ? ` · ${report.orders.length} sipariş` : ''}
            {lastUpdatedAt ? ` · Son güncelleme ${formatDateTime(lastUpdatedAt)}` : ''}
          </span>
        }
        actions={
          <button
            type="button"
            className="btn btn-success"
            onClick={handleExport}
            disabled={!report || loading}
          >
            Excel'e Aktar (.xlsx)
          </button>
        }
      />

      <div className="surface-card p-3 p-lg-4 mb-4">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleApply()
          }}
        >
          <div className="row g-3 align-items-end">
            <div className="col-12 col-sm-6 col-lg-3">
              <label className="form-label" htmlFor="report-range-mode">
                Tarih Aralığı
              </label>
              <select
                id="report-range-mode"
                className="form-select"
                value={draft.mode}
                onChange={(event) => {
                  const mode = event.target.value as RangeMode
                  setDraft((previous) => ({
                    ...previous,
                    mode,
                    ...(mode === 'custom'
                      ? { from: previous.from || today, to: previous.to || today }
                      : {}),
                  }))
                }}
              >
                <option value="today">Bugün</option>
                <option value="week">Bu Hafta (Pzt–Bugün)</option>
                <option value="month">Seçilen Ay</option>
                <option value="year">Seçilen Yıl</option>
                <option value="custom">Özel Tarih Aralığı</option>
              </select>
            </div>

            {draft.mode === 'month' ? (
              <div className="col-12 col-sm-6 col-lg-3">
                <label className="form-label" htmlFor="report-month">
                  Ay
                </label>
                <input
                  id="report-month"
                  type="month"
                  className="form-control"
                  value={draft.month}
                  max={today.slice(0, 7)}
                  onChange={(event) => updateDraft({ month: event.target.value })}
                />
              </div>
            ) : null}

            {draft.mode === 'year' ? (
              <div className="col-12 col-sm-6 col-lg-3">
                <label className="form-label" htmlFor="report-year">
                  Yıl
                </label>
                <select
                  id="report-year"
                  className="form-select"
                  value={draft.year}
                  onChange={(event) => updateDraft({ year: event.target.value })}
                >
                  {Array.from({ length: 6 }, (_, index) => Number(today.slice(0, 4)) - index).map(
                    (year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ) : null}

            {draft.mode === 'custom' ? (
              <>
                <div className="col-12 col-sm-6 col-lg-3">
                  <label className="form-label" htmlFor="report-from">
                    Başlangıç
                  </label>
                  <input
                    id="report-from"
                    type="date"
                    className="form-control"
                    value={draft.from}
                    max={draft.to || today}
                    onChange={(event) => updateDraft({ from: event.target.value })}
                  />
                </div>
                <div className="col-12 col-sm-6 col-lg-3">
                  <label className="form-label" htmlFor="report-to">
                    Bitiş
                  </label>
                  <input
                    id="report-to"
                    type="date"
                    className="form-control"
                    value={draft.to}
                    min={draft.from || undefined}
                    onChange={(event) => updateDraft({ to: event.target.value })}
                  />
                </div>
              </>
            ) : null}

            <div className="col-12 col-sm-6 col-lg-3">
              <label className="form-label" htmlFor="report-category">
                Kategori
              </label>
              <select
                id="report-category"
                className="form-select"
                value={draft.categoryId}
                onChange={(event) => updateDraft({ categoryId: event.target.value })}
              >
                <option value="">Tüm kategoriler</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.isArchived ? ' (arşiv)' : ''}
                  </option>
                ))}
              </select>
              {categoriesError ? (
                <div className="form-text text-danger">{categoriesError}</div>
              ) : null}
            </div>

            <div className="col-12 col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="report-source">
                Kaynak
              </label>
              <select
                id="report-source"
                className="form-select"
                value={draft.source}
                onChange={(event) => updateDraft({ source: event.target.value as SourceFilter })}
              >
                <option value="">Tümü</option>
                <option value="ONLINE">Online</option>
                <option value="CASHIER">Kasa</option>
              </select>
            </div>

            <div className="col-12 col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="report-payment">
                Ödeme Yöntemi
              </label>
              <select
                id="report-payment"
                className="form-select"
                value={draft.paymentMethod}
                onChange={(event) =>
                  updateDraft({ paymentMethod: event.target.value as PaymentFilter })
                }
              >
                <option value="">Tümü</option>
                <option value="CASH">Nakit</option>
                <option value="CARD">Kart</option>
              </select>
            </div>

            <div className="col-12 col-lg-3 d-flex gap-2">
              <button type="submit" className="btn btn-primary flex-grow-1">
                Filtrele
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={handleReset}>
                Sıfırla
              </button>
            </div>
          </div>

          {filterError ? (
            <div className="alert alert-warning py-2 mt-3 mb-0" role="alert">
              {filterError}
            </div>
          ) : null}
        </form>
      </div>

      {exportError ? <ErrorAlert message={exportError} /> : null}
      {error ? (
        <ErrorAlert
          message={error}
          onRetry={() => {
            void refresh()
          }}
        />
      ) : null}

      {!report && loading ? <LoadingBlock label="Rapor yükleniyor…" /> : null}
      {!report && !loading && !error ? (
        <EmptyState
          title="Rapor verisi yok"
          description="Seçilen dönem için rapor oluşturulamadı."
        />
      ) : null}

      {report ? (
        <>
          <div className="manager-stats mb-4">
            <StatCard label="Tahsilat" value={formatMoney(report.paymentSummary.collections)} />
            <StatCard label="Ciro" value={formatMoney(report.paymentSummary.revenue)} />
            <StatCard
              label="İade"
              value={formatMoney(report.paymentSummary.refunds)}
              tone={report.paymentSummary.refunds > 0 ? 'alert' : undefined}
            />
            <StatCard label="Nakit" value={formatMoney(report.paymentSummary.cash)} />
            <StatCard label="Kart" value={formatMoney(report.paymentSummary.card)} />
            <StatCard label="Sipariş" value={String(report.orders.length)} />
          </div>

          {!hasAnyData ? (
            <div className="surface-card p-4 mb-4">
              <EmptyState
                title="Kayıt bulunamadı"
                description="Seçilen dönem ve filtreler için satış, sipariş veya kasa kapanışı kaydı yok."
              />
            </div>
          ) : (
            <>
              <div className="row g-4 mb-4">
                <div className="col-12 col-xl-6">
                  <div className="surface-card p-3 p-lg-4 h-100">
                    <h2 className="h5 mb-3">En Çok Satılan Ürünler</h2>
                    {report.topProducts.length === 0 ? (
                      <EmptyState
                        title="Ürün satışı yok"
                        description="Seçilen dönemde satılan ürün bulunmuyor."
                      />
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle table-compact mb-0">
                          <thead>
                            <tr>
                              <th scope="col">#</th>
                              <th scope="col">Ürün</th>
                              <th scope="col" className="text-end">
                                Adet
                              </th>
                              <th scope="col" className="text-end">
                                Ciro
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.topProducts.map((item, index) => (
                              <tr key={`${item.name}-${index}`}>
                                <td className="muted">{index + 1}</td>
                                <td>{item.name}</td>
                                <td className="text-end text-tabular">{item.quantity}</td>
                                <td className="text-end text-tabular">{formatMoney(item.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-12 col-xl-6">
                  <div className="surface-card p-3 p-lg-4 h-100">
                    <h2 className="h5 mb-3">Kategori Dağılımı</h2>
                    {report.categoryDistribution.length === 0 ? (
                      <EmptyState
                        title="Kategori satışı yok"
                        description="Seçilen dönemde kategori bazlı satış bulunmuyor."
                      />
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle table-compact mb-0">
                          <thead>
                            <tr>
                              <th scope="col">Kategori</th>
                              <th scope="col" className="text-end">
                                Adet
                              </th>
                              <th scope="col" className="text-end">
                                Ciro
                              </th>
                              <th scope="col" className="text-end">
                                Pay
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.categoryDistribution.map((item) => {
                              const share =
                                categoryRevenueTotal > 0
                                  ? (item.revenue / categoryRevenueTotal) * 100
                                  : 0
                              return (
                                <tr key={item.name}>
                                  <td>
                                    <div>{item.name}</div>
                                    <div
                                      className="progress mt-1"
                                      style={{ height: 5 }}
                                      role="progressbar"
                                      aria-label={`${item.name} ciro payı`}
                                      aria-valuenow={Math.round(share)}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                    >
                                      <div
                                        className="progress-bar"
                                        style={{ width: `${Math.min(100, share)}%` }}
                                      />
                                    </div>
                                  </td>
                                  <td className="text-end text-tabular">{item.quantity}</td>
                                  <td className="text-end text-tabular">
                                    {formatMoney(item.revenue)}
                                  </td>
                                  <td className="text-end text-tabular">{share.toFixed(1)}%</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="surface-card p-3 p-lg-4 mb-4">
                <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-3">
                  <h2 className="h5 mb-0">Yoğun Saatler</h2>
                  <span className="small muted">
                    En yoğun saat: {String(peakHour.hour).padStart(2, '0')}:00 · Toplam{' '}
                    {hourlyOrderTotal} sipariş
                  </span>
                </div>
                <div className="report-chart" role="img" aria-label="Saatlik ciro dağılımı">
                  {hours.map((item) => {
                    const height =
                      maxHourlyRevenue > 0
                        ? `${Math.max(3, Math.round((item.revenue / maxHourlyRevenue) * 100))}%`
                        : '3px'
                    return (
                      <div
                        key={item.hour}
                        className="report-bar"
                        style={{ height, opacity: item.revenue > 0 ? 1 : 0.3 }}
                        title={`${String(item.hour).padStart(2, '0')}:00 · ${item.orders} sipariş · ${formatMoney(item.revenue)}`}
                      />
                    )
                  })}
                </div>
                <div className="d-flex gap-1 px-1 mt-1" aria-hidden="true">
                  {hours.map((item) => (
                    <div
                      key={item.hour}
                      className="muted"
                      style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem' }}
                    >
                      {item.hour % 3 === 0 ? String(item.hour).padStart(2, '0') : ''}
                    </div>
                  ))}
                </div>
              </div>

              <div className="row g-4 mb-4">
                <div className="col-12 col-xl-6">
                  <div className="surface-card p-3 p-lg-4 h-100">
                    <h2 className="h5 mb-3">Günlük Ciro</h2>
                    {dailyRows.length === 0 ? (
                      <EmptyState
                        title="Günlük ciro yok"
                        description="Seçilen dönemde teslim edilmiş sipariş bulunmuyor."
                      />
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle table-compact mb-0">
                          <thead>
                            <tr>
                              <th scope="col">Tarih</th>
                              <th scope="col" className="text-end">
                                Sipariş
                              </th>
                              <th scope="col" className="text-end">
                                Ciro
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyRows.map((item) => (
                              <tr key={item.date}>
                                <td>{formatDate(item.date)}</td>
                                <td className="text-end text-tabular">{item.orders}</td>
                                <td className="text-end text-tabular">
                                  {formatMoney(item.revenue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-12 col-xl-6">
                  <div className="surface-card p-3 p-lg-4 h-100">
                    <h2 className="h5 mb-3">Aylık Ciro</h2>
                    {monthlyRows.length === 0 ? (
                      <EmptyState
                        title="Aylık ciro yok"
                        description="Seçilen dönemde teslim edilmiş sipariş bulunmuyor."
                      />
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle table-compact mb-0">
                          <thead>
                            <tr>
                              <th scope="col">Ay</th>
                              <th scope="col" className="text-end">
                                Sipariş
                              </th>
                              <th scope="col" className="text-end">
                                Ciro
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthlyRows.map((item) => (
                              <tr key={item.month}>
                                <td>{formatMonthLabel(item.month)}</td>
                                <td className="text-end text-tabular">{item.orders}</td>
                                <td className="text-end text-tabular">
                                  {formatMoney(item.revenue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="surface-card p-3 p-lg-4 mb-4">
                <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-3">
                  <h2 className="h5 mb-0">Siparişler</h2>
                  <span className="small muted">{report.orders.length} kayıt</span>
                </div>
                {report.orders.length === 0 ? (
                  <EmptyState
                    title="Sipariş yok"
                    description="Seçilen dönemde sipariş kaydı bulunmuyor."
                  />
                ) : (
                  <div className="table-responsive" style={{ maxHeight: 520, overflowY: 'auto' }}>
                    <table className="table table-sm table-hover align-middle table-compact mb-0">
                      <thead>
                        <tr>
                          <th scope="col">Sipariş</th>
                          <th scope="col">Tarih</th>
                          <th scope="col">Kaynak</th>
                          <th scope="col">Durum</th>
                          <th scope="col">Ödeme</th>
                          <th scope="col">Müşteri</th>
                          <th scope="col" className="text-end">
                            Tutar
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.orders.map((order) => (
                          <tr key={`${order.orderNumber}-${order.createdAt}`}>
                            <td className="fw-semibold text-tabular">{order.orderNumber}</td>
                            <td className="text-tabular">{formatDateTime(order.createdAt)}</td>
                            <td>
                              <SourceBadge source={order.source} />
                            </td>
                            <td>
                              <OrderStatusBadge status={order.status} />
                            </td>
                            <td>
                              <PaymentStatusBadge status={order.paymentStatus} />
                            </td>
                            <td>{order.customerName ?? '—'}</td>
                            <td className="text-end text-tabular">
                              {formatMoney(order.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="surface-card p-3 p-lg-4 mb-4">
                <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-3">
                  <h2 className="h5 mb-0">Kasa Kapanışları</h2>
                  <span className="small muted">{report.cashClosings.length} kayıt</span>
                </div>
                {report.cashClosings.length === 0 ? (
                  <EmptyState
                    title="Kasa kapanışı yok"
                    description="Seçilen dönemde kasa kapanış kaydı bulunmuyor."
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
                          <th scope="col">Not</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.cashClosings.map((closing) => {
                          const difference = closing.differenceAmount
                          const differenceClass =
                            difference === 0
                              ? 'text-success'
                              : difference > 0
                                ? 'text-warning-emphasis'
                                : 'text-danger'
                          return (
                            <tr key={closing.id}>
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
                              <td className={`text-end text-tabular fw-semibold ${differenceClass}`}>
                                {difference > 0
                                  ? `+${formatMoney(difference)}`
                                  : formatMoney(difference)}
                              </td>
                              <td>{closing.closedByName ?? '—'}</td>
                              <td>
                                <span title={closing.note ?? undefined}>{closing.note ?? '—'}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : null}
    </>
  )
}
