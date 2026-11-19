import { memo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { PROBLEM_LABELS } from '../../components/StatusBadge'
import { toUserMessage } from '../../lib/errors'
import type { ProblemType } from '../../types/domain'

const PROBLEM_TYPES: ProblemType[] = [
  'OUT_OF_STOCK',
  'MISSING_INGREDIENT',
  'NOTE_UNCLEAR',
  'EQUIPMENT_BUSY',
  'WONT_MAKE_BREAK',
  'OTHER',
]

const NOTE_MAX_LENGTH = 500

interface ProblemModalProps {
  orderNumber: number
  onClose: () => void
  onSubmit: (type: ProblemType, note: string) => Promise<void>
}

function ProblemModalBase({ orderNumber, onClose, onSubmit }: ProblemModalProps) {
  const [type, setType] = useState<ProblemType | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async () => {
    if (!type || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(type, note.trim())
      // Başarılı gönderimde üst bileşen modalı kapatır.
    } catch (cause) {
      setError(toUserMessage(cause))
      setBusy(false)
    }
  }

  const close = () => {
    if (!busy) onClose()
  }

  return (
    <Modal
      open
      title={`Sorun Bildir · Sipariş #${orderNumber}`}
      onClose={close}
      closeOnBackdrop={!busy}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn btn-warning"
            onClick={() => {
              void handleSubmit()
            }}
            disabled={!type || busy}
          >
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
            Sorun Bildir
          </button>
        </>
      }
    >
      {error ? (
        <div className="alert alert-danger py-2 small" role="alert">
          {error}
        </div>
      ) : null}

      <fieldset disabled={busy}>
        <legend className="form-label fw-semibold fs-6">Sorun türü</legend>
        <div className="row g-2">
          {PROBLEM_TYPES.map((value) => (
            <div className="col-12 col-sm-6" key={value}>
              <div className="form-check border rounded px-4 py-2 h-100">
                <input
                  className="form-check-input"
                  type="radio"
                  name="kitchen-problem-type"
                  id={`kitchen-problem-${value}`}
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                />
                <label className="form-check-label" htmlFor={`kitchen-problem-${value}`}>
                  {PROBLEM_LABELS[value]}
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <label className="form-label" htmlFor="kitchen-problem-note">
            Açıklama (isteğe bağlı)
          </label>
          <textarea
            id="kitchen-problem-note"
            className="form-control"
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            placeholder="Sorunu kısaca açıklayabilirsiniz."
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="form-text text-end text-tabular">
            {note.length}/{NOTE_MAX_LENGTH}
          </div>
        </div>
      </fieldset>
    </Modal>
  )
}

export const ProblemModal = memo(ProblemModalBase)
