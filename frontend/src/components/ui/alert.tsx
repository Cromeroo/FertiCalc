import { cx } from '@/lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'

type Variant = 'warning' | 'destructive'

const STYLES: Record<Variant, string> = {
  warning: 'border-warning/40 bg-warning/10 text-yellow-200',
  destructive: 'border-destructive/40 bg-destructive/10 text-red-200'
}

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  title?: string
  children: ReactNode
}

export function Alert({ className, variant = 'warning', title, children, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cx('rounded-md border px-3 py-2.5 text-xs leading-relaxed', STYLES[variant], className)}
      {...props}
    >
      {title && <p className="font-semibold mb-1">{title}</p>}
      {children}
    </div>
  )
}
