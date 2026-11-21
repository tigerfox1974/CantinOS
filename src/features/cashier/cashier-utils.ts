import { formatMoney, parseMoneyInput } from '../../lib/format'
import type {
  CashierOrderInput,
  CashierOrderResult,
  MenuProduct,
  OrderProblem,
  PaymentMethod,
  StaffOrder,
} from '../../types/domain'

export const MIN_QUANTITY = 1
export const MAX_QUANTITY = 50
export const MAX_LINE_NOTE = 200
export const MAX_GENERAL_NOTE = 500
export const MAX_CUSTOMER_NAME = 80

export type ReceiptSize = '58' | '80'

export interface CartLine {
  key: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  lineNote: string
}

export interface OrderFormValues {
  lines: CartLine[]
  paymentMethod: PaymentMethod | null
  receivedText: string
  customerName: string
  generalNote: string
}

/** Para değerini kuruş hassasiyetinde yuvarlar. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function lineTotal(line: CartLine): number {
  return roundMoney(line.unitPrice * line.quantity)
}

export function cartTotal(lines: CartLine[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + lineTotal(line), 0))
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return MIN_QUANTITY
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.trunc(value)))
}

/**
 * Ürünü sepete ekler. Aynı ürünün notsuz satırı varsa adedini artırır;
 * notlu satırlar ayrı kalır. Adet üst sınırı aşılmaz.
 */
export function addProductToCart(lines: CartLine[], product: MenuProduct, newKey: string): CartLine[] {
  const mergeIndex = lines.findIndex(
    (line) => line.productId === product.id && line.lineNote.trim().length === 0,
  )

  if (mergeIndex === -1) {
    return [
      ...lines,
      {
        key: newKey,
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity: MIN_QUANTITY,
        lineNote: '',
      },
    ]
  }

  return lines.map((line, index) =>
    index === mergeIndex ? { ...line, quantity: clampQuantity(line.quantity + 1) } : line,
  )
}

export function updateCartQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  return lines.map((line) =>
    line.key === key ? { ...line, quantity: clampQuantity(quantity) } : line,
  )
}

export function updateCartLineNote(lines: CartLine[], key: string, note: string): CartLine[] {
  const nextNote = note.slice(0, MAX_LINE_NOTE)
  return lines.map((line) => (line.key === key ? { ...line, lineNote: nextNote } : line))
}

export function removeCartLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => line.key !== key)
}

/** Alınan para toplamdan düşükse para üstü 0 döner. */
export function calculateChange(received: number, total: number): number {
  const difference = roundMoney(received - total)
  return difference > 0 ? difference : 0
}

/**
 * Sepet tutarına göre akıllı hızlı nakit banknot önerileri üretir.
 * Örn: 72 TL için [72, 100, 200, 500]
 */
export function getQuickCashPresets(total: number): number[] {
  if (total <= 0) return []
  const presets = new Set<number>()
  presets.add(roundMoney(total))

  const standardBanknotes = [10, 20, 50, 100, 200, 500]
  for (const b of standardBanknotes) {
    if (b >= total && presets.size < 4) {
      presets.add(b)
    }
  }

  if (total > 500) {
    const next100 = Math.ceil(total / 100) * 100
    presets.add(next100)
    presets.add(next100 + 100)
  }

  return Array.from(presets)
    .sort((a, b) => a - b)
    .slice(0, 4)
}

/**
 * Ürün adına göre tek tıkla eklenebilecek hızlı opsiyon/not hapları listesi döner.
 * Ürünün türüne (soğuk sandviç, sıcak tost, sıcak içecek, soğuk içecek vb.) göre
 * anlamlı ve mantıklı seçenekler sunar.
 */
export function getProductQuickModifiers(productName: string): string[] {
  const lower = productName.toLocaleLowerCase('tr-TR')

  // Soğuk sandviçler (ton balıklı, soğuk sandviç vb.) -> Asla 'İyi Pişmiş' veya 'Ketçapsız' içermez!
  if (
    lower.includes('ton balık') ||
    lower.includes('soğuk sandviç') ||
    lower.includes('deli') ||
    (lower.includes('sandviç') && !lower.includes('sıcak') && !lower.includes('tost'))
  ) {
    return ['🍅 Domatessiz', 'Mayonezsiz', 'Mısırsız', 'Yeşilliksiz', 'Turşusuz']
  }

  // Sıcak tostlar ve sıcak sandviçler
  if (
    lower.includes('tost') ||
    lower.includes('sıcak sandviç') ||
    lower.includes('ekmek arası') ||
    lower.includes('burger')
  ) {
    return ['🍅 Domatessiz', 'Ketçapsız', 'Mayonezsiz', 'Acılı', 'İyi Pişmiş']
  }

  // Sıcak İçecekler (Çay, Kahve vb.)
  if (
    lower.includes('kahve') ||
    lower.includes('çay') ||
    lower.includes('latte') ||
    lower.includes('cappuccino') ||
    lower.includes('espresso')
  ) {
    return ['Şekersiz', 'Az Şekerli', 'Orta', 'Şekerli', 'Sütlü']
  }

  // Soğuk İçecekler (Ayran, Su, Meyve Suyu, Meşrubat, Kola, Soda)
  if (
    lower.includes('ayran') ||
    lower.includes('su') ||
    lower.includes('meyve suyu') ||
    lower.includes('kola') ||
    lower.includes('soda') ||
    lower.includes('gazoz') ||
    lower.includes('soğuk çay') ||
    lower.includes('ice tea')
  ) {
    return ['Soğuk', 'Oda Sıcaklığı', 'Pipetli', 'Buzlu']
  }

  // Hamur işi / Pastane (Poğaça, Börek, Simit, Açma)
  if (
    lower.includes('poğaça') ||
    lower.includes('börek') ||
    lower.includes('simit') ||
    lower.includes('açma') ||
    lower.includes('kurabiye')
  ) {
    return ['Isıtılsın', 'Peynirli', 'Zeytinli', 'Çıtır']
  }

  // Sıcak yemekler / Çorbalar
  if (lower.includes('sıcak') || lower.includes('çorba') || lower.includes('yemek') || lower.includes('pilav')) {
    return ['Ekmekli', 'Ekstresiz', 'Tuzsuz', 'Limonlu']
  }

  return ['Paket Olsun', 'Ayrı Paket', 'Isıtılsın']
}

export function isCashSufficient(received: number, total: number): boolean {
  return received + 0.005 >= total
}

export function remainingAmount(order: StaffOrder): number {
  return Math.max(0, roundMoney(order.totalAmount - order.paidAmount))
}

export function openProblems(order: StaffOrder): OrderProblem[] {
  return order.problems.filter((problem) => problem.clearedAt === null)
}

export function canDeliver(order: StaffOrder): boolean {
  return order.status === 'READY' && order.paymentStatus === 'PAID'
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return method === 'CASH' ? 'Nakit' : 'Kart'
}

/**
 * Formu göndermeden önce doğrular. Hata yoksa null döner.
 */
export function validateOrderForm(values: OrderFormValues): string | null {
  const { lines } = values

  if (lines.length === 0) {
    return 'Sepetinizde en az bir ürün olmalı.'
  }

  if (lines.some((line) => line.quantity < MIN_QUANTITY || line.quantity > MAX_QUANTITY)) {
    return 'Ürün adedi 1 ile 50 arasında olmalı.'
  }

  if (lines.some((line) => line.lineNote.length > MAX_LINE_NOTE)) {
    return `Satır notu en fazla ${MAX_LINE_NOTE} karakter olabilir.`
  }

  if (values.customerName.trim().length > MAX_CUSTOMER_NAME) {
    return `Müşteri adı en fazla ${MAX_CUSTOMER_NAME} karakter olabilir.`
  }

  if (values.generalNote.length > MAX_GENERAL_NOTE) {
    return `Sipariş notu en fazla ${MAX_GENERAL_NOTE} karakter olabilir.`
  }

  if (!values.paymentMethod) {
    return 'Ödeme yöntemi seçin.'
  }

  if (values.paymentMethod === 'CASH') {
    const total = cartTotal(lines)
    const received = parseMoneyInput(values.receivedText)
    if (!isCashSufficient(received, total)) {
      return `Alınan para toplamdan düşük olamaz. En az ${formatMoney(total)} girin.`
    }
  }

  return null
}

export function buildCashierOrderInput(
  lines: CartLine[],
  paymentMethod: PaymentMethod,
  receivedText: string,
  customerName: string,
  generalNote: string,
): CashierOrderInput {
  const input: CashierOrderInput = {
    paymentMethod,
    items: lines.map((line) => ({
      productId: line.productId,
      quantity: clampQuantity(line.quantity),
      ...(line.lineNote.trim().length > 0 ? { lineNote: line.lineNote.trim() } : {}),
    })),
  }

  if (paymentMethod === 'CASH') {
    input.receivedAmount = roundMoney(parseMoneyInput(receivedText))
  }

  const name = customerName.trim()
  if (name.length > 0) input.customerName = name

  const note = generalNote.trim()
  if (note.length > 0) input.generalNote = note

  return input
}

export function buildOrderReceipt(
  order: StaffOrder,
  fallbackCashierName = 'Kasiyer',
  lastPayment?: { method: PaymentMethod; receivedAmount: number; changeAmount: number },
): CashierOrderResult {
  const payment =
    order.payments && order.payments.length > 0
      ? order.payments[order.payments.length - 1]
      : null

  const paymentMethod: PaymentMethod =
    lastPayment?.method ?? payment?.paymentMethod ?? 'CASH'
  const receivedAmount =
    lastPayment?.receivedAmount ?? payment?.receivedAmount ?? order.totalAmount
  const changeAmount =
    lastPayment?.changeAmount ?? payment?.changeAmount ?? 0
  const cashierName =
    payment?.createdByName ?? fallbackCashierName

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    totalAmount: order.totalAmount,
    paymentMethod,
    receivedAmount,
    changeAmount,
    cashierName,
    items: order.items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
  }
}
