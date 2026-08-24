import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtFecha, fmtNum } from '@/lib/utils'
import type { PlanResumen } from '@/lib/api'

interface Props {
  planes: PlanResumen[]
  estado: 'cargando' | 'listo' | 'error'
  onAbrir: (id: string) => void
  onEliminar: (id: string) => void
}

export function PlanesGuardados({ planes, estado, onAbrir, onEliminar }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planes guardados</CardTitle>
      </CardHeader>
      <CardContent>
        {estado === 'cargando' && <Skeleton className="h-10 w-full" />}

        {estado === 'listo' && planes.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            Aún no hay planes guardados. Calcula un plan y pulsa «Guardar plan».
          </p>
        )}

        {estado === 'listo' && planes.length > 0 && (
          <ul className="divide-y divide-border">
            {planes.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                    {p.cultivo_nombre ?? p.cultivo_id} · {fmtNum(p.rendimiento_t_ha)} t/ha · {fmtFecha(p.fecha)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => onAbrir(p.id)}>Ver</Button>
                  <Button variant="destructive" size="sm" aria-label={`Eliminar ${p.nombre}`} onClick={() => onEliminar(p.id)}>
                    Eliminar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {estado === 'error' && (
          <p className="text-xs text-destructive">No se pudieron cargar los planes.</p>
        )}
      </CardContent>
    </Card>
  )
}
