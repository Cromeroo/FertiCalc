import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useLaboratorio } from '@/hooks/useLaboratorio'
import { FormularioCultivo } from './laboratorio/FormularioCultivo'
import { ExplicacionPanel } from './laboratorio/ExplicacionPanel'
import { TablaCurva } from './laboratorio/TablaCurva'
import { Resultados } from './Resultados'

export function LaboratorioGnn({ onGuardado, onVerSeguimiento }: {
  onGuardado?: () => void
  onVerSeguimiento?: () => void
}) {
  const lab = useLaboratorio()
  const pred = lab.prediccion

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Cultivos nuevos — curva y plan estimados
          <Badge variant="warning">experimental · IA</Badge>
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Para cultivos <strong className="text-foreground">que no están en el catálogo</strong> (sin curva publicada). Si tu cultivo sí está listado arriba, usa el formulario principal — este laboratorio es solo para cultivos nuevos.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">¿Cómo funciona? No necesitas saber fertilizantes de antemano</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li><strong className="text-foreground">Escribe tu cultivo y elige su familia</strong> — el sistema busca parientes con curvas conocidas.</li>
            <li><strong className="text-foreground">La extracción biológica se sugiere sola</strong> — es cuánto el cultivo <em>extrae</em> por tonelada (no lo que aplicarás). Si tienes análisis propio, ajústala.</li>
            <li>La IA predice <em>cuándo</em> lo absorbe y el motor calcula <strong className="text-foreground">cuánto fertilizante aplicar por fase</strong>.</li>
          </ol>
        </div>

        <FormularioCultivo
          familias={lab.familias}
          nombreCultivo={lab.nombreCultivo}
          onNombre={lab.setNombreCultivo}
          familia={lab.familia}
          onFamilia={lab.cambiarFamilia}
          ext={lab.ext}
          onExt={lab.cambiarExtraccion}
          fuenteValores={lab.fuenteValores}
          rendimiento={lab.rendimiento}
          onRendimiento={lab.setRendimiento}
          fases={lab.fases}
          onFases={lab.setFases}
          cargando={lab.cargando}
          onSubmit={lab.predecir}
        />

        {lab.error && <Alert variant="destructive">{lab.error}</Alert>}

        {pred && lab.resultado && (
          <div className="space-y-4">
            {pred.explicacion && (
              <ExplicacionPanel explicacion={pred.explicacion} mae={lab.mae} />
            )}
            <TablaCurva curva={pred.curva_predicha} />
            <Resultados data={lab.resultado.plan} onGuardado={onGuardado} onVerSeguimiento={onVerSeguimiento} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
