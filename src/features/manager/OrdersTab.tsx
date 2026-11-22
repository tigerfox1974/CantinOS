import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog, ReasonDialog } from '../../components/Dialogs'
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '../../components/Feedback'
import { staffOrderApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { formatMoney, formatTime } from '../../lib/format'
import { usePolling } from '../../lib/polling'
import type { StaffOrder } from '../../types/domain'
import { AdjustOrderModal } from './orders/AdjustOrderModal'
import { OrderDetailModal } from './orders/OrderDetailModal'
import { OrderListCard } from './orders/OrderListCard'
import { RefundOrderModal } from './orders/RefundOrderModal'

const EMPTY_ORDERS: StaffOrder[] = []
const SEARCH_DEBOUNCE_MS = 350

export function OrdersTab({ token }: { token: string }) {
  const [mode, setMode] = useState<'ACTIVE' | 'ALL'>('ACTIVE')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [success, setSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [selected, setSelected] = useState<StaffOrder | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [priorityTarget, setPriorityTarget] = useState<StaffOrder | null>(null)
  const [priorityRemoveTarget, setPriorityRemoveTarget] = useState<StaffOrder | null>(null)
  const [cancelTarget, setCancelTarget] = useState<StaffOrder | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<StaffOrder | null>(null)
  const [refundTarget, setRefundTarget] = useState<StaffOrder | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  // Arama metni geciktirilerek sunucuya gönderilir; yazarken input odağı korunur.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loader = useCallback(
    () => staffOrderApi.list(token, mode, search.length > 0 ? search : undefined),
    [token, mode, search],
  )
  const { data, error, loading, refresh, lastUpdatedAt } = usePolling(loader)

  const filterRef = useRef({ mode, search })
  // Filtre değişince beklemeden yeniden yükle.
  useEffect(() => {
    if (filterRef.current.mode === mode && filterRef.current.search === search) return
    filterRef.current = { mode, search }
    void refresh()
  }, [mode, search, refresh])

  // Başarı bildirimi kendiliğinden kapanır.
  useEffect(() => {
    if (!success) return
    const timer = window.setTimeout(() => setSuccess(null), 7000)
    return () => window.clearTimeout(timer)
  }, [success])

  const orders = data ?? EMPTY_ORDERS

  // Açık detay modalı canlı veriyle güncellenir; kayıt listeden çıksa bile son hali korunur.
  useEffect(() => {
    if (!detailOpen || !selected) return
    const fresh = orders.find((order) => order.id === selected.id)
    if (fresh && fresh !== selected) setSelected(fresh)
  }, [detailOpen, orders, selected])

  const openDetail = (order: StaffOrder) => {
    setSelected(order)
    setDetailOpen(true)
  }

  const openPriority = (order: StaffOrder) => {
    if (order.priorityOverride) setPriorityRemoveTarget(order)
    else setPriorityTarget(order)
  }

  const handleSetPriority = async (order: StaffOrder, reason: string) => {
    setActionBusy(true)
    setActionError(null)
    try {
      await staffOrderApi.setPriority(token, order.id, true, reason)
      setSuccess(`#${order.orderNumber} siparişi öncelikli olarak işaretlendi.`)
      setPriorityTarget(null)
      await refresh()
    } catch (cause) {
      setActionError(toUserMessage(cause))
      setPriorityTarget(null)
    } finally {
      setActionBusy(false)
    }
  }

  const handleRemovePriority = async (order: StaffOrder) => {
    setActionBusy(true)
    setActionError(null)
    try {
      await staffOrderApi.setPriority(token, order.id, false, 'Yönetici öncelik işaretini kaldırdı.')
      setSuccess(`#${order.orderNumber} siparişinin önceliği kaldırıldı.`)
      setPriorityRemoveTarget(null)
      await refresh()
    } catch (cause) {
      setActionError(toUserMessage(cause))
      setPriorityRemoveTarget(null)
    } finally {
      setActionBusy(false)
    }
  }

  const handleCancel = async (order: StaffOrder, reason: string) => {
    setActionBusy(true)
    setActionError(null)
    try {
      await staffOrderApi.cancel(token, order.id, reason)
      setSuccess(`#${order.orderNumber} siparişi iptal edildi.`)
      setCancelTarget(null)
      await refresh()
    } catch (cause) {
      setActionError(toUserMessage(cause))
      setCancelTarget(null)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Siparişler"
        subtitle="Tüm sipariş geçmişi, arama, öncelik, düzeltme, iptal ve iade işlemleri."
        actions={
          <>
            <span className="live-indicator">
              <span className="live-dot" aria-hidden="true" />
              {lastUpdatedAt ? `Canlı · ${formatTime(lastUpdatedAt)}` : 'Canlı'}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Yenile
            </button>
          </>
        }
      />

      {success ? (
        <div
          className="alert alert-success d-flex flex-wrap align-items-center justify-content-between gap-2"
          role="status"
        >
          <span>{success}</span>
          <button type="button" className="btn-close" aria-label="Kapat" onClick={() => setSuccess(null)} />
        </div>
      ) : null}

      {actionError ? <ErrorAlert message={actionError} /> : null}

      <div className="surface-card p-3 mb-3">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-lg-7">
            <label className="form-label small text-body-secondary" htmlFor="orders-search">
              Sipariş ara
            </label>
            <input
              id="orders-search"
              type="search"
              className="form-control"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Sipariş no, müşteri adı veya telefon"
              autoComplete="off"
            />
          </div>
          <div className="col-12 col-lg-5">
            <span className="form-label small text-body-secondary d-block">Kapsam</span>
            <div className="btn-group w-100" role="group" aria-label="Sipariş kapsamı">
              <button
                type="button"
                className={`btn ${mode === 'ACTIVE' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setMode('ACTIVE')}
                aria-pressed={mode === 'ACTIVE'}
              >
                Aktif
              </button>
              <button
                type="button"
                className={`btn ${mode === 'ALL' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setMode('ALL')}
                aria-pressed={mode === 'ALL'}
              >
                Tümü
              </button>
            </div>
          </div>
        </div>
        <div className="small text-body-secondary mt-2">
          {loading && !data
            ? 'Siparişler yükleniyor…'
            : `${orders.length} sipariş${search.length > 0 ? ` · "${search}" araması` : ''}`}
        </div>
      </div>

      {error ? <ErrorAlert message={error} onRetry={() => void refresh()} /> : null}
      {loading && !data ? <LoadingBlock label="Siparişler yükleniyor…" /> : null}

      {data && orders.length === 0 ? (
        <EmptyState
          title={
            search.length > 0
              ? 'Aramanızla eşleşen sipariş yok'
              : mode === 'ACTIVE'
                ? 'Aktif sipariş yok'
                : 'Sipariş bulunamadı'
          }
          description={
            search.length > 0
              ? 'Sipariş numarası, müşteri adı veya telefonla tekrar deneyin.'
              : mode === 'ACTIVE'
                ? 'Yeni siparişler geldiğinde burada görünür.'
                : 'Geçmiş siparişler burada listelenir.'
          }
        />
      ) : null}

      {orders.length > 0 ? (
        <div className="d-flex flex-column gap-2">
          {orders.map((order) => (
            <OrderListCard
              key={order.id}
              order={order}
              onOpenDetail={() => openDetail(order)}
              onTogglePriority={() => openPriority(order)}
              onAdjust={() => setAdjustTarget(order)}
              onCancel={() => setCancelTarget(order)}
              onRefund={() => setRefundTarget(order)}
            />
          ))}
        </div>
      ) : null}

      {detailOpen && selected ? (
        <OrderDetailModal
          order={selected}
          onClose={() => setDetailOpen(false)}
          onTogglePriority={() => {
            setDetailOpen(false)
            openPriority(selected)
          }}
          onAdjust={() => {
            setDetailOpen(false)
            setAdjustTarget(selected)
          }}
          onCancel={() => {
            setDetailOpen(false)
            setCancelTarget(selected)
          }}
          onRefund={() => {
            setDetailOpen(false)
            setRefundTarget(selected)
          }}
        />
      ) : null}

      {priorityTarget ? (
        <ReasonDialog
          open
          title={`Sipariş #${priorityTarget.orderNumber} öncelik ver`}
          description={
            <p className="small mb-0">
              Öncelikli siparişler mutfak ekranında öne alınır. Neden bilgisi zorunludur.
            </p>
          }
          confirmLabel="Öncelik ver"
          variant="warning"
          busy={actionBusy}
          onConfirm={(reason) => {
            void handleSetPriority(priorityTarget, reason)
          }}
          onCancel={() => {
            if (!actionBusy) setPriorityTarget(null)
          }}
        />
      ) : null}

      {priorityRemoveTarget ? (
        <ConfirmDialog
          open
          title="Önceliği kaldır"
          message={
            <p className="mb-0">
              #{priorityRemoveTarget.orderNumber} siparişinin öncelik işareti kaldırılacak. Devam edilsin mi?
            </p>
          }
          confirmLabel="Önceliği kaldır"
          variant="warning"
          busy={actionBusy}
          onConfirm={() => {
            void handleRemovePriority(priorityRemoveTarget)
          }}
          onCancel={() => {
            if (!actionBusy) setPriorityRemoveTarget(null)
          }}
        />
      ) : null}

      {cancelTarget ? (
        <ReasonDialog
          open
          title={`Sipariş #${cancelTarget.orderNumber} iptal`}
          description={
            <div className="small">
              <p className="mb-1">İptal işlemi geri alınamaz ve neden bilgisi zorunludur.</p>
              {cancelTarget.paidAmount > 0 ? (
                <p className="text-danger mb-0">
                  Sipariş ödenmiş görünüyor. İptalden sonra iade işlemini ayrıca yapmalısınız.
                </p>
              ) : null}
            </div>
          }
          confirmLabel="Siparişi iptal et"
          variant="danger"
          busy={actionBusy}
          onConfirm={(reason) => {
            void handleCancel(cancelTarget, reason)
          }}
          onCancel={() => {
            if (!actionBusy) setCancelTarget(null)
          }}
        />
      ) : null}

      {adjustTarget ? (
        <AdjustOrderModal
          order={adjustTarget}
          token={token}
          onClose={() => setAdjustTarget(null)}
          onSuccess={(result) => {
            const orderNumber = adjustTarget.orderNumber
            setSuccess(`#${orderNumber} siparişi düzeltildi. Yeni toplam: ${formatMoney(result.totalAmount)}.`)
            setAdjustTarget(null)
            void refresh()
          }}
        />
      ) : null}

      {refundTarget ? (
        <RefundOrderModal
          order={refundTarget}
          token={token}
          onClose={() => setRefundTarget(null)}
          onSuccess={(amount) => {
            const orderNumber = refundTarget.orderNumber
            setSuccess(`#${orderNumber} siparişi için ${formatMoney(amount)} iade kaydedildi.`)
            setRefundTarget(null)
            void refresh()
          }}
        />
      ) : null}
    </div>
  )
}
