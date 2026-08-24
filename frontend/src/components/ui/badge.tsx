import { cx } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

type Variant = 'default' | 'outline' | 'info' | 'success' | 'warning'

const VARIANTS: Record<Variant, string> = {
  default: 'bg-muted text-muted-foreground border-border',
  outline: 'bg-transparent text-muted-foreground border-border',
  info: 'bg-cyan-950/60 text-cyan-300 border-cyan-800',
  success: 'bg-green-950/60 text-green-300 border-green-800',
  warning: 'bg-yellow-950/60 text-yellow-300 border-yellow-800'
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
}
