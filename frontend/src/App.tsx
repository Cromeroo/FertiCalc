import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import type { SolicitudRecomendacion } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/ui/section'
import { NUTRIENTES, parseDecimal } from '@/lib/utils'
import { FormularioLote, type ValoresFormulario } from '@/components/FormularioLote'
import { Resultados } from '@/components/Resultados'
import { PlanesGuardados } from '@/components/PlanesGuardados'
import { Chat } from '@/components/Chat'
import { LaboratorioGnn } from '@/components/LaboratorioGnn'
import { Seguimiento } from '@/components/Seguimiento'
import { usePlanes } from '@/hooks/usePlanes'
import type { Fase, Recomendacion } from '@/lib/api'

const VALORES_INICIALES: ValoresFormulario = {
  rendimiento: '40',
  suelo: { n: '0', p: '0', k: '0' },
  eficiencias: { N: '0.6', P: '0.25', K: '0.5' },
  faseDesde: ''
}

export default function App() {
  const [vista, setVista] = useState<'planificar' | 'seguimiento' | 'asistente'>('planificar')
  const [cultivos, setCultivos] = useState<api.CultivoResumen[]>([])
  const [cultivoId, setCultivoId] = useState('')
  const [fases, setFases] = useState<Fase[]>([])
  const [valores, setValores] = useState<ValoresFormulario>(VALORES_INICIALES)
  const [resultado, setResultado] = useState<Recomendacion | null>(null)
  const [autoGuardar, setAutoGuardar] = useState(false)
  const [errorGlobal, setErrorGlobal] = useState('')
  const [calculando, setCalculando] = useState(false)
  const [modo, setModo] = useState('')
  const { planes, estadoPlanes, recargarPlanes, eliminarPlan } = usePlanes()

  useEffect(() => {
    api.health().then(setModo).catch(() => {})
    api
      .listarCultivos()
      .then(data => {
        setCultivos(data)
        if (data.length) seleccionarCultivo(data[0].id)
      })
      .catch(() => setErrorGlobal('No se pudo conectar con la API. Verifica que el backend esté corriendo.'))
  }, [])

  async function seleccionarCultivo(id: string) {
    setCultivoId(id)
    setValores(v => ({ ...v, faseDesde: '', rendimiento: id === 'maiz' || id === 'papa' ? '12' : '40' }))
    try {
      const d = await api.obtenerCultivo(id)
      setFases(d.cultivo.fases ?? [])
    } catch {
      setFases([])
    }
  }

  function construirSolicitud(): SolicitudRecomendacion {
    const suelo = (v: string) => (v.trim() === '' ? 0 : (parseDecimal(v) ?? 0))
    return {
      cultivo_id: cultivoId,
      rendimiento_t_ha: parseDecimal(valores.rendimiento) ?? 0,
      analisis_suelo: {
        n_disponible_kg_ha: suelo(valores.suelo.n),
        p2o5_disponible_kg_ha: suelo(valores.suelo.p),
        k2o_disponible_kg_ha: suelo(valores.suelo.k)
      },
      eficiencias: {
        N: parseDecimal(valores.eficiencias.N) ?? 0.6,
        P: parseDecimal(valores.eficiencias.P) ?? 0.25,
        K: parseDecimal(valores.eficiencias.K) ?? 0.5
      },
      fase_desde_orden: valores.faseDesde ? Number(valores.faseDesde) : null
    }
  }

  function validarValores(): string | null {
    const rend = parseDecimal(valores.rendimiento)
    if (rend === null || rend <= 0) return 'El rendimiento esperado debe ser un número mayor a 0 (acepta coma o punto).'
    for (const k of ['n', 'p', 'k'] as const) {
      const v = valores.suelo[k].trim()
      if (v !== '') {
        const s = parseDecimal(v)
        if (s === null || s < 0) return 'Los aportes del suelo deben ser números mayores o iguales a 0, o déjalos vacíos.'
      }
    }
    for (const n of NUTRIENTES) {
      const e = parseDecimal(valores.eficiencias[n])
      if (e === null || e <= 0 || e > 1) return 'Las eficiencias ERF deben ser números entre 0.05 y 1.'
    }
    return null
  }

  async function calcular(e: React.FormEvent) {
    e.preventDefault()
    await ejecutarCalculo(false)
  }

  async function calcularYGuardar(e: React.FormEvent) {
    e.preventDefault()
    await ejecutarCalculo(true)
  }

  async function ejecutarCalculo(conGuardado: boolean) {
    const problema = validarValores()
    if (problema) {
      setResultado(null)
      setAutoGuardar(false)
      setErrorGlobal(problema)
      return
    }
    setCalculando(true)
    setErrorGlobal('')
    try {
      setResultado(await api.calcularRecomendacion(construirSolicitud()))
      setAutoGuardar(conGuardado)
      window.setTimeout(() => {
        document.getElementById('resultado')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err) {
      setResultado(null)
      setAutoGuardar(false)
      setErrorGlobal(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setCalculando(false)
    }
  }

  async function abrirPlan(id: string) {
    try {
      const plan = await api.abrirPlan(id)
      setResultado(plan.recomendacion)
      setVista('planificar')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setErrorGlobal('No se pudo abrir el plan')
    }
  }

  function irAPlanificar() {
    setResultado(null)
    setErrorGlobal('')
    setVista('planificar')
    window.scrollTo({ top: 0 })
    window.setTimeout(() => {
      document.getElementById('cultivo')?.focus()
    }, 100)
  }

  function irASeguimiento() {
    setVista('seguimiento')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function eliminarPlanSeguro(id: string) {
    if (!window.confirm('¿Eliminar este plan?')) return
    try {
      await eliminarPlan(id)
    } catch (e) {
      setErrorGlobal(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="sticky top-0 z-40 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-primary">FertiCalc</h1>
          <Badge variant={modo === 'neo4j' ? 'info' : modo === 'json' ? 'success' : 'outline'}>
            {modo === 'neo4j' ? 'grafo Neo4j' : modo === 'json' ? 'semilla JSON' : 'conectando…'}
          </Badge>
          <nav aria-label="Vistas" className="ml-auto flex gap-1 rounded-lg border border-border bg-background p-1 text-xs">
            {([
              ['planificar', '1 · Planificar'],
              ['seguimiento', '2 · Seguimiento'],
              ['asistente', '3 · Asistente']
            ] as const).map(([v, etiqueta]) => (
              <button
                key={v}
                type="button"
                aria-current={vista === v ? 'page' : undefined}
                onClick={() => {
                  setVista(v)
                  window.scrollTo({ top: 0 })
                }}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  vista === v ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 pb-6">
        <p className="mb-5 text-xs text-muted-foreground">
          Planifica por cultivo · Sigue tu siembra por fase · Resuelve dudas con el asistente
        </p>

      {errorGlobal && (
        <Alert variant="destructive" title="No se pudo completar la operación" className="mb-4">
          {errorGlobal}
        </Alert>
      )}

      <main className="space-y-4">
        {cultivos.length === 0 && !errorGlobal ? (
          <>
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </>
        ) : (
          <>
            <section aria-label="Planificar" hidden={vista !== 'planificar'} className="space-y-4">
              <SectionHeader paso="1" titulo="Planifica tu fertilización" />
              {!resultado && !calculando && (
                <div className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  <p className="font-medium text-foreground">Para crear un plan nuevo, sigue estos pasos:</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    <li>Elige el cultivo y el rendimiento esperado abajo.</li>
                    <li>Pulsa <strong className="text-foreground">«Calcular y guardar con nombre»</strong> para calcular y ponerle nombre al plan en un solo paso (o solo «Calcular» si prefieres revisar antes).</li>
                  </ol>
                </div>
              )}
              <FormularioLote
                cultivos={cultivos}
                cultivoId={cultivoId}
                onCultivo={seleccionarCultivo}
                fases={fases}
                valores={valores}
                onChange={setValores}
                onCalcular={calcular}
                onCalcularYGuardar={calcularYGuardar}
                cargando={calculando}
              />

              {resultado && (
                <Resultados
                  data={resultado}
                  onGuardado={recargarPlanes}
                  onVerSeguimiento={irASeguimiento}
                  autoAbrirDialogo={autoGuardar}
                  onDialogoCerrado={() => setAutoGuardar(false)}
                />
              )}

              <details className="rounded-xl border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer select-none text-sm font-medium text-primary marker:content-none">
                  ¿Tu cultivo no está en el catálogo? Estímalo con IA
                </summary>
                <div className="pt-3">
                  <LaboratorioGnn />
                </div>
              </details>
            </section>

            <section aria-label="Seguimiento" hidden={vista !== 'seguimiento'} className="space-y-4">
              <SectionHeader paso="2" titulo="Sigue tu siembra fase a fase" />
              <Seguimiento planes={planes.map(p => ({ id: p.id, nombre: p.nombre }))} />

              <PlanesGuardados
                planes={planes}
                estado={estadoPlanes}
                onAbrir={abrirPlan}
                onEliminar={eliminarPlanSeguro}
                onNuevo={irAPlanificar}
              />
            </section>

            <section aria-label="Asistente" hidden={vista !== 'asistente'} className="space-y-4">
              <SectionHeader paso="3" titulo="Resuelve dudas con el asistente" />
              <Chat />
            </section>
          </>
        )}
      </main>
      </div>

      <footer className="py-6 text-center text-[11px] text-muted-foreground">
        MVP de demostración · Valores de extracción tomados de literatura científica · Validar con agrónomo antes de uso productivo.
      </footer>
    </div>
  )
}
