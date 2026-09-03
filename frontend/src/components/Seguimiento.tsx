import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/card'
import { fmtNum } from '@/lib/utils'
import type { EstadoSiembra, SiembraResumen } from '@/lib/api'

export function Seguimiento({ planes }: { planes: { id: string; nombre: string }[] }) {
  const [siembras, setSiembras] = useState<SiembraResumen[]>([])
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [seleccionada, setSeleccionada] = useState<SiembraResumen | null>(null)
  const [detalle, setDetalle] = useState<EstadoSiembra | null>(null)
  const [planId, setPlanId] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [dias, setDias] = useState('20')
  const [error, setError] = useState('')

  function recargar() {
    setEstado('cargando')
    api.listarSiembras()
      .then(s => { setSiembras(s); setEstado('listo') })
      .catch(() => setEstado('error'))
  }

  useEffect(recargar, [])

  async function abrir(id: string) {
    try {
      const d = await api.estadoSiembra(id)
      setDetalle(d)
      const s = siembras.find(x => x.id === id) ?? null
      setSeleccionada(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la siembra')
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const id = await api.crearSiembra(planId, fecha, Number(dias))
      await abrir(id)
      recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la siembra')
    }
  }

  async function cambiarEstado(orden: number, nuevo: 'aplicada' | 'omitida' | 'pendiente') {
    if (!seleccionada) return
    try {
      await api.marcarFase(seleccionada.id, orden, nuevo)
      await abrir(seleccionada.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar')
    }
  }

  const siguiente = detalle?.calendario.find(f => f.estado === 'pendiente')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Seguimiento de siembras</CardTitle>
          <Badge variant="success">nuevo</Badge>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Convierte un plan en calendario vivo: te indica qué aplicación toca y te permite marcar avances.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        {!seleccionada && (
          <>
            <form onSubmit={crear} className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Label htmlFor="seg-plan">Plan a sembrar</Label>
                <Select id="seg-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
                  <option value="">Elige un plan guardado…</option>
                  {planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
              </div>
              <div className="w-36">
                <Label htmlFor="seg-fecha">Fecha de siembra</Label>
                <Input id="seg-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
              </div>
              <div className="w-28">
                <Label htmlFor="seg-dias">Días por fase</Label>
                <Input id="seg-dias" type="number" min="1" max="365" value={dias} onChange={e => setDias(e.target.value)} required />
              </div>
              <Button type="submit" size="sm" disabled={!planId}>Crear seguimiento</Button>
            </form>

            {estado === 'cargando' && <p className="text-xs text-muted-foreground">Cargando siembras…</p>}
            {estado === 'error' && <p className="text-xs text-destructive">No se pudieron cargar las siembras.</p>}
            {estado === 'listo' && siembras.length === 0 && (
              <p className="text-xs italic text-muted-foreground">Aún no hay siembras en seguimiento. Guarda un plan y créala desde aquí.</p>
            )}
            {estado === 'listo' && siembras.length > 0 && (
              <ul className="divide-y divide-border">
                {siembras.map(s => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.plan_nombre ?? s.plan_id}</p>
                      <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                        {s.cultivo_nombre} · sembrada {s.fecha_inicio} · BBCH {s.bbch_actual}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => abrir(s.id)}>Ver</Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {seleccionada && detalle && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{detalle.plan_nombre}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Sembrada {seleccionada.fecha_inicio} · BBCH actual {detalle.siembra.bbch_actual}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSeleccionada(null); setDetalle(null) }}>‹ Volver</Button>
            </div>

            {siguiente && (
              <Alert variant="warning" title="Siguiente aplicación">
                Fase {siguiente.orden} · {siguiente.nombre_fase} (BBCH {siguiente.bbch}) —
                fecha estimada {siguiente.fecha_estimada}
              </Alert>
            )}
            {!siguiente && (
              <Alert title="Ciclo completo">Todas las aplicaciones están cumplidas u omitidas.</Alert>
            )}

            <Table>
              <THead>
                <tr>
                  <TH>Fase</TH>
                  <TH>Fecha est.</TH>
                  <TH className="text-right">Dosis kg/ha</TH>
                  <TH>Fuentes</TH>
                  <TH>Estado</TH>
                </tr>
              </THead>
              <TBody>
                {detalle.calendario.map(f => (
                  <TR key={f.orden} className={f.estado === 'aplicada' ? 'opacity-55' : ''}>
                    <TD>
                      <p className="font-medium">{f.nombre_fase}</p>
                      <p className="text-[11px] text-muted-foreground">BBCH {f.bbch}</p>
                    </TD>
                    <TD className="tabular-nums text-xs">{f.fecha_estimada}</TD>
                    <TD className="text-right font-medium text-xs tabular-nums">
                      N {fmtNum(f.dosis_nutriente_kg_ha.N)} · P {fmtNum(f.dosis_nutriente_kg_ha.P)} · K {fmtNum(f.dosis_nutriente_kg_ha.K)}
                    </TD>
                    <TD className="text-[11px]">
                      {f.fuentes_sugeridas.map(s => (
                        <span key={s.fuente_id} className="block text-muted-foreground">
                          {s.nombre}: {fmtNum(s.kg_ha)} kg/ha
                        </span>
                      ))}
                    </TD>
                    <TD>
                      <div className="flex gap-1.5">
                        {f.estado === 'pendiente' ? (
                          <>
                            <Button size="sm" onClick={() => cambiarEstado(f.orden, 'aplicada')}>Aplicar</Button>
                            <Button variant="destructive" size="sm" onClick={() => cambiarEstado(f.orden, 'omitida')}>Omitir</Button>
                          </>
                        ) : (
                          <>
                            <Badge variant={f.estado === 'aplicada' ? 'success' : 'outline'}>{f.estado}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => cambiarEstado(f.orden, 'pendiente')}>Reabrir</Button>
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
