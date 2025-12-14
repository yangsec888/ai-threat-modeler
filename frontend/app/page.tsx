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
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [activeNav, setActiveNav] = useState<NavItem>('threat-modeling');

  const renderContent = () => {
    switch (activeNav) {
      case 'chat':
        return <ChatInterface />
      case 'threat-modeling':
        return (
          <div className="container mx-auto max-w-7xl p-8">
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
        {/* Password Change Banner */}
        {needsPasswordChange && !showPasswordDialog && (
          <div className="bg-amber-50 border-b border-amber-200 p-4 flex-shrink-0">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-3">
                <span className="text-amber-600 font-semibold">⚠️ Security Reminder</span>
                <span className="text-amber-700 text-sm">
                  You are using the default password. Please change it immediately for security.
                </span>
              </div>
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => setShowPasswordDialog(true)}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Change Password
              </Button>
            </div>
          </div>
        )}
        
        {/* Password Dialog Modal */}
        {showPasswordDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <ChangePasswordDialog 
              onClose={() => setShowPasswordDialog(false)}
              showCloseButton={true}
            />
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {renderContent()}
        </div>
      </div>
    </main>
  )
}
