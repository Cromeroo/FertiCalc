export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export const NUTRIENTES = ['N', 'P', 'K'] as const
export type Nutriente = (typeof NUTRIENTES)[number]

export const NOMBRE_NUTRIENTE: Record<Nutriente, string> = {
  N: 'Nitrógeno (N)',
  P: 'Fósforo (P₂O₅)',
  K: 'Potasio (K₂O)'
}

const fmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })

export function fmtNum(x: number | string): string {
  const n = Number(x)
  return Number.isFinite(n) ? fmt.format(n) : '—'
}

export function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}
