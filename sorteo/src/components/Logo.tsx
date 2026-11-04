import { useBrand } from '../lib/brand'

// Sello azul noche con la inicial en dorado (se usa si el organizador no cargó su logo).
export function LogoMark({ size = 40 }: { size?: number }) {
  const { name } = useBrand()
  const initial = (name.trim()[0] ?? 'S').toUpperCase()
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center"
      style={{
        width: size, height: size, borderRadius: size * 0.3,
        background: 'linear-gradient(160deg,#1c2756,#0c1226)',
        boxShadow: '0 10px 18px -10px #0c1226, inset 0 0 0 1px #d4ac5666, inset 0 1px 0 #ffffff26',
      }}
    >
      <span className="gold-text font-display font-bold" style={{ fontSize: size * 0.55, lineHeight: 1 }}>{initial}</span>
    </span>
  )
}

// Logo propio del emprendimiento si se cargó; si no, el sello con la inicial.
export function BrandMark({ size = 40 }: { size?: number }) {
  const { logoUrl, name } = useBrand()
  if (logoUrl) return <img src={logoUrl} alt={`Logo de ${name}`} width={size} height={size} className="rounded-xl object-cover shadow-md" style={{ width: size, height: size }} />
  return <LogoMark size={size} />
}

export function Logo({ light = false }: { light?: boolean }) {
  const { name } = useBrand()
  const long = name.length > 16
  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <BrandMark size={40} />
      <span className={`truncate font-extrabold tracking-tight ${long ? 'text-lg' : 'text-xl'} ${light ? 'text-white' : 'text-ink'}`}>{name}</span>
    </span>
  )
}
