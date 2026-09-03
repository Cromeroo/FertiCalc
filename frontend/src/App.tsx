import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import type { SolicitudRecomendacion } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { NUTRIENTES, parseDecimal } from '@/lib/utils'
import { FormularioLote, type ValoresFormulario } from '@/components/FormularioLote'
import { Resultados } from '@/components/Resultados'
import { PlanesGuardados } from '@/components/PlanesGuardados'
import { Chat } from '@/components/Chat'
import { LaboratorioGnn } from '@/components/LaboratorioGnn'
import { Seguimiento } from '@/components/Seguimiento'
import type { Fase, PlanResumen, Recomendacion } from '@/lib/api'

const VALORES_INICIALES: ValoresFormulario = {
  rendimiento: '40',
  suelo: { n: '0', p: '0', k: '0' },
  eficiencias: { N: '0.6', P: '0.25', K: '0.5' },
  faseDesde: ''
}

export default function App() {
  const [cultivos, setCultivos] = useState<api.CultivoResumen[]>([])
  const [cultivoId, setCultivoId] = useState('')
  const [fases, setFases] = useState<Fase[]>([])
  const [valores, setValores] = useState<ValoresFormulario>(VALORES_INICIALES)
  const [resultado, setResultado] = useState<Recomendacion | null>(null)
  const [errorGlobal, setErrorGlobal] = useState('')
  const [calculando, setCalculando] = useState(false)
  const [modo, setModo] = useState('')
  const [planes, setPlanes] = useState<PlanResumen[]>([])
  const [estadoPlanes, setEstadoPlanes] = useState<'cargando' | 'listo' | 'error'>('cargando')

  useEffect(() => {
    api.health().then(setModo).catch(() => {})
    api
      .listarCultivos()
      .then(data => {
        setCultivos(data)
        if (data.length) seleccionarCultivo(data[0].id)
      })
      .catch(() => setErrorGlobal('No se pudo conectar con la API. Verifica que el backend esté corriendo.'))
    recargarPlanes()
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
    const problema = validarValores()
    if (problema) {
      setResultado(null)
      setErrorGlobal(problema)
      return
    }
    setCalculando(true)
    setErrorGlobal('')
    try {
      setResultado(await api.calcularRecomendacion(construirSolicitud()))
    } catch (err) {
      setResultado(null)
      setErrorGlobal(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setCalculando(false)
    }
  }

  function recargarPlanes() {
    setEstadoPlanes('cargando')
    api
      .listarPlanes()
      .then(p => {
        setPlanes(p)
        setEstadoPlanes('listo')
      })
      .catch(() => setEstadoPlanes('error'))
  }

  async function abrirPlan(id: string) {
    try {
      const plan = await api.abrirPlan(id)
      setResultado(plan.recomendacion)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setErrorGlobal('No se pudo abrir el plan')
    }
  }

  async function eliminarPlanSeguro(id: string) {
    if (!window.confirm('¿Eliminar este plan?')) return
    try {
      await api.eliminarPlan(id)
      recargarPlanes()
    } catch (e) {
      setErrorGlobal(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-primary">FertiCalc</h1>
          <Badge variant={modo === 'neo4j' ? 'info' : modo === 'json' ? 'success' : 'outline'}>
            {modo === 'neo4j' ? 'grafo Neo4j' : modo === 'json' ? 'semilla JSON' : 'conectando…'}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Planifica por cultivo · Sigue tu siembra por fase · Resuelve dudas con el asistente
        </p>
        <nav aria-label="Secciones" className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <a href="#planificar" className="rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary">1 · Planificar</a>
          <span className="self-center text-muted-foreground">→</span>
          <a href="#seguimiento" className="rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary">2 · Seguimiento</a>
          <span className="self-center text-muted-foreground">→</span>
          <a href="#asistente" className="rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary">3 · Asistente</a>
        </nav>
      </header>

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
            <section id="planificar" className="scroll-mt-4 space-y-4">
              <h2 className="text-sm font-semibold">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>
                Planifica tu fertilización
              </h2>
              <FormularioLote
                cultivos={cultivos}
                cultivoId={cultivoId}
                onCultivo={seleccionarCultivo}
                fases={fases}
                valores={valores}
                onChange={setValores}
                onCalcular={calcular}
                cargando={calculando}
              />

              {resultado && <Resultados data={resultado} onGuardado={recargarPlanes} />}

              <details className="rounded-xl border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer select-none text-sm font-medium text-primary marker:content-none">
                  ¿Tu cultivo no está en el catálogo? Estímalo con IA
                </summary>
                <div className="pt-3">
                  <LaboratorioGnn />
                </div>
              </details>
            </section>

            <section id="seguimiento" className="scroll-mt-4 space-y-4">
              <h2 className="text-sm font-semibold">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
                Sigue tu siembra fase a fase
              </h2>
              <Seguimiento planes={planes.map(p => ({ id: p.id, nombre: p.nombre }))} />

              <PlanesGuardados planes={planes} estado={estadoPlanes} onAbrir={abrirPlan} onEliminar={eliminarPlanSeguro} />
            </section>

            <section id="asistente" className="scroll-mt-4 space-y-4">
              <h2 className="text-sm font-semibold">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>
                Resuelve dudas con el asistente
              </h2>
              <Chat />
            </section>
          </>
        )}
      </main>

      <footer className="py-6 text-center text-[11px] text-muted-foreground">
        MVP de demostración · Valores de extracción tomados de literatura científica · Validar con agrónomo antes de uso productivo.
      </footer>
    </div>
  )
}
