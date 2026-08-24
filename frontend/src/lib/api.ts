import type { Nutriente } from '@/lib/utils'

export interface CultivoResumen {
  id: string
  nombre: string
  unidad_rendimiento: string
  fases: number
}

export interface Fase {
  orden: number
  nombre: string
  bbch_inicio: string
  bbch_fin: string
  descripcion?: string
  curva_pct_acumulada: Record<Nutriente, number>
  referencia_curva: string
}

export interface FuenteAplicacion {
  fuente_id: string
  nombre: string
  kg_ha: number
  aporta: Record<string, number>
}

export interface RecomendacionFase {
  orden: number
  nombre: string
  bbch: string
  dosis_nutriente_kg_ha: Record<string, number>
  fuentes_sugeridas: FuenteAplicacion[]
  referencia_curva: string
}

export interface PasoEvidencia {
  paso: string
  formula: string
  valores: Record<string, unknown>
  resultado: Record<string, unknown>
  referencia?: string
}

export interface Referencia {
  id: string
  autores: string
  anio: number | string
  titulo: string
  fuente: string
}

export interface Recomendacion {
  cultivo_id: string
  cultivo_nombre: string
  rendimiento_t_ha: number
  demanda_total_kg_ha: Record<string, number>
  aporte_suelo_kg_ha: Record<string, number>
  requerimiento_neto_kg_ha: Record<string, number>
  dosis_fertilizante_kg_ha: Record<string, number>
  fases: RecomendacionFase[]
  evidencia: PasoEvidencia[]
  advertencias: string[]
  referencias?: Record<string, Referencia>
}

export interface PlanResumen {
  id: string
  nombre: string
  cultivo_id: string
  cultivo_nombre?: string | null
  rendimiento_t_ha: number
  fecha: string
}

export interface SolicitudRecomendacion {
  cultivo_id: string
  rendimiento_t_ha: number
  analisis_suelo: {
    n_disponible_kg_ha: number
    p2o5_disponible_kg_ha: number
    k2o_disponible_kg_ha: number
  }
  eficiencias: Record<Nutriente, number>
  fase_desde_orden: number | null
}

async function pedir<T>(url: string): Promise<T> {
  const r = await fetch(url)
  const data = await r.json()
  if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Error en ${url}`)
  return data as T
}

export async function health(): Promise<string> {
  const d = await pedir<{ modo_conocimiento: string }>('/health')
  return d.modo_conocimiento
}

export function listarCultivos(): Promise<CultivoResumen[]> {
  return pedir<CultivoResumen[]>('/api/cultivos')
}

export function obtenerCultivo(id: string): Promise<{ cultivo: { fases: Fase[] }; referencias: Record<string, Referencia> }> {
  return pedir(`/api/cultivos/${id}`)
}

export async function calcularRecomendacion(solicitud: SolicitudRecomendacion): Promise<Recomendacion> {
  const r = await fetch('/api/recomendacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(solicitud)
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.detail ?? 'No se pudo calcular la recomendación')
  return data as Recomendacion
}

export function listarPlanes(): Promise<PlanResumen[]> {
  return pedir<PlanResumen[]>('/api/planes')
}

export function abrirPlan(id: string): Promise<{ recomendacion: Recomendacion }> {
  return pedir(`/api/planes/${id}`)
}

export async function guardarPlan(nombre: string, recomendacion: Recomendacion): Promise<string> {
  const r = await fetch('/api/planes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, recomendacion })
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.detail ?? 'No se pudo guardar el plan')
  return data.id as string
}

export async function eliminarPlan(id: string): Promise<void> {
  const r = await fetch(`/api/planes/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error('No se pudo eliminar el plan')
}

export interface ChatMensaje {
  role: 'user' | 'model'
  content: string
}

export interface ChatRespuesta {
  respuesta: string
  pasos: string[]
  recomendacion: Recomendacion | null
}

export async function enviarChat(mensaje: string, historial: ChatMensaje[]): Promise<ChatRespuesta> {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mensaje,
      historial: historial.map(m => ({ role: m.role, content: m.content }))
    })
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.detail ?? 'El asistente no está disponible')
  return data as ChatRespuesta
}

export async function enviarFeedback(rating: number, comentario = '', origen = 'chat'): Promise<number> {
  const r = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, comentario, origen })
  })
  const data = await r.json()
  if (!r.ok) throw new Error('No se pudo registrar el feedback')
  return data.id as number
}

export interface CurvaPredicha {
  orden: number
  nombre: string
  bbch: string
  pct_acumulado: Record<string, number>
}

export interface RespuestaGnn {
  extraccion_entrada_kg_t: Record<string, number>
  num_fases: number
  curva_predicha: CurvaPredicha[]
  modelo: { arquitectura?: string; entrenado_en?: string; metricas_loo_mae_puntos?: number }
  advertencia: string
}

export interface EstadoGnn {
  entrenado: boolean
  arquitectura?: string
  entrenado_en?: string
  metricas_loo?: { mae_global: number; por_cultivo: Record<string, { mae_puntos: number }> }
}

export async function estadoGnn(): Promise<EstadoGnn> {
  return pedir('/api/gnn/estado')
}

export async function predecirCurvaGnn(
  extraccion_por_t: Record<string, number>,
  num_fases = 4,
  familia?: string
): Promise<RespuestaGnn> {
  const r = await fetch('/api/gnn/predecir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraccion_por_t, num_fases, familia: familia || null })
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.detail ?? 'No se pudo predecir')
  return data as RespuestaGnn
}
