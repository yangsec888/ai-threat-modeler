import { api } from '@/lib/api'

// Mock fetch
global.fetch = jest.fn()

// Setup localStorage mocks
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    
    // Suppress console.error during tests (expected errors are tested)
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore console methods
    jest.restoreAllMocks()
  })

  describe('register', () => {
    it('should register a new user and store token', async () => {
      const mockResponse = {
        user: { id: 1, username: 'testuser', email: 'test@example.com' },
        token: 'test-token',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.register('testuser', 'test@example.com', 'password123')

      expect(result).toEqual(mockResponse)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'test-token')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    it('should throw error on failed registration', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Username already exists' }),
      })

      await expect(api.register('testuser', 'test@example.com', 'password123')).rejects.toThrow(
        'Username already exists'
      )
    })
  })

  describe('login', () => {
    it('should login and store token', async () => {
      const mockResponse = {
        user: { id: 1, username: 'testuser', email: 'test@example.com' },
        token: 'test-token',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.login('testuser', 'password123')

      expect(result).toEqual(mockResponse)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'test-token')
    })

    it('should throw error on failed login', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      })

      await expect(api.login('testuser', 'wrongpassword')).rejects.toThrow('Invalid credentials')
    })
  })

  describe('logout', () => {
    it('should remove token from localStorage', () => {
      api.logout()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
    })
  })

  describe('getCurrentUser', () => {
    it('should get current user with token', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        user: { id: 1, username: 'testuser', email: 'test@example.com', password_changed: true },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.getCurrentUser()

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('should remove token on 401 error', async () => {
      localStorageMock.getItem.mockReturnValue('invalid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      await expect(api.getCurrentUser()).rejects.toThrow('Unauthorized')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
    })
  })

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        message: 'Password changed successfully',
        user: { id: 1, username: 'testuser', email: 'test@example.com', password_changed: true },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.changePassword('oldpassword', 'newpassword123')

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/change-password'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            currentPassword: 'oldpassword',
            newPassword: 'newpassword123',
          }),
        })
      )
    })

    it('should throw error on failed password change', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Current password is incorrect' }),
      })

      await expect(api.changePassword('wrongpassword', 'newpassword123')).rejects.toThrow(
        'Current password is incorrect'
      )
    })
  })

  describe('chat', () => {
    it('should send chat message successfully', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        status: 'success',
        response: 'This is a test response',
        role: 'simple_query_agent',
        sessionActive: true,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.chat('Hello, this is a test message')

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            message: 'Hello, this is a test message',
            role: undefined,
            history: undefined,
          }),
        })
      )
    })

    it('should send chat message with role and history', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        status: 'success',
        response: 'Response with history',
        role: 'code_reviewer',
        sessionActive: true,
      }

      const history = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.chat('Follow-up question', 'code_reviewer', history)

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            message: 'Follow-up question',
            role: 'code_reviewer',
            history,
          }),
        })
      )
    })

    it('should handle /end command', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        status: 'success',
        response: 'Chat session ended. Starting a new conversation.',
        role: 'simple_query_agent',
        sessionEnded: true,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.chat('/end')

      expect(result).toEqual(mockResponse)
      expect(result.sessionEnded).toBe(true)
    })

    it('should throw error on failed chat request', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to process chat message', message: 'API key missing' }),
      })

      await expect(api.chat('Hello')).rejects.toThrow('API key missing')
    })

    it('should handle network errors', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')

      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new TypeError('Failed to fetch')
      )

      await expect(api.chat('Hello')).rejects.toThrow('Unable to connect to server')
    })
  })

  describe('endChat', () => {
    it('should end chat session successfully', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        status: 'success',
        message: 'Chat session ended successfully',
        sessionEnded: true,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.endChat()

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/end'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('should throw error on failed end chat request', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to end chat session' }),
      })

      await expect(api.endChat()).rejects.toThrow('Failed to end chat session')
    })
  })

  describe('getChatSession', () => {
    it('should get chat session status when session exists', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        hasSession: true,
        message: 'Active chat session exists',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.getChatSession()

      expect(result).toEqual(mockResponse)
      expect(result.hasSession).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/session'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('should get chat session status when no session exists', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')
      const mockResponse = {
        hasSession: false,
        message: 'No active chat session',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await api.getChatSession()

      expect(result).toEqual(mockResponse)
      expect(result.hasSession).toBe(false)
    })

    it('should throw error on failed get session request', async () => {
      localStorageMock.getItem.mockReturnValue('test-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to get session status' }),
      })

      await expect(api.getChatSession()).rejects.toThrow('Failed to get session status')
    })
  })
})

