import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'

// Mock the API
jest.mock('@/lib/api')

const TestComponent = () => {
  const { user, isAuthenticated, needsPasswordChange, loading } = useAuth()
  
  if (loading) return <div>Loading...</div>
  
  return (
    <div>
      <div data-testid="authenticated">{isAuthenticated ? 'true' : 'false'}</div>
      <div data-testid="needs-password-change">{needsPasswordChange ? 'true' : 'false'}</div>
      {user && <div data-testid="username">{user.username}</div>}
    </div>
  )
}

describe('AuthContext', () => {
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    })
  })

  it('should provide loading state initially', () => {
    ;(api.getCurrentUser as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )
    localStorageMock.getItem.mockReturnValue('test-token') // Need token to trigger getCurrentUser

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should load user from token on mount', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_changed: true,
    }

    localStorageMock.getItem.mockReturnValue('test-token')
    ;(api.getCurrentUser as jest.Mock).mockResolvedValueOnce({ user: mockUser })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
      expect(screen.getByTestId('username')).toHaveTextContent('testuser')
    })
  })

  it('should handle login', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_changed: true,
    }

    localStorageMock.getItem.mockReturnValue(null)
    ;(api.getCurrentUser as jest.Mock).mockRejectedValueOnce(new Error('Unauthorized'))
    ;(api.login as jest.Mock).mockResolvedValueOnce({
      user: mockUser,
      token: 'test-token',
    })

    const LoginComponent = () => {
      const { login } = useAuth()
      
      return (
        <button onClick={() => login('testuser', 'password123')}>Login</button>
      )
    }

    render(
      <AuthProvider>
        <LoginComponent />
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    })

    await act(async () => {
      screen.getByText('Login').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
      expect(screen.getByTestId('username')).toHaveTextContent('testuser')
    })
  })

  it('should detect when password change is needed', async () => {
    const mockUser = {
      id: 1,
      username: 'admin',
      email: 'admin@localhost',
      password_changed: false,
    }

    localStorageMock.getItem.mockReturnValue('test-token')
    ;(api.getCurrentUser as jest.Mock).mockReset()
    ;(api.getCurrentUser as jest.Mock).mockResolvedValue({ user: mockUser })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // Wait for authenticated state
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    }, { timeout: 3000 })

    // Then check for password change needed
    expect(screen.getByTestId('needs-password-change')).toHaveTextContent('true')
  })

  it('should handle logout', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_changed: true,
    }

    localStorageMock.getItem.mockReturnValue('test-token')
    ;(api.getCurrentUser as jest.Mock).mockResolvedValueOnce({ user: mockUser })

    const LogoutComponent = () => {
      const { logout } = useAuth()
      
      return (
        <button onClick={logout}>Logout</button>
      )
    }

    render(
      <AuthProvider>
        <LogoutComponent />
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    await act(async () => {
      screen.getByText('Logout').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    })
  })
})

