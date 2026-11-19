import { beforeEach, describe, expect, it } from 'vitest'
import { publicApi, staffAuthApi, staffOrderApi } from './api'
import { resetDemoStore } from './mock-rpc'

describe('yerel mock rpc motoru', () => {
  beforeEach(() => {
    resetDemoStore()
  })

  it('kamusal menüyü ve kategorileri döndürür', async () => {
    const menu = await publicApi.getMenu()
    expect(menu.onlineOrderingEnabled).toBe(true)
    expect(menu.categories.length).toBeGreaterThan(0)
    expect(menu.categories[0].products.length).toBeGreaterThan(0)
  })

  it('demo personel hesabı ile oturum açabilir', async () => {
    const loginRes = await staffAuthApi.login('kasa@cantinos.demo', 'Kasa123!')
    expect(loginRes.token).toBeDefined()
    expect(loginRes.staff.role).toBe('CASHIER')
    expect(loginRes.staff.displayName).toBe('Demo Kasa')

    const me = await staffAuthApi.me(loginRes.token)
    expect(me.displayName).toBe('Demo Kasa')
  })

  it('geçersiz parolada hata fırlatır', async () => {
    await expect(staffAuthApi.login('kasa@cantinos.demo', 'yanlis')).rejects.toThrow(
      'E-posta veya parola hatalı.',
    )
  })

  it('online sipariş oluşturup takip edebilir', async () => {
    const menu = await publicApi.getMenu()
    const firstProduct = menu.categories[0].products[0]

    const orderRes = await publicApi.createOnlineOrder({
      customerName: 'Test Müşteri',
      customerPhone: '0555 123 4567',
      delivery: { type: 'NOW' },
      items: [{ productId: firstProduct.id, quantity: 2 }],
    })

    expect(orderRes.orderNumber).toBeGreaterThanOrEqual(1001)
    expect(orderRes.totalAmount).toBe(firstProduct.price * 2)

    const trackRes = await publicApi.trackOrder(orderRes.orderNumber, orderRes.trackingToken)
    expect(trackRes).not.toBeNull()
    expect(trackRes?.order?.orderNumber).toBe(orderRes.orderNumber)
    expect(trackRes?.order?.items[0].productName).toBe(firstProduct.name)
  })

  it('kasa personeli sipariş oluşturup durum güncelleyebilir', async () => {
    const loginRes = await staffAuthApi.login('kasa@cantinos.demo', 'Kasa123!')
    const menu = await publicApi.getMenu()
    const prod = menu.categories[0].products[0]

    const cashierOrder = await staffOrderApi.createCashierOrder(loginRes.token, {
      paymentMethod: 'CASH',
      receivedAmount: prod.price * 2,
      items: [{ productId: prod.id, quantity: 1 }],
    })

    expect(cashierOrder.orderNumber).toBeGreaterThanOrEqual(1001)
    expect(cashierOrder.changeAmount).toBe(prod.price)

    const list = await staffOrderApi.list(loginRes.token)
    expect(list.some((o) => o.orderNumber === cashierOrder.orderNumber)).toBe(true)
  })

  it('sekme ve canlı senkronizasyon sipariş durumunu otomatik anında yansıtır', async () => {
    const kitchenLogin = await staffAuthApi.login('mutfak@cantinos.demo', 'Mutfak123!')
    const menu = await publicApi.getMenu()
    const prod = menu.categories[0].products[0]

    // 1. Müşteri online sipariş verir
    const created = await publicApi.createOnlineOrder({
      customerName: 'Ayşe Canlı',
      customerPhone: '0555 999 8877',
      delivery: { type: 'NOW' },
      items: [{ productId: prod.id, quantity: 1 }],
    })

    // 2. Mutfak tarafında sipariş anında görünür
    const kitchenOrders = await staffOrderApi.list(kitchenLogin.token)
    const foundInKitchen = kitchenOrders.find((o) => o.orderNumber === created.orderNumber)
    expect(foundInKitchen).toBeDefined()
    expect(foundInKitchen?.status).toBe('NEW')

    // 3. Mutfak siparişi "PREPARING" durumuna alır
    await staffOrderApi.setStatus(kitchenLogin.token, foundInKitchen!.id, 'PREPARING')

    // 4. Müşteri takip ekranı ve TV bekleme ekranı durumu anında güncel görür
    const track = await publicApi.trackOrder(created.orderNumber, created.trackingToken)
    expect(track?.order?.status).toBe('PREPARING')

    const displayOrders = await publicApi.displayOrders()
    expect(displayOrders.some((d) => d.orderNumber === created.orderNumber && d.status === 'PREPARING')).toBe(true)
  })
})
