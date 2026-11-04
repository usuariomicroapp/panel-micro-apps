// Cloudflare Pages Function (plan gratuito): GET /api/quiniela?fecha=AAAA-MM-DD&turno=nocturna
// Lee la página oficial de la Quiniela de la Ciudad y devuelve los 20 números de la Ciudad (51)
// en el orden en que salen. No guarda nada ni usa claves: es solo lectura de una fuente pública.
// Se guarda en caché 10 segundos para no consultar de más a la fuente oficial.

const BASE = 'https://quiniela.loteriadelaciudad.gob.ar/'
const TURNOS = ['previa', 'primera', 'matutina', 'vespertina', 'nocturna']
const HORA = { previa: '10:15', primera: '12:00', matutina: '15:00', vespertina: '18:00', nocturna: '21:00' }
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; SorteoApp/1.0)', accept: 'text/html,application/javascript,*/*' }

const json = (body, status = 200, maxAge = 10) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}`, 'access-control-allow-origin': '*' },
  })

// "03/11/2026 - 10:15 - Sorteo Nº 53117 - PREVIA"
export function parseIndex(html) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
  const re = /(\d{2})\/(\d{2})\/(\d{4})\s*-\s*\d{1,2}:\d{2}\s*-\s*Sorteo[^0-9]{0,12}(\d{4,7})\s*-\s*(PREVIA|PRIMERA|MATUTINA|VESPERTINA|NOCTURNA)/gi
  const out = []
  const seen = new Set()
  for (const m of text.matchAll(re)) {
    const sorteo = Number(m[4])
    if (seen.has(sorteo)) continue
    seen.add(sorteo)
    out.push({ fecha: `${m[3]}-${m[2]}-${m[1]}`, turno: m[5].toLowerCase(), sorteo })
  }
  return out
}

// window.RESULTADOS_DATA = [{...}]; window.POZO_ULTIMO_SORTEO = 0;
export function parseData(js) {
  const m = js.match(/RESULTADOS_DATA\s*=\s*([\s\S]*?\])\s*;\s*(?:window\.|$)/)
  if (!m) return null
  let arr
  try { arr = JSON.parse(m[1]) } catch { return null }
  const d = Array.isArray(arr) ? arr[0] : null
  if (!d) return null
  const [dd, mm, yyyy] = String(d.fecha || '').split('/')
  const mod = String(d.modalidad || '').toLowerCase()
  const turno = TURNOS.find((t) => t.startsWith(mod.slice(0, 4))) || null
  const ciudad = d.jurisdicciones && (d.jurisdicciones['51'] || d.jurisdicciones[51])
  const numeros = Array(20).fill(null)
  for (const n of (ciudad && ciudad.numeros) || []) {
    const pos = Number(n.pos)
    const val = String(n.val ?? '').trim()
    if (pos >= 1 && pos <= 20 && /^\d{4}$/.test(val)) numeros[pos - 1] = val
  }
  return { sorteo: Number(d.sorteo), fecha: yyyy ? `${yyyy}-${mm}-${dd}` : null, turno, numeros }
}

// Turnos (lunes a sábado) desde un sorteo conocido hasta el pedido, para estimar su número.
export function turnosEntre(desde, hasta) {
  const key = (f, t) => f + ':' + TURNOS.indexOf(t)
  if (key(hasta.fecha, hasta.turno) <= key(desde.fecha, desde.turno)) return 0
  let n = 0
  let f = desde.fecha
  let i = TURNOS.indexOf(desde.turno)
  for (let guard = 0; guard < 200; guard++) {
    i++
    if (i >= TURNOS.length) {
      i = 0
      const d = new Date(f + 'T12:00:00Z')
      do d.setUTCDate(d.getUTCDate() + 1)
      while (d.getUTCDay() === 0)
      f = d.toISOString().slice(0, 10)
    }
    n++
    if (f === hasta.fecha && TURNOS[i] === hasta.turno) return n
    if (f > hasta.fecha) return 0
  }
  return 0
}

async function fetchText(url) {
  const r = await fetch(url, { headers: UA, cf: { cacheTtl: 10, cacheEverything: true } })
  if (!r.ok) throw new Error('fuente ' + r.status)
  return r.text()
}

async function readDraw(sorteo, fecha, turno) {
  const d = parseData(await fetchText(`${BASE}includes/resultados-data.php?sorteo=${sorteo}`))
  if (d && d.fecha === fecha && d.turno === turno) return d
  return null
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const fecha = url.searchParams.get('fecha') || ''
  const turno = (url.searchParams.get('turno') || '').toLowerCase()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !TURNOS.includes(turno)) return json({ error: 'Pedí fecha=AAAA-MM-DD y turno' }, 400, 3600)

  const cache = caches.default
  const cacheKey = new Request(`${url.origin}/api/quiniela?fecha=${fecha}&turno=${turno}`)
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const base = { fecha, turno, hora: HORA[turno], fuente: BASE }
  let res
  try {
    const index = parseIndex(await fetchText(BASE))
    let draw = null
    const listed = index.find((e) => e.fecha === fecha && e.turno === turno)
    if (listed) draw = await readDraw(listed.sorteo, fecha, turno)
    else if (index.length) {
      // Si todavía no figura en la lista, se estima su número a partir del último publicado.
      const last = index.reduce((a, b) => (b.sorteo > a.sorteo ? b : a))
      const pasos = turnosEntre(last, { fecha, turno })
      if (pasos > 0 && pasos <= 12) draw = await readDraw(last.sorteo + pasos, fecha, turno)
    }
    if (!draw) res = json({ ...base, estado: 'pendiente', numeros: Array(20).fill(null) }, 200, 10)
    else {
      const salieron = draw.numeros.filter(Boolean).length
      const estado = salieron === 20 ? 'completo' : salieron ? 'en_curso' : 'pendiente'
      res = json({ ...base, sorteo: draw.sorteo, estado, numeros: draw.numeros }, 200, estado === 'completo' ? 600 : 10)
    }
  } catch (e) {
    res = json({ ...base, estado: 'sin_conexion', error: 'No pudimos leer la página oficial', numeros: Array(20).fill(null) }, 200, 10)
  }
  await cache.put(cacheKey, res.clone())
  return res
}
