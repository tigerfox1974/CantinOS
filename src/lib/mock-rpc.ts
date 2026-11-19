import type {
  AdminCategory,
  AdminDeliverySlot,
  AdminProduct,
  AnalyticsFilters,
  AnalyticsReport,
  AvailabilityStatus,
  CashClosing,
  CashierOrderResult,
  CategoryInput,
  DailySummary,
  DeliverySlot,
  DeliverySlotInput,
  LoginResult,
  OnlineOrderResult,
  OrderStatus,
  PaymentMethod,
  PaymentRecord,
  ProductInput,
  PublicMenu,
  StaffOrder,
  StaffSessionInfo,
  TrackingOrder,
  TrackResult,
} from '../types/domain'
import { AppError } from './errors'
import {
  INITIAL_CATEGORIES,
  INITIAL_DELIVERY_SLOTS,
  INITIAL_PRODUCTS,
  INITIAL_STAFF_ACCOUNTS,
  MockStaffAccount,
  getInitialOrders,
} from './mock-data'

const MOCK_STORAGE_KEY = 'cantinos_demo_store_v2'

interface MockStore {
  staffAccounts: MockStaffAccount[]
  sessions: Record<string, { staffId: string; expiresAt: string }>
  categories: AdminCategory[]
  products: AdminProduct[]
  deliverySlots: AdminDeliverySlot[]
  orders: StaffOrder[]
  trackingTokens: Record<string, string>
  cashClosings: CashClosing[]
  kitchenWarningMinutes: number
  kitchenLateMinutes: number
  onlineOrderingEnabled: boolean
  businessTimezone: string
  nextOrderNumber: number
}

function loadInitialStore(): MockStore {
  const initialOrders = getInitialOrders()
  const tokens: Record<string, string> = {}
  for (const o of initialOrders) {
    tokens[o.id] = `token-demo-${o.orderNumber}`
  }

  return {
    staffAccounts: INITIAL_STAFF_ACCOUNTS,
    sessions: {},
    categories: INITIAL_CATEGORIES,
    products: INITIAL_PRODUCTS,
    deliverySlots: INITIAL_DELIVERY_SLOTS,
    orders: initialOrders,
    trackingTokens: tokens,
    cashClosings: [],
    kitchenWarningMinutes: 5,
    kitchenLateMinutes: 10,
    onlineOrderingEnabled: true,
    businessTimezone: 'Asia/Nicosia',
    nextOrderNumber: 1004,
  }
}

let memoryStore: MockStore | null = null
let broadcastChannel: BroadcastChannel | null = null

export function invalidateStore(): void {
  memoryStore = null
}

export function notifyLiveSync(): void {
  try {
    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        if (!broadcastChannel) {
          try {
            broadcastChannel = new BroadcastChannel('cantinos_live_sync')
          } catch {
            broadcastChannel = null
          }
        }
        if (broadcastChannel) {
          broadcastChannel.postMessage({ type: 'SYNC', ts: Date.now() })
        }
      }
      window.dispatchEvent(new CustomEvent('cantinos_local_sync'))
    }
  } catch {
    // ignore
  }
}

function getStore(): MockStore {
  if (memoryStore) return memoryStore
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('cantinos_demo_store_v1')
      const raw = window.localStorage.getItem(MOCK_STORAGE_KEY)
      if (raw) {
        memoryStore = JSON.parse(raw) as MockStore
        // Personel hesaplarını her zaman güncel kod tanımlarıyla eşitle
        memoryStore.staffAccounts = INITIAL_STAFF_ACCOUNTS
        return memoryStore
      }
    }
  } catch {
    // fallback
  }
  memoryStore = loadInitialStore()
  persistStore()
  return memoryStore
}

function persistStore(): void {
  if (!memoryStore || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(memoryStore))
    notifyLiveSync()
  } catch {
    // quota
  }
}

export function resetDemoStore(): void {
  memoryStore = loadInitialStore()
  persistStore()
  notifyLiveSync()
}

function resolveStaff(token: string): MockStaffAccount {
  const store = getStore()
  const session = store.sessions[token]
  if (!session) {
    throw new AppError('Oturum bulunamadı. Lütfen yeniden giriş yapın.')
  }
  if (new Date(session.expiresAt) <= new Date()) {
    throw new AppError('Oturumunuzun süresi dolmuş. Lütfen yeniden giriş yapın.')
  }
  const staff = store.staffAccounts.find((s) => s.id === session.staffId)
  if (!staff) {
    throw new AppError('Personel hesabı bulunamadı.')
  }
  return staff
}

export async function mockRpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const store = getStore()
  const now = new Date()

  switch (name) {
    case 'get_public_menu': {
      const activeCategories = store.categories
        .filter((c) => !c.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      const categories = activeCategories
        .map((cat) => {
          const prods = store.products
            .filter((p) => p.categoryId === cat.id && p.availabilityStatus !== 'ARCHIVED')
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              price: p.price,
              imageUrl: p.imageUrl,
              sortOrder: p.sortOrder,
              availabilityStatus: p.availabilityStatus,
              availabilityNote:
                p.availabilityStatus === 'CLOSED' && p.availabilityNotePublic
                  ? p.availabilityNote
                  : null,
            }))

          return {
            id: cat.id,
            name: cat.name,
            sortOrder: cat.sortOrder,
            products: prods,
          }
        })
        .filter((c) => c.products.length > 0)

      const menu: PublicMenu = {
        onlineOrderingEnabled: store.onlineOrderingEnabled,
        categories,
      }
      return menu as T
    }

    case 'get_public_delivery_slots': {
      const slots: DeliverySlot[] = store.deliverySlots
        .filter((s) => s.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({
          id: s.id,
          label: s.label,
          targetTime: s.targetTime,
          targetAt: new Date(now.toDateString() + ' ' + s.targetTime).toISOString(),
          sortOrder: s.sortOrder,
          available: true,
        }))
      return slots as T
    }

    case 'create_online_order': {
      if (!store.onlineOrderingEnabled) {
        throw new AppError('Online sipariş şu an kapalıdır.')
      }
      const customerName = String(params.p_customer_name || '').trim()
      const customerPhone = String(params.p_customer_phone || '').trim()
      const delivery = params.p_delivery as { type: 'NOW' | 'SLOT' | 'CUSTOM'; slotId?: string; time?: string }
      const generalNote = params.p_note ? String(params.p_note).trim() : null
      const rawItems = (params.p_items || []) as Array<{
        productId: string
        quantity: number
        lineNote?: string
      }>

      if (!customerName) throw new AppError('Ad ve soyad zorunludur.')
      if (!customerPhone) throw new AppError('Telefon numarası zorunludur.')
      if (rawItems.length === 0) throw new AppError('Sepetiniz boş.')

      let totalAmount = 0
      const items = rawItems.map((item) => {
        const product = store.products.find((p) => p.id === item.productId)
        if (!product || product.availabilityStatus !== 'ACTIVE') {
          throw new AppError(`Seçilen ürün (${item.productId}) artık siparişe uygun değil.`)
        }
        const unitPrice = product.price
        const quantity = Math.max(1, Math.min(50, Math.trunc(item.quantity)))
        const lineTotal = Math.round(unitPrice * quantity * 100) / 100
        totalAmount += lineTotal
        return {
          productId: product.id,
          productName: product.name,
          categoryName: product.categoryName,
          unitPrice,
          quantity,
          lineNote: item.lineNote ? item.lineNote.slice(0, 200) : null,
          lineTotal,
        }
      })

      let deliveryLabel = 'Hemen / İlk Fırsatta'
      let targetDeliveryAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString()

      if (delivery.type === 'SLOT' && delivery.slotId) {
        const slot = store.deliverySlots.find((s) => s.id === delivery.slotId)
        if (slot) {
          deliveryLabel = slot.label
          targetDeliveryAt = new Date(now.toDateString() + ' ' + slot.targetTime).toISOString()
        }
      }

      const orderNumber = store.nextOrderNumber++
      const orderId = `order-${Date.now()}-${orderNumber}`
      const trackingToken = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)

      const order: StaffOrder = {
        id: orderId,
        orderNumber,
        source: 'ONLINE',
        status: 'NEW',
        paymentStatus: 'WAITING',
        totalAmount: Math.round(totalAmount * 100) / 100,
        paidAmount: 0,
        deliveryLabel,
        targetDeliveryAt,
        customerName,
        customerPhone,
        generalNote,
        priorityOverride: false,
        priorityOverrideReason: null,
        cancellationReason: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        deliveredAt: null,
        items,
        problems: [],
        payments: [],
      }

      store.orders.unshift(order)
      store.trackingTokens[orderId] = trackingToken
      persistStore()

      const result: OnlineOrderResult = {
        orderId,
        orderNumber,
        trackingToken,
        trackingPath: `/takip/${orderNumber}/${trackingToken}`,
        totalAmount: order.totalAmount,
        deliveryLabel,
        targetDeliveryAt,
        createdAt: order.createdAt,
      }
      return result as T
    }

    case 'track_order': {
      const orderNumber = Number(params.p_order_number)
      const token = String(params.p_tracking_token || '')

      const order = store.orders.find((o) => o.orderNumber === orderNumber)
      if (!order || store.trackingTokens[order.id] !== token) {
        return { expired: false, order: null } as T
      }

      const trackingOrder: TrackingOrder = {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        deliveryLabel: order.deliveryLabel,
        targetDeliveryAt: order.targetDeliveryAt,
        generalNote: order.generalNote,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        deliveredAt: order.deliveredAt,
        items: order.items.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          lineNote: i.lineNote,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
      }

      const isExpired =
        order.deliveredAt !== null &&
        now.getTime() - new Date(order.deliveredAt).getTime() > 60 * 60 * 1000

      const result: TrackResult = {
        expired: isExpired,
        order: isExpired ? null : trackingOrder,
      }
      return result as T
    }

    case 'public_display_orders': {
      const display = store.orders
        .filter((o) => o.status === 'PREPARING' || o.status === 'READY')
        .map((o) => ({
          orderNumber: o.orderNumber,
          status: o.status,
          updatedAt: o.updatedAt,
        }))
      return display as T
    }

    case 'staff_login': {
      const email = String(params.p_email || '').trim().toLowerCase()
      const password = String(params.p_password || '')

      const normalize = (val: string) => val.replace('@okulbufesi.demo', '@cantinos.demo').toLowerCase()
      const normalizedInput = normalize(email)

      const account = store.staffAccounts.find((a) => {
        return (
          (a.email.toLowerCase() === email || normalize(a.email) === normalizedInput) &&
          a.password === password
        )
      })

      if (!account) {
        throw new AppError('E-posta veya parola hatalı.')
      }

      const token = `session-token-${account.id}-${Date.now()}`
      const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString()

      store.sessions[token] = { staffId: account.id, expiresAt }
      persistStore()

      const result: LoginResult = {
        token,
        expiresAt,
        staff: {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          role: account.role,
        },
      }
      return result as T
    }

    case 'staff_logout': {
      const token = String(params.p_token || '')
      delete store.sessions[token]
      persistStore()
      return true as T
    }

    case 'staff_me': {
      const staff = resolveStaff(String(params.p_token || ''))
      const info: StaffSessionInfo = {
        id: staff.id,
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
      }
      return info as T
    }

    case 'staff_orders': {
      const staff = resolveStaff(String(params.p_token || ''))
      const mode = (params.p_mode as 'ACTIVE' | 'ALL') || 'ACTIVE'
      const search = params.p_search ? String(params.p_search).trim().toLowerCase() : null

      let list = [...store.orders]

      if (mode === 'ACTIVE') {
        list = list.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED')
      }

      if (search) {
        list = list.filter(
          (o) =>
            String(o.orderNumber).includes(search) ||
            (o.customerName && o.customerName.toLowerCase().includes(search)),
        )
      }

      // Mutfak rolü gizliliği: Fiyat, ödeme ve müşteri iletişim bilgisi gizlenir
      if (staff.role === 'KITCHEN') {
        list = list.map((o) => ({
          ...o,
          customerName: null,
          customerPhone: null,
          totalAmount: 0,
          paidAmount: 0,
          payments: [],
          items: o.items.map((i) => ({
            ...i,
            unitPrice: 0,
            lineTotal: 0,
          })),
        }))
      }

      return list as T
    }

    case 'staff_create_cashier_order': {
      const staff = resolveStaff(String(params.p_token || ''))
      if (staff.role !== 'CASHIER' && staff.role !== 'MANAGER') {
        throw new AppError('Yalnızca kasa ve yönetici sipariş oluşturabilir.')
      }

      const rawItems = (params.p_items || []) as Array<{
        productId: string
        quantity: number
        lineNote?: string
      }>
      const paymentMethod = params.p_payment_method as PaymentMethod
      const receivedAmount = params.p_received_amount ? Number(params.p_received_amount) : 0
      const customerName = params.p_customer_name ? String(params.p_customer_name).trim() : null
      const generalNote = params.p_note ? String(params.p_note).trim() : null

      if (rawItems.length === 0) throw new AppError('Sepetiniz boş.')

      let totalAmount = 0
      const items = rawItems.map((item) => {
        const product = store.products.find((p) => p.id === item.productId)
        if (!product) throw new AppError('Ürün bulunamadı.')
        const unitPrice = product.price
        const quantity = Math.max(1, Math.min(50, Math.trunc(item.quantity)))
        const lineTotal = Math.round(unitPrice * quantity * 100) / 100
        totalAmount += lineTotal
        return {
          productId: product.id,
          productName: product.name,
          categoryName: product.categoryName,
          unitPrice,
          quantity,
          lineNote: item.lineNote ? item.lineNote.slice(0, 200) : null,
          lineTotal,
        }
      })

      totalAmount = Math.round(totalAmount * 100) / 100

      if (paymentMethod === 'CASH' && receivedAmount < totalAmount) {
        throw new AppError('Alınan nakit para toplam tutardan az olamaz.')
      }

      const changeAmount =
        paymentMethod === 'CASH' ? Math.round((receivedAmount - totalAmount) * 100) / 100 : 0

      const orderNumber = store.nextOrderNumber++
      const orderId = `order-${Date.now()}-${orderNumber}`

      const payment: PaymentRecord = {
        id: `pay-${Date.now()}`,
        paymentType: 'PAYMENT',
        paymentMethod,
        amount: totalAmount,
        receivedAmount: paymentMethod === 'CASH' ? receivedAmount : totalAmount,
        changeAmount,
        createdAt: now.toISOString(),
        createdByName: staff.displayName,
        note: null,
      }

      const order: StaffOrder = {
        id: orderId,
        orderNumber,
        source: 'CASHIER',
        status: 'PREPARING',
        paymentStatus: 'PAID',
        totalAmount,
        paidAmount: totalAmount,
        deliveryLabel: 'Kasadan Teslim',
        targetDeliveryAt: now.toISOString(),
        customerName,
        customerPhone: null,
        generalNote,
        priorityOverride: false,
        priorityOverrideReason: null,
        cancellationReason: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        deliveredAt: null,
        items,
        problems: [],
        payments: [payment],
      }

      store.orders.unshift(order)
      persistStore()

      const result: CashierOrderResult = {
        orderId,
        orderNumber,
        totalAmount,
        receivedAmount: payment.receivedAmount ?? totalAmount,
        changeAmount,
        paymentMethod,
        cashierName: staff.displayName,
        createdAt: now.toISOString(),
        items: items.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
      }
      return result as T
    }

    case 'staff_set_order_status': {
      resolveStaff(String(params.p_token || ''))
      const orderId = String(params.p_order_id || '')
      const nextStatus = String(params.p_status || '') as OrderStatus

      const order = store.orders.find((o) => o.id === orderId)
      if (!order) throw new AppError('Sipariş bulunamadı.')

      order.status = nextStatus
      order.updatedAt = now.toISOString()
      if (nextStatus === 'DELIVERED') {
        order.deliveredAt = now.toISOString()
      }
      persistStore()
      return true as T
    }

    case 'staff_take_payment': {
      const staff = resolveStaff(String(params.p_token || ''))
      const orderId = String(params.p_order_id || '')
      const method = params.p_method as PaymentMethod
      const receivedAmount = params.p_received_amount ? Number(params.p_received_amount) : 0
      const note = params.p_note ? String(params.p_note) : null

      const order = store.orders.find((o) => o.id === orderId)
      if (!order) throw new AppError('Sipariş bulunamadı.')

      if (method === 'CASH' && receivedAmount < order.totalAmount) {
        throw new AppError('Alınan nakit tutar toplamdan düşük olamaz.')
      }

      const changeAmount =
        method === 'CASH' ? Math.round((receivedAmount - order.totalAmount) * 100) / 100 : 0

      order.paymentStatus = 'PAID'
      order.paidAmount = order.totalAmount
      order.payments.push({
        id: `pay-${Date.now()}`,
        paymentType: 'PAYMENT',
        paymentMethod: method,
        amount: order.totalAmount,
        receivedAmount: method === 'CASH' ? receivedAmount : order.totalAmount,
        changeAmount,
        createdAt: now.toISOString(),
        createdByName: staff.displayName,
        note,
      })
      order.updatedAt = now.toISOString()
      persistStore()

      return {
        paidAmount: order.totalAmount,
        changeAmount,
        paymentStatus: 'PAID',
      } as T
    }

    case 'staff_refund_order': {
      const staff = resolveStaff(String(params.p_token || ''))
      const orderId = String(params.p_order_id || '')
      const reason = String(params.p_reason || '')
      const method = params.p_method as PaymentMethod
      const amount = Number(params.p_amount)

      const order = store.orders.find((o) => o.id === orderId)
      if (!order) throw new AppError('Sipariş bulunamadı.')

      order.paymentStatus = 'REFUNDED'
      order.payments.push({
        id: `ref-${Date.now()}`,
        paymentType: 'REFUND',
        paymentMethod: method,
        amount: -Math.abs(amount),
        receivedAmount: null,
        changeAmount: null,
        createdAt: now.toISOString(),
        createdByName: staff.displayName,
        note: reason,
      })
      order.updatedAt = now.toISOString()
      persistStore()
      return true as T
    }

    case 'staff_cancel_order': {
      resolveStaff(String(params.p_token || ''))
      const orderId = String(params.p_order_id || '')
      const reason = String(params.p_reason || '')

      const order = store.orders.find((o) => o.id === orderId)
      if (!order) throw new AppError('Sipariş bulunamadı.')

      order.status = 'CANCELLED'
      order.cancellationReason = reason
      order.updatedAt = now.toISOString()
      persistStore()
      return true as T
    }

    case 'staff_adjust_order': {
      resolveStaff(String(params.p_token || ''))
      const orderId = String(params.p_order_id || '')
      const rawItems = (params.p_items || []) as Array<{ productId: string; quantity: number }>

      const order = store.orders.find((o) => o.id === orderId)
      if (!order) throw new AppError('Sipariş bulunamadı.')

      let total = 0
      order.items = rawItems.map((item) => {
        const product = store.products.find((p) => p.id === item.productId)
        if (!product) throw new AppError('Ürün bulunamadı.')
        const lineTotal = Math.round(product.price * item.quantity * 100) / 100
        total += lineTotal
        return {
          productId: product.id,
          productName: product.name,
          categoryName: product.categoryName,
          unitPrice: product.price,
          quantity: item.quantity,
          lineNote: null,
          lineTotal,
        }
      })
      order.totalAmount = Math.round(total * 100) / 100
      order.updatedAt = now.toISOString()
      persistStore()
      return true as T
    }

    case 'staff_report_problem': {
      const staff = resolveStaff(String(params.p_token || ''))
      const orderId = String(params.p_order_id || '')
      const problemType = String(params.p_problem_type || '')
      const note = String(params.p_note || '')

      const order = store.orders.find((o) => o.id === orderId)
      if (!order) throw new AppError('Sipariş bulunamadı.')

      order.problems.push({
        id: `prob-${Date.now()}`,
        problemType: problemType as any,
        note,
        reportedAt: now.toISOString(),
        reportedByName: staff.displayName,
        informedAt: null,
        informedByName: null,
        clearedAt: null,
        clearedByName: null,
      })
      order.updatedAt = now.toISOString()
      persistStore()
      return true as T
    }

    case 'staff_mark_informed': {
      const staff = resolveStaff(String(params.p_token || ''))
      const problemId = String(params.p_problem_id || '')

      for (const order of store.orders) {
        const p = order.problems.find((pr) => pr.id === problemId)
        if (p) {
          p.informedAt = now.toISOString()
          p.informedByName = staff.displayName
          order.updatedAt = now.toISOString()
          persistStore()
          return true as T
        }
      }
      return true as T
    }

    case 'staff_clear_problem': {
      const staff = resolveStaff(String(params.p_token || ''))
      const problemId = String(params.p_problem_id || '')

      for (const order of store.orders) {
        const p = order.problems.find((pr) => pr.id === problemId)
        if (p) {
          p.clearedAt = now.toISOString()
          p.clearedByName = staff.displayName
          order.updatedAt = now.toISOString()
          persistStore()
          return true as T
        }
      }
      return true as T
    }

    case 'staff_set_priority_override': {
      resolveStaff(String(params.p_token || ''))
      const orderId = String(params.p_order_id || '')
      const priority = Boolean(params.p_priority)
      const reason = params.p_reason ? String(params.p_reason) : null

      const order = store.orders.find((o) => o.id === orderId)
      if (!order) throw new AppError('Sipariş bulunamadı.')

      order.priorityOverride = priority
      order.priorityOverrideReason = reason
      order.updatedAt = now.toISOString()
      persistStore()
      return true as T
    }

    case 'staff_daily_summary': {
      resolveStaff(String(params.p_token || ''))
      const activeOrders = store.orders.filter(
        (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED',
      ).length
      const preparingOrders = store.orders.filter((o) => o.status === 'PREPARING').length
      const readyOrders = store.orders.filter((o) => o.status === 'READY').length
      const waitingPaymentOrders = store.orders.filter(
        (o) => o.paymentStatus === 'WAITING' && o.status !== 'CANCELLED',
      ).length

      let totalRevenue = 0
      let cashRevenue = 0
      let cardRevenue = 0

      for (const order of store.orders) {
        for (const p of order.payments) {
          if (p.paymentType === 'PAYMENT') {
            totalRevenue += p.amount
            if (p.paymentMethod === 'CASH') cashRevenue += p.amount
            if (p.paymentMethod === 'CARD') cardRevenue += p.amount
          }
        }
      }

      const latestClosing = store.cashClosings[store.cashClosings.length - 1] || null

      const summary: DailySummary = {
        businessDate: now.toISOString().split('T')[0],
        activeOrders,
        preparingOrders,
        readyOrders,
        waitingPaymentOrders,
        collections: totalRevenue,
        revenue: totalRevenue,
        cashCollections: cashRevenue,
        cardCollections: cardRevenue,
        refunds: 0,
        averagePrepMinutes: 8,
        cashDifference: latestClosing ? latestClosing.differenceAmount : null,
        openProblems: store.orders.reduce((sum, o) => sum + o.problems.filter((pr) => !pr.clearedAt).length, 0),
        onlineOrderingEnabled: store.onlineOrderingEnabled,
        cashClosed: Boolean(latestClosing),
        cashClosedAt: latestClosing ? latestClosing.closedAt : null,
      }
      return summary as T
    }

    case 'staff_analytics_report': {
      resolveStaff(String(params.p_token || ''))
      const filters = params.p_filters as AnalyticsFilters

      let totalCash = 0
      let totalCard = 0
      for (const order of store.orders) {
        for (const p of order.payments) {
          if (p.paymentType === 'PAYMENT') {
            if (p.paymentMethod === 'CASH') totalCash += p.amount
            if (p.paymentMethod === 'CARD') totalCard += p.amount
          }
        }
      }

      const report: AnalyticsReport = {
        topProducts: store.products.slice(0, 5).map((p) => ({
          name: p.name,
          quantity: 4,
          revenue: p.price * 4,
        })),
        categoryDistribution: store.categories.map((c) => ({
          name: c.name,
          quantity: 6,
          revenue: 160,
        })),
        hourly: [
          { hour: 9, orders: 2, revenue: 60 },
          { hour: 10, orders: 4, revenue: 140 },
          { hour: 11, orders: 3, revenue: 95 },
          { hour: 12, orders: 6, revenue: 210 },
        ],
        dailyRevenue: [
          { date: filters.from, orders: store.orders.length, revenue: totalCash + totalCard },
        ],
        monthlyRevenue: [
          { month: filters.from.slice(0, 7), orders: store.orders.length, revenue: totalCash + totalCard },
        ],
        paymentSummary: {
          collections: totalCash + totalCard,
          revenue: totalCash + totalCard,
          refunds: 0,
          cash: totalCash,
          card: totalCard,
        },
        orders: store.orders.map((o) => ({
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          deliveredAt: o.deliveredAt,
          source: o.source,
          status: o.status,
          paymentStatus: o.paymentStatus,
          totalAmount: o.totalAmount,
          customerName: o.customerName,
        })),
        cashClosings: store.cashClosings,
      }
      return report as T
    }

    case 'staff_list_cash_closings': {
      resolveStaff(String(params.p_token || ''))
      return store.cashClosings as T
    }

    case 'staff_close_cash_day': {
      const staff = resolveStaff(String(params.p_token || ''))
      const date = String(params.p_date || now.toISOString().split('T')[0])
      const actualCash = Number(params.p_actual_cash)
      const note = params.p_note ? String(params.p_note) : null

      let expectedCash = 0
      let expectedCard = 0
      for (const order of store.orders) {
        for (const p of order.payments) {
          if (p.paymentType === 'PAYMENT') {
            if (p.paymentMethod === 'CASH') expectedCash += p.amount
            if (p.paymentMethod === 'CARD') expectedCard += p.amount
          }
        }
      }

      const closing: CashClosing = {
        id: `close-${Date.now()}`,
        businessDate: date,
        expectedCash,
        expectedCard,
        actualCash,
        differenceAmount: Math.round((actualCash - expectedCash) * 100) / 100,
        closedAt: now.toISOString(),
        closedByName: staff.displayName,
        note,
        deliveredOrders: store.orders.filter((o) => o.status === 'DELIVERED').length,
        averagePrepMinutes: 8,
      }

      store.cashClosings.push(closing)
      persistStore()
      return closing as T
    }

    case 'staff_categories_admin': {
      resolveStaff(String(params.p_token || ''))
      return store.categories as T
    }

    case 'staff_manage_category': {
      resolveStaff(String(params.p_token || ''))
      const action = String(params.p_action || '')
      const payload = params.p_category as CategoryInput

      if (action === 'CREATE') {
        const id = `cat-${Date.now()}`
        const newCat: AdminCategory = {
          id,
          name: payload.name,
          sortOrder: payload.sortOrder ?? 10,
          isArchived: false,
          productCount: 0,
        }
        store.categories.push(newCat)
        persistStore()
        return { id } as T
      } else if (action === 'UPDATE') {
        const cat = store.categories.find((c) => c.id === payload.id)
        if (!cat) throw new AppError('Kategori bulunamadı.')
        cat.name = payload.name
        if (payload.sortOrder !== undefined) cat.sortOrder = payload.sortOrder
        persistStore()
        return { id: cat.id } as T
      } else if (action === 'ARCHIVE') {
        const cat = store.categories.find((c) => c.id === payload.id)
        if (!cat) throw new AppError('Kategori bulunamadı.')
        cat.isArchived = true
        persistStore()
        return { id: cat.id } as T
      }
      return { id: payload.id || 'ok' } as T
    }

    case 'staff_products_admin': {
      resolveStaff(String(params.p_token || ''))
      return store.products as T
    }

    case 'staff_save_product': {
      resolveStaff(String(params.p_token || ''))
      const p = params.p_product as ProductInput

      const category = store.categories.find((c) => c.id === p.categoryId)
      const categoryName = category ? category.name : 'Genel'

      if (p.id) {
        const existing = store.products.find((prod) => prod.id === p.id)
        if (!existing) throw new AppError('Ürün bulunamadı.')
        existing.categoryId = p.categoryId
        existing.categoryName = categoryName
        existing.name = p.name
        existing.description = p.description ?? null
        existing.price = p.price
        existing.sortOrder = p.sortOrder ?? 10
        if (p.imageUrl !== undefined) existing.imageUrl = p.imageUrl
        if (p.availabilityStatus) existing.availabilityStatus = p.availabilityStatus
        persistStore()
        return { id: existing.id } as T
      } else {
        const id = `prod-${Date.now()}`
        const newProd: AdminProduct = {
          id,
          categoryId: p.categoryId,
          categoryName,
          name: p.name,
          description: p.description ?? null,
          price: p.price,
          imageUrl: p.imageUrl ?? null,
          sortOrder: p.sortOrder ?? 10,
          availabilityStatus: p.availabilityStatus ?? 'ACTIVE',
          availabilityNote: null,
          availabilityNotePublic: false,
        }
        store.products.push(newProd)
        persistStore()
        return { id } as T
      }
    }

    case 'staff_set_product_availability': {
      resolveStaff(String(params.p_token || ''))
      const productId = String(params.p_product_id || '')
      const status = params.p_status as AvailabilityStatus
      const note = params.p_note ? String(params.p_note) : null
      const notePublic = Boolean(params.p_note_public)

      const prod = store.products.find((p) => p.id === productId)
      if (!prod) throw new AppError('Ürün bulunamadı.')

      prod.availabilityStatus = status
      prod.availabilityNote = note
      prod.availabilityNotePublic = notePublic
      persistStore()
      return true as T
    }

    case 'staff_delivery_slots_admin': {
      resolveStaff(String(params.p_token || ''))
      return store.deliverySlots as T
    }

    case 'staff_manage_delivery_slot': {
      resolveStaff(String(params.p_token || ''))
      const action = String(params.p_action || '')
      const slot = params.p_slot as DeliverySlotInput

      if (action === 'CREATE') {
        const id = `slot-${Date.now()}`
        const newSlot: AdminDeliverySlot = {
          id,
          label: slot.label,
          targetTime: slot.targetTime,
          sortOrder: slot.sortOrder ?? 10,
          active: slot.active !== undefined ? slot.active : true,
        }
        store.deliverySlots.push(newSlot)
        persistStore()
        return { id } as T
      } else if (action === 'UPDATE') {
        const sl = store.deliverySlots.find((s) => s.id === slot.id)
        if (!sl) throw new AppError('Teslimat saati bulunamadı.')
        sl.label = slot.label
        sl.targetTime = slot.targetTime
        if (slot.sortOrder !== undefined) sl.sortOrder = slot.sortOrder
        if (slot.active !== undefined) sl.active = slot.active
        persistStore()
        return { id: sl.id } as T
      } else if (action === 'TOGGLE') {
        const sl = store.deliverySlots.find((s) => s.id === slot.id)
        if (!sl) throw new AppError('Teslimat saati bulunamadı.')
        sl.active = !sl.active
        persistStore()
        return { id: sl.id } as T
      }
      return { id: slot.id || 'ok' } as T
    }

    case 'staff_get_settings': {
      resolveStaff(String(params.p_token || ''))
      return {
        kitchenWarningMinutes: store.kitchenWarningMinutes,
        kitchenLateMinutes: store.kitchenLateMinutes,
        onlineOrderingEnabled: store.onlineOrderingEnabled,
      } as T
    }

    case 'staff_set_kitchen_thresholds': {
      resolveStaff(String(params.p_token || ''))
      store.kitchenWarningMinutes = Number(params.p_warning_minutes)
      store.kitchenLateMinutes = Number(params.p_late_minutes)
      persistStore()
      return true as T
    }

    case 'staff_toggle_online_ordering': {
      resolveStaff(String(params.p_token || ''))
      store.onlineOrderingEnabled = Boolean(params.p_enabled)
      persistStore()
      return true as T
    }

    default:
      throw new AppError(`Mock RPC desteklenmiyor: ${name}`)
  }
}
