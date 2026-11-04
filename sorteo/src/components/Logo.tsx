import { useBrand } from '../lib/brand'

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#logo-g)" />
      <circle cx="64" cy="64" r="38" fill="#fff" />
      <circle cx="64" cy="64" r="28" fill="none" stroke="#f5b301" strokeWidth="5" />
      <text x="64" y="76" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="34" fontWeight="800" fill="#4c1d95">S</text>
      <circle cx="98" cy="30" r="6" fill="#f5b301" />
    </svg>
  )
}

// Logo propio del emprendimiento si se cargó; si no, el de SORTEO.
export function BrandMark({ size = 40 }: { size?: number }) {
  const { logoUrl, name } = useBrand()
  if (logoUrl) return <img src={logoUrl} alt={`Logo de ${name}`} width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />
  return <LogoMark size={size} />
}

export function Logo({ light = false }: { light?: boolean }) {
  const { name } = useBrand()
  const long = name.length > 14
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <BrandMark size={36} />
      <span className={`truncate font-extrabold ${long ? 'text-lg' : 'text-xl tracking-[0.12em]'} ${light ? 'text-white' : 'text-brand-900'}`}>{name}</span>
    </span>
  )
}
