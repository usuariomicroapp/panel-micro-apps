export const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

export const pad = (n: number, digits: number) => String(n).padStart(digits, '0')

export const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso))

// Enlace de WhatsApp para celulares de Argentina: 54 + 9 + código de área + número (sin 0 ni 15).
export const waLink = (phone: string, text = '') => {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('9')) d = d.slice(1)
  d = d.replace(/^0/, '')
  return `https://wa.me/549${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
