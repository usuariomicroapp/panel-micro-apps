import type { ReactNode } from 'react'

export const inputCls = 'mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-brand-500 disabled:bg-canvas'
export const primaryCls = 'rounded-2xl bg-brand-600 px-5 py-3 font-bold text-white active:scale-[.99] disabled:cursor-not-allowed disabled:bg-brand-600/40'
export const ghostCls = 'rounded-2xl border border-line px-5 py-3 font-semibold text-muted hover:text-ink'

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
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
