/**
 * Authentication Context Provider for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

export type UserRole = 'Admin' | 'Operator' | 'Auditor';

interface User {
  id: number;
  username: string;
  email: string;
  role?: UserRole;
  password_changed?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  isAuthenticated: boolean;
  needsPasswordChange: boolean;
  canScheduleJobs: boolean;
  canManageUsers: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          const response = await api.getCurrentUser();
          setUser(response.user);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('auth_token');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await api.login(username, password);
    setUser(response.user);
  };

  const register = async (username: string, email: string, password: string) => {
    const response = await api.register(username, email, password);
    setUser(response.user);
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const response = await api.changePassword(currentPassword, newPassword);
    setUser(response.user);
  };

  const canScheduleJobs = user?.role === 'Admin' || user?.role === 'Operator';
  const canManageUsers = user?.role === 'Admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        changePassword,
        isAuthenticated: !!user,
        needsPasswordChange: user ? !user.password_changed : false,
        canScheduleJobs,
        canManageUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

