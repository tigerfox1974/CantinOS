import { useState } from 'react'
import { LoadingBlock, PageHeader } from '../../components/Feedback'
import { formatDate, formatTime } from '../../lib/format'
import { useClock } from '../../lib/polling'
import { useAuth } from '../staff-auth/AuthProvider'
import { CashClosingTab } from './CashClosingTab'
import { CatalogTab } from './CatalogTab'
import { OrdersTab } from './OrdersTab'
import { OverviewTab } from './OverviewTab'
import { ReportsTab } from './reports/ReportsTab'
import { SlotsTab } from './SlotsTab'

const TABS = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'orders', label: 'Siparişler' },
  { id: 'catalog', label: 'Ürünler' },
  { id: 'slots', label: 'Teslim Saatleri' },
  { id: 'reports', label: 'Raporlar' },
  { id: 'cash', label: 'Kasa Kapanışı' },
] as const

type TabId = (typeof TABS)[number]['id']

export function ManagerPage() {
  const { session } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const now = useClock(1000)

  if (!session?.token) {
    return <LoadingBlock label="Oturum yükleniyor…" />
  }

  const token = session.token

  return (
    <div>
      <PageHeader
        title="Yönetim Paneli"
        subtitle={`${session.staff.displayName} · ${formatDate(now)}`}
        actions={
          <span className="live-indicator" title="Veriler 2,5 saniyede bir güncellenir">
            <span className="live-dot" aria-hidden="true" />
            Canlı · {formatTime(now)}
          </span>
        }
      />

      <ul className="nav nav-pills manager-tabs flex-wrap gap-1 mb-4" role="tablist">
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.id} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`nav-link${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === 'overview' ? <OverviewTab token={token} /> : null}
      {activeTab === 'orders' ? <OrdersTab token={token} /> : null}
      {activeTab === 'catalog' ? <CatalogTab token={token} /> : null}
      {activeTab === 'slots' ? <SlotsTab token={token} /> : null}
      {activeTab === 'reports' ? <ReportsTab token={token} /> : null}
      {activeTab === 'cash' ? <CashClosingTab token={token} /> : null}
    </div>
  )
}
