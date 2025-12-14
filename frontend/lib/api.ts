/**
 * API Client for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

// Ensure HTTPS in production
const getApiBaseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  // In production, enforce HTTPS
  if (process.env.NODE_ENV === 'production' && url.startsWith('http://')) {
    console.warn('⚠️  WARNING: API URL uses HTTP in production. Consider using HTTPS.');
  }
  return url;
};

const API_BASE_URL = getApiBaseUrl();

// Get auth token from localStorage
const getAuthToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
};

// Get headers with auth token
const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// Handle authentication errors - clear token if user not found or unauthorized
const handleAuthError = (response: Response): void => {
  if (response.status === 401 || response.status === 403) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      // Optionally reload the page to clear any cached auth state
      // window.location.reload();
    }
  }
};

export const api = {
  // Authentication
  register: async (username: string, email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Registration failed');
    }
    
    const data = await response.json();
    if (data.token && typeof window !== 'undefined') {
      localStorage.setItem('auth_token', data.token);
    }
    return data;
  },

  login: async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Login failed');
    }
    
    const data = await response.json();
    if (data.token && typeof window !== 'undefined') {
      localStorage.setItem('auth_token', data.token);
    }
    return data;
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  },

  getCurrentUser: async () => {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to get user');
    }
    
    return response.json();
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to change password');
    }
    
    return response.json();
  },

  // Threat Modeling
  threatModeling: async (repositoryZip: File, query?: string) => {
    const formData = new FormData();
    formData.append('repository', repositoryZip);
    if (query) {
      formData.append('query', query);
    }
    
    const authHeaders = getAuthHeaders();
    // Create headers without Content-Type - browser will set it automatically with boundary for FormData
    const headers: Record<string, string> = {};
    // @ts-ignore - HeadersInit can be indexed for Authorization header
    const authHeader = authHeaders['Authorization'];
    if (authHeader) {
      headers['Authorization'] = authHeader as string;
    }
    
    const response = await fetch(`${API_BASE_URL}/threat-modeling`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to create threat modeling job');
    }
    
    return response.json();
  },

  getThreatModelingJobs: async () => {
    const response = await fetch(`${API_BASE_URL}/threat-modeling/jobs`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to get jobs');
    }
    
    return response.json();
  },

  getThreatModelingJob: async (jobId: string) => {
    const response = await fetch(`${API_BASE_URL}/threat-modeling/jobs/${jobId}`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to get job');
    }
    
    return response.json();
  },

  downloadThreatModelingReport: async (jobId: string, type: 'data_flow_diagram' | 'threat_model' | 'risk_registry' | 'all' = 'all') => {
    const response = await fetch(`${API_BASE_URL}/threat-modeling/reports/${jobId}/download?type=${type}`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to download report');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Determine filename based on type
    const filename = type === 'all'
      ? `threat_modeling_reports_${jobId}.zip`
      : type === 'data_flow_diagram' 
      ? `data_flow_diagram_${jobId}.txt`
      : type === 'risk_registry'
      ? `risk_registry_${jobId}.txt`
      : `threat_model_${jobId}.txt`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  deleteThreatModelingJob: async (jobId: string) => {
    const response = await fetch(`${API_BASE_URL}/threat-modeling/jobs/${jobId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to delete job');
    }
    
    return response.json();
  },

  getThreatModelingReports: async () => {
    const response = await fetch(`${API_BASE_URL}/threat-modeling/reports`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to get reports');
    }
    
    return response.json();
  },

  // Chat
  chat: async (message: string, role?: string, history?: Array<{ role: string; content: string }>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message, role, history }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
        // Prioritize detailed message over generic error, or combine if both exist
        const errorMessage = errorData.message || errorData.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('Chat API response:', data);
      return data;
    } catch (error: unknown) {
      console.error('Chat API error:', error);
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Please ensure the backend is running.');
      }
      throw error;
    }
  },

  endChat: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/end`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
        throw new Error(errorData.message || errorData.error || 'Failed to end chat session');
      }
      
      return response.json();
    } catch (error: unknown) {
      console.error('End chat error:', error);
      throw error;
    }
  },

  getChatSession: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/session`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
        throw new Error(errorData.message || errorData.error || 'Failed to get session status');
      }
      
      return response.json();
    } catch (error: unknown) {
      console.error('Get chat session error:', error);
      throw error;
    }
  },

  // User Management (Admin only)
  getUsers: async () => {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to get users');
    }
    
    return response.json();
  },

  getUser: async (id: number) => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to get user');
    }
    
    return response.json();
  },

  createUser: async (username: string, email: string, password: string, role: 'Admin' | 'Operator' | 'Auditor') => {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ username, email, password, role }),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to create user');
    }
    
    return response.json();
  },

  updateUser: async (id: number, updates: { username?: string; email?: string; role?: 'Admin' | 'Operator' | 'Auditor'; password?: string }) => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to update user');
    }
    
    return response.json();
  },

  deleteUser: async (id: number) => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to delete user');
    }
    
    return response.json();
  },

  // Settings (Admin only)
  getSettings: async () => {
    const response = await fetch(`${API_BASE_URL}/settings`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to get settings');
    }
    
    return response.json();
  },

  updateSettings: async (settings: {
    encryption_key?: string;
    anthropic_api_key?: string;
    anthropic_base_url?: string;
    claude_code_max_output_tokens?: number | null;
  }) => {
    const response = await fetch(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to update settings');
    }
    
    return response.json();
  },

  regenerateEncryptionKey: async () => {
    const response = await fetch(`${API_BASE_URL}/settings/regenerate-encryption-key`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to regenerate encryption key');
    }
    
    return response.json();
  },

  validateApiKey: async (apiKey: string, baseUrl?: string) => {
    const response = await fetch(`${API_BASE_URL}/settings/validate-api-key`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ api_key: apiKey, base_url: baseUrl }),
    });
    
    if (!response.ok) {
      handleAuthError(response);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
      throw new Error(errorData.error || errorData.message || 'Failed to validate API key');
    }
    
    return response.json();
  },
};

