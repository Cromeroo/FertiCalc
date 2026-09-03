import { useMemo, useState } from 'react'
import { CalendarioMes, type EventoCalendario } from '@/components/ui/calendar'
import { FaseCard } from './LineaTiempo'
import type { EstadoSiembra } from '@/lib/api'

interface Props {
  detalle: EstadoSiembra
  onCambiar: (orden: number, nuevo: 'aplicada' | 'omitida' | 'pendiente') => void
}

export function CalendarioSiembra({ detalle, onCambiar }: Props) {
  const hoy = new Date()
  const [year, setYear] = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth())
  const [fechaSel, setFechaSel] = useState<string | null>(null)

  const eventos: EventoCalendario[] = useMemo(
    () =>
      detalle.calendario.map(f => ({
        key: `f-${f.orden}`,
        fecha: f.fecha_estimada.slice(0, 10),
        titulo: `F${f.orden} · ${f.nombre_fase}`,
        estado: f.estado as EventoCalendario['estado']
      })),
    [detalle]
  )

  const delDia = fechaSel
    ? detalle.calendario.filter(f => f.fecha_estimada.slice(0, 10) === fechaSel)
    : []

  return (
    <div className="space-y-3">
      <CalendarioMes
        year={year}
        month={month}
        eventos={eventos}
        fechaSeleccionada={fechaSel}
        onSelectFecha={setFechaSel}
        onMesChange={(y, m) => { setYear(y); setMonth(m) }}
      />
      {fechaSel && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Aplicaciones del {fechaSel}
          </p>
          {delDia.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Nada programado este día.</p>
          ) : (
            <ol className="relative space-y-3 border-l-2 border-border pl-4">
              {delDia.map(f => (
                <FaseCard key={f.orden} fase={f} onCambiar={nuevo => onCambiar(f.orden, nuevo)} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
