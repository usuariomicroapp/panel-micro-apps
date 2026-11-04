import { useEffect } from 'react'
import { NavLink, Navigate, Outlet, Link, useLocation } from 'react-router-dom'
import { Logo } from './Logo'
import { useAuth } from '../lib/auth'
import { useBrand } from '../lib/brand'
import { isConfigured } from '../lib/supabase'
import { BACK_KEY } from '../pages/Profile'
import Notices from './Notices'
import JoinOrganizer from './JoinOrganizer'
import Icon, { type IconName } from './Icon'

const nav: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Sorteos', icon: 'home' },
  { to: '/premios', label: 'Premios', icon: 'gift' },
  { to: '/mis-numeros', label: 'Mis números', icon: 'ticket' },
  { to: '/resultados', label: 'Resultados', icon: 'trophy' },
  { to: '/invitar', label: 'Invitar', icon: 'share' },
  { to: '/perfil', label: 'Mi perfil', icon: 'user' },
]

// Pantallas que van en oscuro (azul noche): el panel del organizador y los resultados.
const isDark = (path: string) => path.startsWith('/admin') || path.startsWith('/resultados')

export default function Layout() {
  const { pathname } = useLocation()
  const { ready, session, isAdmin, isOwner, viewAsBuyer, setViewAsBuyer } = useAuth()
  const { paused, pausedMessage } = useBrand()
  // El participante solo ve sorteos, premios, resultados y su perfil. Invitar es del organizador.
  // El dueño comparte desde su panel. El organizador ve Invitar en lugar de Mis números (que igual tiene desde su perfil).
  // El organizador tiene su perfil dentro del panel (botón Perfil), no abajo.
  const items = nav.filter((n) => (n.to === '/invitar' ? isAdmin && !isOwner : n.to === '/mis-numeros' ? !isAdmin : n.to === '/perfil' ? !(isAdmin && !isOwner) : true))
  const dark = isDark(pathname)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', dark)
    document.documentElement.classList.add('app-bg')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1226' : '#f6f4ef')
  }, [dark])
  // Sin cuenta, lo primero es registrarse o ingresar. Después vuelve a donde quería ir.
  const mustLogin = isConfigured && ready && !session && pathname !== '/perfil'
  if (mustLogin) {
    try { sessionStorage.setItem(BACK_KEY, pathname) } catch { /* sin almacenamiento */ }
    return <Navigate to="/perfil" replace />
  }
  const guest = isConfigured && !session
  return (
    <div className="flex min-h-screen flex-col">
      {paused && <div className="bg-sold px-4 py-2 text-center text-sm font-semibold text-white">{pausedMessage || 'La app está pausada momentáneamente.'}</div>}
      {viewAsBuyer && (
        <div className="flex items-center justify-center gap-3 bg-night px-4 py-2 text-sm text-white">
          <span>Estás viendo la app como un participante.</span>
          <button onClick={() => setViewAsBuyer(false)} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">Volver a mi panel</button>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="Inicio"><Logo /></Link>
          <nav className={`${guest ? 'hidden' : 'hidden md:flex'} gap-1`}>
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-bold ${isActive ? 'btn-navy' : 'text-muted hover:text-ink'}`}>
                {n.label}
              </NavLink>
            ))}
            {isAdmin && <NavLink to="/admin" className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-bold ${isActive ? 'btn-gold' : 'text-muted hover:text-ink'}`}>Panel</NavLink>}
          </nav>
          {isAdmin && <Link to="/admin" className="btn-gold rounded-full px-4 py-2 text-sm font-extrabold md:hidden">Panel</Link>}
        </div>
      </header>
      <JoinOrganizer />
      <Notices />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:pb-12">
        <Outlet />
      </main>
      {!guest && <nav className={`fixed inset-x-0 bottom-0 z-20 grid ${items.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-20px_#0c1226] backdrop-blur-md md:hidden`}>
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => `group flex flex-col items-center gap-1 whitespace-nowrap py-2.5 text-[11px] font-bold ${isActive ? 'text-ink' : 'text-muted'}`}>
            {({ isActive }) => (<>
              <span className={`grid h-8 w-12 place-items-center rounded-full transition ${isActive ? 'bg-gold/20 text-gold-dark' : ''}`}><Icon name={n.icon} /></span>
              {n.label}
            </>)}
          </NavLink>
        ))}
      </nav>}
    </div>
  )
}
