// Cloudflare Pages Function: POST /api/push (con la sesión del organizador).
// Toma los avisos pendientes de la base y los manda como notificación push a los celulares.
// La clave privada de avisos (VAPID_PRIVATE_KEY) vive solo acá, como secreto de Cloudflare.
// Cifrado aes128gcm (RFC 8291) y firma VAPID (RFC 8292): lo aceptan Android, iPhone y computadoras.
import { buildPushPayload } from '@block65/webcrypto-web-push'

const DEFAULT_URL = 'https://ofuugwzkqhpfkaohnpgf.supabase.co'
const DEFAULT_KEY = 'sb_publishable_Jy-O2SIZCucTbcilHKuvOA_9rqIPNTo' // pública: la seguridad la da RLS
const DEFAULT_VAPID_PUBLIC = 'BIXIBBYQZy5-rRD9NCBKRBI5CeMkyv0vvtRICK1N37qieQTdX2ToNUQ1xHpx2vac7U_FnNJ0wGS6ZQMv9WiTPT0' // pública

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

async function rpc(env, token, name, args = {}) {
  const r = await fetch(`${env.SUPABASE_URL || DEFAULT_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY || DEFAULT_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status })
  return r.status === 204 ? null : r.json()
}

export async function onRequestPost({ request, env }) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Falta la sesión' }, 401)
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim()
  if (!privateKey) return json({ error: 'Falta configurar la clave de avisos (VAPID_PRIVATE_KEY) en Cloudflare', sent: 0 }, 503)

  let batch
  try { batch = await rpc(env, token, 'take_push_batch') } catch (e) { return json({ error: 'No autorizado' }, e.status === 401 ? 401 : 403) }

  const origin = new URL(request.url).origin
  const vapid = { subject: env.VAPID_SUBJECT || origin, publicKey: env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC, privateKey }
  const gone = []
  let sent = 0, failed = 0
  const jobs = []
  for (const n of batch || []) {
    for (const subscription of n.subs || []) {
      jobs.push((async () => {
        try {
          const payload = await buildPushPayload({
            data: JSON.stringify({ title: n.title, body: n.body, url: `${origin}/#${n.link || '/'}`, kind: n.kind, tag: n.id }),
            options: { ttl: 60 * 60 * 24, urgency: n.kind === 'ganador' ? 'high' : 'normal' },
          }, subscription, vapid)
          const r = await fetch(subscription.endpoint, payload)
          if (r.status === 404 || r.status === 410) gone.push(subscription.endpoint)
          else if (r.ok) sent++
          else failed++
        } catch { failed++ }
      })())
    }
  }
  await Promise.all(jobs)
  if (gone.length) { try { await rpc(env, token, 'drop_push_endpoints', { p_endpoints: gone }) } catch { /* se reintenta la próxima */ } }
  return json({ notices: (batch || []).length, sent, failed, removed: gone.length })
}
