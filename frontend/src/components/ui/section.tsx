import type { ReactNode } from 'react'
import { cx } from '@/lib/utils'

export function SectionHeader({ paso, titulo, hint }: { paso: string; titulo: string; hint?: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {paso}
        </span>
        {titulo}
      </h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Stat({
  label,
  value,
  unit,
  sub,
  toneClass,
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  toneClass?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cx('text-2xl font-semibold tabular-nums', toneClass)}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  )
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[10px] text-muted-foreground">{children}</p>
}
