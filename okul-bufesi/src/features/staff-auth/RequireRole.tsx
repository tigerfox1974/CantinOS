import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingBlock } from '../../components/Feedback'
import type { StaffRole } from '../../types/domain'
import { roleHome, useAuth } from './AuthProvider'

export function RequireRole({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="container py-5">
        <LoadingBlock label="Oturum doğrulanıyor…" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/personel" replace state={{ from: location.pathname }} />
  }

  if (!roles.includes(session.staff.role)) {
    return <Navigate to={roleHome(session.staff.role)} replace />
  }

  return <>{children}</>
}
