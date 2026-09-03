import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { DecimalInput } from '@/components/ui/decimal'
import { Label } from '@/components/ui/label'
import { parseDecimal } from '@/lib/utils'
import { fmtNum } from '@/lib/utils'
import type { EstadoSiembra, FaseCalendario, SiembraResumen } from '@/lib/api'

type Vista = { nombre: 'lista' } | { nombre: 'nueva' } | { nombre: 'calendario' }

export function Seguimiento({ planes }: { planes: { id: string; nombre: string }[] }) {
  const [siembras, setSiembras] = useState<SiembraResumen[]>([])
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [vista, setVista] = useState<Vista>({ nombre: 'lista' })
  const [seleccionada, setSeleccionada] = useState<SiembraResumen | null>(null)
  const [detalle, setDetalle] = useState<EstadoSiembra | null>(null)
  const [planId, setPlanId] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [dias, setDias] = useState('')
  const [familia, setFamilia] = useState('')
  const [especie, setEspecie] = useState('')
  const [filtro, setFiltro] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const familiasDisponibles = [...new Set(siembras.map(s => s.familia).filter(Boolean))] as string[]
  const visibles = filtro ? siembras.filter(s => s.familia === filtro) : siembras

  function recargar() {
    setEstado('cargando')
    api.listarSiembras()
      .then(s => { setSiembras(s); setEstado('listo') })
      .catch(() => setEstado('error'))
  }

  useEffect(recargar, [])

  async function abrir(id: string) {
    try {
      const [d, lista] = await Promise.all([api.estadoSiembra(id), api.listarSiembras()])
      setSiembras(lista)
      setEstado('listo')
      setDetalle(d)
      setSeleccionada(lista.find(x => x.id === id) ?? null)
      setVista({ nombre: 'calendario' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la siembra')
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      const diasNum = dias.trim() === '' ? undefined : parseDecimal(dias)
      if (diasNum !== undefined && (diasNum === null || diasNum < 1)) {
        setError('Los días por fase deben ser un número mayor o igual a 1, o déjalo vacío para cálculo automático.')
        return
      }
      const res = await api.crearSiembra(
        planId, fecha, diasNum ?? undefined, familia.trim().toLowerCase(), especie.trim()
      )
      setDias(String(res.dias_estimados_fase))
      await abrir(res.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la siembra')
    } finally {
      setGuardando(false)
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
  const hechas = detalle?.calendario.filter(f => f.estado !== 'pendiente').length ?? 0
  const total = detalle?.calendario.length ?? 0

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
        <div role="tablist" aria-label="Vistas de seguimiento" className="mt-2 flex gap-1 rounded-lg border border-border bg-background p-1 text-xs">
          {(['lista', 'nueva'] as const).map(v => (
            <button
              key={v}
              role="tab"
              aria-selected={vista.nombre === v || (vista.nombre === 'calendario' && v === 'lista')}
              onClick={() => setVista({ nombre: v })}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                vista.nombre === v || (vista.nombre === 'calendario' && v === 'lista')
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'lista' ? `Mis siembras${siembras.length ? ` (${siembras.length})` : ''}` : '+ Nueva siembra'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        {(vista.nombre === 'lista' || vista.nombre === 'calendario') && !detalle && <VistaLista
          estado={estado}
          visibles={visibles}
          familiasDisponibles={familiasDisponibles}
          filtro={filtro}
          onFiltro={setFiltro}
          onAbrir={abrir}
          onNueva={() => setVista({ nombre: 'nueva' })}
        />}

        {vista.nombre === 'nueva' && !detalle && (
          <form onSubmit={crear} className="space-y-3">
            <div>
              <Label htmlFor="seg-plan">¿Qué plan vas a sembrar?</Label>
              <Select id="seg-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
                <option value="">Elige un plan guardado…</option>
                {planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Select>
              {planes.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Aún no tienes planes. Calcula uno arriba y pulsa «Guardar plan».
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
              <div>
                <Label htmlFor="seg-fecha">Fecha de siembra</Label>
                <Input id="seg-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="seg-especie">Especie / variedad <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="seg-especie" placeholder="ej: tomate chonto" value={especie} onChange={e => setEspecie(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="seg-familia">Familia <span className="font-normal text-muted-foreground">(se hereda del plan)</span></Label>
                <Select id="seg-familia" value={familia} onChange={e => setFamilia(e.target.value)}>
                  <option value="">Del plan</option>
                  {['solanaceae', 'poaceae', 'cucurbitaceae', 'rosaceae', 'asteraceae'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="seg-dias">Días por fase <span className="font-normal text-muted-foreground">(auto según familia)</span></Label>
                <DecimalInput id="seg-dias" min={1} max={365} placeholder="automático"
                  ariaLabel="Días estimados por fase, opcional"
                  value={dias} onChange={setDias} />              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!planId || guardando}>
                {guardando ? 'Creando…' : 'Crear calendario de aplicaciones'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setVista({ nombre: 'lista' })}>Cancelar</Button>
            </div>
          </form>
        )}

        {vista.nombre === 'calendario' && detalle && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{detalle.plan_nombre}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {[seleccionada?.familia, seleccionada?.especie, `Sembrada ${seleccionada?.fecha_inicio}`, `BBCH actual ${detalle.siembra.bbch_actual}`, `${hechas}/${total} aplicadas`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSeleccionada(null); setDetalle(null); setVista({ nombre: 'lista' }) }}>‹ Mis siembras</Button>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={hechas} aria-valuemin={0} aria-valuemax={total}>
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${total ? (hechas / total) * 100 : 0}%` }} />
            </div>

            {siguiente ? (
              <Alert variant="warning" title="Toca aplicar ahora">
                <strong>Fase {siguiente.orden} · {siguiente.nombre_fase}</strong> (BBCH {siguiente.bbch}) — fecha estimada {siguiente.fecha_estimada}
              </Alert>
            ) : (
              <Alert title="Ciclo completo">Todas las aplicaciones están cumplidas u omitidas.</Alert>
            )}

            <ol className="relative space-y-3 border-l-2 border-border pl-4">
              {detalle.calendario.map(f => (
                <FaseCard key={f.orden} fase={f} onCambiar={nuevo => cambiarEstado(f.orden, nuevo)} />
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VistaLista({ estado, visibles, familiasDisponibles, filtro, onFiltro, onAbrir, onNueva }: {
  estado: 'cargando' | 'listo' | 'error'
  visibles: SiembraResumen[]
  familiasDisponibles: string[]
  filtro: string
  onFiltro: (f: string) => void
  onAbrir: (id: string) => void
  onNueva: () => void
}) {
  if (estado === 'cargando') {
    return (
      <div className="space-y-2" aria-label="Cargando siembras">
        {[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-border" />)}
      </div>
    )
  }
  if (estado === 'error') {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center text-xs">
        <p className="font-medium text-destructive">No se pudieron cargar las siembras</p>
        <p className="mt-0.5 text-muted-foreground">Verifica que el backend esté corriendo e inténtalo de nuevo.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>Reintentar</Button>
      </div>
    )
  }
  if (visibles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium">Aún no hay siembras en seguimiento</p>
        <p className="mt-1 text-xs text-muted-foreground">Guarda un plan de fertilización y crea aquí su calendario de aplicaciones.</p>
        <Button size="sm" className="mt-3" onClick={onNueva}>Crear mi primera siembra</Button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {familiasDisponibles.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Filtrar:</span>
          {['', ...familiasDisponibles].map(f => (
            <button
              key={f || 'todas'}
              onClick={() => onFiltro(f)}
              aria-pressed={filtro === f}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                filtro === f ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {f || 'todas'}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y divide-border">
        {visibles.map(s => (
          <li key={s.id}>
            <button
              onClick={() => onAbrir(s.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.plan_nombre ?? s.plan_id}</p>
                <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                  {[s.familia, s.especie, s.cultivo_nombre].filter(Boolean).join(' · ')} · sembrada {s.fecha_inicio} · BBCH {s.bbch_actual}
                </p>
              </div>
              <span className="shrink-0 text-xs text-primary">Ver calendario ›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FaseCard({ fase, onCambiar }: {
  fase: FaseCalendario
  onCambiar: (nuevo: 'aplicada' | 'omitida' | 'pendiente') => void
}) {
  const hecha = fase.estado !== 'pendiente'
  return (
    <li className={`relative rounded-xl border p-3 ${hecha ? 'border-border bg-background opacity-60' : 'border-primary/40 bg-card'}`}>
      <span
        aria-hidden="true"
        className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 ${
          fase.estado === 'aplicada' ? 'border-primary bg-primary' : fase.estado === 'omitida' ? 'border-border bg-border' : 'border-primary bg-background'
        }`}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            Fase {fase.orden} · {fase.nombre_fase}
            {hecha && <Badge variant={fase.estado === 'aplicada' ? 'success' : 'outline'} className="ml-2">{fase.estado}</Badge>}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">BBCH {fase.bbch} · fecha estimada {fase.fecha_estimada}</p>
        </div>
        {!hecha && (
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => onCambiar('aplicada')}>✓ Aplicar</Button>
            <Button variant="ghost" size="sm" onClick={() => onCambiar('omitida')}>Omitir</Button>
          </div>
        )}
        {hecha && (
          <Button variant="ghost" size="sm" onClick={() => onCambiar('pendiente')}>Reabrir</Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] tabular-nums">
        <span className="rounded-md bg-muted px-2 py-1"><strong>N</strong> {fmtNum(fase.dosis_nutriente_kg_ha.N)} kg/ha</span>
        <span className="rounded-md bg-muted px-2 py-1"><strong>P₂O₅</strong> {fmtNum(fase.dosis_nutriente_kg_ha.P)} kg/ha</span>
        <span className="rounded-md bg-muted px-2 py-1"><strong>K₂O</strong> {fmtNum(fase.dosis_nutriente_kg_ha.K)} kg/ha</span>
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
        {fase.fuentes_sugeridas.map(s => (
          <p key={s.fuente_id}>• {s.nombre}: <strong className="tabular-nums">{fmtNum(s.kg_ha)} kg/ha</strong></p>
        ))}
      </div>
    </li>
  )
}
