import { formatDateTime, formatMoney } from '../../lib/format'
import type { CashierOrderResult } from '../../types/domain'
import { paymentMethodLabel, type ReceiptSize } from './cashier-utils'

interface ReceiptProps {
  receipt: CashierOrderResult
  size: ReceiptSize
}

export function Receipt({ receipt, size }: ReceiptProps) {
  return (
    <div className={`receipt receipt-${size}`}>
      <h1>Okul Büfesi</h1>
      <div className="receipt-meta">
        <div>Sipariş No: {receipt.orderNumber}</div>
        <div>{formatDateTime(receipt.createdAt)}</div>
      </div>

      <hr />

      <table className="receipt-table">
        <tbody>
          {receipt.items.map((item, index) => (
            <tr key={`${item.productName}-${index}`}>
              <td className="qty">{item.quantity}</td>
              <td>
                <div>{item.productName}</div>
                <div>Birim: {formatMoney(item.unitPrice)}</div>
              </td>
              <td className="amount">{formatMoney(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />

      <div className="receipt-total">
        <span>Toplam</span>
        <span>{formatMoney(receipt.totalAmount)}</span>
      </div>

      <hr />

      <div className="d-flex justify-content-between">
        <span>Ödeme</span>
        <span>{paymentMethodLabel(receipt.paymentMethod)}</span>
      </div>
      <div className="d-flex justify-content-between">
        <span>Alınan</span>
        <span>{formatMoney(receipt.receivedAmount)}</span>
      </div>
      <div className="d-flex justify-content-between">
        <span>Para üstü</span>
        <span>{formatMoney(receipt.changeAmount)}</span>
      </div>
      <div className="d-flex justify-content-between">
        <span>Kasiyer</span>
        <span>{receipt.cashierName}</span>
      </div>

      <hr />

      <div className="receipt-footer">
        <div>Afiyet olsun!</div>
        <div>Bizi tercih ettiğiniz için teşekkürler.</div>
      </div>
    </div>
  )
}
