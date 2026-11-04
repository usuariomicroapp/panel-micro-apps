import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'
import { buildMessage } from '../pages/Invite'
import Icon from './Icon'

// Mensaje y enlace para invitar participantes, con el texto que eligió el organizador.
export function useInviteMessage() {
  const { name: brand } = useBrand()
  const [row, setRow] = useState<{ group_link: string; install_link: string; share_message: string } | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.from('settings').select('group_link, install_link, share_message').eq('id', 1).maybeSingle()
      .then(({ data }) => setRow((data as typeof row) ?? { group_link: '', install_link: '', share_message: '' }))
  }, [])
  const link = row?.install_link || `${window.location.origin}/`
  return { link, message: buildMessage(row?.share_message ?? '', brand, row?.group_link ?? '', link) }
}

// Caja para compartir un enlace: botón grande, WhatsApp y copiar.
export default function ShareBox({ title, text, message, link, button = 'Compartir link' }: { title: string; text: string; message: string; link: string; button?: string }) {
  const [copied, setCopied] = useState(false)
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
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/15 text-[#f6e0a4]"><Icon name="share" /></span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <p className="mt-1 text-sm text-[#aab3d6]">{text}</p>
        </div>
      </div>
      <p className="mt-4 break-all rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-[#f6e0a4]">{link}</p>
      <button onClick={share} className="btn-gold mt-4 w-full rounded-2xl py-3.5 text-lg font-extrabold">{button}</button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="btn-green rounded-2xl py-3 text-center font-bold">WhatsApp</a>
        <button onClick={copy} className="rounded-2xl border border-white/15 bg-white/5 py-3 font-bold text-white">{copied ? '¡Copiado!' : 'Copiar mensaje'}</button>
      </div>
    </section>
  )
}
