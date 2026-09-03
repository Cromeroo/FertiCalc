import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/tabs'
import { useSiembras } from '@/hooks/useSiembras'
import { ListaSiembras } from './seguimiento/ListaSiembras'
import { FormularioSiembra } from './seguimiento/FormularioSiembra'
import { DetalleSiembra } from './seguimiento/DetalleSiembra'
import { AgendaGlobal } from './seguimiento/AgendaGlobal'

type Pestaña = 'lista' | 'calendario' | 'nueva'

export function Seguimiento({ planes }: { planes: Array<{ id: string; nombre: string }> }) {
  const [pestaña, setPestaña] = useState<Pestaña>('lista')
  const {
    siembras, estado, detalle, seleccionada,
    agenda, cargandoAgenda, error, guardando,
    abrir, crear, cambiarEstado, volver, cargarAgenda, limpiarError
  } = useSiembras()

  useEffect(() => {
    if (pestaña === 'calendario') void cargarAgenda()
  }, [pestaña, cargarAgenda])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Seguimiento de siembras</CardTitle>
          <Badge variant="success">nuevo</Badge>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Convierte un plan en calendario vivo: te indica qué aplicación toca y te permite marcar avances.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive" title="No se pudo completar la operación">
            {error}
            <button
              type="button"
              onClick={limpiarError}
              className="ml-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Descartar
            </button>
          </Alert>
        )}

        {detalle ? (
          <DetalleSiembra
            detalle={detalle}
            seleccionada={seleccionada}
            onVolver={volver}
            onCambiar={cambiarEstado}
          />
        ) : (
          <Tabs value={pestaña} onChange={v => setPestaña(v as Pestaña)}>
            <TabList aria-label="Vistas de seguimiento">
              <Tab value="lista">Mis siembras{siembras.length ? ` (${siembras.length})` : ''}</Tab>
              <Tab value="calendario">Calendario</Tab>
              <Tab value="nueva">+ Nueva siembra</Tab>
            </TabList>
            <TabPanel value="lista">
              <ListaSiembras
                siembras={siembras}
                estado={estado}
                onAbrir={abrir}
                onNueva={() => setPestaña('nueva')}
                onReintentar={() => window.location.reload()}
              />
            </TabPanel>
            <TabPanel value="calendario">
              <AgendaGlobal
                agenda={agenda}
                cargando={cargandoAgenda}
                onAbrir={abrir}
              />
            </TabPanel>
            <TabPanel value="nueva">
              <FormularioSiembra
                planes={planes}
                guardando={guardando}
                onCrear={crear}
                onCancelar={() => setPestaña('lista')}
              />
            </TabPanel>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
