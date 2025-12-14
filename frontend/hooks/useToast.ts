/**
 * Toast Hook for managing notifications
 * 
 * Author: Sam Li
 */

import { useState, useCallback } from 'react'
import { Toast, ToastType } from '@/components/ui/toast'

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = Math.random().toString(36).substring(7)
    const newToast: Toast = {
      id,
      message,
      type,
      duration: duration !== undefined ? duration : 5000,
    }

    setToasts((prev) => [...prev, newToast])
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const success = useCallback((message: string, duration?: number) => {
    return showToast(message, 'success', duration)
  }, [showToast])

  const error = useCallback((message: string, duration?: number) => {
    return showToast(message, 'error', duration)
  }, [showToast])

  const info = useCallback((message: string, duration?: number) => {
    // Default info messages to 3 seconds for auto-close
    const infoDuration = duration !== undefined ? duration : 3000
    return showToast(message, 'info', infoDuration)
  }, [showToast])

  const warning = useCallback((message: string, duration?: number) => {
    return showToast(message, 'warning', duration)
  }, [showToast])

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    info,
    warning,
  }
}

