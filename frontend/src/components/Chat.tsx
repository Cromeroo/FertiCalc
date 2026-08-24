import { useRef, useState } from 'react'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Markdown } from './Markdown'
import type { ChatMensaje, ChatRespuesta } from '@/lib/api'

interface MensajeUI {
  role: 'user' | 'assistant'
  text: string
  pasos?: string[]
  feedback?: 'si' | 'no'
}

const BIENVENIDA: MensajeUI = {
  role: 'assistant',
  text:
    'Soy el asistente de FertiCalc. Puedo calcular planes de fertilización por fase fenológica y explicarte la evidencia. Ejemplo: «¿Qué le aplico a un tomate de 60 t/ha con suelo que aporta 30-20-40?»'
}

export function Chat() {
  const [mensajes, setMensajes] = useState<MensajeUI[]>([BIENVENIDA])
  const [entrada, setEntrada] = useState('')
  const [cargando, setCargando] = useState(false)
  const historialRef = useRef<ChatMensaje[]>([])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const texto = entrada.trim()
    if (!texto || cargando) return
    setEntrada('')
    setMensajes(m => [...m, { role: 'user', text: texto }])
    setCargando(true)
    try {
      const resp: ChatRespuesta = await api.enviarChat(texto, historialRef.current)
      historialRef.current.push({ role: 'user', content: texto }, { role: 'model', content: resp.respuesta })
      setMensajes(m => [...m, { role: 'assistant', text: resp.respuesta, pasos: resp.pasos }])
    } catch (err) {
      setMensajes(m => [
        ...m,
        { role: 'assistant', text: err instanceof Error ? err.message : 'Error del asistente' }
      ])
    } finally {
      setCargando(false)
    }
  }

  async function calificar(index: number, valor: 'si' | 'no') {
    const msg = mensajes[index]
    if (msg.feedback || !msg.pasos?.length) return
    setMensajes(actual =>
      actual.map((m, i) => (i === index ? { ...m, feedback: valor } : m))
    )
    try {
      await api.enviarFeedback(valor === 'si' ? 1 : -1, msg.text.slice(0, 500), 'chat')
    } catch {
      /* silencioso: el feedback no debe interrumpir */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asistente agronómico</CardTitle>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Las cifras siempre salen del motor determinista vía function calling · el LLM solo interpreta
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1" aria-live="polite">
          {mensajes.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] rounded-lg rounded-br-sm border border-border bg-muted px-3 py-2 text-xs'
                    : 'max-w-[90%] space-y-1.5 rounded-lg rounded-bl-sm border border-border bg-background px-3 py-2 text-xs leading-relaxed'
                }
              >
                <p className="whitespace-pre-wrap">
                  {m.role === 'assistant' ? <Markdown>{m.text}</Markdown> : m.text}
                </p>
                {m.role === 'assistant' && m.pasos && m.pasos.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {m.pasos.map((p, j) => (
                      <Badge key={j} variant="outline">{p}</Badge>
                    ))}
                    {!m.feedback ? (
                      <span className="ml-1 flex gap-1">
                        <button
                          className="rounded border border-border px-1.5 py-0.5 hover:bg-card-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label="Respuesta útil"
                          onClick={() => calificar(i, 'si')}
                        >
                          👍
                        </button>
                        <button
                          className="rounded border border-border px-1.5 py-0.5 hover:bg-card-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label="Respuesta no útil"
                          onClick={() => calificar(i, 'no')}
                        >
                          👎
                        </button>
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">feedback registrado</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {cargando && (
            <div className="flex justify-start">
              <div className="animate-pulse rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                Consultando herramientas…
              </div>
            </div>
          )}
        </div>

        <form onSubmit={enviar} className="flex gap-2">
          <input
            value={entrada}
            onChange={e => setEntrada(e.target.value)}
            placeholder="Pregunta sobre fertilización de un cultivo…"
            aria-label="Mensaje para el asistente"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={cargando || !entrada.trim()}>Enviar</Button>
        </form>
      </CardContent>
    </Card>
  )
}
