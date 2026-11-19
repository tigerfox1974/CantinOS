import type {
  AdminCategory,
  AdminDeliverySlot,
  AdminProduct,
  AnalyticsFilters,
  AnalyticsReport,
  CashClosing,
  CashierOrderInput,
  CashierOrderResult,
  CategoryInput,
  DailySummary,
  DeliverySlot,
  DeliverySlotInput,
  DisplayOrder,
  LoginResult,
  OnlineOrderInput,
  OnlineOrderResult,
  ProductInput,
  PublicMenu,
  StaffOrder,
  StaffSessionInfo,
  TrackResult,
} from '../types/domain'
import { AppError, logTechnicalError, toUserMessage } from './errors'
import { mockRpc } from './mock-rpc'
import { isDemoActive, requireSupabase, supabase } from './supabase'

async function rpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  if (isDemoActive) {
    return mockRpc<T>(name, params)
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc(name, params)
  if (error) {
    logTechnicalError(`rpc:${name}`, error)
    throw new AppError(toUserMessage(error), error.code)
  }
  return data as T
}

function tokenParams(token: string): { p_token: string } {
  return { p_token: token }
}

export const publicApi = {
  getMenu: () => rpc<PublicMenu>('get_public_menu'),
  getDeliverySlots: () => rpc<DeliverySlot[]>('get_public_delivery_slots'),
  createOnlineOrder: (input: OnlineOrderInput) =>
    rpc<OnlineOrderResult>('create_online_order', {
      p_customer_name: input.customerName,
      p_customer_phone: input.customerPhone,
      p_delivery: input.delivery,
      p_note: input.generalNote ?? null,
      p_items: input.items,
    }),
  trackOrder: (orderNumber: number | string, trackingToken: string) =>
    rpc<TrackResult | null>('track_order', {
      p_order_number: Number(orderNumber),
      p_tracking_token: trackingToken,
    }),
  displayOrders: () => rpc<DisplayOrder[]>('public_display_orders'),
}

export const staffAuthApi = {
  login: (email: string, password: string) =>
    rpc<LoginResult>('staff_login', { p_email: email, p_password: password }),
  logout: (token: string) => rpc<boolean>('staff_logout', tokenParams(token)),
  me: (token: string) => rpc<StaffSessionInfo>('staff_me', tokenParams(token)),
}

export const staffOrderApi = {
  list: (token: string, mode: 'ACTIVE' | 'ALL' = 'ACTIVE', search?: string) =>
    rpc<StaffOrder[]>('staff_orders', {
      ...tokenParams(token),
      p_mode: mode,
      p_search: search?.trim() ? search.trim() : null,
    }),
  createCashierOrder: (token: string, input: CashierOrderInput) =>
    rpc<CashierOrderResult>('staff_create_cashier_order', {
      ...tokenParams(token),
      p_items: input.items,
      p_payment_method: input.paymentMethod,
      p_received_amount: input.receivedAmount ?? null,
      p_customer_name: input.customerName?.trim() ? input.customerName.trim() : null,
      p_note: input.generalNote?.trim() ? input.generalNote.trim() : null,
    }),
  setStatus: (token: string, orderId: string, status: string) =>
    rpc<boolean>('staff_set_order_status', {
      ...tokenParams(token),
      p_order_id: orderId,
      p_status: status,
    }),
  takePayment: (
    token: string,
    orderId: string,
    method: 'CASH' | 'CARD',
    receivedAmount?: number,
    note?: string,
  ) =>
    rpc<{ paidAmount: number; changeAmount: number; paymentStatus: string }>('staff_take_payment', {
      ...tokenParams(token),
      p_order_id: orderId,
      p_method: method,
      p_received_amount: receivedAmount ?? null,
      p_note: note ?? null,
    }),
  refund: (token: string, orderId: string, method: 'CASH' | 'CARD', amount: number, reason: string) =>
    rpc<boolean>('staff_refund_order', {
      ...tokenParams(token),
      p_order_id: orderId,
      p_method: method,
      p_amount: amount,
      p_reason: reason,
    }),
  reportProblem: (token: string, orderId: string, problemType: string, note?: string) =>
    rpc<boolean>('staff_report_problem', {
      ...tokenParams(token),
      p_order_id: orderId,
      p_problem_type: problemType,
      p_note: note?.trim() ? note.trim() : null,
    }),
  markInformed: (token: string, problemId: string) =>
    rpc<boolean>('staff_mark_informed', { ...tokenParams(token), p_problem_id: problemId }),
  clearProblem: (token: string, problemId: string) =>
    rpc<boolean>('staff_clear_problem', { ...tokenParams(token), p_problem_id: problemId }),
  cancel: (token: string, orderId: string, reason: string) =>
    rpc<boolean>('staff_cancel_order', {
      ...tokenParams(token),
      p_order_id: orderId,
      p_reason: reason,
    }),
  adjust: (
    token: string,
    orderId: string,
    items: Array<{ productId: string; quantity: number; lineNote?: string }>,
    reason: string,
  ) =>
    rpc<{ totalAmount: number }>('staff_adjust_order', {
      ...tokenParams(token),
      p_order_id: orderId,
      p_items: items,
      p_reason: reason,
    }),
  setPriority: (token: string, orderId: string, priority: boolean, reason: string) =>
    rpc<boolean>('staff_set_priority_override', {
      ...tokenParams(token),
      p_order_id: orderId,
      p_priority: priority,
      p_reason: reason,
    }),
}

export const staffAdminApi = {
  toggleOnlineOrdering: (token: string, enabled: boolean) =>
    rpc<boolean>('staff_toggle_online_ordering', { ...tokenParams(token), p_enabled: enabled }),
  setProductAvailability: (
    token: string,
    productId: string,
    status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED',
    note?: string,
    notePublic = true,
  ) =>
    rpc<boolean>('staff_set_product_availability', {
      ...tokenParams(token),
      p_product_id: productId,
      p_status: status,
      p_note: note?.trim() ? note.trim() : null,
      p_note_public: notePublic,
    }),
  saveProduct: (token: string, product: ProductInput) =>
    rpc<{ id: string }>('staff_save_product', { ...tokenParams(token), p_product: product }),
  manageCategory: (token: string, action: 'CREATE' | 'UPDATE' | 'ARCHIVE' | 'REORDER', category: CategoryInput) =>
    rpc<{ id: string }>('staff_manage_category', {
      ...tokenParams(token),
      p_action: action,
      p_category: category,
    }),
  manageDeliverySlot: (
    token: string,
    action: 'CREATE' | 'UPDATE' | 'TOGGLE' | 'REORDER',
    slot: DeliverySlotInput,
  ) =>
    rpc<{ id: string }>('staff_manage_delivery_slot', {
      ...tokenParams(token),
      p_action: action,
      p_slot: slot,
    }),
  dailySummary: (token: string, date?: string) =>
    rpc<DailySummary>('staff_daily_summary', {
      ...tokenParams(token),
      p_date: date ?? null,
    }),
  closeCashDay: (token: string, date: string, actualCash: number, note?: string) =>
    rpc<CashClosing>('staff_close_cash_day', {
      ...tokenParams(token),
      p_date: date,
      p_actual_cash: actualCash,
      p_note: note?.trim() ? note.trim() : null,
    }),
  analytics: (token: string, filters: AnalyticsFilters) =>
    rpc<AnalyticsReport>('staff_analytics_report', {
      ...tokenParams(token),
      p_filters: filters,
    }),
  getSettings: (token: string) =>
    rpc<{ kitchenWarningMinutes: number; kitchenLateMinutes: number; onlineOrderingEnabled: boolean }>(
      'staff_get_settings',
      tokenParams(token),
    ),
  setKitchenThresholds: (token: string, warningMinutes: number, lateMinutes: number) =>
    rpc<boolean>('staff_set_kitchen_thresholds', {
      ...tokenParams(token),
      p_warning_minutes: warningMinutes,
      p_late_minutes: lateMinutes,
    }),
  cashClosings: (token: string, limit = 30) =>
    rpc<CashClosing[]>('staff_list_cash_closings', { ...tokenParams(token), p_limit: limit }),
  adminCategories: (token: string) => rpc<AdminCategory[]>('staff_categories_admin', tokenParams(token)),
  adminProducts: (token: string) => rpc<AdminProduct[]>('staff_products_admin', tokenParams(token)),
  adminDeliverySlots: (token: string) =>
    rpc<AdminDeliverySlot[]>('staff_delivery_slots_admin', tokenParams(token)),
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024

export async function uploadProductImage(token: string, file: File): Promise<string> {
  if (isDemoActive) {
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      throw new AppError('Yalnız PNG ve JPEG görseller yüklenebilir.')
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new AppError('Görsel en fazla 3 MB olabilir.')
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new AppError('Görsel okunamadı.'))
      reader.readAsDataURL(file)
    })
  }

  if (!supabase) throw new AppError('Sistem yapılandırması eksik. Yöneticinize başvurun.')
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new AppError('Yalnız PNG ve JPEG görseller yüklenebilir.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError('Görsel en fazla 3 MB olabilir.')
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-product-image`
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'x-staff-token': token,
    },
    body,
  })

  if (!response.ok) {
    let message = 'Görsel yüklenemedi. Lütfen tekrar deneyin.'
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // yanıt gövdesi okunamadıysa genel mesaj kullanılır
    }
    throw new AppError(message)
  }

  const payload = (await response.json()) as { url?: string }
  if (!payload.url) throw new AppError('Görsel yüklenemedi. Lütfen tekrar deneyin.')
  return payload.url
}
