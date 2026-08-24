/**
 * Main Dashboard Page for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import { useState } from 'react'
import { ThreatModeling } from '@/components/ThreatModeling'
import { ChatInterface } from '@/components/ChatInterface'
import { Settings } from '@/components/Settings'
import { UserManagement } from '@/components/UserManagement'
import { AuthGuard } from '@/components/AuthGuard'
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog'
import { Sidebar, NavItem } from '@/components/Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  )
}

function Dashboard() {
  const { user, logout, needsPasswordChange } = useAuth();
  const [activeNav, setActiveNav] = useState<NavItem>('threat-modeling');

  const renderContent = () => {
    switch (activeNav) {
      case 'chat':
        return <ChatInterface />
      case 'threat-modeling':
        return (
          <div className="w-full max-w-none px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
            <ThreatModeling />
          </div>
        )
      case 'settings':
        return <Settings />
      case 'users':
        return user?.role === 'Admin' ? <UserManagement /> : null
      default:
        return null
    }
  }

  return (
    <main className="h-screen flex bg-background overflow-hidden">
      {/* Non-dismissible password gate: while the account still uses the
          default credentials, block access to the app so the default
          password cannot be used to operate the system. */}
      {needsPasswordChange ? (
        <div
          data-testid="password-change-gate"
          className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-gate-title"
        >
          <div className="w-full max-w-md">
            <div className="mb-3 text-center">
              <h1 id="password-gate-title" className="text-xl font-semibold text-amber-700">
                ⚠️ Default Password Must Be Changed
              </h1>
              <p className="text-muted-foreground text-sm mt-2">
                You are signed in with the built-in default credentials. For security,
                all other functions are locked until you set a strong personal password.
              </p>
            </div>
            <ChangePasswordDialog showCloseButton={false} />
            <div className="mt-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                data-testid="gate-logout"
                className="text-muted-foreground"
              >
                Sign out instead
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Sidebar */}
          <Sidebar
            activeItem={activeNav}
            onItemClick={setActiveNav}
            isAdmin={user?.role === 'Admin'}
            username={user?.username}
            onLogout={logout}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Page Content */}
            <div className="flex-1 overflow-auto">
              {renderContent()}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
