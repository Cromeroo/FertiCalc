import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EstadoGcal } from '@/lib/api'

export function VinculoGoogle({ siembraId }: { siembraId?: string }) {
  const [estado, setEstado] = useState<EstadoGcal | null>(null)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    api.gcalEstado().then(setEstado).catch(() => setEstado(null))
  }, [])

  async function vincular() {
    setCargando(true)
    try {
      await api.gcalVincular()
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo iniciar la vinculación')
      setCargando(false)
    }
  }

  async function desvincular() {
    if (!window.confirm('¿Desvincular tu cuenta de Google? Los eventos ya creados quedan en tu calendario.')) return
    setCargando(true)
    try {
      await api.gcalDesvincular()
      setEstado({ configurado: true, vinculado: false, email: '' })
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo desvincular')
    } finally {
      setCargando(false)
    }
  }

  async function sincronizar() {
    if (!siembraId) return
    setCargando(true)
    setMensaje('')
    try {
      const r = await api.gcalSincronizar(siembraId)
      const partes = []
      if (r.creados) partes.push(`${r.creados} creados`)
      if (r.actualizados) partes.push(`${r.actualizados} actualizados`)
      if (r.omitidos) partes.push(`${r.omitidos} omitidos`)
      setMensaje(`Sincronizado con Google Calendar: ${partes.join(' · ') || 'sin cambios'}. Revisa tu calendario.`)
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo sincronizar')
    } finally {
      setCargando(false)
    }
  }

  if (estado && !estado.configurado) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Para sincronizar automáticamente, configura las credenciales de Google (ver docs/GOOGLE_CALENDAR.md).
        Mientras tanto puedes usar el enlace por fase o descargar el .ics.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estado && estado.vinculado ? (
        <>
          <Badge variant="success">Vinculado: {estado.email || 'tu cuenta'}</Badge>
          {siembraId && (
            <Button variant="outline" size="sm" onClick={sincronizar} disabled={cargando}>
              {cargando ? 'Sincronizando…' : 'Sincronizar esta siembra'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={desvincular} disabled={cargando}>
            Desvincular
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={vincular} disabled={cargando}>
          {cargando ? 'Abriendo Google…' : 'Vincular mi Google Calendar'}
        </Button>
      )}
      {mensaje && (
        <span role="status" className="w-full text-[11px] text-muted-foreground">
          {mensaje}
        </span>
      )}
    </div>
  )
}
