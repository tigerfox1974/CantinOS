import { Link, Route, Routes } from 'react-router-dom'
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
  if (!isSupabaseConfigured && !isDemoActive) return <ConfigMissing />

  return (
    <>
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
