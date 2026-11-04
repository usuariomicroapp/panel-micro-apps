// Cloudflare Pages Function: /manifest.webmanifest con el nombre del emprendimiento,
// así la app instalada en el celular se llama como cada cliente la configuró.
const DEFAULT_URL = 'https://ofuugwzkqhpfkaohnpgf.supabase.co'
const DEFAULT_KEY = 'sb_publishable_Jy-O2SIZCucTbcilHKuvOA_9rqIPNTo' // pública: la seguridad la da RLS

export async function onRequestGet({ env }) {
  let name = 'SORTEO'
  try {
    const r = await fetch(`${env.SUPABASE_URL || DEFAULT_URL}/rest/v1/settings?id=eq.1&select=brand_name`, {
      headers: { apikey: env.SUPABASE_KEY || DEFAULT_KEY },
      cf: { cacheTtl: 300, cacheEverything: true },
    })
    const rows = await r.json()
    if (Array.isArray(rows) && rows[0]?.brand_name?.trim()) name = rows[0].brand_name.trim().slice(0, 40)
  } catch { /* se usa el nombre por defecto */ }
  const manifest = {
    name,
    short_name: name.length > 15 ? name.split(' ')[0].slice(0, 15) : name,
    description: 'Sorteos con resultados de la Quiniela de la Ciudad.',
    lang: 'es-AR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f4ef',
    theme_color: '#0c1226',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return new Response(JSON.stringify(manifest), {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  })
}
