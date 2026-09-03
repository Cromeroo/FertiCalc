import { useCallback, useEffect, useState } from 'react'
import * as api from '@/lib/api'
import type { EstadoSiembra, SiembraResumen } from '@/lib/api'
import type { EventoCalendario } from '@/components/ui/calendar'

export type EstadoCarga = 'cargando' | 'listo' | 'error'

export interface NuevaSiembra {
  planId: string
  fecha: string
  dias?: number
  familia: string
  especie: string
}

export function useSiembras() {
  const [siembras, setSiembras] = useState<SiembraResumen[]>([])
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [detalle, setDetalle] = useState<EstadoSiembra | null>(null)
  const [seleccionada, setSeleccionada] = useState<SiembraResumen | null>(null)
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null)
  const [cargandoAgenda, setCargandoAgenda] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const recargar = useCallback(async () => {
    setEstado('cargando')
    try {
      const s = await api.listarSiembras()
      setSiembras(s)
      setEstado('listo')
    } catch {
      setEstado('error')
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  async function abrir(id: string) {
    try {
      const [d, lista] = await Promise.all([api.estadoSiembra(id), api.listarSiembras()])
      setSiembras(lista)
      setEstado('listo')
      setDetalle(d)
      setSeleccionada(lista.find(x => x.id === id) ?? null)
      setAgenda(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la siembra')
    }
  }

  async function crear(datos: NuevaSiembra): Promise<void> {
    setError('')
    setGuardando(true)
    try {
      const res = await api.crearSiembra(
        datos.planId,
        datos.fecha,
        datos.dias,
        datos.familia.trim().toLowerCase(),
        datos.especie.trim()
      )
      await abrir(res.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la siembra')
      throw err
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

  function volver() {
    setSeleccionada(null)
    setDetalle(null)
  }

  async function cargarAgenda() {
    if (agenda !== null || cargandoAgenda) return
    setCargandoAgenda(true)
    try {
      const lista = siembras.length ? siembras : await api.listarSiembras()
      if (!siembras.length) {
        setSiembras(lista)
        setEstado('listo')
      }
      const detalles = await Promise.all(lista.map(s => api.estadoSiembra(s.id)))
      const items: AgendaItem[] = []
      for (let i = 0; i < lista.length; i++) {
        for (const f of detalles[i].calendario) {
          items.push({
            key: `${lista[i].id}-${f.orden}`,
            fecha: f.fecha_estimada.slice(0, 10),
            titulo: `F${f.orden} · ${f.nombre_fase}`,
            estado: f.estado as AgendaItem['estado'],
            siembraId: lista[i].id,
            planNombre: detalles[i].plan_nombre
          })
        }
      }
      setAgenda(items)
    } catch {
      setAgenda([])
    } finally {
      setCargandoAgenda(false)
    }
  }

  return {
    siembras, estado, detalle, seleccionada, agenda, cargandoAgenda,
    error, guardando,
    recargar, abrir, crear, cambiarEstado, volver, cargarAgenda,
    limpiarError: () => setError('')
  }
}

export interface AgendaItem extends EventoCalendario {
  siembraId: string
  planNombre: string
}
