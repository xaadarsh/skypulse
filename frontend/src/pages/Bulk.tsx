import { AnimatePresence, motion } from 'framer-motion'
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { OFFLINE, pct, type BatchResult } from '../api'
import { SortTable, type Col } from '../components/monitor'
import { tip } from '../components/insights/ModelLab'
import { Button, Card, EmptyState, ErrorBox, PageHero, RiskPill, Tabs } from '../components/ui'
import { CountUp } from '../lib/motion'

type Row = BatchResult['rows'][number]

/** Upload with real progress (fetch cannot report upload progress). */
function upload(file: File, onProgress: (p: number) => void) {
  return new Promise<BatchResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', file)
    xhr.open('POST', (import.meta.env.VITE_API ?? '/api') + '/batch')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 502) { reject(new Error(OFFLINE)); return }
      let body: { detail?: string } & BatchResult
      try { body = JSON.parse(xhr.responseText) } catch { reject(new Error(xhr.status >= 500 ? OFFLINE : `${xhr.status} ${xhr.statusText}`)); return }
      if (xhr.status >= 400) reject(new Error(typeof body.detail === 'string' ? body.detail : `${xhr.status}`)); else resolve(body)
    }
    xhr.onerror = () => reject(new Error(OFFLINE))
    xhr.send(fd)
  })
}

const cols: Col<Row>[] = [
  { key: 'row', label: '#', render: (r) => <span className="num text-muted">{r.row}</span>, sort: (r) => r.row },
  { key: 'name', label: 'Passenger', render: (r) => r.name ?? '—', sort: (r) => r.name ?? '' },
  { key: 'class', label: 'Class', render: (r) => r.class_name, sort: (r) => r.class_name },
  { key: 'age', label: 'Age', align: 'right', render: (r) => <span className="num">{r.age}</span>, sort: (r) => r.age },
  { key: 'risk', label: 'Risk', render: (r) => <RiskPill band={r.band} risk={r.risk} />, sort: (r) => r.risk },
  { key: 'reason', label: 'Biggest complaint', render: (r) => <span className="text-muted">{r.top_reason}</span> },
]

export default function Bulk() {
  const [res, setRes] = useState<BatchResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const [filter, setFilter] = useState<'all' | 'risk'>('all')
  const [limit, setLimit] = useState(200)

  const go = async (f: File) => {
    setFile(f); setErr(''); setRes(null); setProgress(0); setLimit(200)
    try { setRes(await upload(f, setProgress)) } catch (e) { setErr((e as Error).message) } finally { setProgress(null) }
  }
  const download = () => {
    if (!res) return
    const url = URL.createObjectURL(new Blob([res.csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: 'skypulse_predictions.csv' }).click()
    URL.revokeObjectURL(url)
  }
  const rows = useMemo(() => (res?.rows ?? []).filter((r) => filter === 'all' || r.risk >= 0.5), [res, filter])
  const donut = res ? [
    { name: 'At risk (≥ 50%)', value: res.rows.filter((r) => r.band === 'high').length, c: 'var(--risk)' },
    { name: 'Watch (30–50%)', value: res.rows.filter((r) => r.band === 'medium').length, c: 'var(--warn)' },
    { name: 'Safe (< 30%)', value: res.rows.filter((r) => r.band === 'low').length, c: 'var(--safe)' },
  ] : []
  const busy = progress !== null

  return (
    <div>
      <PageHero eyebrow="Batch scoring" title={<>Score a whole <span className="text-gradient">passenger list.</span></>} steps={['Drop a CSV', 'Review the risk list', 'Download the results']}>
        Upload up to 10,000 passengers in the Kaggle column format. Every row gets a risk score and its biggest complaint.
      </PageHero>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) go(f) }}
          className={`animated-border flex cursor-pointer flex-col items-center justify-center rounded-[2rem] px-8 text-center transition ${res && !busy ? 'min-h-[180px] py-6' : 'min-h-[300px] py-12'} ${drag ? 'scale-[1.01]' : ''}`}>
          <motion.span animate={{ y: drag ? -8 : [0, -6, 0] }} transition={drag ? {} : { repeat: Infinity, duration: 2.4 }}
            className="bg-accent grid h-20 w-20 place-items-center rounded-3xl text-[var(--on-accent)] shadow-[0_20px_50px_-15px_var(--a1)]"><UploadCloud size={36} /></motion.span>
          <span className="mt-6 font-display text-2xl font-semibold">{drag ? 'Drop it!' : res ? `${file?.name} · drop another file to replace` : file ? file.name : 'Drag & drop a CSV here'}</span>
          <span className="mt-2 text-base text-muted">or click to choose a file · max 5 MB</span>
          <input type="file" accept=".csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) go(f) }} data-testid="bulk-input" />
          <AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-8 w-full max-w-md" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)} aria-label="Upload progress">
                <div className="h-2.5 overflow-hidden rounded-full bg-line">
                  <motion.div className="bg-accent h-full rounded-full" animate={{ width: `${Math.max(8, (progress ?? 0) * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted">{(progress ?? 0) < 1 ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : 'Scoring every passenger…'}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </label>
        <div className="space-y-5">
          <Card>
            {res ? (
              <>
                <h3 className="font-display text-xl font-semibold">Summary</h3>
                <div className="relative mt-2 h-52">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={3} stroke="none" animationDuration={1100}>
                        {donut.map((d) => <Cell key={d.name} fill={d.c} />)}
                      </Pie>
                      <Tooltip {...tip} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div><div className="font-display text-4xl font-semibold text-risk"><CountUp value={res.summary.at_risk} /></div><div className="text-[13px] text-muted">of {res.summary.n} at risk</div></div>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 text-[15px]">
                  {donut.map((d) => <li key={d.name} className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.c }} />{d.name}</span><span className="num font-semibold">{d.value}</span></li>)}
                </ul>
                <p className="mt-3 text-[15px] text-muted">Average risk {pct(res.summary.avg_risk)}</p>
                <Button size="lg" className="mt-5 w-full" onClick={download}><Download size={18} />Download results CSV</Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3"><FileSpreadsheet className="text-brand" size={24} /><h3 className="font-display text-xl font-semibold">Try the sample</h3></div>
                <p className="mt-2 text-[15px] text-muted">40 real passengers from the Kaggle test file, with the answer (satisfaction) removed.</p>
                <a href="/sample_passengers.csv" download className="mt-4 inline-flex font-semibold text-brand underline underline-offset-4">Download sample_passengers.csv</a>
              </>
            )}
          </Card>
        </div>
      </div>
      <div className="mt-8">
        {err && <ErrorBox error={err} />}
        {!res && !busy && !err && <Card><EmptyState title="No file yet">Drop a CSV above — results show up here as a sortable table with a risk pill per passenger.</EmptyState></Card>}
        {res && (
          <Card>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-2xl font-semibold">Predictions <span className="text-base font-normal text-muted">· sorted by risk, click a header to re-sort</span></h3>
              <Tabs label="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: `All (${res.rows.length})` }, { value: 'risk', label: `At risk (${res.summary.at_risk})` }]} />
            </div>
            <SortTable rows={rows.slice(0, limit)} cols={cols} rowKey={(r) => r.row} initialSort="risk" maxHeight={640} />
            {rows.length > limit && <div className="mt-4 text-center"><Button variant="ghost" onClick={() => setLimit(limit + 500)}>Show {Math.min(500, rows.length - limit)} more of {rows.length - limit}</Button></div>}
          </Card>
        )}
      </div>
    </div>
  )
}
