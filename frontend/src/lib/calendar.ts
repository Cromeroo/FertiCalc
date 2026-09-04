import type { FaseCalendario } from './api'

function fechaCompacta(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '')
}

function siguienteDia(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d + 1))
  return fechaCompacta(f.toISOString())
}

export function tituloFase(fase: FaseCalendario, cultivo?: string): string {
  const base = `Fertilizar fase ${fase.orden} · ${fase.nombre_fase}`
  return cultivo ? `${base} (${cultivo})` : base
}

export function detalleFase(fase: FaseCalendario): string {
  const lineas = [
    `BBCH ${fase.bbch} · fecha estimada ${fase.fecha_estimada.slice(0, 10)}`,
    `Dosis: N ${fase.dosis_nutriente_kg_ha.N} · P2O5 ${fase.dosis_nutriente_kg_ha.P} · K2O ${fase.dosis_nutriente_kg_ha.K} kg/ha`,
    ...fase.fuentes_sugeridas.map(s => `- ${s.nombre}: ${s.kg_ha} kg/ha`)
  ]
  return lineas.join('\n')
}

export function googleCalendarUrl(fase: FaseCalendario, cultivo?: string): string {
  const inicio = fechaCompacta(fase.fecha_estimada)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: tituloFase(fase, cultivo),
    dates: `${inicio}/${siguienteDia(fase.fecha_estimada)}`,
    details: `${detalleFase(fase)}\n\nGenerado por FertiCalc — valida con tu agrónomo.`
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function escaparIcs(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function calendarioIcs(
  nombreSiembra: string,
  fases: FaseCalendario[],
  cultivo?: string
): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FertiCalc//Plan fertilizacion//ES',
    'CALSCALE:GREGORIAN'
  ]
  const ahora = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  fases.forEach((f, i) => {
    const inicio = fechaCompacta(f.fecha_estimada)
    lineas.push(
      'BEGIN:VEVENT',
      `UID:ferticalc-${inicio}-f${f.orden}-${i}@local`,
      `DTSTAMP:${ahora}`,
      `DTSTART;VALUE=DATE:${inicio}`,
      `SUMMARY:${escaparIcs(tituloFase(f, cultivo ?? nombreSiembra))}`,
      `DESCRIPTION:${escaparIcs(detalleFase(f))}`,
      'END:VEVENT'
    )
  })
  lineas.push('END:VCALENDAR')
  return lineas.join('\r\n')
}

export function descargarIcs(nombreArchivo: string, contenido: string): void {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo.endsWith('.ics') ? nombreArchivo : `${nombreArchivo}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
