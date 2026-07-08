import React from 'react'

export interface ToastState { msg: string; kind: 'ok' | 'err' }

export function useToast(duration = 3500) {
  const [toast, setToast] = React.useState<ToastState | null>(null)

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), duration)
    return () => clearTimeout(t)
  }, [toast, duration])

  const show = React.useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind })
  }, [])

  return { toast, show }
}
