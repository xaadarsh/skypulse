import { AnimatePresence, motion } from 'framer-motion'
import { FlaskConical, TrendingUp, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type Insights as Ins } from '../api'
import { ModelLab } from '../components/insights/ModelLab'
import { Segments } from '../components/insights/Segments'
import { Strategy } from '../components/insights/Strategy'
import { ErrorBox, PageHero, Skeleton, Tabs } from '../components/ui'

type Tab = 'strategy' | 'segments' | 'lab'
const COPY: Record<Tab, { title: React.ReactNode; text: string; steps: string[] }> = {
  strategy: { title: <>What if we fixed <span className="text-gradient">one thing?</span></>, text: 'Improve one service for a group of passengers and see how many more the model predicts would leave satisfied.', steps: ['Pick a service', 'Pick a group', 'Compare before and after'] },
  segments: { title: <>Six kinds of <span className="text-gradient">passengers.</span></>, text: 'Machine learning grouped 1 lakh passengers into personas with similar answers — each with its own pain point.', steps: ['Rotate the 3D map', 'Hover a persona', 'Read its weakest service'] },
  lab: { title: <>How good is <span className="text-gradient">the model?</span></>, text: 'Four algorithms trained and tested on the same data. Here is how each one scored on passengers it had never seen.', steps: ['See the winner', 'Compare curves', 'Check fairness'] },
}

export default function Insights() {
  const [params, setParams] = useSearchParams()
  const tab = (['strategy', 'segments', 'lab'].includes(params.get('tab') ?? '') ? params.get('tab') : 'strategy') as Tab
  const [ins, setIns] = useState<Ins | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); api.insights().then(setIns).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  return (
    <div>
      <div className="pt-6 sm:pt-10">
        <Tabs label="Insights" size="lg" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={[
          { value: 'strategy', label: 'Strategy', icon: <TrendingUp size={17} /> },
          { value: 'segments', label: 'Personas', icon: <Users size={17} /> },
          { value: 'lab', label: 'Model Lab', icon: <FlaskConical size={17} /> },
        ]} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
          <PageHero eyebrow={tab === 'lab' ? 'Model Lab' : tab === 'segments' ? 'Passenger personas' : 'Strategy simulator'} title={COPY[tab].title} steps={COPY[tab].steps}>{COPY[tab].text}</PageHero>
          {err && <ErrorBox error={err} retry={load} />}
          {!ins && !err && <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>}
          {ins && tab === 'strategy' && <Strategy ins={ins} />}
          {ins && tab === 'segments' && <Segments ins={ins} />}
          {ins && tab === 'lab' && <ModelLab ins={ins} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
