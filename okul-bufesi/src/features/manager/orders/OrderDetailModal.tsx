import { Modal } from '../../../components/Modal'
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  SourceBadge,
  problemLabel,
} from '../../../components/StatusBadge'
import { formatDateTime, formatMoney } from '../../../lib/format'
import type { StaffOrder } from '../../../types/domain'
import {
  isAdjustable,
  isCancellable,
  isRefundable,
  paymentMethodLabel,
  paymentTypeLabel,
} from './orderUtils'

interface OrderDetailModalProps {
  order: StaffOrder
  onClose: () => void
  onTogglePriority: () => void
  onAdjust: () => void
  onCancel: () => void
  onRefund: () => void
}

export function OrderDetailModal({
  order,
  onClose,
  onTogglePriority,
  onAdjust,
  onCancel,
  onRefund,
}: OrderDetailModalProps) {
  const remaining = order.totalAmount - order.paidAmount

  return (
    <Modal
      open
      title={`Sipariş #${order.orderNumber}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary me-auto" onClick={onClose}>
            Kapat
          </button>
          <button type="button" className="btn btn-outline-warning" onClick={onTogglePriority}>
            {order.priorityOverride ? 'Önceliği kaldır' : 'Öncelik ver'}
          </button>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={onAdjust}
            disabled={!isAdjustable(order.status)}
          >
            Düzelt
          </button>
          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={onCancel}
            disabled={!isCancellable(order.status)}
          >
            İptal
          </button>
          <button
            type="button"
            className="btn btn-outline-dark"
            onClick={onRefund}
            disabled={!isRefundable(order)}
          >
            İade
          </button>
        </>
      }
    >
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <SourceBadge source={order.source} />
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.paymentStatus} />
        {order.priorityOverride ? <span className="badge text-bg-warning">Öncelikli</span> : null}
      </div>

      <dl className="row g-2 small mb-0">
        <div className="col-12 col-sm-6">
          <dt className="text-body-secondary fw-normal mb-0">Müşteri</dt>
          <dd className="mb-0 fw-semibold">{order.customerName ?? '—'}</dd>
        </div>
        <div className="col-12 col-sm-6">
          <dt className="text-body-secondary fw-normal mb-0">Telefon</dt>
          <dd className="mb-0">{order.customerPhone ?? '—'}</dd>
        </div>
        <div className="col-12 col-sm-6">
          <dt className="text-body-secondary fw-normal mb-0">Teslim</dt>
          <dd className="mb-0">
            {order.deliveryLabel} · {formatDateTime(order.targetDeliveryAt)}
          </dd>
        </div>
        <div className="col-12 col-sm-6">
          <dt className="text-body-secondary fw-normal mb-0">Oluşturulma</dt>
          <dd className="mb-0 text-tabular">{formatDateTime(order.createdAt)}</dd>
        </div>
        <div className="col-12 col-sm-6">
          <dt className="text-body-secondary fw-normal mb-0">Toplam</dt>
          <dd className="mb-0 fw-semibold text-tabular">{formatMoney(order.totalAmount)}</dd>
        </div>
        <div className="col-12 col-sm-6">
          <dt className="text-body-secondary fw-normal mb-0">Ödenen</dt>
          <dd className="mb-0 text-tabular">
            {formatMoney(order.paidAmount)}
            {remaining > 0.005 ? (
              <span className="text-body-secondary"> · Kalan {formatMoney(remaining)}</span>
            ) : null}
          </dd>
        </div>
        {order.deliveredAt ? (
          <div className="col-12 col-sm-6">
            <dt className="text-body-secondary fw-normal mb-0">Teslim edildi</dt>
            <dd className="mb-0 text-tabular">{formatDateTime(order.deliveredAt)}</dd>
          </div>
        ) : null}
      </dl>

      {order.generalNote ? (
        <div className="alert alert-info small mt-3 mb-0">
          <div className="fw-semibold">Sipariş notu</div>
          <div>{order.generalNote}</div>
        </div>
      ) : null}

      <h3 className="h6 mt-4 mb-2">Ürünler</h3>
      {order.items.length === 0 ? (
        <p className="small text-body-secondary mb-0">Ürün kaydı yok.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-compact align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Ürün</th>
                <th scope="col" className="text-end">
                  Adet
                </th>
                <th scope="col" className="text-end">
                  Birim
                </th>
                <th scope="col" className="text-end">
                  Toplam
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.productId}-${index}`}>
                  <td>
                    <div className="fw-semibold">{item.productName}</div>
                    <div className="small text-body-secondary">{item.categoryName}</div>
                    {item.lineNote ? <div className="small text-warning-emphasis">Not: {item.lineNote}</div> : null}
                  </td>
                  <td className="text-end text-tabular">{item.quantity}</td>
                  <td className="text-end text-tabular">{formatMoney(item.unitPrice)}</td>
                  <td className="text-end text-tabular fw-semibold">{formatMoney(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="h6 mt-4 mb-2">Ödemeler</h3>
      {order.payments.length === 0 ? (
        <p className="small text-body-secondary mb-0">Ödeme kaydı yok.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-compact align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Tür</th>
                <th scope="col">Yöntem</th>
                <th scope="col" className="text-end">
                  Tutar
                </th>
                <th scope="col">Tarih</th>
                <th scope="col">Kullanıcı</th>
              </tr>
            </thead>
            <tbody>
              {order.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <div className="fw-semibold">{paymentTypeLabel(payment.paymentType)}</div>
                    {payment.note ? <div className="small text-body-secondary">{payment.note}</div> : null}
                  </td>
                  <td>{paymentMethodLabel(payment.paymentMethod)}</td>
                  <td
                    className={`text-end text-tabular fw-semibold${
                      payment.paymentType === 'REFUND' ? ' text-danger' : ''
                    }`}
                  >
                    {payment.paymentType === 'REFUND' ? '-' : ''}
                    {formatMoney(payment.amount)}
                  </td>
                  <td className="small text-tabular">{formatDateTime(payment.createdAt)}</td>
                  <td className="small">{payment.createdByName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="h6 mt-4 mb-2">Sorunlar</h3>
      {order.problems.length === 0 ? (
        <p className="small text-body-secondary mb-0">Sorun kaydı yok.</p>
      ) : (
        <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
          {order.problems.map((problem) => {
            const statusLabel = problem.clearedAt ? 'Temizlendi' : problem.informedAt ? 'Bildirildi' : 'Açık'
            const statusClass = problem.clearedAt
              ? 'text-bg-secondary'
              : problem.informedAt
                ? 'text-bg-info'
                : 'text-bg-warning'
            return (
              <li key={problem.id} className="border rounded p-2">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <span className="fw-semibold">{problemLabel(problem.problemType)}</span>
                  <span className={`badge ${statusClass}`}>{statusLabel}</span>
                </div>
                {problem.note ? <div className="small mt-1">{problem.note}</div> : null}
                <div className="small text-body-secondary mt-1">
                  Bildiren: {problem.reportedByName ?? '—'} · {formatDateTime(problem.reportedAt)}
                </div>
                {problem.clearedAt ? (
                  <div className="small text-body-secondary">
                    Temizleyen: {problem.clearedByName ?? '—'} · {formatDateTime(problem.clearedAt)}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {order.priorityOverride || order.cancellationReason ? (
        <div className="d-flex flex-column gap-2 mt-4">
          {order.priorityOverride ? (
            <div className="alert alert-warning small mb-0">
              <div className="fw-semibold">Öncelik nedeni</div>
              <div>{order.priorityOverrideReason ?? 'Neden belirtilmemiş.'}</div>
            </div>
          ) : null}
          {order.cancellationReason ? (
            <div className="alert alert-danger small mb-0">
              <div className="fw-semibold">İptal nedeni</div>
              <div>{order.cancellationReason}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
