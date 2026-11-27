import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseState = vi.hoisted(() => ({
  isDemoActive: true,
  isSupabaseConfigured: false,
}))

const mockAuthApi = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
}))

vi.mock('../../lib/supabase', () => supabaseState)
vi.mock('../../lib/api', () => ({
  staffAuthApi: mockAuthApi,
}))

import { AuthProvider, useAuth } from './AuthProvider'

function TestHarness() {
  const { session, loading, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="role">{session?.staff.role ?? 'none'}</span>
      <button type="button" onClick={() => void login('mutfak@cantinos.demo', 'Mutfak123!')}>
        Giriş
      </button>
      <button type="button" onClick={() => void logout()}>
        Çıkış
      </button>
    </div>
  )
}

describe('AuthProvider oturum depolama seçimi', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('demo modunda oturumu sessionStorage içinde saklar, localStorage kullanmaz', async () => {
    supabaseState.isDemoActive = true
    supabaseState.isSupabaseConfigured = false
    mockAuthApi.login.mockResolvedValue({
      token: 'demo-token',
      expiresAt: '2026-11-28T00:00:00Z',
      staff: {
        id: 's-1',
        email: 'mutfak@cantinos.demo',
        displayName: 'Mutfak',
        role: 'KITCHEN',
      },
    })
    mockAuthApi.logout.mockResolvedValue(true)

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>,
    )

    await act(async () => {
      screen.getByText('Giriş').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('KITCHEN')
    })

    expect(sessionStorage.getItem('cantinos.staff.session')).toContain('demo-token')
    expect(localStorage.getItem('cantinos.staff.session')).toBeNull()

    await act(async () => {
      screen.getByText('Çıkış').click()
    })

    expect(sessionStorage.getItem('cantinos.staff.session')).toBeNull()
  })

  it('canlı Supabase modunda oturumu localStorage içinde saklar, sessionStorage kullanmaz', async () => {
    supabaseState.isDemoActive = false
    supabaseState.isSupabaseConfigured = true
    mockAuthApi.login.mockResolvedValue({
      token: 'live-token',
      expiresAt: '2026-11-28T00:00:00Z',
      staff: {
        id: 's-2',
        email: 'kasa@cantinos.local',
        displayName: 'Kasa',
        role: 'CASHIER',
      },
    })
    mockAuthApi.logout.mockResolvedValue(true)

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>,
    )

    await act(async () => {
      screen.getByText('Giriş').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('CASHIER')
    })

    expect(localStorage.getItem('cantinos.staff.session')).toContain('live-token')
    expect(sessionStorage.getItem('cantinos.staff.session')).toBeNull()

    await act(async () => {
      screen.getByText('Çıkış').click()
    })

    expect(localStorage.getItem('cantinos.staff.session')).toBeNull()
  })
})
