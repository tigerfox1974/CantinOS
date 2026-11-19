import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../../components/Dialogs'
import { EmptyState, ErrorAlert, LoadingBlock } from '../../components/Feedback'
import { Modal } from '../../components/Modal'
import { staffAdminApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { usePolling } from '../../lib/polling'
import type { AdminDeliverySlot, DeliverySlotInput } from '../../types/domain'

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

interface SlotDraft {
  id?: string
  label: string
  targetTime: string
  sortOrder: string
  active: boolean
}

async function loadSlots(token: string): Promise<AdminDeliverySlot[]> {
  const result = await staffAdminApi.adminDeliverySlots(token)
  return Array.isArray(result) ? (result as AdminDeliverySlot[]) : []
}

function sortSlots(slots: AdminDeliverySlot[]): AdminDeliverySlot[] {
  return [...slots].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'tr'))
}

function nextSortOrder(slots: AdminDeliverySlot[]): number {
  if (slots.length === 0) return 10
  return Math.max(...slots.map((slot) => slot.sortOrder)) + 10
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const numeric = Number(trimmed)
  return Number.isInteger(numeric) ? numeric : null
}

export function SlotsTab({ token }: { token: string }) {
  const { data, error, loading, refresh } = usePolling<AdminDeliverySlot[]>(() => loadSlots(token), {
    enabled: Boolean(token),
  })
  const slots = useMemo(() => sortSlots(data ?? []), [data])

  const [draft, setDraft] = useState<SlotDraft | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingToggle, setPendingToggle] = useState<AdminDeliverySlot | null>(null)
  const [toggling, setToggling] = useState(false)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [warningInput, setWarningInput] = useState('')
  const [lateInput, setLateInput] = useState('')
  const [thresholdsLoading, setThresholdsLoading] = useState(true)
  const [thresholdsSaving, setThresholdsSaving] = useState(false)
  const [thresholdsError, setThresholdsError] = useState<string | null>(null)
  const [thresholdsSuccess, setThresholdsSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setThresholdsLoading(false)
      return
    }

    let active = true
    setThresholdsLoading(true)
    staffAdminApi
      .getSettings(token)
      .then((settings) => {
        if (!active) return
        setWarningInput(String(settings.kitchenWarningMinutes))
        setLateInput(String(settings.kitchenLateMinutes))
        setThresholdsError(null)
      })
      .catch((cause) => {
        if (!active) return
        setThresholdsError(toUserMessage(cause))
      })
      .finally(() => {
        if (active) setThresholdsLoading(false)
      })

    return () => {
      active = false
    }
  }, [token])

  const openCreate = () => {
    setFormError(null)
    setDraft({ label: '', targetTime: '', sortOrder: String(nextSortOrder(slots)), active: true })
  }

  const openEdit = (slot: AdminDeliverySlot) => {
    setFormError(null)
    setDraft({
      id: slot.id,
      label: slot.label,
      targetTime: slot.targetTime,
      sortOrder: String(slot.sortOrder),
      active: slot.active,
    })
  }

  const closeDraft = () => {
    if (saving) return
    setDraft(null)
    setFormError(null)
  }

  const saveSlot = async () => {
    if (!draft) return

    const label = draft.label.trim()
    if (label.length < 2 || label.length > 60) {
      setFormError('Teslim etiketi 2 ile 60 karakter arasında olmalıdır.')
      return
    }
    if (!TIME_PATTERN.test(draft.targetTime)) {
      setFormError('Teslim saatini HH:MM biçiminde girin.')
      return
    }

    const sortOrder = parseInteger(draft.sortOrder)
    if (draft.sortOrder.trim() !== '' && sortOrder === null) {
      setFormError('Sıra 0 veya daha büyük bir tam sayı olmalıdır.')
      return
    }

    const input: DeliverySlotInput = {
      label,
      targetTime: draft.targetTime,
      sortOrder: sortOrder ?? undefined,
      active: draft.active,
    }
    if (draft.id) input.id = draft.id

    setSaving(true)
    setFormError(null)
    try {
      await staffAdminApi.manageDeliverySlot(token, draft.id ? 'UPDATE' : 'CREATE', input)
      setDraft(null)
      await refresh()
    } catch (cause) {
      setFormError(toUserMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const confirmToggle = async () => {
    if (!pendingToggle) return

    setToggling(true)
    setActionError(null)
    try {
      await staffAdminApi.manageDeliverySlot(token, 'TOGGLE', {
        id: pendingToggle.id,
        label: pendingToggle.label,
        targetTime: pendingToggle.targetTime,
        active: !pendingToggle.active,
      })
      setPendingToggle(null)
      await refresh()
    } catch (cause) {
      setPendingToggle(null)
      setActionError(toUserMessage(cause))
    } finally {
      setToggling(false)
    }
  }

  const moveSlot = async (slot: AdminDeliverySlot, direction: -1 | 1) => {
    const index = slots.findIndex((item) => item.id === slot.id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= slots.length) return

    const next = [...slots]
    const moved = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = moved

    setReorderingId(slot.id)
    setActionError(null)
    try {
      for (let position = 0; position < next.length; position += 1) {
        const item = next[position]
        const desired = (position + 1) * 10
        if (item.sortOrder === desired) continue
        await staffAdminApi.manageDeliverySlot(token, 'REORDER', {
          id: item.id,
          label: item.label,
          targetTime: item.targetTime,
          sortOrder: desired,
        })
      }
      await refresh()
    } catch (cause) {
      setActionError(toUserMessage(cause))
    } finally {
      setReorderingId(null)
    }
  }

  const saveThresholds = async () => {
    const warning = parseInteger(warningInput)
    const late = parseInteger(lateInput)

    if (warning === null || warning < 1 || warning > 60) {
      setThresholdsError('Dikkat eşiği 1 ile 60 dakika arasında olmalıdır.')
      return
    }
    if (late === null || late < 1 || late > 120) {
      setThresholdsError('Gecikme eşiği 1 ile 120 dakika arasında olmalıdır.')
      return
    }
    if (late <= warning) {
      setThresholdsError('Gecikme eşiği dikkat eşiğinden büyük olmalıdır.')
      return
    }

    setThresholdsSaving(true)
    setThresholdsError(null)
    setThresholdsSuccess(null)
    try {
      await staffAdminApi.setKitchenThresholds(token, warning, late)
      setThresholdsSuccess('Mutfak eşikleri kaydedildi.')
    } catch (cause) {
      setThresholdsError(toUserMessage(cause))
    } finally {
      setThresholdsSaving(false)
    }
  }

  const handleSlotSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void saveSlot()
  }

  const handleThresholdSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void saveThresholds()
  }

  return (
    <div>
      {error ? <ErrorAlert message={error} onRetry={() => void refresh()} /> : null}
      {actionError ? <ErrorAlert message={actionError} /> : null}

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h2 className="h5 mb-1">Teslim saatleri</h2>
          <p className="text-body-secondary small mb-0">
            Teneffüs teslim saatlerini ekleyin, sıralayın veya geçici olarak kapatın.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Yeni teneffüs
        </button>
      </div>

      <div className="surface-card p-3 p-lg-4">
        {loading && !data ? (
          <LoadingBlock label="Teslim saatleri yükleniyor…" />
        ) : error && !data ? (
          <p className="text-body-secondary mb-0">Teslim saatleri yüklenemedi.</p>
        ) : slots.length === 0 ? (
          <EmptyState title="Henüz teslim saati yok" description="Yeni teneffüs ekleyerek başlayın." />
        ) : (
          <ul className="list-unstyled mb-0">
            {slots.map((slot, index) => (
              <li className="admin-list-row" key={slot.id}>
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span className={`badge ${slot.active ? 'text-bg-success' : 'text-bg-secondary'}`}>
                    {slot.active ? 'Aktif' : 'Pasif'}
                  </span>
                  <div>
                    <div className="fw-semibold">{slot.label}</div>
                    <div className="small text-body-secondary text-tabular">
                      {slot.targetTime} · Sıra {slot.sortOrder}
                    </div>
                  </div>
                  {reorderingId === slot.id ? (
                    <span className="spinner-border spinner-border-sm text-body-secondary" aria-hidden="true" />
                  ) : null}
                </div>

                <div className="d-flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    title="Yukarı taşı"
                    aria-label={`${slot.label} yukarı taşı`}
                    disabled={index === 0 || reorderingId !== null}
                    onClick={() => void moveSlot(slot, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    title="Aşağı taşı"
                    aria-label={`${slot.label} aşağı taşı`}
                    disabled={index === slots.length - 1 || reorderingId !== null}
                    onClick={() => void moveSlot(slot, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={saving || reorderingId !== null}
                    onClick={() => openEdit(slot)}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${slot.active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                    disabled={toggling || reorderingId !== null}
                    onClick={() => {
                      setActionError(null)
                      setPendingToggle(slot)
                    }}
                  >
                    {slot.active ? 'Kapat' : 'Aç'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface-card p-3 p-lg-4 mt-4">
        <h2 className="h5 mb-1">Mutfak eşikleri</h2>
        <p className="text-body-secondary small mb-3">
          Sipariş kartları bu sürelere göre dikkat ve gecikme durumuna geçer.
        </p>

        {thresholdsLoading ? (
          <div className="small text-body-secondary mb-2">Eşikler yükleniyor…</div>
        ) : null}

        <form className="row g-3 align-items-end" onSubmit={handleThresholdSubmit} noValidate>
          <div className="col-sm-4">
            <label className="form-label" htmlFor="kitchen-warning-minutes">
              Dikkat eşiği (dk)
            </label>
            <input
              id="kitchen-warning-minutes"
              className="form-control"
              type="number"
              min={1}
              max={60}
              inputMode="numeric"
              value={warningInput}
              disabled={thresholdsLoading || thresholdsSaving}
              onChange={(event) => setWarningInput(event.target.value)}
            />
          </div>
          <div className="col-sm-4">
            <label className="form-label" htmlFor="kitchen-late-minutes">
              Gecikme eşiği (dk)
            </label>
            <input
              id="kitchen-late-minutes"
              className="form-control"
              type="number"
              min={1}
              max={120}
              inputMode="numeric"
              value={lateInput}
              disabled={thresholdsLoading || thresholdsSaving}
              onChange={(event) => setLateInput(event.target.value)}
            />
          </div>
          <div className="col-sm-4">
            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={thresholdsLoading || thresholdsSaving}
            >
              {thresholdsSaving ? (
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
              ) : null}
              Eşikleri kaydet
            </button>
          </div>
        </form>

        {thresholdsError ? (
          <div className="mt-3">
            <ErrorAlert message={thresholdsError} />
          </div>
        ) : null}
        {thresholdsSuccess ? (
          <div className="alert alert-success mt-3 mb-0" role="status">
            {thresholdsSuccess}
          </div>
        ) : null}
      </div>

      <Modal
        open={draft !== null}
        title={draft?.id ? 'Teneffüsü düzenle' : 'Yeni teneffüs'}
        onClose={closeDraft}
        closeOnBackdrop={!saving}
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={closeDraft} disabled={saving}>
              Vazgeç
            </button>
            <button type="submit" form="slot-form" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
              Kaydet
            </button>
          </>
        }
      >
        {draft ? (
          <form id="slot-form" className="row g-3" onSubmit={handleSlotSubmit} noValidate>
            <div className="col-12">
              <label className="form-label" htmlFor="slot-label">
                Etiket
              </label>
              <input
                id="slot-label"
                className="form-control"
                type="text"
                maxLength={60}
                required
                autoFocus
                disabled={saving}
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
              <div className="form-text">Örn. 2. Teneffüs</div>
            </div>
            <div className="col-sm-6">
              <label className="form-label" htmlFor="slot-time">
                Saat
              </label>
              <input
                id="slot-time"
                className="form-control"
                type="time"
                required
                disabled={saving}
                value={draft.targetTime}
                onChange={(event) => setDraft({ ...draft, targetTime: event.target.value })}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label" htmlFor="slot-order">
                Sıra
              </label>
              <input
                id="slot-order"
                className="form-control"
                type="number"
                min={0}
                step={1}
                disabled={saving}
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              />
              <div className="form-text">Küçük değer önce gösterilir.</div>
            </div>
          </form>
        ) : null}

        {formError ? (
          <div className="mt-3">
            <ErrorAlert message={formError} />
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={pendingToggle !== null}
        title={pendingToggle?.active ? 'Teslim saatini kapat' : 'Teslim saatini aç'}
        message={
          pendingToggle
            ? `"${pendingToggle.label}" (${pendingToggle.targetTime}) teslim saati ${
                pendingToggle.active
                  ? 'kapatılacak. Müşteriler bu saati seçemeyecek.'
                  : 'açılacak. Müşteriler bu saati yeniden seçebilecek.'
              }`
            : ''
        }
        confirmLabel={pendingToggle?.active ? 'Kapat' : 'Aç'}
        variant={pendingToggle?.active ? 'danger' : 'success'}
        busy={toggling}
        onConfirm={() => void confirmToggle()}
        onCancel={() => {
          if (toggling) return
          setPendingToggle(null)
          setActionError(null)
        }}
      />
    </div>
  )
}
