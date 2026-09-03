import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { fmtNum } from '@/lib/utils'
import type { PasoEvidencia, Referencia } from '@/lib/api'

interface Props {
  evidencia: PasoEvidencia[]
  referencias: Record<string, Referencia>
}

const ETIQUETA_NUTRIENTE: Record<string, string> = { N: 'N', P: 'P₂O₅', K: 'K₂O' }

function esMapaNPK(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const ks = Object.keys(v as object)
  return ks.length > 0 && ks.every(k => ['N', 'P', 'K'].includes(k)) &&
    Object.values(v as object).every(x => typeof x === 'number')
}

function MapaNPK({ datos, unidad }: { datos: Record<string, number>; unidad: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {['N', 'P', 'K'].filter(k => k in datos).map(k => (
        <span key={k} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] tabular-nums">
          <span className="text-muted-foreground">{ETIQUETA_NUTRIENTE[k]} </span>
          <strong>{fmtNum(datos[k])}</strong>
          <span className="text-muted-foreground"> {unidad}</span>
        </span>
      ))}
    </div>
  )
}

function Valor({ valor, profundidad = 0 }: { valor: unknown; profundidad?: number }) {
  if (valor === null || valor === undefined) return <span className="text-muted-foreground">—</span>
  if (typeof valor === 'number') return <strong className="tabular-nums">{fmtNum(valor)}</strong>
  if (typeof valor === 'string' || typeof valor === 'boolean') return <span>{String(valor)}</span>
  if (Array.isArray(valor)) {
    if (valor.length === 0) return <span className="text-muted-foreground">vacío</span>
    if (valor.every(v => typeof v === 'string' || typeof v === 'number')) {
      return (
        <span className="flex flex-wrap gap-1">
          {valor.map((v, i) => (
            <Badge key={i} variant="outline">{String(v)}</Badge>
          ))}
        </span>
      )
    }
    return (
      <ul className="list-disc space-y-0.5 pl-4">
        {valor.map((v, i) => <li key={i}><Valor valor={v} profundidad={profundidad + 1} /></li>)}
      </ul>
    )
  }
  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>
    if (esMapaNPK(obj)) return <MapaNPK datos={obj} unidad="kg/ha" />
    return (
      <dl className="space-y-1">
        {Object.entries(obj).map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="text-muted-foreground">{etiquetaClave(k)}:</dt>
            <dd className="min-w-0 flex-1"><Valor valor={v} profundidad={profundidad + 1} /></dd>
          </div>
        ))}
      </dl>
    )
  }
  return <span>{String(valor)}</span>
}

function etiquetaClave(k: string): string {
  const mapa: Record<string, string> = {
    extraccion_por_t: 'Extracción por tonelada (kg/t)',
    rendimiento_t_ha: 'Rendimiento (t/ha)',
    aporte_suelo: 'Aporte del suelo (kg/ha)',
    demanda_total_kg_ha: 'Demanda total',
    ERF: 'Eficiencias ERF',
    nota: 'Nota',
    modelo: 'Modelo',
    inicio_del_calculo_pct: 'Punto de partida (% acumulado)',
    reglas_evaluadas: 'Reglas evaluadas',
    evaluaciones: 'Evaluaciones',
    regla: 'Regla',
    disparada: '¿Se activó?',
  }
  return mapa[k] ?? k.replace(/_/g, ' ')
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
                <div className="mt-1 rounded border border-border bg-background px-2 py-1.5">
                  <Valor valor={ev.resultado} />
                </div>
                {ev.valores && Object.keys(ev.valores).length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground marker:content-none hover:text-foreground">
                      Ver datos de entrada ▸
                    </summary>
                    <div className="mt-1 rounded border border-border bg-background px-2 py-1.5">
                      <Valor valor={ev.valores} />
                    </div>
                  </details>
                )}
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
