import type { ReactNode } from 'react'

export const inputCls = 'mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none shadow-[inset_0_1px_2px_#0c12220d] focus:border-gold focus:ring-4 focus:ring-gold/20 disabled:bg-canvas'
export const primaryCls = 'rounded-2xl btn-gold px-5 py-3 font-extrabold'
export const ghostCls = 'card rounded-2xl px-5 py-3 font-bold text-ink'

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
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
