import { describe, expect, it } from 'vitest'
import {
  MAX_CUSTOMER_NAME,
  MAX_CUSTOMER_PHONE,
  MAX_GENERAL_NOTE,
  MAX_LINE_NOTE,
  MAX_LINE_QUANTITY,
  cartCount,
  cartTotal,
  type CartLine,
} from './cart'

describe('müşteri sepet kuralları', () => {
  it('sepet toplamını kuruş hassasiyetinde doğru hesaplar', () => {
    const lines: CartLine[] = [
      {
        productId: 'p-1',
        name: 'Kaşarlı Tost',
        unitPrice: 45.0,
        quantity: 2,
        lineNote: '',
        availabilityStatus: 'ACTIVE',
        availabilityNote: null,
        imageUrl: null,
      },
      {
        productId: 'p-2',
        name: 'Ayran',
        unitPrice: 15.0,
        quantity: 1,
        lineNote: '',
        availabilityStatus: 'ACTIVE',
        availabilityNote: null,
        imageUrl: null,
      },
    ]

    expect(cartTotal(lines)).toBe(105.0)
    expect(cartCount(lines)).toBe(3)
  })

  it('boş sepette toplamı ve sayıyı 0 döndürür', () => {
    expect(cartTotal([])).toBe(0)
    expect(cartCount([])).toBe(0)
  })

  it('sabit sınır değerlerini korur', () => {
    expect(MAX_LINE_QUANTITY).toBe(50)
    expect(MAX_LINE_NOTE).toBe(200)
    expect(MAX_GENERAL_NOTE).toBe(500)
    expect(MAX_CUSTOMER_NAME).toBe(80)
    expect(MAX_CUSTOMER_PHONE).toBe(20)
  })
})
