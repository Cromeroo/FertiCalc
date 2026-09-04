import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fmtNum } from '@/lib/utils'
import { googleCalendarUrl } from '@/lib/calendar'
import type { FaseCalendario } from '@/lib/api'

interface Props {
  fase: FaseCalendario
  cultivo?: string
  onCambiar: (nuevo: 'aplicada' | 'omitida' | 'pendiente') => void
}

export function FaseCard({ fase, cultivo, onCambiar }: Props) {
  const hecha = fase.estado !== 'pendiente'
  return (
    <li className={`relative rounded-xl border p-3 ${hecha ? 'border-border bg-background opacity-60' : 'border-primary/40 bg-card'}`}>
      <span
        aria-hidden="true"
        className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 ${
          fase.estado === 'aplicada' ? 'border-primary bg-primary' : fase.estado === 'omitida' ? 'border-border bg-border' : 'border-primary bg-background'
        }`}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            Fase {fase.orden} · {fase.nombre_fase}
            {hecha && <Badge variant={fase.estado === 'aplicada' ? 'success' : 'outline'} className="ml-2">{fase.estado}</Badge>}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">BBCH {fase.bbch} · fecha estimada {fase.fecha_estimada}</p>
        </div>
        {!hecha ? (
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => onCambiar('aplicada')}>✓ Aplicar</Button>
            <Button variant="ghost" size="sm" onClick={() => onCambiar('omitida')}>Omitir</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onCambiar('pendiente')}>Reabrir</Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] tabular-nums">
        <span className="rounded-md bg-muted px-2 py-1"><strong>N</strong> {fmtNum(fase.dosis_nutriente_kg_ha.N)} kg/ha</span>
        <span className="rounded-md bg-muted px-2 py-1"><strong>P₂O₅</strong> {fmtNum(fase.dosis_nutriente_kg_ha.P)} kg/ha</span>
        <span className="rounded-md bg-muted px-2 py-1"><strong>K₂O</strong> {fmtNum(fase.dosis_nutriente_kg_ha.K)} kg/ha</span>
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
        {fase.fuentes_sugeridas.map(s => (
          <p key={s.fuente_id}>• {s.nombre}: <strong className="tabular-nums">{fmtNum(s.kg_ha)} kg/ha</strong></p>
        ))}
      </div>
      {!hecha && (
        <a
          href={googleCalendarUrl(fase, cultivo)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          📅 Añadir recordatorio a Google Calendar
        </a>
      )}
    </li>
  )
}

export function LineaTiempo({ calendario, cultivo, onCambiar }: {
  calendario: FaseCalendario[]
  cultivo?: string
  onCambiar: (orden: number, nuevo: 'aplicada' | 'omitida' | 'pendiente') => void
}) {
  return (
    <ol className="relative space-y-3 border-l-2 border-border pl-4">
      {calendario.map(f => (
        <FaseCard key={f.orden} fase={f} cultivo={cultivo} onCambiar={nuevo => onCambiar(f.orden, nuevo)} />
      ))}
    </ol>
  )
}
