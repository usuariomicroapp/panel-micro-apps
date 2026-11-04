import { useState } from 'react'
import { useBrand, orgLink } from '../lib/brand'
import { buildMessage } from '../pages/Invite'
import Icon from './Icon'

// Mensaje y enlace para invitar participantes, con el texto y el link del organizador.
export function useInviteMessage() {
  const b = useBrand()
  const link = orgLink(b)
  return { link, message: buildMessage(b.shareMessage, b.name, b.groupLink, link) }
}

// Caja para compartir un enlace: botón grande, WhatsApp y copiar.
export default function ShareBox({ title, text, message, link, button = 'Compartir link', collapsible = false, extra }: { title: string; text: string; message: string; link: string; button?: string; collapsible?: boolean; extra?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(!collapsible)
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { /* sin portapapeles */ }
  }
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: message }) } catch { /* la persona cerró el menú */ }
    } else window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
  }
  return (
    <section className="navycard rounded-3xl p-5 md:p-6">
      <button type="button" disabled={!collapsible} onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/15 text-[#f6e0a4]"><Icon name="share" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-extrabold">{title}</span>
          <span className="mt-1 block text-sm text-[#aab3d6]">{open ? text : 'Tocá para ver el link'}</span>
        </span>
        {collapsible && <svg viewBox="0 0 24 24" aria-hidden="true" className={`mt-2 h-6 w-6 shrink-0 text-[#f6e0a4] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>}
      </button>
      {open && <>
      <p className="mt-4 break-all rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-[#f6e0a4]">{link}</p>
      <button onClick={share} className="btn-gold mt-4 w-full rounded-2xl py-3.5 text-lg font-extrabold">{button}</button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="btn-green rounded-2xl py-3 text-center font-bold">WhatsApp</a>
        <button onClick={copy} className="rounded-2xl border border-white/15 bg-white/5 py-3 font-bold text-white">{copied ? '¡Copiado!' : 'Copiar mensaje'}</button>
      </div>
      {extra}
      </>}
    </section>
  )
}
