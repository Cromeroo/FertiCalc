import { cx } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  className?: string
  label?: string
}

export function Progress({ value, max = 100, className, label }: ProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={cx('h-1.5 overflow-hidden rounded-full bg-border', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
