import { Button } from '@/components/ui/button'
import { DecimalInput } from '@/components/ui/decimal'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  familias: readonly string[]
  nombreCultivo: string
  onNombre: (v: string) => void
  familia: string
  onFamilia: (v: string) => void
  ext: { N: string; P: string; K: string }
  onExt: (campo: 'N' | 'P' | 'K', v: string) => void
  fuenteValores: string
  rendimiento: string
  onRendimiento: (v: string) => void
  fases: number
  onFases: (v: number) => void
  cargando: boolean
  onSubmit: (e: React.FormEvent) => void
}

const CAMPOS = [
  { campo: 'N', etiqueta: 'N extraído (kg/t)', aria: 'Extracción de nitrógeno kg/t' },
  { campo: 'P', etiqueta: 'P₂O₅ extraído (kg/t)', aria: 'Extracción de fósforo kg/t' },
  { campo: 'K', etiqueta: 'K₂O extraído (kg/t)', aria: 'Extracción de potasio kg/t' }
] as const

export function FormularioCultivo(props: Props) {
  const { familias, cargando, onSubmit } = props
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[180px]">
          <Label htmlFor="gnn-nombre">1. Nombre de tu cultivo (opcional)</Label>
          <Input
            id="gnn-nombre"
            placeholder="ej: cocona, lulo, quinua"
            value={props.nombreCultivo}
            onChange={e => props.onNombre(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Label htmlFor="gnn-familia">Familia botánica *</Label>
          <Select id="gnn-familia" value={props.familia} onChange={e => props.onFamilia(e.target.value)}>
            {familias.map(f => <option key={f} value={f}>{f}</option>)}
          </Select>
          <p className="mt-1 text-[10px] text-muted-foreground">Define a qué parientes del grafo se conecta</p>
        </div>
      </div>

      <div>
        <Label>2. Extracción biológica del cultivo — <span className="font-normal">se sugiere automáticamente al elegir familia</span></Label>
        <p className="mb-1.5 text-[10px] text-muted-foreground">No es fertilizante. Es cuánto la planta extrae por tonelada cosechada. El laboratorio calculará el fertilizante por ti.</p>
        <div className="flex flex-wrap items-end gap-2">
          {CAMPOS.map(({ campo, etiqueta, aria }) => (
            <div key={campo} className="w-28">
              <DecimalInput
                id={`gnn-${campo.toLowerCase()}`}
                min={0.01}
                value={props.ext[campo]}
                ariaLabel={aria}
                onChange={v => props.onExt(campo, v)}
                required
              />
              <p className="mt-1 text-[10px] text-muted-foreground">{etiqueta}</p>
            </div>
          ))}
        </div>
        {props.fuenteValores && (
          <p className="mt-2 rounded bg-primary/10 px-2 py-1 text-[10px] text-primary">{props.fuenteValores}</p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <Label htmlFor="gnn-rend">3. Rendimiento esperado (t/ha)</Label>
          <DecimalInput
            id="gnn-rend"
            min={0.1}
            value={props.rendimiento}
            ariaLabel="Rendimiento esperado en toneladas por hectárea"
            onChange={props.onRendimiento}
            required
          />
        </div>
        <div className="w-28">
          <Label htmlFor="gnn-fases">Fases del ciclo</Label>
          <Select id="gnn-fases" value={props.fases} onChange={e => props.onFases(Number(e.target.value))}>
            {[2, 3, 4, 5, 6].map(f => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
        <Button type="submit" variant="secondary" disabled={cargando}>
          {cargando ? 'Calculando…' : 'Predecir curva y generar plan'}
        </Button>
      </div>
    </form>
  )
}
