# Convenciones de Frontend (FertiCalc)

> La guía principal es [`../SKILL.md`](../SKILL.md) (frontend-production-shadcn).
> Este documento solo agrega reglas específicas del proyecto.

## Stack

- React 18 + TypeScript (strict) + Vite
- Tailwind CSS v4 (`@tailwindcss/vite`), tokens en `@theme` dentro de `src/index.css`
- Componentes `ui/` estilo shadcn escritos localmente (sin Radix por ahora); si se necesita un primitivo accesible complejo, proponer migrar ese componente a shadcn/ui real

## Estructura

```
src/
├── components/
│   ├── ui/            # primitivos reutilizables: button, input, label, card (+Table),
│   │                  # badge, skeleton, alert, decimal, tabs, progress,
│   │                  # empty-state (EmptyState/ErrorState/LoadingList), section
│   │                  # (SectionHeader/Stat/FieldHint), calendar (CalendarioMes)
│   ├── seguimiento/   # feature Seguimiento: container + ListaSiembras +
│   │                  # FormularioSiembra + DetalleSiembra + LineaTiempo +
│   │                  # CalendarioSiembra + AgendaGlobal
│   └── laboratorio/   # feature Laboratorio: container + FormularioCultivo +
│                      # ExplicacionPanel + TablaCurva
├── hooks/             # useSiembras, usePlanes, useLaboratorio (estado + API)
├── lib/               # api.ts (único fetch), utils.ts (cx, fmt, parseDecimal)
└── App.tsx            # shell: header, nav, secciones, footer (sin lógica de negocio)
```

Reglas de componentización:

- Ningún componente de feature supera ~150 líneas; si crece, partir en subcomponentes por responsabilidad.
- La lógica de datos vive en `hooks/`; los componentes reciben props y renderizan.
- Los contenedores (`Seguimiento`, `LaboratorioGnn`, `App`) solo orquestan hooks + layout.
- Nuevos patrones visuales van primero a `ui/` como primitivos reutilizables.

## Reglas específicas del dominio

1. **Colores de nutrientes fijos**: N → `text-nutrient-n`, P → `text-nutrient-p`, K → `text-nutrient-k`. Nunca otros colores para nutrientes.
2. **El front no calcula**: todos los números vienen del backend; aquí solo se formatean con `fmtNum` (`es-MX`).
3. **La evidencia es el producto**: el árbol de evidencia y las referencias siempre visibles vía `<details>` abiertos.
4. **Copy en español**, tono técnico sobrio. Sin marketing.
5. **`api.ts` es el único punto de fetch**, con interfaces tipadas que espejan los schemas Pydantic del backend.
6. Badges de fuentes líquidas de fertirriego usan variante `info`; avisos de antagonismo usan `Alert variant="warning"` con la cita incluida.

## Estados obligatorios (checklist PR)

- Carga inicial: skeletons con forma estable
- Submit: botón deshabilitado + texto de progreso
- Error de red: banner `Alert destructive` arriba, no rompe la app
- Lista vacía (planes): mensaje + acción sugerida
- Focus-visible con ring en todos los controles
- Mobile `<640px`: grids a una columna, tabla con scroll horizontal

## Verificación

```bash
npm run build   # corre tsc --noEmit + vite build
```
