import { cx } from '@/lib/utils'
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'

export const INPUT_CLASS =
  'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

const BASE = INPUT_CLASS

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(BASE, className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(BASE, 'appearance-none', className)} {...props}>
      {children}
    </select>
  )
}
