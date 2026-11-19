import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
  labelledBy?: string
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('modal-open')
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div
        className="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => {
          if (closeOnBackdrop && event.target === event.currentTarget) onClose()
        }}
      >
        <div className={`modal-dialog modal-dialog-centered modal-${size} modal-dialog-scrollable`}>
          <div className="modal-content shadow-lg">
            <div className="modal-header">
              <h2 className="modal-title h5">{title}</h2>
              <button type="button" className="btn-close" aria-label="Kapat" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-footer">{footer}</div> : null}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>,
    document.body,
  )
}
