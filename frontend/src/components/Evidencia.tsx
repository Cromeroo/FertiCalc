import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { PasoEvidencia, Referencia } from '@/lib/api'

interface Props {
  evidencia: PasoEvidencia[]
  referencias: Record<string, Referencia>
}

export function Evidencia({ evidencia, referencias }: Props) {
  const refs = Object.values(referencias)
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        <details open className="group px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-primary marker:content-none">
            Evidencia del cálculo · {evidencia.length} pasos trazables
          </summary>
          <ol className="mt-3 space-y-4">
            {evidencia.map((ev, i) => (
              <li key={i} className="text-xs">
                <p className="font-semibold text-foreground">
                  <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                  {ev.paso}
                </p>
                <code className="mt-1 block overflow-x-auto rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-sky-300">
                  {ev.formula}
                </code>
                <pre className="mt-1 max-h-40 overflow-auto rounded border border-border bg-background px-2 py-1 font-mono text-[10px] leading-relaxed">
                  {JSON.stringify(ev.resultado, null, 2)}
                </pre>
                {ev.referencia && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Referencia: {ev.referencia}</p>
                )}
              </li>
            ))}
          </ol>
        </details>

        <details className="px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-primary marker:content-none">
            Referencias bibliográficas ({refs.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {refs.map(r => (
              <li key={r.id} className="text-xs leading-relaxed">
                <Badge variant="outline" className="mr-1.5">{r.id}</Badge>
                {r.autores} ({r.anio}). <em>{r.titulo}</em>. {r.fuente}
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  )
}
