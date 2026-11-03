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

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={36} />
      <span className={`text-xl font-extrabold tracking-[0.18em] ${light ? 'text-white' : 'text-brand-900'}`}>SORTEO</span>
    </span>
  )
}
