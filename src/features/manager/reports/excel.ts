import * as XLSX from 'xlsx-js-style'
import { businessDate, formatDate, formatDateTime } from '../../../lib/format'
import type {
  AnalyticsReport,
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from '../../../types/domain'

const MONEY_FORMAT = '#,##0.00" TL"'
const INTEGER_FORMAT = '#,##0'
const DECIMAL_FORMAT = '0.0'
const PERCENT_FORMAT = '0.0"%"'

const INK = '1F2D3D'
const MUTED = '6B7C8F'
const BORDER_COLOR = 'C9D6E2'
const HEADER_BG = '1F4E79'
const SUBTLE_BG = 'EAF2F8'
const TOTAL_BG = 'F2F7FA'

const SOURCE_LABELS: Record<OrderSource, string> = {
  ONLINE: 'Online',
  CASHIER: 'Kasadan',
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Yeni',
  PREPARING: 'Hazırlanıyor',
  READY: 'Hazır',
  DELIVERED: 'Teslim edildi',
  CANCELLED: 'İptal',
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  WAITING: 'Ödeme bekliyor',
  PAID: 'Ödendi',
  REFUND_PENDING: 'İade bekliyor',
  REFUNDED: 'İade edildi',
}

type BorderStyle = NonNullable<XLSX.CellStyle['border']>
type FontStyle = NonNullable<XLSX.CellStyle['font']>

const thinSide = { style: 'thin' as const, color: { rgb: BORDER_COLOR } }
const cellBorder = {
  top: thinSide,
  bottom: thinSide,
  left: thinSide,
  right: thinSide,
} satisfies BorderStyle

const baseFont = {
  name: 'Calibri',
  sz: 10,
  color: { rgb: INK },
} satisfies FontStyle

const bodyStyle: XLSX.CellStyle = {
  font: baseFont,
  border: cellBorder,
  alignment: { vertical: 'center' },
}

const centerStyle: XLSX.CellStyle = {
  ...bodyStyle,
  alignment: { horizontal: 'center', vertical: 'center' },
}

const numberStyle: XLSX.CellStyle = {
  ...bodyStyle,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: INTEGER_FORMAT,
}

const moneyStyle: XLSX.CellStyle = {
  ...bodyStyle,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: MONEY_FORMAT,
}

const percentStyle: XLSX.CellStyle = {
  ...bodyStyle,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: PERCENT_FORMAT,
}

const decimalStyle: XLSX.CellStyle = {
  ...bodyStyle,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: DECIMAL_FORMAT,
}

const wrapStyle: XLSX.CellStyle = {
  ...bodyStyle,
  alignment: { vertical: 'top', wrapText: true },
}

const labelStyle: XLSX.CellStyle = {
  ...bodyStyle,
  font: { ...baseFont, bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: SUBTLE_BG } },
}

const headerStyle: XLSX.CellStyle = {
  font: { ...baseFont, bold: true, color: { rgb: 'FFFFFF' } },
  border: cellBorder,
  fill: { patternType: 'solid', fgColor: { rgb: HEADER_BG } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}

const titleStyle: XLSX.CellStyle = {
  font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: INK } },
  alignment: { vertical: 'center' },
}

const totalBorder = {
  ...cellBorder,
  top: { style: 'medium' as const, color: { rgb: HEADER_BG } },
} satisfies BorderStyle

const totalStyle: XLSX.CellStyle = {
  font: { ...baseFont, bold: true },
  border: totalBorder,
  fill: { patternType: 'solid', fgColor: { rgb: TOTAL_BG } },
  alignment: { vertical: 'center' },
}

const totalNumberStyle: XLSX.CellStyle = {
  ...totalStyle,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: INTEGER_FORMAT,
}

const totalMoneyStyle: XLSX.CellStyle = {
  ...totalStyle,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: MONEY_FORMAT,
}

const emptyStyle: XLSX.CellStyle = {
  font: { ...baseFont, italic: true, color: { rgb: MUTED } },
  alignment: { vertical: 'center' },
}

interface SheetCell {
  value: string | number
  type: 's' | 'n'
  style?: XLSX.CellStyle
}

function textCell(value: string, style: XLSX.CellStyle = bodyStyle): SheetCell {
  return { value, type: 's', style }
}

function numberCell(value: number, style: XLSX.CellStyle = numberStyle): SheetCell {
  return { value, type: 'n', style }
}

function moneyCell(value: number): SheetCell {
  return numberCell(value, moneyStyle)
}

function totalText(value: string): SheetCell {
  return textCell(value, totalStyle)
}

function totalNumber(value: number): SheetCell {
  return numberCell(value, totalNumberStyle)
}

function totalMoney(value: number): SheetCell {
  return numberCell(value, totalMoneyStyle)
}

function blankTotal(): SheetCell {
  return textCell('', totalStyle)
}

function titleRow(title: string, span: number): SheetCell[] {
  const row: SheetCell[] = [{ value: title, type: 's', style: titleStyle }]
  for (let index = 1; index < span; index += 1) {
    row.push({ value: '', type: 's' })
  }
  return row
}

function headerRow(headers: string[]): SheetCell[] {
  return headers.map((header) => textCell(header, headerStyle))
}

function emptyRow(message: string, span: number): SheetCell[] {
  const row: SheetCell[] = [textCell(message, emptyStyle)]
  for (let index = 1; index < span; index += 1) {
    row.push({ value: '', type: 's' })
  }
  return row
}

function columnName(index: number): string {
  let value = index + 1
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function cellAddress(row: number, column: number): string {
  return `${columnName(column)}${row + 1}`
}

function decodeAddress(address: string): { r: number; c: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(address)
  if (!match) return { r: 0, c: 0 }
  const column = match[1]
    .split('')
    .reduce((total, character) => total * 26 + (character.charCodeAt(0) - 64), 0)
  return { r: Number(match[2]) - 1, c: column - 1 }
}

function decodeRange(reference: string): XLSX.Range {
  const [start, end] = reference.split(':')
  return { s: decodeAddress(start), e: decodeAddress(end ?? start) }
}

function buildSheet(
  rows: SheetCell[][],
  widths: number[],
  merges: string[] = [],
): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {}
  let maxColumns = 1

  rows.forEach((row, rowIndex) => {
    maxColumns = Math.max(maxColumns, row.length)
    row.forEach((cell, columnIndex) => {
      const cellObject: XLSX.CellObject = { v: cell.value, t: cell.type }
      if (cell.style) {
        cellObject.s = cell.style
        if (cell.style.numFmt) cellObject.z = cell.style.numFmt
      }
      sheet[cellAddress(rowIndex, columnIndex)] = cellObject
    })
  })

  const lastRow = Math.max(rows.length - 1, 0)
  sheet['!ref'] = `${cellAddress(0, 0)}:${cellAddress(lastRow, maxColumns - 1)}`
  sheet['!cols'] = widths.map((width) => ({ wch: width }))
  if (merges.length > 0) {
    sheet['!merges'] = merges.map(decodeRange)
  }
  return sheet
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/**
 * Analitik raporunu biçimlendirilmiş bir .xlsx çalışma kitabına aktarır.
 * Tarayıcıda doğrudan dosya indirir; CSV üretmez.
 */
export function exportAnalyticsToExcel(
  report: AnalyticsReport,
  meta: { from: string; to: string; title?: string },
): void {
  const summary = report.paymentSummary
  const reportTitle = meta.title?.trim() || 'Satış ve Kasa Özeti'

  const summarySheet = buildSheet(
    [
      titleRow('Okul Büfesi — Analitik Rapor', 2),
      [textCell('Dönem', labelStyle), textCell(`${formatDate(meta.from)} – ${formatDate(meta.to)}`)],
      [textCell('Rapor', labelStyle), textCell(reportTitle)],
      [textCell('Oluşturulma', labelStyle), textCell(formatDateTime(new Date()))],
      [],
      headerRow(['Özet Kalemi', 'Değer']),
      [textCell('Tahsilat'), moneyCell(summary.collections)],
      [textCell('Ciro'), moneyCell(summary.revenue)],
      [textCell('İade'), moneyCell(summary.refunds)],
      [textCell('Nakit Tahsilat'), moneyCell(summary.cash)],
      [textCell('Kart Tahsilat'), moneyCell(summary.card)],
      [textCell('Sipariş Sayısı'), numberCell(report.orders.length)],
      [textCell('Kasa Kapanışı Sayısı'), numberCell(report.cashClosings.length)],
      [totalText('TOPLAM TAHSİLAT'), totalMoney(summary.collections)],
    ],
    [30, 26],
    ['A1:B1'],
  )

  const productQuantity = report.topProducts.reduce((total, item) => total + item.quantity, 0)
  const productRevenue = roundMoney(
    report.topProducts.reduce((total, item) => total + item.revenue, 0),
  )

  const productsSheet = buildSheet(
    [
      titleRow('En Çok Satılan Ürünler', 4),
      [],
      headerRow(['Sıra', 'Ürün', 'Adet', 'Ciro']),
      ...(report.topProducts.length === 0
        ? [emptyRow('Bu dönemde ürün satışı bulunmuyor.', 4)]
        : [
            ...report.topProducts.map((item, index) => [
              numberCell(index + 1, centerStyle),
              textCell(item.name),
              numberCell(item.quantity),
              moneyCell(item.revenue),
            ]),
            [blankTotal(), totalText('TOPLAM'), totalNumber(productQuantity), totalMoney(productRevenue)],
          ]),
    ],
    [6, 34, 10, 16],
    ['A1:D1'],
  )

  const categoryQuantity = report.categoryDistribution.reduce(
    (total, item) => total + item.quantity,
    0,
  )
  const categoryRevenue = roundMoney(
    report.categoryDistribution.reduce((total, item) => total + item.revenue, 0),
  )

  const categoriesSheet = buildSheet(
    [
      titleRow('Kategori Dağılımı', 4),
      [],
      headerRow(['Kategori', 'Adet', 'Ciro', 'Pay (%)']),
      ...(report.categoryDistribution.length === 0
        ? [emptyRow('Bu dönemde kategori satışı bulunmuyor.', 4)]
        : [
            ...report.categoryDistribution.map((item) => [
              textCell(item.name),
              numberCell(item.quantity),
              moneyCell(item.revenue),
              numberCell(
                categoryRevenue > 0 ? roundMoney((item.revenue / categoryRevenue) * 100) : 0,
                percentStyle,
              ),
            ]),
            [
              totalText('TOPLAM'),
              totalNumber(categoryQuantity),
              totalMoney(categoryRevenue),
              totalNumber(100),
            ],
          ]),
    ],
    [28, 10, 16, 12],
    ['A1:D1'],
  )

  const hourlyMap = new Map(report.hourly.map((item) => [item.hour, item]))
  const hourlyRows = Array.from({ length: 24 }, (_, hour) => {
    const item = hourlyMap.get(hour)
    return { hour, orders: item?.orders ?? 0, revenue: item?.revenue ?? 0 }
  })
  const hourlyOrders = hourlyRows.reduce((total, item) => total + item.orders, 0)
  const hourlyRevenue = roundMoney(hourlyRows.reduce((total, item) => total + item.revenue, 0))

  const hourlySheet = buildSheet(
    [
      titleRow('Yoğun Saatler', 3),
      [],
      headerRow(['Saat', 'Sipariş', 'Ciro']),
      ...hourlyRows.map((item) => [
        textCell(formatHour(item.hour), centerStyle),
        numberCell(item.orders),
        moneyCell(item.revenue),
      ]),
      [totalText('TOPLAM'), totalNumber(hourlyOrders), totalMoney(hourlyRevenue)],
    ],
    [12, 10, 16],
    ['A1:C1'],
  )

  const dailyOrders = report.dailyRevenue.reduce((total, item) => total + item.orders, 0)
  const dailyRevenue = roundMoney(
    report.dailyRevenue.reduce((total, item) => total + item.revenue, 0),
  )

  const dailySheet = buildSheet(
    [
      titleRow('Günlük Ciro', 3),
      [],
      headerRow(['Tarih', 'Sipariş', 'Ciro']),
      ...(report.dailyRevenue.length === 0
        ? [emptyRow('Bu dönemde teslim edilmiş sipariş bulunmuyor.', 3)]
        : [
            ...report.dailyRevenue.map((item) => [
              textCell(formatDate(item.date)),
              numberCell(item.orders),
              moneyCell(item.revenue),
            ]),
            [totalText('TOPLAM'), totalNumber(dailyOrders), totalMoney(dailyRevenue)],
          ]),
    ],
    [14, 10, 16],
    ['A1:C1'],
  )

  const monthlyOrders = report.monthlyRevenue.reduce((total, item) => total + item.orders, 0)
  const monthlyRevenue = roundMoney(
    report.monthlyRevenue.reduce((total, item) => total + item.revenue, 0),
  )

  const monthlySheet = buildSheet(
    [
      titleRow('Aylık Ciro', 3),
      [],
      headerRow(['Ay', 'Sipariş', 'Ciro']),
      ...(report.monthlyRevenue.length === 0
        ? [emptyRow('Bu dönemde teslim edilmiş sipariş bulunmuyor.', 3)]
        : [
            ...report.monthlyRevenue.map((item) => [
              textCell(formatMonthLabel(item.month)),
              numberCell(item.orders),
              moneyCell(item.revenue),
            ]),
            [totalText('TOPLAM'), totalNumber(monthlyOrders), totalMoney(monthlyRevenue)],
          ]),
    ],
    [18, 10, 16],
    ['A1:C1'],
  )

  const orderTotal = roundMoney(
    report.orders.reduce((total, item) => total + item.totalAmount, 0),
  )

  const ordersSheet = buildSheet(
    [
      titleRow('Sipariş Listesi', 8),
      [],
      headerRow(['Sipariş No', 'Oluşturma', 'Teslim', 'Kaynak', 'Durum', 'Ödeme', 'Müşteri', 'Tutar']),
      ...(report.orders.length === 0
        ? [emptyRow('Bu dönemde sipariş bulunmuyor.', 8)]
        : [
            ...report.orders.map((order) => [
              numberCell(order.orderNumber),
              textCell(formatDateTime(order.createdAt)),
              textCell(order.deliveredAt ? formatDateTime(order.deliveredAt) : '—'),
              textCell(SOURCE_LABELS[order.source]),
              textCell(ORDER_STATUS_LABELS[order.status]),
              textCell(PAYMENT_STATUS_LABELS[order.paymentStatus]),
              textCell(order.customerName ?? '—'),
              moneyCell(order.totalAmount),
            ]),
            [
              blankTotal(),
              blankTotal(),
              blankTotal(),
              blankTotal(),
              blankTotal(),
              blankTotal(),
              totalText('TOPLAM'),
              totalMoney(orderTotal),
            ],
          ]),
    ],
    [12, 20, 20, 10, 14, 16, 24, 16],
    ['A1:H1'],
  )

  const closingExpectedCash = roundMoney(
    report.cashClosings.reduce((total, item) => total + item.expectedCash, 0),
  )
  const closingExpectedCard = roundMoney(
    report.cashClosings.reduce((total, item) => total + item.expectedCard, 0),
  )
  const closingActualCash = roundMoney(
    report.cashClosings.reduce((total, item) => total + item.actualCash, 0),
  )
  const closingDifference = roundMoney(
    report.cashClosings.reduce((total, item) => total + item.differenceAmount, 0),
  )
  const closingDelivered = report.cashClosings.reduce(
    (total, item) => total + item.deliveredOrders,
    0,
  )

  const cashSheet = buildSheet(
    [
      titleRow('Kasa Kapanışı', 10),
      [],
      headerRow([
        'Tarih',
        'Beklenen Nakit',
        'Beklenen Kart',
        'Gerçek Nakit',
        'Fark',
        'Teslim Sipariş',
        'Ort. Hazırlık (dk)',
        'Kapatan',
        'Kapanış Zamanı',
        'Not',
      ]),
      ...(report.cashClosings.length === 0
        ? [emptyRow('Bu dönemde kasa kapanışı bulunmuyor.', 10)]
        : [
            ...report.cashClosings.map((closing) => [
              textCell(formatDate(closing.businessDate)),
              moneyCell(closing.expectedCash),
              moneyCell(closing.expectedCard),
              moneyCell(closing.actualCash),
              moneyCell(closing.differenceAmount),
              numberCell(closing.deliveredOrders),
              closing.averagePrepMinutes === null
                ? textCell('—', centerStyle)
                : numberCell(closing.averagePrepMinutes, decimalStyle),
              textCell(closing.closedByName ?? '—'),
              textCell(formatDateTime(closing.closedAt)),
              textCell(closing.note ?? '—', wrapStyle),
            ]),
            [
              totalText('TOPLAM'),
              totalMoney(closingExpectedCash),
              totalMoney(closingExpectedCard),
              totalMoney(closingActualCash),
              totalMoney(closingDifference),
              totalNumber(closingDelivered),
              blankTotal(),
              blankTotal(),
              blankTotal(),
              blankTotal(),
            ],
          ]),
    ],
    [14, 16, 16, 16, 14, 14, 18, 20, 20, 40],
    ['A1:J1'],
  )

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Özet')
  XLSX.utils.book_append_sheet(workbook, productsSheet, 'Ürünler')
  XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Kategoriler')
  XLSX.utils.book_append_sheet(workbook, hourlySheet, 'Saatlik')
  XLSX.utils.book_append_sheet(workbook, dailySheet, 'Günlük Ciro')
  XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Aylık Ciro')
  XLSX.utils.book_append_sheet(workbook, ordersSheet, 'Siparişler')
  XLSX.utils.book_append_sheet(workbook, cashSheet, 'Kasa Kapanışı')

  workbook.Props = {
    Title: meta.title?.trim() || 'Okul Büfesi Analitik Raporu',
    Subject: `${formatDate(meta.from)} – ${formatDate(meta.to)}`,
    Author: 'Okul Büfesi',
    Company: 'Okul Büfesi',
    CreatedDate: new Date(),
  }

  XLSX.writeFile(workbook, `okul-bufesi-rapor-${businessDate()}.xlsx`)
}
