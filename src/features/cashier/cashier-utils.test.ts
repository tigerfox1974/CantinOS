import { describe, expect, it } from 'vitest'
import type { MenuProduct, StaffOrder } from '../../types/domain'
import {
  addProductToCart,
  buildOrderReceipt,
  calculateChange,
  cartTotal,
  clampQuantity,
  getProductQuickModifiers,
  getQuickCashPresets,
  isCashSufficient,
  validateOrderForm,
} from './cashier-utils'

const product: MenuProduct = {
  id: 'product-1',
  name: 'Tost',
  description: null,
  price: 42.5,
  imageUrl: null,
  sortOrder: 1,
  availabilityStatus: 'ACTIVE',
  availabilityNote: null,
}

describe('kasa sepet kuralları', () => {
  it('aynı notsuz ürünü birleştirir ve adet sınırını korur', () => {
    const once = addProductToCart([], product, 'line-1')
    const twice = addProductToCart(once, product, 'line-2')

    expect(twice).toHaveLength(1)
    expect(twice[0].quantity).toBe(2)
    expect(clampQuantity(100)).toBe(50)
  })

  it('kuruş hassasiyetinde toplam ve para üstü hesaplar', () => {
    const lines = addProductToCart([], product, 'line-1').map((line) => ({ ...line, quantity: 2 }))
    expect(cartTotal(lines)).toBe(85)
    expect(calculateChange(100, 85)).toBe(15)
    expect(isCashSufficient(84.99, 85)).toBe(false)
  })

  it('sepet tutarına göre akıllı hızlı nakit banknot önerileri üretir', () => {
    expect(getQuickCashPresets(72)).toEqual([72, 100, 200, 500])
    expect(getQuickCashPresets(18)).toEqual([18, 20, 50, 100])
    expect(getQuickCashPresets(0)).toEqual([])
  })

  it('ürün adına göre hızlı opsiyon/not hapları listesi döner', () => {
    expect(getProductQuickModifiers('Kaşarlı Tost')).toContain('🍅 Domatessiz')
    expect(getProductQuickModifiers('Kaşarlı Tost')).toContain('İyi Pişmiş')
    // Ton Balıklı Sandviç soğuk sandviçtir, asla 'İyi Pişmiş' içermemeli, 'Mısırsız' veya 'Mayonezsiz' içermeli
    expect(getProductQuickModifiers('Ton Balıklı Sandviç')).toContain('Mayonezsiz')
    expect(getProductQuickModifiers('Ton Balıklı Sandviç')).toContain('Mısırsız')
    expect(getProductQuickModifiers('Ton Balıklı Sandviç')).not.toContain('İyi Pişmiş')
    expect(getProductQuickModifiers('Türk Kahvesi')).toContain('Orta')
    expect(getProductQuickModifiers('Ayran')).toContain('Soğuk')
  })

  it('yetersiz nakitli siparişi reddeder', () => {
    const lines = addProductToCart([], product, 'line-1')
    expect(
      validateOrderForm({
        lines,
        paymentMethod: 'CASH',
        receivedText: '10',
        customerName: '',
        generalNote: '',
      }),
    ).toContain('Alınan para toplamdan düşük')
  })

  it('teslim edilen online sipariş için eksiksiz fiş nesnesi üretir', () => {
    const order: StaffOrder = {
      id: 'online-1',
      orderNumber: 1042,
      source: 'ONLINE',
      customerName: 'Ahmet Online',
      customerPhone: '0555 123 4567',
      deliveryLabel: 'Hemen',
      targetDeliveryAt: '2026-11-19T12:00:00Z',
      generalNote: null,
      status: 'READY',
      paymentStatus: 'PAID',
      totalAmount: 60,
      paidAmount: 60,
      priorityOverride: false,
      priorityOverrideReason: null,
      cancellationReason: null,
      createdAt: '2026-11-19T11:45:00Z',
      updatedAt: '2026-11-19T11:55:00Z',
      deliveredAt: null,
      items: [
        {
          productId: 'p-1',
          productName: 'Kaşarlı Tost',
          categoryName: 'Tost',
          unitPrice: 45,
          quantity: 1,
          lineNote: null,
          lineTotal: 45,
        },
        {
          productId: 'p-2',
          productName: 'Ayran',
          categoryName: 'İçecek',
          unitPrice: 15,
          quantity: 1,
          lineNote: null,
          lineTotal: 15,
        },
      ],
      problems: [],
      payments: [
        {
          id: 'pay-1',
          paymentType: 'PAYMENT',
          paymentMethod: 'CASH',
          amount: 60,
          receivedAmount: 100,
          changeAmount: 40,
          createdAt: '2026-11-19T11:55:00Z',
          createdByName: 'Kasiyer Mehmet',
          note: null,
        },
      ],
    }

    const receipt = buildOrderReceipt(order, 'Varsayılan Kasiyer')
    expect(receipt.orderNumber).toBe(1042)
    expect(receipt.totalAmount).toBe(60)
    expect(receipt.paymentMethod).toBe('CASH')
    expect(receipt.receivedAmount).toBe(100)
    expect(receipt.changeAmount).toBe(40)
    expect(receipt.cashierName).toBe('Kasiyer Mehmet')
    expect(receipt.items).toHaveLength(2)
  })
})
