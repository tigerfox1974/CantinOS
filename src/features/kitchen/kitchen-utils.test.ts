import { describe, expect, it } from 'vitest'
import type { StaffOrder } from '../../types/domain'
import {
  DEFAULT_THRESHOLDS,
  groupKitchenOrders,
  kitchenUrgency,
  normalizeThresholds,
  sortKitchenOrders,
} from './kitchen-utils'

const mockOrder = (overrides: Partial<StaffOrder>): StaffOrder => ({
  id: 'o-1',
  orderNumber: 1001,
  source: 'ONLINE',
  customerName: 'Test',
  customerPhone: null,
  deliveryLabel: 'Hemen',
  targetDeliveryAt: '2026-11-19T12:00:00Z',
  generalNote: null,
  status: 'NEW',
  paymentStatus: 'WAITING',
  totalAmount: 50,
  paidAmount: 0,
  priorityOverride: false,
  priorityOverrideReason: null,
  cancellationReason: null,
  createdAt: '2026-11-19T11:50:00Z',
  updatedAt: '2026-11-19T11:50:00Z',
  deliveredAt: null,
  items: [],
  problems: [],
  payments: [],
  ...overrides,
})

describe('mutfak yardımcı fonksiyonları', () => {
  it('siparişleri durumlarına göre kolonlara ayırır', () => {
    const orders: StaffOrder[] = [
      mockOrder({ id: '1', orderNumber: 1001, status: 'NEW' }),
      mockOrder({ id: '2', orderNumber: 1002, status: 'PREPARING' }),
      mockOrder({ id: '3', orderNumber: 1003, status: 'READY' }),
      mockOrder({ id: '4', orderNumber: 1004, status: 'DELIVERED' }), // Mutfak kolonlarında listelenmez
    ]

    const cols = groupKitchenOrders(orders)
    expect(cols.newOrders).toHaveLength(1)
    expect(cols.preparing).toHaveLength(1)
    expect(cols.ready).toHaveLength(1)
  })

  it('öncelikli siparişleri en üste taşır', () => {
    const orders: StaffOrder[] = [
      mockOrder({ id: '1', orderNumber: 1001, priorityOverride: false }),
      mockOrder({ id: '2', orderNumber: 1002, priorityOverride: true }),
    ]

    const sorted = sortKitchenOrders(orders)
    expect(sorted[0].orderNumber).toBe(1002)
    expect(sorted[1].orderNumber).toBe(1001)
  })

  it('geçen süreye göre aciliyet durumunu doğru belirler', () => {
    expect(kitchenUrgency(2, DEFAULT_THRESHOLDS)).toBe('normal')
    expect(kitchenUrgency(6, DEFAULT_THRESHOLDS)).toBe('attention')
    expect(kitchenUrgency(11, DEFAULT_THRESHOLDS)).toBe('late')
  })

  it('geçersiz eşikleri güvenli varsayılanlara normalize eder', () => {
    const norm = normalizeThresholds({ kitchenWarningMinutes: 0, kitchenLateMinutes: -5 })
    expect(norm.warningMinutes).toBe(1)
    expect(norm.lateMinutes).toBe(2)
  })
})
