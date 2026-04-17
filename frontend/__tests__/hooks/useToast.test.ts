import { renderHook, act } from '@testing-library/react'
import { useToast } from '@/hooks/useToast'

describe('useToast', () => {
  it('keeps at most four toasts, dropping the oldest when a fifth is added', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.success('m1')
      result.current.success('m2')
      result.current.success('m3')
      result.current.success('m4')
      result.current.success('m5')
    })

    expect(result.current.toasts).toHaveLength(4)
    expect(result.current.toasts.map((t) => t.message)).toEqual(['m2', 'm3', 'm4', 'm5'])
  })

  it('removeToast drops a single entry', () => {
    const { result } = renderHook(() => useToast())
    let id = ''
    act(() => {
      id = result.current.success('only') ?? ''
    })
    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      result.current.removeToast(id)
    })
    expect(result.current.toasts).toHaveLength(0)
  })
})
