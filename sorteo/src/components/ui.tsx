import { useState, type ReactNode } from 'react'

export const inputCls = 'mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none shadow-[inset_0_1px_2px_#0c12220d] focus:border-gold focus:ring-4 focus:ring-gold/20 disabled:bg-canvas'
export const primaryCls = 'rounded-2xl btn-gold px-5 py-3 font-extrabold'
export const ghostCls = 'card rounded-2xl px-5 py-3 font-bold text-ink'

// Con "collapsible" la tarjeta arranca cerrada y se abre al tocar el título.
export function Card({ title, children, action, collapsible, defaultOpen = false, hint }: { title?: string; children: ReactNode; action?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; hint?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  if (collapsible && title) {
    return (
      <section className="card rounded-3xl">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 p-5 text-left md:px-6">
          <span className="min-w-0">
            <span className="block text-xl font-extrabold">{title}</span>
            {hint && !open && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-6 w-6 shrink-0 text-gold-dark transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {open && (
          <div className="px-5 pb-5 md:px-6 md:pb-6">
            {action && <div className="mb-4 flex justify-end">{action}</div>}
            {children}
          </div>
        )}
      </section>
    )
  }
  return (
    <section className="card rounded-3xl p-5 md:p-6">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-xl font-extrabold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
export function Notice({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${kind === 'error' ? 'bg-sold/10 text-sold' : 'bg-free/10 text-free'}`}>
      {children}
    </p>
  )
}
