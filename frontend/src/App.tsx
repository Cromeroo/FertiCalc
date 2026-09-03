import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import type { SolicitudRecomendacion } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
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
    return {
      cultivo_id: cultivoId,
      rendimiento_t_ha: Number(valores.rendimiento),
      analisis_suelo: {
        n_disponible_kg_ha: Number(valores.suelo.n),
        p2o5_disponible_kg_ha: Number(valores.suelo.p),
        k2o_disponible_kg_ha: Number(valores.suelo.k)
      },
      eficiencias: {
        N: Number(valores.eficiencias.N),
        P: Number(valores.eficiencias.P),
        K: Number(valores.eficiencias.K)
      },
      fase_desde_orden: valores.faseDesde ? Number(valores.faseDesde) : null
    }
  }

  async function calcular(e: React.FormEvent) {
    e.preventDefault()
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
          Recomendación de fertilización por fase fenológica · motor determinista con evidencia trazable
        </p>
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

            <Chat />

            <LaboratorioGnn />

            <Seguimiento planes={planes.map(p => ({ id: p.id, nombre: p.nombre }))} />

            <PlanesGuardados planes={planes} estado={estadoPlanes} onAbrir={abrirPlan} onEliminar={eliminarPlanSeguro} />
          </>
        )}
      </main>

      <footer className="py-6 text-center text-[11px] text-muted-foreground">
        MVP de demostración · Valores de extracción tomados de literatura científica · Validar con agrónomo antes de uso productivo.
      </footer>
    </div>
  )
}
