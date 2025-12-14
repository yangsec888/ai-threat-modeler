/**
 * Collapsible Sidebar Component for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { 
  MessageSquare, 
  Shield, 
  Settings, 
  Users, 
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import logo from '@/app/logo.png'

export type NavItem = 'chat' | 'threat-modeling' | 'settings' | 'users'

interface SidebarProps {
  activeItem: NavItem
  onItemClick: (item: NavItem) => void
  isAdmin: boolean
  username?: string
  onLogout: () => void
}

interface NavItemConfig {
  id: NavItem
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const navItems: NavItemConfig[] = [
  { id: 'threat-modeling', label: 'Threat Model', icon: <Shield className="w-5 h-5" /> },
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  { id: 'users', label: 'Users', icon: <Users className="w-5 h-5" />, adminOnly: true },
]

export function Sidebar({ activeItem, onItemClick, isAdmin, username, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin)

  return (
    <aside 
      className={cn(
        "h-screen bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out relative",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn(
        "h-14 flex items-center border-b border-slate-700 px-3",
        collapsed ? "justify-center" : "justify-between"
      )}>
        <div className={cn(
          "flex items-center gap-2 overflow-hidden",
          collapsed && "justify-center"
        )}>
          <Image
            src={logo}
            alt="AI Threat Modeler"
            width={28}
            height={28}
            className="object-contain flex-shrink-0"
            priority
          />
          {!collapsed && (
            <span className="font-semibold text-lg truncate">AI Threat Modeler</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>
      
      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-2 mt-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5 mx-auto" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {filteredItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onItemClick(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  "hover:bg-slate-800",
                  activeItem === item.id 
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25" 
                    : "text-slate-300 hover:text-white",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.label : undefined}
              >
                <span className={cn(
                  "flex-shrink-0 transition-transform duration-200",
                  activeItem === item.id && "scale-110"
                )}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="truncate font-medium">{item.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer - User info & Logout */}
      <div className="border-t border-slate-700 p-3">
        {!collapsed && username && (
          <div className="mb-2 px-2 py-1.5 text-sm text-slate-400 truncate">
            {username}
          </div>
        )}
        <button
          onClick={onLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
            "text-slate-400 hover:text-white hover:bg-slate-800",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  )
}

