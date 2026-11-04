import { useState } from 'react'
import PrizeArt from './PrizeArt'
import type { RaffleView } from '../lib/publicRaffles'

type Props = { raffle: Pick<RaffleView, 'name' | 'prize' | 'photos' | 'art'>; className?: string; gallery?: boolean }

// Fotos reales del premio con el detalle escrito debajo de cada una.
// Sin fotos: la ilustración de ejemplo o un fondo neutro.
export default function RaffleImage({ raffle, className = '', gallery = false }: Props) {
  const [i, setI] = useState(0)
  const photos = raffle.photos
  if (photos.length) {
    const cur = photos[Math.min(i, photos.length - 1)]
    const many = gallery && photos.length > 1
    return (
      <div>
        <div className={`relative bg-canvas ${className}`}>
          <img src={cur.url} alt={cur.caption || `Foto del premio: ${raffle.prize || raffle.name}`} className="h-full w-full object-cover" loading="lazy" />
          {many && (
            <>
              <button type="button" onClick={() => setI((i - 1 + photos.length) % photos.length)} aria-label="Foto anterior"
                className="absolute left-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-white/85 text-2xl font-bold text-night shadow">‹</button>
              <button type="button" onClick={() => setI((i + 1) % photos.length)} aria-label="Foto siguiente"
                className="absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-white/85 text-2xl font-bold text-night shadow">›</button>
              <span className="absolute bottom-2 right-2 rounded-full bg-night/70 px-2.5 py-0.5 text-sm font-semibold text-white">{i + 1} de {photos.length}</span>
            </>
          )}
        </div>
        {gallery && cur.caption && <p className="whitespace-pre-line border-b border-line bg-brand-50 px-5 py-3 text-base">{cur.caption}</p>}
      </div>
    )
  }
  if (raffle.art) return <PrizeArt kind={raffle.art} className={className} />
  return (
    <div className={`flex items-center justify-center bg-[radial-gradient(70%_60%_at_50%_35%,#3a4a86_0,#151d3d_60%,#0b1022_100%)] text-white ${className}`}>
      <span className="gold-text px-4 text-center font-display text-xl font-bold">{raffle.prize || raffle.name}</span>
    </div>
  )
}
