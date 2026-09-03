import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarioMes } from '@/components/ui/calendar'
import type { AgendaItem } from '@/hooks/useSiembras'

interface Props {
  agenda: AgendaItem[] | null
  cargando: boolean
  onAbrir: (siembraId: string) => void
}

export function AgendaGlobal({ agenda, cargando, onAbrir }: Props) {
  const hoy = new Date()
  const [year, setYear] = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth())
  const [fechaSel, setFechaSel] = useState<string | null>(null)

  if (cargando || agenda === null) {
    return (
      <div className="space-y-2" aria-label="Cargando agenda">
        {[0, 1].map(i => <div key={i} className="h-40 animate-pulse rounded-lg bg-border" />)}
      </div>
    )
  }

  if (agenda.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        No hay siembras en seguimiento. Crea una en la pestaña «Nueva siembra».
      </p>
    )
  }

  const delDia = (fechaSel ? agenda.filter(e => e.fecha === fechaSel) : []).sort((a, b) =>
    a.planNombre.localeCompare(b.planNombre)
  )

  return (
    <div className="space-y-3">
      <CalendarioMes
        year={year}
        month={month}
        eventos={agenda}
        fechaSeleccionada={fechaSel}
        onSelectFecha={setFechaSel}
        onMesChange={(y, m) => { setYear(y); setMonth(m) }}
      />
      {fechaSel && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Aplicaciones del {fechaSel} ({delDia.length})
          </p>
          {delDia.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Nada programado este día.</p>
          ) : (
            <ul className="space-y-1.5">
              {delDia.map(e => (
                <li
                  key={e.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{e.titulo}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{e.planNombre}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant={e.estado === 'aplicada' ? 'success' : 'outline'}>{e.estado}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => onAbrir(e.siembraId)}>
                      Ver ›
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
