export type StaffRole = 'CASHIER' | 'KITCHEN' | 'MANAGER'

export type OrderSource = 'ONLINE' | 'CASHIER'

export type OrderStatus = 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'

export type PaymentStatus = 'WAITING' | 'PAID' | 'REFUND_PENDING' | 'REFUNDED'

export type PaymentMethod = 'CASH' | 'CARD'

export type AvailabilityStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED'

export type ProblemType =
  | 'OUT_OF_STOCK'
  | 'MISSING_INGREDIENT'
  | 'NOTE_UNCLEAR'
  | 'EQUIPMENT_BUSY'
  | 'WONT_MAKE_BREAK'
  | 'OTHER'

export interface StaffSessionInfo {
  id: string
  email: string
  displayName: string
  role: StaffRole
}

export interface LoginResult {
  token: string
  expiresAt: string
  staff: StaffSessionInfo
}

export interface MenuProduct {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  sortOrder: number
  availabilityStatus: AvailabilityStatus
  availabilityNote: string | null
  quickModifiers?: string[]
}

export interface MenuCategory {
  id: string
  name: string
  sortOrder: number
  icon?: string | null
  products: MenuProduct[]
}

export interface PublicMenu {
  onlineOrderingEnabled: boolean
  categories: MenuCategory[]
}

export interface DeliverySlot {
  id: string
  label: string
  targetTime: string
  targetAt: string
  sortOrder: number
  available: boolean
}

export interface PublicOrderItem {
  productName: string
  quantity: number
  lineNote: string | null
  unitPrice: number
  lineTotal: number
}

export interface TrackingOrder {
  orderNumber: number
  status: OrderStatus
  paymentStatus: PaymentStatus
  totalAmount: number
  deliveryLabel: string
  targetDeliveryAt: string
  generalNote: string | null
  createdAt: string
  updatedAt: string
  deliveredAt: string | null
  items: PublicOrderItem[]
}

export interface TrackResult {
  expired: boolean
  order: TrackingOrder | null
}

export interface DisplayOrder {
  orderNumber: number
  status: OrderStatus
  updatedAt: string
}

export interface OrderProblem {
  id: string
  problemType: ProblemType
  note: string | null
  reportedAt: string
  reportedByName: string | null
  informedAt: string | null
  informedByName: string | null
  clearedAt: string | null
  clearedByName: string | null
}

export interface StaffOrderItem {
  productId: string
  productName: string
  categoryName: string
  unitPrice: number
  quantity: number
  lineNote: string | null
  lineTotal: number
}

export interface PaymentRecord {
  id: string
  paymentType: 'PAYMENT' | 'REFUND'
  paymentMethod: PaymentMethod
  amount: number
  receivedAmount: number | null
  changeAmount: number | null
  createdAt: string
  createdByName: string | null
  note: string | null
}

export interface StaffOrder {
  id: string
  orderNumber: number
  source: OrderSource
  customerName: string | null
  customerPhone: string | null
  deliveryLabel: string
  targetDeliveryAt: string
  generalNote: string | null
  status: OrderStatus
  paymentStatus: PaymentStatus
  totalAmount: number
  paidAmount: number
  priorityOverride: boolean
  priorityOverrideReason: string | null
  createdAt: string
  updatedAt: string
  deliveredAt: string | null
  items: StaffOrderItem[]
  problems: OrderProblem[]
  payments: PaymentRecord[]
  cancellationReason: string | null
}

export interface CashierOrderInput {
  customerName?: string
  generalNote?: string
  paymentMethod: PaymentMethod
  receivedAmount?: number
  items: Array<{ productId: string; quantity: number; lineNote?: string }>
}

export interface ReceiptLine {
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface CashierOrderResult {
  orderId: string
  orderNumber: number
  createdAt: string
  totalAmount: number
  paymentMethod: PaymentMethod
  receivedAmount: number
  changeAmount: number
  cashierName: string
  items: ReceiptLine[]
}

export interface OnlineOrderInput {
  customerName: string
  customerPhone: string
  generalNote?: string
  delivery:
    | { type: 'NOW' }
    | { type: 'SLOT'; slotId: string }
    | { type: 'CUSTOM'; time: string }
  items: Array<{ productId: string; quantity: number; lineNote?: string }>
}

export interface OnlineOrderResult {
  orderId: string
  orderNumber: number
  trackingToken: string
  trackingPath: string
  totalAmount: number
  targetDeliveryAt: string
  deliveryLabel: string
  createdAt: string
}

export interface ProductInput {
  id?: string
  categoryId: string
  name: string
  description?: string
  price: number
  imageUrl?: string | null
  sortOrder?: number
  availabilityStatus?: AvailabilityStatus
  quickModifiers?: string[]
}

export interface CategoryInput {
  id?: string
  name: string
  sortOrder?: number
  icon?: string | null
}

export interface DeliverySlotInput {
  id?: string
  label: string
  targetTime: string
  sortOrder?: number
  active?: boolean
}

export interface DailySummary {
  businessDate: string
  activeOrders: number
  preparingOrders: number
  readyOrders: number
  waitingPaymentOrders: number
  collections: number
  revenue: number
  cashCollections: number
  cardCollections: number
  refunds: number
  averagePrepMinutes: number | null
  cashDifference: number | null
  openProblems: number
  onlineOrderingEnabled: boolean
  cashClosed: boolean
  cashClosedAt: string | null
}

export interface CashClosing {
  id: string
  businessDate: string
  expectedCash: number
  expectedCard: number
  actualCash: number
  differenceAmount: number
  closedAt: string
  closedByName: string | null
  note: string | null
  deliveredOrders: number
  averagePrepMinutes: number | null
}

export interface AdminCategory {
  id: string
  name: string
  sortOrder: number
  isArchived: boolean
  productCount: number
  icon?: string | null
}

export interface AdminProduct {
  id: string
  categoryId: string
  categoryName: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  sortOrder: number
  availabilityStatus: AvailabilityStatus
  availabilityNote: string | null
  availabilityNotePublic: boolean
  quickModifiers?: string[]
}

export interface AdminDeliverySlot {
  id: string
  label: string
  targetTime: string
  sortOrder: number
  active: boolean
}

export interface AnalyticsFilters {
  from: string
  to: string
  categoryId?: string | null
  source?: OrderSource | null
  paymentMethod?: PaymentMethod | null
}

export interface NamedAmount {
  name: string
  quantity: number
  revenue: number
}

export interface AnalyticsReport {
  topProducts: NamedAmount[]
  categoryDistribution: NamedAmount[]
  hourly: Array<{ hour: number; orders: number; revenue: number }>
  dailyRevenue: Array<{ date: string; orders: number; revenue: number }>
  monthlyRevenue: Array<{ month: string; orders: number; revenue: number }>
  paymentSummary: {
    collections: number
    revenue: number
    refunds: number
    cash: number
    card: number
  }
  orders: Array<{
    orderNumber: number
    createdAt: string
    deliveredAt: string | null
    source: OrderSource
    status: OrderStatus
    paymentStatus: PaymentStatus
    totalAmount: number
    customerName: string | null
  }>
  cashClosings: CashClosing[]
}
