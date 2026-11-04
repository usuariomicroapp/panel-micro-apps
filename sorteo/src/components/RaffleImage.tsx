import { useState } from 'react'
import PrizeArt from './PrizeArt'
import type { RaffleView } from '../lib/publicRaffles'

// Muestra las fotos reales del premio; si no hay, la ilustración de ejemplo o un fondo neutro.
export default function RaffleImage({ raffle, className = '', gallery = false }: { raffle: RaffleView; className?: string; gallery?: boolean }) {
  const [i, setI] = useState(0)
  if (raffle.photos.length) {
    return (
      <div className={`relative bg-canvas ${className}`}>
        <img src={raffle.photos[i]} alt={`Foto del premio: ${raffle.prize || raffle.name}`} className="h-full w-full object-cover" loading="lazy" />
        {gallery && raffle.photos.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {raffle.photos.map((_, n) => (
              <button key={n} onClick={() => setI(n)} aria-label={`Ver foto ${n + 1}`}
                className={`h-2.5 w-2.5 rounded-full ${n === i ? 'bg-white' : 'bg-white/50'}`} />
            ))}
          </div>
        )}
      </div>
    )
  }
  if (raffle.art) return <PrizeArt kind={raffle.art} className={className} />
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 text-white ${className}`}>
      <span className="px-4 text-center text-lg font-bold">{raffle.prize || raffle.name}</span>
    </div>
  )
}
