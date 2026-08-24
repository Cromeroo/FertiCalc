import { useState } from 'react'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/card'
import { Evidencia } from './Evidencia'
import { NUTRIENTES, NOMBRE_NUTRIENTE, cx, fmtNum, type Nutriente } from '@/lib/utils'
import type { Recomendacion } from '@/lib/api'

const COLOR_KPI: Record<Nutriente, string> = {
  N: 'text-nutrient-n',
  P: 'text-nutrient-p',
  K: 'text-nutrient-k'
}

export function Resultados({ data, onGuardado }: { data: Recomendacion; onGuardado?: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function guardar() {
    const nombre = window.prompt('Nombre del plan:', `${data.cultivo_nombre} — ${data.rendimiento_t_ha} t/ha`)
    if (!nombre) return
    setGuardando(true)
    try {
      await api.guardarPlan(nombre, data)
      setMensaje(`Guardado como "${nombre}"`)
      onGuardado?.()
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
      window.setTimeout(() => setMensaje(''), 4000)
    }
  }

  return (
    <section aria-label="Resultados del plan" className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              Plan para {data.cultivo_nombre} · {fmtNum(data.rendimiento_t_ha)} t/ha
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dosis total a aplicar · demanda del cultivo menos aporte de suelo, ajustada por eficiencia
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mensaje && <span role="status" className="text-xs text-primary">{mensaje}</span>}
            <Button variant="outline" size="sm" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar plan'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
            {NUTRIENTES.map(n => (
              <div key={n} className={cx('rounded-lg border border-border bg-background px-3 py-2.5')}>
                <p className="text-[11px] text-muted-foreground">{NOMBRE_NUTRIENTE[n]}</p>
                <p className={cx('text-2xl font-semibold tabular-nums', COLOR_KPI[n])}>
                  {fmtNum(data.dosis_fertilizante_kg_ha[n])}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">kg/ha</span>
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  demanda {fmtNum(data.demanda_total_kg_ha[n])} · suelo aporta {fmtNum(data.aporte_suelo_kg_ha[n])}
                </p>
              </div>
            ))}
          </div>

          {data.advertencias.length > 0 && (
            <Alert variant="warning" title={`Avisos del motor (${data.advertencias.length})`}>
              <ul className="list-disc pl-4 space-y-1">
                {data.advertencias.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div>
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Dosis por fase fenológica
            </h3>
            <Table>
              <THead>
                <tr>
                  <TH>Fase (BBCH)</TH>
                  {NUTRIENTES.map(n => (
                    <TH key={n} className="text-right">{n === 'P' ? 'P₂O₅' : n === 'K' ? 'K₂O' : 'N'} kg/ha</TH>
                  ))}
                  <TH>Fuentes sugeridas</TH>
                </tr>
              </THead>
              <TBody>
                {data.fases.map(f => {
                  const ids = f.fuentes_sugeridas.map(s => s.fuente_id)
                  return (
                    <TR key={f.orden}>
                      <TD>
                        <p className="font-medium">{f.nombre}</p>
                        <p className="text-[11px] text-muted-foreground">BBCH {f.bbch}</p>
                      </TD>
                      {NUTRIENTES.map(n => (
                        <TD key={n} className="text-right font-medium">{fmtNum(f.dosis_nutriente_kg_ha[n])}</TD>
                      ))}
                      <TD className="min-w-56">
                        {f.fuentes_sugeridas.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Sin requerimiento</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {f.fuentes_sugeridas.map(s => (
                              <Badge key={s.fuente_id} variant={esLiquida(s.nombre) ? 'info' : 'default'}>
                                {s.nombre} · {fmtNum(s.kg_ha)} kg/ha
                              </Badge>
                            ))}
                          </div>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Curva: {f.referencia_curva}
                          {ids.includes('uan32') || ids.includes('acido_fosforico') ? ' · fertirriego' : ''}
                        </p>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Evidencia evidencia={data.evidencia} referencias={data.referencias ?? {}} />
    </section>
  )
}

function esLiquida(nombre: string): boolean {
  return /liquido|UAN|acido/i.test(nombre)
}
