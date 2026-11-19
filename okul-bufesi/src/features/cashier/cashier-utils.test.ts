import { describe, expect, it } from 'vitest'
import type { MenuProduct } from '../../types/domain'
import {
  addProductToCart,
  calculateChange,
  cartTotal,
  clampQuantity,
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
})
