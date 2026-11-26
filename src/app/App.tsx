import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { DemoBadge } from '../components/DemoBadge'
import { ConfigMissing } from '../components/Feedback'
import { isDemoActive, isSupabaseConfigured } from '../lib/supabase'
import { CustomerPage } from '../features/customer/CustomerPage'
import { TrackPage } from '../features/customer/TrackPage'
import { WaitingDisplayPage } from '../features/waiting-display/WaitingDisplayPage'
import { LoginPage } from '../features/staff-auth/LoginPage'
import { RequireRole } from '../features/staff-auth/RequireRole'
import { KitchenPage } from '../features/kitchen/KitchenPage'
import { CashierPage } from '../features/cashier/CashierPage'
import { ManagerPage } from '../features/manager/ManagerPage'

function DocumentTitle({ configMissing }: { configMissing: boolean }) {
  const { pathname } = useLocation()

  useEffect(() => {
    if (configMissing) {
      document.title = 'CantinOS - Yapılandırma Hatası'
      return
    }

    const normalizedPath = pathname.replace(/\/+$/, '') || '/'

    if (normalizedPath === '/') {
      document.title = 'CantinOS'
      return
    }

    if (normalizedPath.startsWith('/takip/')) {
      const orderNumber = normalizedPath.split('/')[2]
      document.title = /^\d+$/.test(orderNumber)
        ? `CantinOS - Sipariş Takibi #${orderNumber}`
        : 'CantinOS - Sipariş Takibi'
      return
    }

    const titles: Record<string, string> = {
      '/bekleme': 'CantinOS - Bekleme Ekranı',
      '/personel': 'CantinOS - Personel Girişi',
      '/personel/mutfak': 'CantinOS - Mutfak',
      '/personel/kasa': 'CantinOS - Kasa',
      '/personel/yonetim': 'CantinOS - Yönetim - Genel Bakış',
    }

    document.title = titles[normalizedPath] ?? 'CantinOS - Sayfa Bulunamadı'
  }, [configMissing, pathname])

  return null
}

function NotFound() {
  return (
    <div className="container py-5 text-center">
      <h1 className="display-5">Sayfa bulunamadı</h1>
      <p className="text-body-secondary">Aradığınız sayfa mevcut değil.</p>
      <Link className="btn btn-primary" to="/">
        Müşteri menüsüne dön
      </Link>
    </div>
  )
}

export function App() {
  const configMissing = !isSupabaseConfigured && !isDemoActive

  if (configMissing) {
    return (
      <>
        <DocumentTitle configMissing />
        <ConfigMissing />
      </>
    )
  }

  return (
    <>
      <DocumentTitle configMissing={false} />
      {isDemoActive ? <DemoBadge /> : null}
      <Routes>
      <Route path="/" element={<CustomerPage />} />
      <Route path="/takip/:siparisNo/:trackingToken" element={<TrackPage />} />
      <Route path="/bekleme" element={<WaitingDisplayPage />} />
      <Route path="/personel" element={<LoginPage />} />

      <Route
        path="/personel/mutfak"
        element={
          <RequireRole roles={['KITCHEN']}>
            <AppShell fluid>
              <KitchenPage />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/personel/kasa"
        element={
          <RequireRole roles={['CASHIER']}>
            <AppShell fluid>
              <CashierPage />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/personel/yonetim"
        element={
          <RequireRole roles={['MANAGER']}>
            <AppShell fluid>
              <ManagerPage />
            </AppShell>
          </RequireRole>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  )
}
