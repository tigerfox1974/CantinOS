import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger' | 'success' | 'warning'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onCancel}
      closeOnBackdrop={!busy}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn btn-${variant}`} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-body">{message}</div>
      {children}
    </Modal>
  )
}

interface ReasonDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  variant?: 'primary' | 'danger' | 'success' | 'warning'
  busy?: boolean
  requireReason?: boolean
  placeholder?: string
  onConfirm: (reason: string) => void
  onCancel: () => void
  children?: ReactNode
}

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = 'Kaydet',
  variant = 'primary',
  busy = false,
  requireReason = true,
  placeholder = 'Neden yazın (zorunlu)',
  onConfirm,
  onCancel,
  children,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('')
  const valid = !requireReason || reason.trim().length >= 3

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onCancel}
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className={`btn btn-${variant}`}
            onClick={() => {
              onConfirm(reason.trim())
              setReason('')
            }}
            disabled={busy || !valid}
          >
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      {description ? <div className="mb-3">{description}</div> : null}
      {children}
      <label className="form-label" htmlFor="reason-dialog-input">
        Açıklama
      </label>
      <textarea
        id="reason-dialog-input"
        className="form-control"
        rows={3}
        maxLength={500}
        value={reason}
        placeholder={placeholder}
        onChange={(event) => setReason(event.target.value)}
        autoFocus
      />
      {requireReason && reason.length > 0 && reason.trim().length < 3 ? (
        <div className="form-text text-danger">En az 3 karakter yazın.</div>
      ) : null}
    </Modal>
  )
}
