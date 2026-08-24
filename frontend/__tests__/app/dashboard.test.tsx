import React from 'react'
import { render, screen } from '@testing-library/react'
import Home from '@/app/page'
import { useAuth } from '@/contexts/AuthContext'

// Mock the auth context so we can drive `needsPasswordChange` directly.
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

// The components only render the relevant subtree; stub the non-gate pages.
jest.mock('@/components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">sidebar</div>,
}))
jest.mock('@/components/ThreatModeling', () => ({
  ThreatModeling: () => <div data-testid="threat-modeling">threat-modeling</div>,
}))
jest.mock('@/components/ChatInterface', () => ({
  ChatInterface: () => <div data-testid="chat">chat</div>,
}))
jest.mock('@/components/Settings', () => ({
  Settings: () => <div data-testid="settings">settings</div>,
}))
jest.mock('@/components/UserManagement', () => ({
  UserManagement: () => <div data-testid="user-management">user-management</div>,
}))
jest.mock('@/components/ChangePasswordDialog', () => ({
  ChangePasswordDialog: ({ showCloseButton }: { showCloseButton?: boolean }) => (
    <div data-testid="change-password-dialog" data-show-close={String(showCloseButton)}>
      change-password-form
    </div>
  ),
}))

const baseAuth = {
  user: { id: 1, username: 'admin', email: 'admin@localhost', role: 'Admin' },
  logout: jest.fn(),
  needsPasswordChange: false,
  isAuthenticated: true,
  loading: false,
}

describe('Dashboard password gate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue(baseAuth)
  })

  it('renders the normal app when the password has been changed', () => {
    render(<Home />)
    expect(screen.queryByTestId('password-change-gate')).not.toBeInTheDocument()
    expect(screen.getByTestId('threat-modeling')).toBeInTheDocument()
  })

  it('locks the app behind a non-dismissible gate while the default password is active', () => {
    ;(useAuth as jest.Mock).mockReturnValue({ ...baseAuth, needsPasswordChange: true })
    render(<Home />)
    expect(screen.getByTestId('password-change-gate')).toBeInTheDocument()
    // The dialog must not offer a close button while gated.
    expect(screen.getByTestId('change-password-dialog')).toHaveAttribute(
      'data-show-close',
      'false',
    )
    // The app surface must not be reachable behind the gate.
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('threat-modeling')).not.toBeInTheDocument()
    // A sign-out escape hatch is available.
    expect(screen.getByTestId('gate-logout')).toBeInTheDocument()
  })

  it('lets the user sign out from the gate', () => {
    ;(useAuth as jest.Mock).mockReturnValue({ ...baseAuth, needsPasswordChange: true })
    render(<Home />)
    screen.getByTestId('gate-logout').click()
    expect(baseAuth.logout).toHaveBeenCalled()
  })
})
