import { useState } from 'react'
import { cx, parseDecimal } from '@/lib/utils'
import { INPUT_CLASS } from './input'

interface Props {
  id: string
  value: string
  onChange: (v: string) => void
  min?: number
  max?: number
  required?: boolean
  placeholder?: string
  ariaLabel?: string
  hint?: string
  className?: string
}

export function DecimalInput({
  id, value, onChange, min, max, required,
  placeholder, ariaLabel, hint, className
}: Props) {
  const [touched, setTouched] = useState(false)
  const n = parseDecimal(value)
  let error = ''
  if (value.trim() === '') {
    if (required) error = 'Este campo es obligatorio.'
  } else if (n === null) {
    error = 'Escribe un número válido (acepta coma o punto, ej. 3,9).'
  } else if (min !== undefined && n < min) {
    error = `Debe ser mayor o igual a ${min}.`
  } else if (max !== undefined && n > max) {
    error = `Debe ser menor o igual a ${max}.`
  }
  const show = touched && error !== ''
  return (
    <div className={className}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={show}
        onChange={e => onChange(e.target.value.replace(/\s/g, ''))}
        onBlur={() => setTouched(true)}
        className={cx(INPUT_CLASS, show && 'border-destructive')}
      />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
      {show && <p role="alert" className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
