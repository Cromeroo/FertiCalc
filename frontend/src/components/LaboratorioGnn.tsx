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
  const [nombreCultivo, setNombreCultivo] = useState('')
  const [familia, setFamilia] = useState('solanaceae')
  const [ext, setExt] = useState({ N: '', P: '', K: '' })
  const [rendimiento, setRendimiento] = useState('30')
  const [fases, setFases] = useState(4)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<PlanGnnRespuesta | null>(null)
  const [mae, setMae] = useState<number | null>(null)
  const [fuenteValores, setFuenteValores] = useState('')
  const [editadoManual, setEditadoManual] = useState(false)

  useEffect(() => {
    api.estadoGnn().then(e => {
      if (e.metricas_loo?.mae_global) setMae(e.metricas_loo.mae_global)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelado = false
    api.referenciaFamilia(familia)
      .then(ref => {
        if (cancelado || editadoManual) return
        setExt({
          N: String(ref.extraccion_kg_t.N.promedio),
          P: String(ref.extraccion_kg_t.P.promedio),
          K: String(ref.extraccion_kg_t.K.promedio)
        })
        setFuenteValores(
          `Sugerido: promedio de ${ref.num_cultivos} cultivo(s) de esta familia (${ref.cultivos.map(c => c.id).join(', ')}). Ajústalos si tienes análisis propio.`
        )
      })
      .catch(() => {})
    return () => { cancelado = true }
  }, [familia, editadoManual])

  async function predecir(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(ext.N), p = Number(ext.P), k = Number(ext.K)
    const rend = Number(rendimiento)
    if (![n, p, k, rend].every(v => Number.isFinite(v) && v > 0)) {
      setError('Revisa los valores: extracción N/P/K y rendimiento deben ser números mayores a 0.')
      return
    }
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
        <p className="mt-1 text-xs text-muted-foreground">
          Para cultivos <strong className="text-foreground">que no están en el catálogo</strong> (sin curva publicada). Si tu cultivo sí está listado arriba, usa el formulario principal — este laboratorio es solo para cultivos nuevos.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">¿Cómo funciona? No necesitas saber fertilizantes de antemano</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li><strong className="text-foreground">Escribe tu cultivo y elige su familia</strong> — el sistema busca parientes con curvas conocidas.</li>
            <li><strong className="text-foreground">La extracción biológica se sugiere sola</strong> — es cuánto el cultivo <em>extrae</em> por tonelada (no lo que aplicarás). Si tienes análisis propio, ajústala.</li>
            <li>La IA predice <em>cuándo</em> lo absorbe y el motor calcula <strong className="text-foreground">cuánto fertilizante aplicar por fase</strong>.</li>
          </ol>
        </div>

        <form onSubmit={predecir} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="gnn-nombre">1. Nombre de tu cultivo (opcional)</Label>
              <Input id="gnn-nombre" placeholder="ej: cocona, lulo, quinua" value={nombreCultivo}
                onChange={e => setNombreCultivo(e.target.value)} />
            </div>
            <div className="w-44">
              <Label htmlFor="gnn-familia">Familia botánica *</Label>
              <Select id="gnn-familia" value={familia} onChange={e => { setFamilia(e.target.value); setEditadoManual(false) }}>
                {FAMILIAS.map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">Define a qué parientes del grafo se conecta</p>
            </div>
          </div>

          <div>
            <Label>2. Extracción biológica del cultivo — <span className="font-normal">se sugiere automáticamente al elegir familia</span></Label>
            <p className="mb-1.5 text-[10px] text-muted-foreground">No es fertilizante. Es cuánto la planta extrae por tonelada cosechada. El laboratorio calculará el fertilizante por ti.</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-28">
                <Input id="gnn-n" type="number" min="0.01" step="0.01" inputMode="decimal" value={ext.N}
                  aria-label="Extracción de nitrógeno kg/t"
                  onChange={e => { setExt({ ...ext, N: e.target.value }); setEditadoManual(true) }} required />
                <p className="mt-1 text-[10px] text-muted-foreground">N extraído (kg/t)</p>
              </div>
              <div className="w-28">
                <Input id="gnn-p" type="number" min="0.01" step="0.01" inputMode="decimal" value={ext.P}
                  aria-label="Extracción de fósforo kg/t"
                  onChange={e => { setExt({ ...ext, P: e.target.value }); setEditadoManual(true) }} required />
                <p className="mt-1 text-[10px] text-muted-foreground">P₂O₅ extraído (kg/t)</p>
              </div>
              <div className="w-28">
                <Input id="gnn-k" type="number" min="0.01" step="0.01" inputMode="decimal" value={ext.K}
                  aria-label="Extracción de potasio kg/t"
                  onChange={e => { setExt({ ...ext, K: e.target.value }); setEditadoManual(true) }} required />
                <p className="mt-1 text-[10px] text-muted-foreground">K₂O extraído (kg/t)</p>
              </div>
            </div>
            {fuenteValores && <p className="mt-2 rounded bg-primary/10 px-2 py-1 text-[10px] text-primary">{fuenteValores}</p>}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-32">
              <Label htmlFor="gnn-rend">3. Rendimiento esperado (t/ha)</Label>
              <Input id="gnn-rend" type="number" min="0.1" step="1" value={rendimiento}
                onChange={e => setRendimiento(e.target.value)} required />
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
                  {mae != null && <Badge variant="outline">precisión ±{mae} pts</Badge>}
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
