import { useCallback, useEffect, useState } from 'react'
import * as api from '@/lib/api'
import type { PlanResumen } from '@/lib/api'
import type { EstadoCarga } from './useSiembras'

export function usePlanes() {
  const [planes, setPlanes] = useState<PlanResumen[]>([])
  const [estadoPlanes, setEstadoPlanes] = useState<EstadoCarga>('cargando')

  const recargarPlanes = useCallback(async () => {
    setEstadoPlanes('cargando')
    try {
      const p = await api.listarPlanes()
      setPlanes(p)
      setEstadoPlanes('listo')
    } catch {
      setEstadoPlanes('error')
    }
  }, [])

  useEffect(() => {
    void recargarPlanes()
  }, [recargarPlanes])

  async function eliminarPlan(id: string): Promise<void> {
    await api.eliminarPlan(id)
    await recargarPlanes()
  }

  return { planes, estadoPlanes, recargarPlanes, eliminarPlan }
}
