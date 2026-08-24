import { useState } from 'react'
import * as api from '@/lib/api'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/input'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/card'
import type { RespuestaGnn } from '@/lib/api'

const FASES = [2, 3, 4, 5, 6]

export function LaboratorioGnn() {
  const [ext, setExt] = useState({ N: '3', P: '1', K: '4' })
  const [fases, setFases] = useState(4)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<RespuestaGnn | null>(null)

  async function predecir(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError('')
    try {
      setResultado(
        await api.predecirCurvaGnn({ N: Number(ext.N), P: Number(ext.P), K: Number(ext.K) }, fases)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al predecir')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            Laboratorio de curvas
            <Badge variant="warning">experimental · IA</Badge>
          </CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            GNN entrenada con validación leave-one-out sobre el catálogo. Predice la forma de la curva para cultivos sin literatura.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={predecir} className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <Label htmlFor="gnn-n">N kg/t</Label>
            <Input id="gnn-n" type="number" min="0.01" step="0.1" value={ext.N}
              onChange={e => setExt({ ...ext, N: e.target.value })} />
          </div>
          <div className="w-24">
            <Label htmlFor="gnn-p">P₂O₅ kg/t</Label>
            <Input id="gnn-p" type="number" min="0.01" step="0.1" value={ext.P}
              onChange={e => setExt({ ...ext, P: e.target.value })} />
          </div>
          <div className="w-24">
            <Label htmlFor="gnn-k">K₂O kg/t</Label>
            <Input id="gnn-k" type="number" min="0.01" step="0.1" value={ext.K}
              onChange={e => setExt({ ...ext, K: e.target.value })} />
          </div>
          <div className="w-28">
            <Label htmlFor="gnn-fases">Fases</Label>
            <Select id="gnn-fases" value={fases} onChange={e => setFases(Number(e.target.value))}>
              {FASES.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <Button type="submit" variant="secondary" disabled={cargando}>
            {cargando ? 'Prediciendo…' : 'Predecir curva'}
          </Button>
        </form>

        {error && <Alert variant="destructive">{error}</Alert>}

        {resultado && (
          <div className="space-y-2">
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
                {resultado.curva_predicha.map(f => (
                  <TR key={f.orden}>
                    <TD>{f.nombre} <span className="text-[11px] text-muted-foreground">({f.bbch})</span></TD>
                    <TD className="text-right font-medium">{f.pct_acumulado.N}</TD>
                    <TD className="text-right font-medium">{f.pct_acumulado.P}</TD>
                    <TD className="text-right font-medium">{f.pct_acumulado.K}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex flex-wrap gap-1.5">
              {resultado.modelo.metricas_loo_mae_puntos != null && (
                <Badge>MAE leave-one-out: ±{resultado.modelo.metricas_loo_mae_puntos} pts</Badge>
              )}
              {resultado.modelo.arquitectura && <Badge variant="outline">{resultado.modelo.arquitectura}</Badge>}
            </div>
            <Alert variant="warning">{resultado.advertencia}</Alert>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
