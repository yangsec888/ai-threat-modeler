/**
 * Authentication Guard Component for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Login } from './Login';
import { Register } from './Register';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div>
        {showRegister ? (
          <div>
            <Register />
            <div className="text-center mt-4">
              <button
                onClick={() => setShowRegister(false)}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Already have an account? Login
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Login />
            <div className="text-center mt-4">
              <button
                onClick={() => setShowRegister(true)}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Don't have an account? Register
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

