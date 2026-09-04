import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  titulo: string
  children: ReactNode
  acciones?: ReactNode
}

export function Dialog({ open, onClose, titulo, children, acciones }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previo = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, button')?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = ''
      previo?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cx('w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl')}
      >
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <div className="mt-3">{children}</div>
        {acciones && <div className="mt-3 flex justify-end gap-2">{acciones}</div>}
      </div>
    </div>
  )
}
