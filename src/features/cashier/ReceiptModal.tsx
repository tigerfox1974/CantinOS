import { Modal } from '../../components/Modal'
import type { CashierOrderResult } from '../../types/domain'
import { Receipt } from './Receipt'
import type { ReceiptSize } from './cashier-utils'

interface ReceiptModalProps {
  open: boolean
  receipt: CashierOrderResult | null
  size: ReceiptSize
  onSizeChange: (size: ReceiptSize) => void
  onClose: () => void
}

export function ReceiptModal({ open, receipt, size, onSizeChange, onClose }: ReceiptModalProps) {
  return (
    <Modal
      open={open && receipt !== null}
      title="Satış Fişi"
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Kapat
          </button>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => window.print()}
            disabled={!receipt}
          >
            Yeniden Yazdır
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
            disabled={!receipt}
          >
            Yazdır
          </button>
        </>
      }
    >
      {receipt ? (
        <>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <span className="fw-semibold">Fiş genişliği</span>
            <div className="btn-group btn-group-sm" role="group" aria-label="Fiş genişliği">
              <button
                type="button"
                className={`btn ${size === '58' ? 'btn-primary' : 'btn-outline-primary'}`}
                aria-pressed={size === '58'}
                onClick={() => onSizeChange('58')}
              >
                58 mm
              </button>
              <button
                type="button"
                className={`btn ${size === '80' ? 'btn-primary' : 'btn-outline-primary'}`}
                aria-pressed={size === '80'}
                onClick={() => onSizeChange('80')}
              >
                80 mm
              </button>
            </div>
          </div>

          <div className="d-flex justify-content-center bg-body-tertiary rounded p-3">
            <Receipt receipt={receipt} size={size} />
          </div>

          <p className="small text-body-secondary text-center mt-3 mb-0">
            Yazdırma işlemi tarayıcının yazdırma penceresini açar. Fiş yalnızca seçili genişlikte yazdırılır.
          </p>
        </>
      ) : null}
    </Modal>
  )
}
