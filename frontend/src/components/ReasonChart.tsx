import { motion } from 'framer-motion'
import type { Reason } from '../api'
import { InfoTip } from './ui'

export const SHAP_TIP = 'SHAP = how much each factor pushed this prediction up or down, compared with an average passenger. The pushes add up to the final score.'

/** Diverging bars: how many percentage points each factor moves P(satisfied). */
export function ReasonChart({ reasons, title = 'Why this prediction' }: { reasons: Reason[]; title?: string }) {
  const max = Math.max(5, ...reasons.map((r) => Math.abs(r.impact)))
  return (
    <div>
      <div className="mb-1 flex items-center text-[15px] font-semibold">{title}<InfoTip label="What is SHAP?">{SHAP_TIP}</InfoTip></div>
      <div className="mb-4 flex justify-between text-[13px] text-muted"><span>← pushes towards unhappy</span><span>towards satisfied →</span></div>
      <ul className="space-y-3.5">
        {reasons.map((r, i) => {
          const pos = r.impact >= 0, w = (Math.abs(r.impact) / max) * 50
          return (
            <li key={r.feature}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[15px]">
                <span className="truncate">{r.text.split(' →')[0]}</span>
                <span className="num shrink-0 font-semibold" style={{ color: pos ? 'var(--safe)' : 'var(--risk)' }}>{pos ? '+' : '−'}{Math.abs(r.impact).toFixed(1)} pts</span>
              </div>
              <div className="relative h-2.5 rounded-full bg-line">
                <div className="absolute left-1/2 top-[-3px] h-4 w-0.5 -translate-x-1/2 rounded bg-line-strong" />
                <motion.div initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 70, damping: 16 }}
                  className="absolute top-0 h-2.5 rounded-full"
                  style={{ [pos ? 'left' : 'right']: '50%', background: pos ? 'linear-gradient(90deg, color-mix(in srgb, var(--safe) 50%, transparent), var(--safe))' : 'linear-gradient(270deg, color-mix(in srgb, var(--risk) 50%, transparent), var(--risk))', boxShadow: `0 0 12px ${pos ? 'var(--safe)' : 'var(--risk)'}` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
