import type { ReactNode } from 'react'
import { Button } from './button'

interface EmptyStateProps {
  title: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {actionLabel && onAction && (
        <Button size="sm" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export function ErrorState({ title, hint, onRetry }: { title: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center text-xs">
      <p className="font-medium text-destructive">{title}</p>
      {hint && <p className="mt-0.5 text-muted-foreground">{hint}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}

export function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-border" />
      ))}
    </div>
  )
}

export function StateShell({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>
}
