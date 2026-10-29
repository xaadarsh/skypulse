import { useEffect, useState } from 'react'
import { DEFAULT_FEATURES, type Features, type Seat } from '../api'
import { PassengerInputs } from './PassengerInputs'
import { Button, Drawer, ErrorBox, fieldCls } from './ui'

/** Add or edit one passenger on a flight (slide-over form). */
export function PassengerForm({ open, seat, onClose, onSave }: {
  open: boolean; seat: Seat | null; onClose: () => void
  onSave: (v: { name: string; seat?: string; features: Features }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [seatNo, setSeatNo] = useState('')
  const [f, setF] = useState<Features>(DEFAULT_FEATURES)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setName(seat?.name ?? ''); setSeatNo(seat?.seat ?? ''); setF(seat?.base ?? DEFAULT_FEATURES); setErr('')
  }, [open, seat])
  const save = async () => {
    if (!name.trim()) { setErr('Please enter the passenger’s name.'); return }
    setBusy(true); setErr('')
    try { await onSave({ name: name.trim(), seat: seatNo.trim() || undefined, features: f }); onClose() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Drawer open={open} onClose={onClose} title={seat ? `Edit passenger · seat ${seat.seat}` : 'Add a passenger'} width={760}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <label className="text-[15px] font-medium text-muted">Full name
            <input className={`${fieldCls} mt-2`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" />
          </label>
          <label className="text-[15px] font-medium text-muted">Seat (optional)
            <input className={`${fieldCls} mt-2`} value={seatNo} maxLength={4} onChange={(e) => setSeatNo(e.target.value.toUpperCase())} placeholder="Auto" />
          </label>
        </div>
        <PassengerInputs value={f} onChange={setF} idPrefix="form" />
        {err && <ErrorBox error={err} />}
        <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-line bg-surface-strong px-6 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save passenger'}</Button>
        </div>
      </div>
    </Drawer>
  )
}
