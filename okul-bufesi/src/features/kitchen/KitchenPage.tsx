import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '../../components/Dialogs'
import { ErrorAlert, LoadingBlock, PageHeader } from '../../components/Feedback'
import { staffAdminApi, staffOrderApi } from '../../lib/api'
import { logTechnicalError, toUserMessage } from '../../lib/errors'
import { formatTime } from '../../lib/format'
import { useClock, usePolling } from '../../lib/polling'
import type { ProblemType, StaffOrder } from '../../types/domain'
import { useAuth } from '../staff-auth/AuthProvider'
import { KitchenOrderCard } from './KitchenOrderCard'
import { ProblemModal } from './ProblemModal'
import { useKitchenSound } from './useKitchenSound'
import {
  DEFAULT_THRESHOLDS,
  groupKitchenOrders,
  normalizeThresholds,
  orderElapsedMinutes,
  type KitchenColumns,
  type KitchenThresholds,
} from './kitchen-utils'

const COLUMN_META: Array<{ key: keyof KitchenColumns; title: string; badgeClass: string }> = [
  { key: 'newOrders', title: 'Yeni Siparişler', badgeClass: 'text-bg-info' },
  { key: 'preparing', title: 'Hazırlanıyor', badgeClass: 'text-bg-warning' },
  { key: 'ready', title: 'Hazır', badgeClass: 'text-bg-success' },
]

interface OrderRef {
  id: string
  orderNumber: number
}

export function KitchenPage() {
  const { session } = useAuth()
  const token = session?.token ?? null

  const [thresholds, setThresholds] = useState<KitchenThresholds>(DEFAULT_THRESHOLDS)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [revertOrder, setRevertOrder] = useState<OrderRef | null>(null)
  const [problemOrder, setProblemOrder] = useState<OrderRef | null>(null)

  const now = useClock(1000)
  const sound = useKitchenSound()

  const loadOrders = useCallback(() => {
    if (!token) return Promise.resolve<StaffOrder[]>([])
    return staffOrderApi.list(token)
  }, [token])

  const { data, error, loading, refresh, lastUpdatedAt } = usePolling(loadOrders, { enabled: Boolean(token) })

  useEffect(() => {
    if (!token) return
    let active = true
    staffAdminApi
      .getSettings(token)
      .then((settings) => {
        if (active) setThresholds(normalizeThresholds(settings))
      })
      .catch((cause) => {
        logTechnicalError('kitchen:settings', cause)
      })
    return () => {
      active = false
    }
  }, [token])

  const orders = useMemo(() => data ?? [], [data])
  const columns = useMemo(() => groupKitchenOrders(orders), [orders])

  const seenNewNumbersRef = useRef<Set<number> | null>(null)
  const { playNewOrderBeep } = sound

  useEffect(() => {
    if (!data) return
    const newNumbers = data.filter((order) => order.status === 'NEW').map((order) => order.orderNumber)
    if (seenNewNumbersRef.current === null) {
      seenNewNumbersRef.current = new Set(newNumbers)
      return
    }
    const seen = seenNewNumbersRef.current
    const hasNewOrder = newNumbers.some((orderNumber) => !seen.has(orderNumber))
    for (const orderNumber of newNumbers) seen.add(orderNumber)
    if (hasNewOrder) playNewOrderBeep()
  }, [data, playNewOrderBeep])

  const changeStatus = useCallback(
    async (orderId: string, status: 'PREPARING' | 'READY'): Promise<boolean> => {
      if (!token) return false
      setBusyOrderId(orderId)
      setActionError(null)
      try {
        await staffOrderApi.setStatus(token, orderId, status)
        await refresh()
        return true
      } catch (cause) {
        setActionError(toUserMessage(cause))
        return false
      } finally {
        setBusyOrderId(null)
      }
    },
    [token, refresh],
  )

  const handleStart = useCallback(
    (orderId: string) => {
      void changeStatus(orderId, 'PREPARING')
    },
    [changeStatus],
  )

  const handleReady = useCallback(
    (orderId: string) => {
      void changeStatus(orderId, 'READY')
    },
    [changeStatus],
  )

  const handleRevert = useCallback((orderId: string, orderNumber: number) => {
    setRevertOrder({ id: orderId, orderNumber })
  }, [])

  const handleReportProblem = useCallback((orderId: string, orderNumber: number) => {
    setProblemOrder({ id: orderId, orderNumber })
  }, [])

  const closeProblem = useCallback(() => setProblemOrder(null), [])

  const confirmRevert = useCallback(async () => {
    if (!revertOrder) return
    const done = await changeStatus(revertOrder.id, 'PREPARING')
    if (done) setRevertOrder(null)
  }, [revertOrder, changeStatus])

  const submitProblem = useCallback(
    async (type: ProblemType, note: string) => {
      if (!token) throw new Error('Oturum doğrulanamadı. Lütfen yeniden giriş yapın.')
      if (!problemOrder) throw new Error('Sipariş bulunamadı. Lütfen tekrar deneyin.')
      await staffOrderApi.reportProblem(token, problemOrder.id, type, note.trim() ? note.trim() : undefined)
      setProblemOrder(null)
      await refresh()
    },
    [token, problemOrder, refresh],
  )

  if (!token) return <LoadingBlock label="Oturum doğrulanıyor…" />

  return (
    <div>
      <PageHeader
        title="Mutfak Ekranı"
        subtitle={`${orders.length} aktif sipariş`}
        actions={
          <>
            <span className="live-indicator">
              <span className="live-dot" aria-hidden="true" />
              Canlı
              {lastUpdatedAt ? <span>· {formatTime(lastUpdatedAt)}</span> : null}
            </span>
            <button
              type="button"
              className={`btn btn-sm ${sound.enabled ? 'btn-success' : 'btn-outline-secondary'}`}
              aria-pressed={sound.enabled}
              aria-label={
                sound.enabled ? 'Sesli uyarı açık, kapatmak için tıklayın' : 'Sesli uyarı kapalı, açmak için tıklayın'
              }
              title={sound.enabled ? 'Yeni siparişlerde sesli uyarı açık' : 'Yeni siparişlerde sesli uyarı kapalı'}
              onClick={sound.toggle}
            >
              <span aria-hidden="true">{sound.enabled ? '🔔' : '🔇'}</span>{' '}
              {sound.enabled ? 'Sesi Aç' : 'Ses Kapalı'}
            </button>
          </>
        }
      />

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
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setActionError(null)}>
            Kapat
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingBlock label="Siparişler yükleniyor…" />
      ) : (
        <div className="kitchen-board">
          {COLUMN_META.map((meta) => {
            const list = columns[meta.key]
            return (
              <section className="kitchen-column" key={meta.key} aria-label={meta.title}>
                <header className="kitchen-column-header">
                  <h2 className="h6 mb-0">{meta.title}</h2>
                  <span className={`badge ${meta.badgeClass}`}>{list.length}</span>
                </header>
                <div className="kitchen-column-body">
                  {list.length === 0 ? (
                    <p className="text-body-secondary small text-center mb-0 py-3">Sipariş yok</p>
                  ) : (
                    list.map((order) => (
                      <KitchenOrderCard
                        key={order.id}
                        order={order}
                        elapsedMinutes={orderElapsedMinutes(order, now)}
                        thresholds={thresholds}
                        busy={busyOrderId === order.id}
                        onStart={handleStart}
                        onReady={handleReady}
                        onRevert={handleRevert}
                        onReportProblem={handleReportProblem}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(revertOrder)}
        title="Siparişi geri al"
        message={
          <>
            <strong>#{revertOrder?.orderNumber ?? '—'}</strong> numaralı siparişi yeniden “Hazırlanıyor” durumuna almak
            istiyor musunuz?
          </>
        }
        confirmLabel="Geri Al"
        cancelLabel="Vazgeç"
        variant="warning"
        busy={Boolean(revertOrder && busyOrderId === revertOrder.id)}
        onConfirm={() => {
          void confirmRevert()
        }}
        onCancel={() => setRevertOrder(null)}
      />

      {problemOrder ? (
        <ProblemModal
          key={problemOrder.id}
          orderNumber={problemOrder.orderNumber}
          onClose={closeProblem}
          onSubmit={submitProblem}
        />
      ) : null}
    </div>
  )
}
