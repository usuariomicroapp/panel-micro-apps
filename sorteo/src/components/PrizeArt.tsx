// Ilustraciones de premios de ejemplo. En la Etapa 5 se reemplazan por las fotos que subas.
const palettes = {
  phone: ['#7c3aed', '#c4b5fd'],
  bike: ['#0f766e', '#99f6e4'],
  tv: ['#b45309', '#fde68a'],
} as const

export default function PrizeArt({ kind, className = '' }: { kind: keyof typeof palettes; className?: string }) {
  const [a, b] = palettes[kind]
  return (
    <svg viewBox="0 0 400 260" className={className} role="img" aria-label="Ilustración del premio de ejemplo" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`pa-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill={`url(#pa-${kind})`} />
      <circle cx="330" cy="40" r="70" fill="#fff" opacity=".12" />
      <circle cx="60" cy="230" r="90" fill="#fff" opacity=".1" />
      {kind === 'phone' && (
        <g fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round">
          <rect x="160" y="50" width="80" height="160" rx="16" />
          <line x1="190" y1="190" x2="210" y2="190" />
        </g>
      )}
      {kind === 'bike' && (
        <g fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="130" cy="165" r="45" />
          <circle cx="270" cy="165" r="45" />
          <path d="M130 165 L180 95 L250 95 L270 165 M180 95 L215 165 L130 165 M240 75 L260 75" />
        </g>
      )}
      {kind === 'tv' && (
        <g fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round">
          <rect x="105" y="60" width="190" height="120" rx="10" />
          <line x1="170" y1="210" x2="230" y2="210" />
          <line x1="200" y1="180" x2="200" y2="210" />
        </g>
      )}
      <text x="20" y="34" fill="#fff" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="700" opacity=".9">EJEMPLO</text>
    </svg>
  )
}
