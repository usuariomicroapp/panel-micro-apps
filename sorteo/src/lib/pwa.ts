import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Clave PÚBLICA de avisos (la privada está solo en Cloudflare).
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () =>
  ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true

// Recordamos si la app ya se instaló en este celular, para no volver a ofrecerla
// aunque la abran desde el navegador.
const INSTALLED_KEY = 'sorteo-app-instalada'
const markInstalled = () => { try { localStorage.setItem(INSTALLED_KEY, '1') } catch { /* sin almacenamiento */ } }
const wasInstalled = () => { try { return localStorage.getItem(INSTALLED_KEY) === '1' } catch { return false } }
let relatedInstalled = false
if (typeof window !== 'undefined') {
  if (isStandalone()) markInstalled()
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
  nav.getInstalledRelatedApps?.().then((apps) => { if (apps.length) { relatedInstalled = true; markInstalled(); listeners.forEach((l) => l()) } }).catch(() => {})
}
export const hideInstall = () => { markInstalled(); listeners.forEach((l) => l()) }
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

// Android/Chrome: el navegador avisa que se puede instalar; lo guardamos para el botón "Instalar".
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach((l) => l()) })
  window.addEventListener('appinstalled', () => { deferred = null; markInstalled(); listeners.forEach((l) => l()) })
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return {
    installed: isStandalone() || wasInstalled() || relatedInstalled,
    canPrompt: !!deferred,
    ios: isIOS(),
    prompt: async () => {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      if (outcome === 'accepted') markInstalled()
      listeners.forEach((l) => l())
      return outcome === 'accepted'
    },
  }
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

// Pide permiso, suscribe este celular y lo guarda a nombre de la persona.
export async function enablePush(): Promise<PushState> {
  if (!pushSupported() || !supabase) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC!) }))
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_keys: j.keys })
  if (error) throw new Error(error.message)
  return 'on'
}

// El organizador, después de publicar un ganador o cambiar un día, manda los avisos pendientes.
export async function sendPendingPush() {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return
  try { await fetch('/api/push', { method: 'POST', headers: { authorization: `Bearer ${token}` } }) } catch { /* sin señal: queda pendiente */ }
}

// Si este celular ya tenía avisos activados, lo dejamos a nombre de quien inició sesión.
export async function resyncPush() {
  if (!pushSupported() || !supabase || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const j = sub.toJSON()
  await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_keys: j.keys })
}
