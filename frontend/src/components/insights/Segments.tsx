import { Reveal } from '../../lib/motion'
import { Briefcase, Heart, Palmtree, Plane, Sparkles, ThumbsDown, UserPlus } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { pct, type Insights } from '../../api'
import { SEG_COLORS } from '../../three/colors'
import { Card, InfoTip, Skeleton } from '../ui'

const Scatter3D = lazy(() => import('../../three/Scatter3D'))
const TRAIT_ICON = { long_haul: Plane, business: Briefcase, leisure: Palmtree, first_time: UserPlus, young: Sparkles, rating_high: Heart, rating_low: ThumbsDown } as const

export function Segments({ ins }: { ins: Insights }) {
  const [focus, setFocus] = useState<number | null>(null)
  const seg = ins.segments
  return (
    <div className="space-y-6">
      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6 sm:p-7">
          <div>
            <h3 className="flex items-center font-display text-2xl font-semibold">{seg.k} passenger personas
              <InfoTip>K-Means groups passengers whose answers look alike. We tried 4, 5 and 6 groups and kept the one with the best silhouette score (how well-separated the groups are).</InfoTip></h3>
            <p className="mt-1 text-[15px] text-muted">2,500 passengers shown in 3D (PCA). Drag to rotate · hover a card to highlight its persona.</p>
          </div>
          <p className="num text-[13px] text-muted">Silhouette: {Object.entries(seg.silhouette).map(([k, v]) => `k=${k} ${v}`).join(' · ')}</p>
        </div>
        <div className="h-[460px] border-t border-line">
          <Suspense fallback={<Skeleton className="h-full rounded-none" />}><Scatter3D points={seg.points} focus={focus} /></Suspense>
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {seg.segments.map((s, i) => {
          const I = TRAIT_ICON[s.trait as keyof typeof TRAIT_ICON] ?? Sparkles
          const r = Object.entries(s.ratings).sort((a, b) => a[1] - b[1])
          const c = SEG_COLORS[s.id % 6]
          return (
            <Reveal key={s.id} delay={i * 0.06}
              onMouseEnter={() => setFocus(s.id)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(s.id)} onBlur={() => setFocus(null)} tabIndex={0}>
              <Card className="h-full">
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 40%, transparent)` }}><I size={26} /></span>
                  <div className="min-w-0">
                    <h4 className="font-display text-xl font-semibold leading-tight">{s.name}</h4>
                    <p className="text-[13px] text-muted">{pct(s.share, 0)} of passengers</p>
                  </div>
                </div>
                <p className="mt-4 text-[15px] text-muted">{s.tagline}</p>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold" style={{ color: s.satisfied_rate >= 0.5 ? 'var(--safe)' : 'var(--risk)' }}>{pct(s.satisfied_rate)}</span>
                  <span className="text-muted">satisfied</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full" style={{ width: pct(s.satisfied_rate), background: s.satisfied_rate >= 0.5 ? 'var(--safe)' : 'var(--risk)' }} /></div>
                <dl className="mt-5 grid grid-cols-3 gap-3 text-[15px]">
                  {[['Avg age', s.avg_age.toFixed(0)], ['Distance', `${s.avg_distance.toFixed(0)} mi`], ['Loyal', pct(s.loyal_share)]].map(([k, v]) => (
                    <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
                  ))}
                </dl>
                <p className="mt-4 text-[15px]"><span className="text-muted">Weakest:</span> <span className="text-risk">{r[0][0]} {r[0][1].toFixed(1)}★</span> · <span className="text-muted">Best:</span> <span className="text-safe">{r[r.length - 1][0]} {r[r.length - 1][1].toFixed(1)}★</span></p>
              </Card>
            </Reveal>
          )
        })}
      </div>
    </div>
  )
}
