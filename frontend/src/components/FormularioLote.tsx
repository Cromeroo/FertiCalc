import { Field, Label } from '@/components/ui/label'
import { Input, Select } from '@/components/ui/input'
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
      </CardHeader>
      <CardContent>
        <form onSubmit={onCalcular} noValidate={false}>
          <Field label="Cultivo" htmlFor="cultivo">
            <Select id="cultivo" value={cultivoId} onChange={e => onCultivo(e.target.value)}>
              {cultivos.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Select>
          </Field>

          <Field label="Rendimiento esperado (t/ha)" htmlFor="rendimiento">
            <Input
              id="rendimiento"
              type="number"
              min="0.1"
              step="0.1"
              required
              value={valores.rendimiento}
              onChange={e => onChange({ ...valores, rendimiento: e.target.value })}
            />
          </Field>

          <fieldset className="mb-3 rounded-md border border-border px-3 pb-3 pt-1">
            <legend className="px-1 text-[11px] text-muted-foreground">
              Aporte estimado del suelo (kg/ha disponibles)
            </legend>
            <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
              {NUTRIENTES.map(n => (
                <div key={n}>
                  <Label htmlFor={`suelo-${n}`} className="sr-only">{`Aporte ${NOMBRE_NUTRIENTE[n]}`}</Label>
                  <Input
                    id={`suelo-${n}`}
                    type="number"
                    min="0"
                    placeholder={`${ETIQUETA_CORTA[n]} disponible`}
                    aria-label={`Aporte de suelo ${NOMBRE_NUTRIENTE[n]}`}
                    value={valores.suelo[n.toLowerCase() as 'n' | 'p' | 'k']}
                    onChange={e => onChange({ ...valores, suelo: { ...valores.suelo, [n.toLowerCase()]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-3 rounded-md border border-border px-3 pb-3 pt-1">
            <legend className="px-1 text-[11px] text-muted-foreground">
              Eficiencia de aprovechamiento (ERF)
            </legend>
            <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
              {NUTRIENTES.map(n => (
                <div key={n}>
                  <Label htmlFor={`erf-${n}`} className="sr-only">{`ERF ${NOMBRE_NUTRIENTE[n]}`}</Label>
                  <Input
                    id={`erf-${n}`}
                    type="number"
                    min="0.05"
                    max="1"
                    step="0.05"
                    aria-label={`Eficiencia ERF ${NOMBRE_NUTRIENTE[n]}`}
                    value={valores.eficiencias[n]}
                    onChange={e => onChange({ ...valores, eficiencias: { ...valores.eficiencias, [n]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </fieldset>

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
