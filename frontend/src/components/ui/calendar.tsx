import { cx } from '@/lib/utils'

export interface EventoCalendario {
  key: string
  fecha: string
  titulo: string
  estado?: 'pendiente' | 'aplicada' | 'omitida'
}

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
] as const

const PUNTO_ESTADO: Record<string, string> = {
  pendiente: 'bg-primary',
  aplicada: 'bg-green-700',
  omitida: 'bg-muted-foreground/50'
}

export function fechaKey(y: number, m: number, d: number): string {
  const mm = String(m + 1).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

interface CalendarioMesProps {
  year: number
  month: number
  eventos: EventoCalendario[]
  fechaSeleccionada: string | null
  onSelectFecha: (fecha: string | null) => void
  onMesChange: (year: number, month: number) => void
}

export function CalendarioMes({
  year, month, eventos, fechaSeleccionada, onSelectFecha, onMesChange
}: CalendarioMesProps) {
  const primero = new Date(year, month, 1)
  const desplazamiento = (primero.getDay() + 6) % 7
  const diasMes = new Date(year, month + 1, 0).getDate()
  const hoy = fechaKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

  const porDia = new Map<string, EventoCalendario[]>()
  for (const e of eventos) {
    const lista = porDia.get(e.fecha) ?? []
    lista.push(e)
    porDia.set(e.fecha, lista)
  }

  function irMes(delta: number) {
    const d = new Date(year, month + delta, 1)
    onMesChange(d.getFullYear(), d.getMonth())
  }

  function irHoy() {
    const h = new Date()
    onMesChange(h.getFullYear(), h.getMonth())
    onSelectFecha(fechaKey(h.getFullYear(), h.getMonth(), h.getDate()))
  }

  const celdas: Array<{ dia: number } | null> = [
    ...Array.from({ length: desplazamiento }, () => null),
    ...Array.from({ length: diasMes }, (_, i) => ({ dia: i + 1 }))
  ]

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => irMes(-1)}
          aria-label="Mes anterior"
          className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ‹
        </button>
        <p className="text-xs font-semibold tabular-nums">
          {MESES[month]} {year}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={irHoy}
            className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => irMes(1)}
            aria-label="Mes siguiente"
            className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={`Calendario de ${MESES[month]} ${year}`}>
        {DIAS.map(d => (
          <div key={d} className="pb-1 text-center text-[10px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {celdas.map((c, i) => {
          if (!c) return <div key={`v-${i}`} />
          const key = fechaKey(year, month, c.dia)
          const evs = porDia.get(key) ?? []
          const sel = fechaSeleccionada === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectFecha(sel ? null : key)}
              aria-pressed={sel}
              aria-label={`${c.dia} de ${MESES[month]}${evs.length ? `, ${evs.length} aplicaciones` : ''}`}
              className={cx(
                'flex min-h-11 flex-col items-center justify-start gap-0.5 rounded-md border px-1 py-1 text-[11px] tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sel
                  ? 'border-primary bg-primary/10 text-foreground'
                  : evs.length
                    ? 'border-border bg-card hover:border-muted-foreground/40'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50',
                key === hoy && !sel && 'text-primary'
              )}
            >
              <span className={cx(key === hoy && 'font-bold')}>{c.dia}</span>
              <span className="flex gap-0.5" aria-hidden="true">
                {evs.slice(0, 3).map(e => (
                  <span key={e.key} className={cx('h-1.5 w-1.5 rounded-full', PUNTO_ESTADO[e.estado ?? 'pendiente'])} />
                ))}
              </span>
              {evs.length > 0 && (
                <span className="max-w-full truncate text-[9px] leading-tight text-muted-foreground">
                  {evs.length > 1 ? `+${evs.length}` : evs[0].titulo}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground" aria-label="Leyenda">
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> pendiente</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-700" /> aplicada</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> omitida</span>
      </div>
    </div>
  )
}
