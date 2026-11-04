import { Link } from 'react-router-dom'
import { BrandMark } from '../components/Logo'
import { useBrand } from '../lib/brand'

export default function Welcome() {
  const { name } = useBrand()
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 px-6 pb-10 pt-16 text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-gold/20" />
      <span className="relative rounded-full bg-gold px-3 py-1 text-xs font-bold text-brand-900">MODO DEMOSTRACIÓN</span>
      <div className="relative flex flex-col items-center text-center">
        <BrandMark size={112} />
        <h1 className={`mt-6 font-extrabold ${name.length > 12 ? "text-4xl" : "text-5xl tracking-[0.2em]"}`}>{name}</h1>
        <p className="mt-4 max-w-xs text-lg text-brand-100">Elegí tus números, seguí el sorteo oficial y enterate al instante si ganaste.</p>
      </div>
      <div className="relative flex w-full max-w-sm flex-col gap-3">
        <Link to="/" className="rounded-2xl bg-white py-4 text-center text-base font-bold text-brand-700 shadow-lg active:scale-[.98]">Ver sorteos</Link>
        <Link to="/perfil" className="rounded-2xl border border-white/40 py-4 text-center text-base font-semibold text-white active:scale-[.98]">Ingresar o crear cuenta</Link>
        <p className="mt-2 text-center text-xs text-brand-200">Resultados según la Quiniela de la Ciudad</p>
      </div>
    </div>
  )
}
