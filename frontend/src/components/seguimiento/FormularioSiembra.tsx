import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { DecimalInput } from '@/components/ui/decimal'
import { Label } from '@/components/ui/label'
import { parseDecimal } from '@/lib/utils'
import type { NuevaSiembra } from '@/hooks/useSiembras'

const FAMILIAS = ['solanaceae', 'poaceae', 'cucurbitaceae', 'rosaceae', 'asteraceae']

interface Props {
  planes: Array<{ id: string; nombre: string }>
  guardando: boolean
  onCrear: (datos: NuevaSiembra) => Promise<void>
  onCancelar: () => void
}

export function FormularioSiembra({ planes, guardando, onCrear, onCancelar }: Props) {
  const [planId, setPlanId] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [dias, setDias] = useState('')
  const [familia, setFamilia] = useState('')
  const [especie, setEspecie] = useState('')
  const [errorLocal, setErrorLocal] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!planId) {
      setErrorLocal('Elige un plan guardado para sembrar.')
      return
    }
    const diasNum = dias.trim() === '' ? undefined : parseDecimal(dias)
    if (diasNum !== undefined && (diasNum === null || diasNum < 1)) {
      setErrorLocal('Los días por fase deben ser un número mayor o igual a 1, o déjalo vacío para cálculo automático.')
      return
    }
    setErrorLocal('')
    await onCrear({
      planId,
      fecha,
      dias: diasNum ?? undefined,
      familia: familia.trim().toLowerCase(),
      especie: especie.trim()
    })
  }

  return (
    <form onSubmit={enviar} className="space-y-3" noValidate>
      <div>
        <Label htmlFor="seg-plan">¿Qué plan vas a sembrar?</Label>
        <Select id="seg-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
          <option value="">Elige un plan guardado…</option>
          {planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        {planes.length === 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Aún no tienes planes. Calcula uno arriba y pulsa «Guardar plan».
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        <div>
          <Label htmlFor="seg-fecha">Fecha de siembra</Label>
          <Input id="seg-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="seg-especie">Especie / variedad <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input id="seg-especie" placeholder="ej: tomate chonto" value={especie} onChange={e => setEspecie(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="seg-familia">Familia <span className="font-normal text-muted-foreground">(se hereda del plan)</span></Label>
          <Select id="seg-familia" value={familia} onChange={e => setFamilia(e.target.value)}>
            <option value="">Del plan</option>
            {FAMILIAS.map(f => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="seg-dias">Días por fase <span className="font-normal text-muted-foreground">(auto según familia)</span></Label>
          <DecimalInput id="seg-dias" min={1} max={365} placeholder="automático"
            ariaLabel="Días estimados por fase, opcional"
            value={dias} onChange={setDias} />
        </div>
      </div>
      {errorLocal && <p role="alert" className="text-[11px] text-destructive">{errorLocal}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!planId || guardando}>
          {guardando ? 'Creando…' : 'Crear calendario de aplicaciones'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  )
}
