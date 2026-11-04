import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, ghostCls, inputCls, primaryCls } from '../../components/ui'

interface Method {
  id: string
  kind: 'transferencia' | 'mercado_pago' | 'otro'
  label: string
  alias: string
  cbu: string
  holder: string
  instructions: string
  active: boolean
  position: number
}

const kinds: Record<Method['kind'], string> = { transferencia: 'Transferencia bancaria', mercado_pago: 'Mercado Pago (transferencia)', otro: 'Otro' }

function MethodForm({ initial, onDone }: { initial?: Method; onDone: () => void }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const cbu = String(f.get('cbu')).replace(/\D/g, '')
    if (cbu && cbu.length !== 22) return setErr('El CBU/CVU debe tener 22 números.')
    const row = {
      kind: String(f.get('kind')),
      label: String(f.get('label')).trim(),
      alias: String(f.get('alias')).trim(),
      cbu,
      holder: String(f.get('holder')).trim(),
      instructions: String(f.get('instructions')).trim(),
      active: f.get('active') === 'on',
    }
    setBusy(true); setErr('')
    const { error } = initial
      ? await supabase!.from('payment_methods').update(row).eq('id', initial.id)
      : await supabase!.from('payment_methods').insert(row)
    setBusy(false)
    if (error) setErr(error.message)
    else onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Tipo
          <select name="kind" defaultValue={initial?.kind ?? 'transferencia'} className={inputCls}>
            {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block text-sm">Nombre visible
          <input name="label" required maxLength={80} defaultValue={initial?.label} placeholder="Ej.: Banco Nación" className={inputCls} />
        </label>
        <label className="block text-sm">Alias
          <input name="alias" maxLength={40} defaultValue={initial?.alias} className={inputCls} />
        </label>
        <label className="block text-sm">CBU / CVU
          <input name="cbu" inputMode="numeric" defaultValue={initial?.cbu} className={inputCls} />
        </label>
        <label className="block text-sm sm:col-span-2">Titular
          <input name="holder" maxLength={120} defaultValue={initial?.holder} className={inputCls} />
        </label>
        <label className="block text-sm sm:col-span-2">Instrucciones
          <textarea name="instructions" rows={3} maxLength={1000} defaultValue={initial?.instructions} placeholder="Ej.: Poné tu nombre en el concepto." className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={initial?.active ?? true} /> Activo</label>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex gap-2">
        <button disabled={busy} className={primaryCls}>{initial ? 'Guardar' : 'Agregar'}</button>
        <button type="button" onClick={onDone} className={ghostCls}>Cancelar</button>
      </div>
    </form>
  )
}

export default function PaymentMethods() {
  const [items, setItems] = useState<Method[] | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  const load = () => supabase!.from('payment_methods').select('*').order('position').order('created_at').then(({ data }) => setItems((data ?? []) as Method[]))
  useEffect(() => { void load() }, [])

  const remove = async (m: Method) => {
    await supabase!.from('payment_methods').update({ active: false }).eq('id', m.id)
    void load()
  }

  return (
    <Card title="Medios de pago" action={editing === null && <button onClick={() => setEditing('new')} className="text-sm font-semibold text-brand-600">+ Agregar</button>}>
      <p className="mb-4 text-sm text-muted">Los participantes solo verán estos datos cuando los cobros estén habilitados.</p>
      {editing === 'new' && <div className="mb-4"><MethodForm onDone={() => { setEditing(null); void load() }} /></div>}
      {!items ? <p className="text-muted">Cargando…</p> : items.length === 0 && editing !== 'new' ? (
        <p className="text-sm text-muted">Todavía no cargaste ningún medio de pago.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((m) => editing === m.id ? (
            <li key={m.id}><MethodForm initial={m} onDone={() => { setEditing(null); void load() }} /></li>
          ) : (
            <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line p-4">
              <div className="text-sm">
                <p className="font-semibold">{m.label} <span className="font-normal text-muted">· {kinds[m.kind]}</span> {!m.active && <span className="ml-1 rounded-full bg-line px-2 py-0.5 text-xs">Inactivo</span>}</p>
                {m.alias && <p>Alias: <b>{m.alias}</b></p>}
                {m.cbu && <p className="tabular-nums">CBU/CVU: {m.cbu}</p>}
                {m.holder && <p>Titular: {m.holder}</p>}
              </div>
              <div className="flex gap-3 text-sm font-semibold">
                <button onClick={() => setEditing(m.id)} className="text-brand-600">Editar</button>
                {m.active && <button onClick={() => remove(m)} className="text-muted">Desactivar</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
