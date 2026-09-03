import { useState } from 'react'
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/empty-state'
import type { SiembraResumen } from '@/lib/api'
import type { EstadoCarga } from '@/hooks/useSiembras'

interface Props {
  siembras: SiembraResumen[]
  estado: EstadoCarga
  onAbrir: (id: string) => void
  onNueva: () => void
  onReintentar: () => void
}

export function ListaSiembras({ siembras, estado, onAbrir, onNueva, onReintentar }: Props) {
  const [filtro, setFiltro] = useState('')

  if (estado === 'cargando') return <LoadingList rows={3} />
  if (estado === 'error') {
    return (
      <ErrorState
        title="No se pudieron cargar las siembras"
        hint="Verifica que el backend esté corriendo e inténtalo de nuevo."
        onRetry={onReintentar}
      />
    )
  }
  if (siembras.length === 0) {
    return (
      <EmptyState
        title="Aún no hay siembras en seguimiento"
        hint="Guarda un plan de fertilización y crea aquí su calendario de aplicaciones."
        actionLabel="Crear mi primera siembra"
        onAction={onNueva}
      />
    )
  }

  const familias = [...new Set(siembras.map(s => s.familia).filter(Boolean))] as string[]
  const visibles = filtro ? siembras.filter(s => s.familia === filtro) : siembras

  return (
    <div className="space-y-2">
      {familias.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Filtrar:</span>
          {['', ...familias].map(f => (
            <button
              key={f || 'todas'}
              onClick={() => setFiltro(f)}
              aria-pressed={filtro === f}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                filtro === f ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {f || 'todas'}
            </button>
          ))}
        </div>
      )}
      {visibles.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Sin siembras para este filtro.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visibles.map(s => (
            <li key={s.id}>
              <button
                onClick={() => onAbrir(s.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.plan_nombre ?? s.plan_id}</p>
                  <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                    {[s.familia, s.especie, s.cultivo_nombre].filter(Boolean).join(' · ')} · sembrada {s.fecha_inicio} · BBCH {s.bbch_actual}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-primary">Ver calendario ›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
