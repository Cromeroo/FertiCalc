import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CalendarioSiembra } from './CalendarioSiembra'
import { LineaTiempo } from './LineaTiempo'
import { calendarioIcs, descargarIcs } from '@/lib/calendar'
import type { EstadoSiembra, SiembraResumen } from '@/lib/api'

type VistaDetalle = 'linea' | 'mes'

interface Props {
  detalle: EstadoSiembra
  seleccionada: SiembraResumen | null
  onVolver: () => void
  onCambiar: (orden: number, nuevo: 'aplicada' | 'omitida' | 'pendiente') => void
}

export function DetalleSiembra({ detalle, seleccionada, onVolver, onCambiar }: Props) {
  const [vista, setVista] = useState<VistaDetalle>('linea')
  const siguiente = detalle.calendario.find(f => f.estado === 'pendiente')
  const hechas = detalle.calendario.filter(f => f.estado !== 'pendiente').length
  const total = detalle.calendario.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{detalle.plan_nombre}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {[seleccionada?.familia, seleccionada?.especie, `Sembrada ${seleccionada?.fecha_inicio}`, `BBCH actual ${detalle.siembra.bbch_actual}`, `${hechas}/${total} aplicadas`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onVolver}>‹ Mis siembras</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            descargarIcs(
              `ferticalc-${detalle.plan_nombre}`,
              calendarioIcs(
                detalle.plan_nombre,
                detalle.calendario,
                seleccionada?.cultivo_nombre ?? undefined
              )
            )
          }
        >
          ⬇ Descargar calendario (.ics)
        </Button>
        <span className="self-center text-[11px] text-muted-foreground">
          Impórtalo en Google Calendar u Outlook para recibir notificaciones.
        </span>
      </div>

      <Progress value={hechas} max={total} label={`Progreso: ${hechas} de ${total} fases`} />

      {siguiente ? (
        <Alert variant="warning" title="Toca aplicar ahora">
          <strong>Fase {siguiente.orden} · {siguiente.nombre_fase}</strong> (BBCH {siguiente.bbch}) — fecha estimada {siguiente.fecha_estimada}
        </Alert>
      ) : (
        <Alert title="Ciclo completo">Todas las aplicaciones están cumplidas u omitidas.</Alert>
      )}

      <div role="tablist" aria-label="Vista del calendario" className="flex gap-1 rounded-lg border border-border bg-background p-1 text-xs">
        {(['linea', 'mes'] as const).map(v => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              vista === v ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {v === 'linea' ? 'Línea de tiempo' : 'Calendario mensual'}
          </button>
        ))}
      </div>

      {vista === 'linea' ? (
        <LineaTiempo
          calendario={detalle.calendario}
          cultivo={seleccionada?.cultivo_nombre ?? detalle.plan_nombre}
          onCambiar={onCambiar}
        />
      ) : (
        <CalendarioSiembra detalle={detalle} onCambiar={onCambiar} />
      )}
    </div>
  )
}
