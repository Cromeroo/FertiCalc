import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/card'
import { Resultados } from './Resultados'
import type { PlanGnnRespuesta, RespuestaGnn } from '@/lib/api'

const FAMILIAS = ['solanaceae', 'poaceae', 'cucurbitaceae', 'rosaceae', 'asteraceae']

export function LaboratorioGnn() {
  const [ext, setExt] = useState({ N: '2.8', P: '0.9', K: '4.0' })
  const [rendimiento, setRendimiento] = useState('30')
  const [fases, setFases] = useState(4)
  const [familia, setFamilia] = useState('solanaceae')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<PlanGnnRespuesta | null>(null)
  const [mae, setMae] = useState<number | null>(null)
  const [fuenteValores, setFuenteValores] = useState('')

  useEffect(() => {
    api.estadoGnn().then(e => {
      if (e.metricas_loo?.mae_global) setMae(e.metricas_loo.mae_global)
    }).catch(() => {})
  }, [])

  async function usarPromedioFamilia() {
    try {
      const ref = await api.referenciaFamilia(familia)
      setExt({
        N: String(ref.extraccion_kg_t.N.promedio),
        P: String(ref.extraccion_kg_t.P.promedio),
        K: String(ref.extraccion_kg_t.K.promedio)
      })
      setFuenteValores(
        `Promedio de ${ref.num_cultivos} cultivos de la familia (${ref.cultivos.map(c => c.id).join(', ')}). Rango N: ${ref.extraccion_kg_t.N.min}–${ref.extraccion_kg_t.N.max} kg/t.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sin referencia para esa familia')
    }
  }

  async function predecir(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError('')
    try {
      setResultado(
        await api.generarPlanGnn({
          extraccion_por_t: { N: Number(ext.N), P: Number(ext.P), K: Number(ext.K) },
          rendimiento_t_ha: Number(rendimiento),
          num_fases: fases,
          familia
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al predecir')
    } finally {
      setCargando(false)
    }
  }

  const pred: RespuestaGnn | null = resultado?.prediccion ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Cultivos nuevos — curva y plan estimados
          <Badge variant="warning">experimental · IA</Badge>
        </CardTitle>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Para cultivos sin curvas publicadas: la GNN estima la forma de la curva según su familia botánica y el motor determinista calcula el plan.
          {mae != null && ` Precisión validada: ±${mae} pts (leave-one-out).`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={predecir} className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-24">
              <Label htmlFor="gnn-n">N kg/t</Label>
              <Input id="gnn-n" type="number" min="0.01" step="0.1" value={ext.N}
                onChange={e => setExt({ ...ext, N: e.target.value })} required />
            </div>
            <div className="w-24">
              <Label htmlFor="gnn-p">P₂O₅ kg/t</Label>
              <Input id="gnn-p" type="number" min="0.01" step="0.1" value={ext.P}
                onChange={e => setExt({ ...ext, P: e.target.value })} required />
            </div>
            <div className="w-24">
              <Label htmlFor="gnn-k">K₂O kg/t</Label>
              <Input id="gnn-k" type="number" min="0.01" step="0.1" value={ext.K}
                onChange={e => setExt({ ...ext, K: e.target.value })} required />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={usarPromedioFamilia}>
              No tengo datos: usar promedio de la familia
            </Button>
          </div>
          <p className="-mt-1 text-[10px] text-muted-foreground">
            ¿De dónde salen estos valores? De un análisis de tejido a la cosecha, de tablas de extracción del cultivo, o usa el promedio de su familia arriba.
            {fuenteValores && <span className="block mt-0.5 text-primary">{fuenteValores}</span>}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Label htmlFor="gnn-rend">t/ha esperadas</Label>
              <Input id="gnn-rend" type="number" min="0.1" step="1" value={rendimiento}
                onChange={e => setRendimiento(e.target.value)} required />
            </div>
            <div className="w-44">
              <Label htmlFor="gnn-familia">Familia botánica</Label>
              <Select id="gnn-familia" value={familia} onChange={e => setFamilia(e.target.value)}>
                {FAMILIAS.map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Define con qué cultivos del grafo se conecta la predicción
              </p>
            </div>
            <div className="w-28">
              <Label htmlFor="gnn-fases">Fases del ciclo</Label>
              <Select id="gnn-fases" value={fases} onChange={e => setFases(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
            </div>
            <Button type="submit" variant="secondary" disabled={cargando}>
              {cargando ? 'Calculando…' : 'Predecir curva y generar plan'}
            </Button>
          </div>
        </form>

        {error && <Alert variant="destructive">{error}</Alert>}

        {pred && resultado && (
          <div className="space-y-4">
            {pred.explicacion && (
              <div className="rounded-md border border-border bg-background p-3 text-xs space-y-2.5">
                <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                  Por qué el modelo predice esto
                </p>
                <p className="leading-relaxed">{pred.explicacion.razonamiento}</p>
                <div className="grid gap-1.5 max-sm:grid-cols-1 sm:grid-cols-3">
                  {pred.explicacion.factores.map(f => (
                    <div key={f.factor}>
                      <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
                        <span>{f.factor}</span>
                        <span className="tabular-nums">{f.influencia_pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${f.influencia_pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-muted-foreground">Se apoya en:</span>
                  {pred.explicacion.referencias_influyentes.map(r => (
                    <Badge key={r.cultivo_id}>
                      {r.cultivo_id} · {r.apoyo_pct}%
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Curva de absorción acumulada predicha (%)
              </h3>
              <Table>
                <THead>
                  <tr>
                    <TH>Fase (BBCH)</TH>
                    <TH className="text-right">N %</TH>
                    <TH className="text-right">P₂O₅ %</TH>
                    <TH className="text-right">K₂O %</TH>
                  </tr>
                </THead>
                <TBody>
                  {pred.curva_predicha.map(f => (
                    <TR key={f.orden}>
                      <TD>{f.nombre} <span className="text-[11px] text-muted-foreground">({f.bbch})</span></TD>
                      <TD className="text-right font-medium">{f.pct_acumulado.N}</TD>
                      <TD className="text-right font-medium">{f.pct_acumulado.P}</TD>
                      <TD className="text-right font-medium">{f.pct_acumulado.K}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <Resultados data={resultado.plan} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
