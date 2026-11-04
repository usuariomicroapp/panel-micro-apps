import { useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Logo } from './Logo'
import DemoBanner from './DemoBanner'

const nav = [
  { to: '/', label: 'Sorteos', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/resultados', label: 'Resultados', icon: 'M5 13l4 4L19 7' },
  { to: '/invitar', label: 'Invitar', icon: 'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13' },
  { to: '/perfil', label: 'Mi perfil', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="Inicio"><Logo /></Link>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-brand-100 text-brand-700' : 'text-muted hover:text-ink'}`}>
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/admin" className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>Panel</NavLink>
          </nav>
          <Link to="/admin" className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted md:hidden">Panel</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:pb-12">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-muted'}`}>
            <Icon d={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
