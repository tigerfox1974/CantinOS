import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { roleHome, roleLabel, useAuth } from '../features/staff-auth/AuthProvider'

const NAV_ITEMS = [
  { role: 'KITCHEN', to: '/personel/mutfak', label: 'Mutfak' },
  { role: 'CASHIER', to: '/personel/kasa', label: 'Kasa' },
  { role: 'MANAGER', to: '/personel/yonetim', label: 'Yönetim' },
] as const

export function AppShell({ children, fluid = false }: { children: ReactNode; fluid?: boolean }) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  if (!session) return <>{children}</>

  const items = NAV_ITEMS.filter((item) => item.role === session.staff.role)

  return (
    <div className="app-shell">
      <nav className="navbar navbar-expand navbar-dark bg-primary app-navbar">
        <div className={fluid ? 'container-fluid px-3 px-lg-4' : 'container'}>
          <NavLink className="navbar-brand d-flex align-items-center gap-2" to={roleHome(session.staff.role)}>
            <img
              src="/CantinOS_anim_sidebar.gif"
              alt="CantinOS"
              style={{ height: '30px', width: 'auto', borderRadius: '4px', objectFit: 'contain' }}
            />
            <span className="fw-semibold">CantinOS</span>
          </NavLink>

          <div className="d-flex align-items-center gap-2 gap-md-3 ms-auto">
            <ul className="navbar-nav flex-row gap-1">
              {items.map((item) => (
                <li className="nav-item" key={item.to}>
                  <NavLink
                    className={({ isActive }) => `nav-link px-2 px-md-3${isActive ? ' active fw-semibold' : ''}`}
                    to={item.to}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="vr d-none d-md-block text-white-50" />
            <div className="text-white text-end d-none d-md-block lh-sm">
              <div className="small fw-semibold">{session.staff.displayName}</div>
              <div className="small text-white-50">{roleLabel(session.staff.role)}</div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={() => {
                void logout().then(() => navigate('/personel', { replace: true }))
              }}
            >
              Çıkış
            </button>
          </div>
        </div>
      </nav>
      <main className={fluid ? 'container-fluid px-3 px-lg-4 py-3 py-lg-4' : 'container py-4'}>{children}</main>
    </div>
  )
}
