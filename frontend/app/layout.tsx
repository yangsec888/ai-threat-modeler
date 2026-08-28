/**
 * Root Layout Component for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Threat Modeler Dashboard',
  description: 'Web dashboard for AI Threat Modeler - Security automation and analysis',
  icons: {
    icon: '/favicon.jpeg',
    shortcut: '/favicon.jpeg',
    apple: '/favicon.jpeg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}

