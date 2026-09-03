import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import { parseDecimal } from '@/lib/utils'
import type { PlanGnnRespuesta, ReferenciaFamilia } from '@/lib/api'

const FAMILIAS = ['solanaceae', 'poaceae', 'cucurbitaceae', 'rosaceae', 'asteraceae'] as const

export function useLaboratorio() {
  const [nombreCultivo, setNombreCultivo] = useState('')
  const [familia, setFamilia] = useState<string>('solanaceae')
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
      .then((ref: ReferenciaFamilia) => {
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

  function cambiarFamilia(f: string) {
    setFamilia(f)
    setEditadoManual(false)
  }

  function cambiarExtraccion(campo: 'N' | 'P' | 'K', valor: string) {
    setExt(prev => ({ ...prev, [campo]: valor }))
    setEditadoManual(true)
  }

  async function predecir(e: React.FormEvent) {
    e.preventDefault()
    const n = parseDecimal(ext.N), p = parseDecimal(ext.P), k = parseDecimal(ext.K)
    const rend = parseDecimal(rendimiento)
    if (n === null || n <= 0 || p === null || p <= 0 || k === null || k <= 0) {
      setError('Revisa la extracción N/P/K: deben ser números mayores a 0 (acepta coma o punto).')
      return
    }
    if (rend === null || rend <= 0) {
      setError('El rendimiento esperado debe ser un número mayor a 0.')
      return
    }
    setCargando(true)
    setError('')
    try {
      setResultado(
        await api.generarPlanGnn({
          extraccion_por_t: { N: n, P: p, K: k },
          rendimiento_t_ha: rend,
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

  return {
    familias: FAMILIAS,
    nombreCultivo, setNombreCultivo,
    familia, cambiarFamilia,
    ext, cambiarExtraccion,
    rendimiento, setRendimiento,
    fases, setFases,
    cargando, error, resultado,
    mae, fuenteValores,
    predecir,
    prediccion: resultado?.prediccion ?? null
  }
}
