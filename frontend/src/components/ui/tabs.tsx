import { createContext, useContext, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '@/lib/utils'

const TabsContext = createContext<{ value: string; onChange: (v: string) => void } | null>(null)

function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tab debe usarse dentro de <Tabs>')
  return ctx
}

interface TabsProps {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  className?: string
}

export function Tabs({ value, onChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cx('flex gap-1 rounded-lg border border-border bg-background p-1 text-xs', className)}
      {...props}
    />
  )
}

interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

export function Tab({ value, className, children, ...props }: TabProps) {
  const { value: active, onChange } = useTabs()
  const selected = active === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onChange(value)}
      className={cx(
        'flex-1 rounded-md px-3 py-1.5 font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string
}

export function TabPanel({ value, className, children, ...props }: TabPanelProps) {
  const { value: active } = useTabs()
  if (active !== value) return null
  return (
    <div role="tabpanel" className={cx('pt-3', className)} {...props}>
      {children}
    </div>
  )
}
