export default function ComingSoon({ stage, children }: { stage: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50 p-4 text-sm text-brand-700">
      <span className="mr-2 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">Etapa {stage}</span>
      {children}
    </div>
  )
}
