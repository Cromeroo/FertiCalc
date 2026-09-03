import { Badge } from '@/components/ui/badge'
import type { ExplicacionGnn } from '@/lib/api'

interface Props {
  explicacion: ExplicacionGnn
  mae: number | null
}

export function ExplicacionPanel({ explicacion, mae }: Props) {
  return (
    <div className="space-y-2.5 rounded-md border border-border bg-background p-3 text-xs">
      <p className="font-medium uppercase tracking-wide text-[10px] text-muted-foreground">
        Por qué el modelo predice esto
      </p>
      <p className="leading-relaxed">{explicacion.razonamiento}</p>
      <div className="grid gap-1.5 max-sm:grid-cols-1 sm:grid-cols-3">
        {explicacion.factores.map(f => (
          <div key={f.factor}>
            <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{f.factor}</span>
              <span className="tabular-nums">{f.influencia_pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${f.influencia_pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[10px] text-muted-foreground">Se apoya en:</span>
        {explicacion.referencias_influyentes.map(r => (
          <Badge key={r.cultivo_id}>
            {r.cultivo_id} · {r.apoyo_pct}%
          </Badge>
        ))}
        {mae != null && <Badge variant="outline">precisión ±{mae} pts</Badge>}
      </div>
    </div>
  )
}
