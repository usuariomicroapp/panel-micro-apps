// Número en bolillas de lotería. Las últimas `gold` cifras (las que definen el ganador) van en dorado.
export default function Balls({ value, gold = 0, size = 'md' }: { value: string; gold?: number; size?: 'sm' | 'md' | 'lg' }) {
  const dim = { sm: 'h-11 w-11 text-lg', md: 'h-16 w-16 text-2xl', lg: 'h-[4.5rem] w-[4.5rem] text-3xl sm:h-20 sm:w-20' }[size]
  const chars = value.split('')
  return (
    <div className="flex justify-center gap-2" aria-label={value}>
      {chars.map((ch, i) => (
        <span key={i} className={`ball pop-in ${i >= chars.length - gold ? 'ball-gold' : 'ball-navy'} ${dim}`} style={{ animationDelay: `${i * 90}ms` }}>
          <span>{ch}</span>
        </span>
      ))}
    </div>
  )
}
