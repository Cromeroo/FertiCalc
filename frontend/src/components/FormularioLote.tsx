import { Field, Label } from '@/components/ui/label'
import { Select } from '@/components/ui/input'
import { DecimalInput } from '@/components/ui/decimal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NUTRIENTES, NOMBRE_NUTRIENTE, type Nutriente } from '@/lib/utils'
import type { CultivoResumen, Fase } from '@/lib/api'

export interface ValoresFormulario {
  rendimiento: string
  suelo: Record<'n' | 'p' | 'k', string>
  eficiencias: Record<Nutriente, string>
  faseDesde: string
}

const ETIQUETA_CORTA: Record<Nutriente, string> = { N: 'N', P: 'P₂O₅', K: 'K₂O' }

interface Props {
  cultivos: CultivoResumen[]
  cultivoId: string
  onCultivo: (id: string) => void
  fases: Fase[]
  valores: ValoresFormulario
  onChange: (v: ValoresFormulario) => void
  onCalcular: (e: React.FormEvent) => void
  cargando: boolean
}

export function FormularioLote({ cultivos, cultivoId, onCultivo, fases, valores, onChange, onCalcular, cargando }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parámetros del lote</CardTitle>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Solo necesitas el cultivo y el rendimiento esperado. Lo demás trae valores razonables por defecto.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onCalcular} noValidate>
          <Field label="Cultivo" htmlFor="cultivo">
            <Select id="cultivo" value={cultivoId} onChange={e => onCultivo(e.target.value)}>
              {cultivos.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Select>
          </Field>

          <Field label="Rendimiento esperado (t/ha)" htmlFor="rendimiento" hint="¿Cuántas toneladas por hectárea esperas cosechar? Un valor aproximado está bien.">
            <DecimalInput
              id="rendimiento"
              min={0.1}
              value={valores.rendimiento}
              ariaLabel="Rendimiento esperado en toneladas por hectárea"
              onChange={v => onChange({ ...valores, rendimiento: v })}
              required
            />
          </Field>

          <details className="mb-3 rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-medium text-primary marker:content-none">
              ¿Tienes análisis de suelo? (opcional)
            </summary>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Si no tienes análisis, déjalo en 0: el plan asume que el suelo no aporta nutrientes.
              Se consigue en un laboratorio agropecuario con una muestra de tu lote.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 max-sm:grid-cols-1">
              {NUTRIENTES.map(n => (
                <div key={n}>
                  <Label htmlFor={`suelo-${n}`}>{ETIQUETA_CORTA[n]} disponible (kg/ha)</Label>
                  <DecimalInput
                    id={`suelo-${n}`}
                    min={0}
                    value={valores.suelo[n.toLowerCase() as 'n' | 'p' | 'k']}
                    ariaLabel={`Aporte de suelo ${NOMBRE_NUTRIENTE[n]}`}
                    onChange={v => onChange({ ...valores, suelo: { ...valores.suelo, [n.toLowerCase()]: v } })}
                  />
                </div>
              ))}
            </div>
          </details>

          <details className="mb-3 rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-medium text-primary marker:content-none">
              Eficiencias avanzadas ERF (opcional)
            </summary>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Qué fracción del fertilizante aprovecha realmente la planta (0 a 1).
              Los valores por defecto (N 0.6 · P 0.25 · K 0.5) sirven para la mayoría de los casos.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 max-sm:grid-cols-1">
              {NUTRIENTES.map(n => (
                <div key={n}>
                  <Label htmlFor={`erf-${n}`}>ERF {n}</Label>
                  <DecimalInput
                    id={`erf-${n}`}
                    min={0.05}
                    max={1}
                    value={valores.eficiencias[n]}
                    ariaLabel={`Eficiencia ERF ${NOMBRE_NUTRIENTE[n]}`}
                    onChange={v => onChange({ ...valores, eficiencias: { ...valores.eficiencias, [n]: v } })}
                  />
                </div>
              ))}
            </div>
          </details>

          {fases.length > 0 && (
            <Field label="Calcular desde la fase (opcional, ciclos en curso)" htmlFor="fase-desde">
              <Select
                id="fase-desde"
                value={valores.faseDesde}
                onChange={e => onChange({ ...valores, faseDesde: e.target.value })}
              >
                <option value="">Todo el ciclo</option>
                {fases.map(f => (
                  <option key={f.orden} value={f.orden}>
                    Fase {f.orden}: {f.nombre} (BBCH {f.bbch_inicio}–{f.bbch_fin})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Button type="submit" size="lg" disabled={cargando || !cultivoId}>
            {cargando ? 'Calculando…' : 'Calcular plan de fertilización'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
