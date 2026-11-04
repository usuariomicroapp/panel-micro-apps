import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { myId } from '../../lib/mine'
import { supabase } from '../../lib/supabase'
import { useBrand, orgLink } from '../../lib/brand'
import { Card, Notice, ghostCls, inputCls, primaryCls } from '../../components/ui'
import QuinielaBoard from '../../components/QuinielaBoard'
import { useQuiniela } from '../../lib/quiniela'
import { dateAR, dmy, drawMoment, raffleLabel, slotLabels, slotTimes, unsoldLabels, type DrawSlot, type Raffle } from '../../lib/data'
import { pad, waLink } from '../../lib/format'
import { sendPendingPush } from '../../lib/pwa'

type Row = Raffle & { products: { name: string } | null }
type Preview = { used_prize: string; winning_number: number; name: string; phone: string; from_app: boolean; outcome: string }
type Published = {
  outcome: string; winning_number: number; name: string; phone: string
  label: string; digits: number; raffleTitle: string; when: string; slot: DrawSlot; firstPrize: string
}
type Msg = { kind: 'ok' | 'error'; text: string } | null

const slots = Object.keys(slotTimes) as DrawSlot[]
const waHref = waLink
const explain = (m: string) =>
  /admin_set_draw|admin_preview_winner|admin_publish_result|raffle_no/.test(m) && /does not exist|schema cache|function|column/i.test(m)
    ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).'
    : m
const optionLabel = (r: Row) => raffleLabel(r) + (r.products?.name && r.products.name !== r.name ? ` (premio: ${r.products.name})` : '')
const when = (r: Raffle) => (r.official_draw_date && r.official_draw_slot ? `${dmy(r.official_draw_date)} a las ${slotTimes[r.official_draw_slot]}` : '')

export default function DrawDay() {
  const [raffles, setRaffles] = useState<Row[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('raffles').select('*, products(name)').eq('organizer_id', await myId()).in('status', ['draft', 'active', 'closed']).order('raffle_no')
    if (error) setLoadError(explain(error.message))
    setRaffles((data ?? []) as Row[])
  }, [])
  useEffect(() => { load() }, [load])

  if (!raffles) return <p className="py-10 text-center text-muted">Cargando…</p>
  if (loadError) return <Notice kind="error">{loadError}</Notice>
  if (!raffles.length) return <Card title="Cargar día del sorteo"><p className="text-muted">Primero creá un sorteo.</p><Link to="/admin?tab=sorteos" className={`${primaryCls} mt-3 block text-center`}>Ir a Sorteos</Link></Card>
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <SetDrawCard raffles={raffles} onSaved={load} />
        <Schedule raffles={raffles} />
      </div>
      <ResultCard raffles={raffles} onPublished={load} />
    </div>
  )
}

function SetDrawCard({ raffles, onSaved }: { raffles: Row[]; onSaved: () => void }) {
  const [params] = useSearchParams()
  const asked = raffles.find((r) => r.id === params.get('sorteo'))
  const [raffleId, setRaffleId] = useState(asked?.id ?? raffles.find((r) => r.needs_new_draw || !r.official_draw_date)?.id ?? raffles[0].id)
  const raffle = raffles.find((r) => r.id === raffleId)
  const [date, setDate] = useState(raffle?.official_draw_date ?? '')
  const [slot, setSlot] = useState<DrawSlot>(raffle?.official_draw_slot ?? 'nocturna')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  const pick = (id: string) => {
    setRaffleId(id)
    const r = raffles.find((x) => x.id === id)
    setDate(r?.needs_new_draw ? '' : r?.official_draw_date ?? '')
    setSlot(r?.official_draw_slot ?? 'nocturna')
    setMsg(null)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!date) return setMsg({ kind: 'error', text: 'Elegí el día en el calendario.' })
    if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) return setMsg({ kind: 'error', text: 'Los domingos no hay Quiniela. Elegí otro día.' })
    if (drawMoment(date, slot) <= new Date()) return setMsg({ kind: 'error', text: 'Ese día y horario ya pasaron.' })
    setBusy(true)
    const { error } = await supabase!.rpc('admin_set_draw', { p_raffle: raffleId, p_date: date, p_slot: slot })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: explain(error.message) })
    void sendPendingPush()
    setMsg({ kind: 'ok', text: `Listo: ${raffle ? raffleLabel(raffle) : 'el sorteo'} se sortea el ${dmy(date)} a las ${slotTimes[slot]} con la Quiniela de la Ciudad. Se pueden elegir números hasta esa hora.` })
    onSaved()
  }

  return (
    <Card title="Cargar día del sorteo">
      <form onSubmit={save} className="space-y-4">
        <label className="block text-base font-semibold">¿Qué sorteo?
          <select value={raffleId} onChange={(e) => pick(e.target.value)} className={inputCls}>
            {raffles.map((r) => <option key={r.id} value={r.id}>{optionLabel(r)}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-base font-semibold">Día
            <input type="date" value={date} min={dateAR()} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
          </label>
          <label className="block text-base font-semibold">Hora
            <select value={slot} onChange={(e) => setSlot(e.target.value as DrawSlot)} className={inputCls}>
              {slots.map((s) => <option key={s} value={s}>{slotTimes[s]} · {slotLabels[s].split(' ·')[0]}</option>)}
            </select>
          </label>
        </div>
        <p className="text-sm text-muted">Las horas son las de la Quiniela de la Ciudad (de lunes a sábado). Gana el número que coincide con las últimas cifras del 1.er premio.</p>
        {raffle && raffle.official_draw_date && !raffle.needs_new_draw && <p className="text-sm text-muted">Ahora está para el {when(raffle)}. Si lo cambiás, avisamos a quienes ya eligieron números.</p>}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button disabled={busy} className={`${primaryCls} w-full`}>{busy ? 'Guardando…' : 'Guardar día del sorteo'}</button>
      </form>
    </Card>
  )
}

function Schedule({ raffles }: { raffles: Row[] }) {
  return (
    <Card title="Tus sorteos">
      <ul className="divide-y divide-line">
        {raffles.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="font-semibold">{raffleLabel(r)}</span>
            {r.needs_new_draw
              ? <span className="rounded-full bg-sold/10 px-3 py-1 text-sm font-bold text-sold">Cargá el nuevo día</span>
              : r.official_draw_date
                ? <span className="text-base tabular-nums">{when(r)}</span>
                : <span className="text-sm text-muted">Sin día cargado</span>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ResultCard({ raffles, onPublished }: { raffles: Row[]; onPublished: () => void }) {
  const today = dateAR()
  // Sorteos con día cargado que se hacen hoy o ya pasaron.
  const due = useMemo(() => raffles.filter((r) => r.status === 'active' && !r.needs_new_draw && r.official_draw_date && r.official_draw_date <= today), [raffles, today])
  const [raffleId, setRaffleId] = useState('')
  const raffle = due.find((r) => r.id === raffleId) ?? due[0]
  const live = useQuiniela(raffle?.official_draw_date ?? null, raffle?.official_draw_slot ?? null, !!raffle)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [published, setPublished] = useState<Published | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const needsSecond = raffle?.unsold_policy === 'segundo_premio'

  // Cuando la fuente oficial ya tiene el número, se completa solo (el organizador lo confirma).
  useEffect(() => { if (live?.numeros[0]) setFirst((v) => v || live.numeros[0]!) }, [live?.numeros])
  useEffect(() => { if (needsSecond && live?.numeros[1]) setSecond((v) => v || live.numeros[1]!) }, [live?.numeros, needsSecond])
  useEffect(() => { setFirst(''); setSecond(''); setPreview(null); setMsg(null) }, [raffle?.id])

  if (published) {
    const num = pad(published.winning_number, published.digits)
    const text = `¡Hola ${published.name.split(' ')[0]}! Salió tu número ${num} en la Quiniela de la Ciudad: ganaste ${published.label}. Comunicate conmigo para coordinar la entrega.`
    return (
      <Card title="Resultado publicado">
        {published.outcome === 'ganador' ? (
          <div className="space-y-4">
            <p className="text-lg">Ganó <b>{published.name}</b> con el número <b>{num}</b>. Ya le apareció el aviso en la app{published.phone ? ' y podés escribirle ahora:' : '.'}</p>
            {published.phone && (
              <div className="flex flex-wrap gap-3">
                <a href={waHref(published.phone, text)} target="_blank" rel="noreferrer" className="rounded-2xl bg-free px-5 py-3 font-bold text-white">Avisarle por WhatsApp</a>
                <a href={`tel:${published.phone.replace(/[^\d+]/g, '')}`} className={ghostCls}>Llamar al {published.phone}</a>
              </div>
            )}
          </div>
        ) : published.outcome === 'siguiente_sorteo' ? (
          <p className="text-lg">Salió el {num} y nadie lo tenía. El sorteo sigue: cargá el nuevo día en "Cargar día del sorteo".</p>
        ) : (
          <p className="text-lg">Salió el {num} y nadie lo tenía: el sorteo quedó desierto.</p>
        )}
        <ShareResult result={published} />
        <button onClick={() => setPublished(null)} className={`${ghostCls} mt-5`}>Listo</button>
      </Card>
    )
  }

  if (!raffle) {
    return (
      <Card title="Resultado y ganador">
        <p className="text-base text-muted">Cuando llegue el día de un sorteo, acá vas a ver la Quiniela en vivo y vas a confirmar al ganador.</p>
      </Card>
    )
  }

  const drawAt = drawMoment(raffle.official_draw_date!, raffle.official_draw_slot!)
  const started = drawAt <= new Date()
  const ok4 = (v: string) => /^\d{4}$/.test(v)
  const label = raffle.products?.name || raffle.name

  const check = async () => {
    if (!ok4(first)) return setMsg({ kind: 'error', text: 'El 1.er premio tiene 4 cifras.' })
    if (needsSecond && second && !ok4(second)) return setMsg({ kind: 'error', text: 'El 2.º premio tiene 4 cifras.' })
    setBusy(true)
    const { data, error } = await supabase!.rpc('admin_preview_winner', { p_raffle: raffle.id, p_first_prize: first, p_second_prize: needsSecond && second ? second : null })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: explain(error.message) })
    setMsg(null)
    setPreview(((data ?? []) as Preview[])[0] ?? null)
  }

  const publish = async () => {
    const src = live?.estado === 'completo' && live.numeros[0] === first && (!needsSecond || !second || live.numeros[1] === second)
    setBusy(true)
    const { data, error } = await supabase!.rpc('admin_publish_result', {
      p_raffle: raffle.id, p_first_prize: first, p_second_prize: needsSecond && second ? second : null,
      p_numbers: src ? live!.numeros : [], p_from_source: !!src,
    })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: explain(error.message) })
    const row = ((data ?? []) as { outcome: string; winning_number: number; name: string; phone: string }[])[0]
    setPreview(null)
    setPublished({ ...row, label, digits: raffle.digits, raffleTitle: raffleLabel(raffle), when: when(raffle), slot: raffle.official_draw_slot!, firstPrize: first })
    void sendPendingPush()
    onPublished()
  }

  const n = preview ? pad(preview.winning_number, raffle.digits) : ''
  return (
    <div className="space-y-6">
      <Card title="Resultado y ganador">
        <div className="space-y-4">
          {due.length > 1 && (
            <label className="block text-base font-semibold">¿Qué sorteo?
              <select value={raffle.id} onChange={(e) => setRaffleId(e.target.value)} className={inputCls}>
                {due.map((r) => <option key={r.id} value={r.id}>{optionLabel(r)}</option>)}
              </select>
            </label>
          )}
          <p className="text-base"><b>{raffleLabel(raffle)}</b> · {when(raffle)}</p>
          <p className="text-sm text-muted">Si nadie tiene el número: {unsoldLabels[raffle.unsold_policy ?? 'desierto'].toLowerCase()}.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-base font-semibold">1.er premio
              <input value={first} onChange={(e) => { setFirst(e.target.value.replace(/\D/g, '').slice(0, 4)); setPreview(null) }} inputMode="numeric" placeholder="Ej.: 4537" className={`${inputCls} text-2xl tabular-nums`} />
            </label>
            {needsSecond && (
              <label className="block text-base font-semibold">2.º premio
                <input value={second} onChange={(e) => { setSecond(e.target.value.replace(/\D/g, '').slice(0, 4)); setPreview(null) }} inputMode="numeric" placeholder="Por si nadie tiene el 1.º" className={`${inputCls} text-2xl tabular-nums`} />
              </label>
            )}
          </div>
          {live?.numeros[0] && first && live.numeros[0] !== first && <Notice kind="error">La página oficial dice {live.numeros[0]} para el 1.er premio. Revisá antes de publicar.</Notice>}
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          {!preview && <button onClick={check} disabled={busy || !ok4(first)} className={`${primaryCls} w-full`}>Ver quién ganó</button>}
          {preview && (
            <div className="space-y-4 rounded-2xl border-2 border-brand-200 bg-brand-50 p-4">
              {preview.outcome === 'ganador' ? (
                <p className="text-lg">Salió el <b className="text-2xl">{n}</b>{preview.used_prize !== first && ' (2.º premio)'}. Lo tiene <b>{preview.name}</b>{preview.phone && ` · ${preview.phone}`}{!preview.from_app && ' (anotado en persona)'}.</p>
              ) : preview.outcome === 'falta_segundo' ? (
                <p className="text-lg">Salió el <b>{n}</b> y nadie lo tiene. Cargá el 2.º premio para ver quién gana.</p>
              ) : preview.outcome === 'siguiente_sorteo' ? (
                <p className="text-lg">Salió el <b>{n}</b> y nadie lo tiene. El sorteo va a pasar a la próxima Quiniela que cargues.</p>
              ) : (
                <p className="text-lg">Salió el <b>{n}</b> y nadie lo tiene: el sorteo queda desierto.</p>
              )}
              {!started && <p className="text-sm text-muted">Podés publicar cuando empiece la Quiniela ({slotTimes[raffle.official_draw_slot!]}).</p>}
              <div className="flex flex-wrap gap-3">
                <button onClick={publish} disabled={busy || !started || preview.outcome === 'falta_segundo'} className={primaryCls}>Confirmar y publicar</button>
                <button onClick={() => setPreview(null)} className={ghostCls}>Corregir</button>
              </div>
            </div>
          )}
        </div>
      </Card>
      <QuinielaBoard live={live} digits={raffle.digits} />
    </div>
  )
}

// Nombre como lo muestra Resultados: "Beto González" -> "Beto G." (el teléfono nunca va al grupo).
const shortName = (full: string) => {
  const [a = '', b = ''] = full.trim().split(/\s+/)
  return b ? `${a} ${b[0]}.` : a
}

function resultMessage(r: Published, appUrl: string) {
  const num = pad(r.winning_number, r.digits)
  const lines = [
    `🎉 Resultado: ${r.raffleTitle}`,
    `Premio: ${r.label}`,
    `Quiniela de la Ciudad, ${slotLabels[r.slot].split(' · ')[0].toLowerCase()} del ${r.when}. 1.er premio: ${r.firstPrize}.`,
  ]
  if (r.outcome === 'ganador') lines.push(`Número ganador: ${num}. Ganó ${shortName(r.name).replace(/\.$/, "")}. ¡Felicitaciones! El premio se le entrega a la persona ganadora.`)
  else if (r.outcome === 'siguiente_sorteo') lines.push(`Salió el ${num} y nadie lo tenía, así que el sorteo pasa a la próxima Quiniela. Les aviso el nuevo día.`)
  else lines.push(`Salió el ${num} y nadie lo tenía: el sorteo quedó desierto.`)
  lines.push('', `Ver el resultado: ${appUrl}`)
  return lines.join('\n')
}

function ShareResult({ result }: { result: Published }) {
  const brand = useBrand()
  const text = resultMessage(result, `${orgLink({ code: brand.code, installLink: '' })}#/resultados`)
  const [copied, setCopied] = useState(false)
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { return /* la persona cerró el menú */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) }
  }
  return (
    <div className="mt-6 space-y-3 rounded-2xl border border-line p-4">
      <p className="text-base font-semibold">Contale al grupo</p>
      <p className="whitespace-pre-line rounded-xl bg-brand-50 p-3 text-sm">{text}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={share} className="rounded-2xl bg-free px-5 py-3 font-bold text-white">Compartir resultado en el grupo</button>
        <button onClick={copy} className={ghostCls}>{copied ? 'Copiado ✓' : 'Copiar mensaje'}</button>
      </div>
    </div>
  )
}
