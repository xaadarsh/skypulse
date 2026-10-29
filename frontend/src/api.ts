const BASE = import.meta.env.VITE_API ?? '/api'

export type Features = Record<
  | 'gender' | 'customer_type' | 'age' | 'travel_type' | 'travel_class' | 'flight_distance'
  | 'wifi' | 'time_convenient' | 'online_booking' | 'gate_location' | 'food' | 'online_boarding'
  | 'seat_comfort' | 'entertainment' | 'onboard_service' | 'leg_room' | 'baggage' | 'checkin'
  | 'inflight_service' | 'cleanliness' | 'dep_delay' | 'arr_delay',
  number
>

export type Band = 'low' | 'medium' | 'high'
export type Reason = { feature: string; label: string; value: number; shap: number; impact: number; text: string }
export type Prediction = {
  prob: number; risk: number; label: string; band: Band; reasons: Reason[]; base_prob: number; model: string; segment: string
}
export type BookingPrediction = { prob: number; risk: number; label: string; band: Band; model: string; accuracy: number; f1: number }
export type Recommendation = {
  already_satisfied: boolean; start_prob: number; end_prob: number; flipped: boolean
  changes: { feature: string; label: string; from: number; to: number }[]
}
export type Seat = {
  id: number; seat: string; row: number; letter: string; name: string; dataset_id: number | null
  travel_class: number; class_name: string; risk: number; band: Band; action: string | null
  action_label: string | null; message: string | null; features: Features; state: Features; base: Features
}
export type FlightEvent = { id: number; kind: string; detail: Record<string, unknown>; created_at: string }
export type Flight = {
  id: number; code: string; route: string; source: 'dataset' | 'manifest' | 'manual'; source_label: string
  delay: number; created_at: string; seats: Seat[]; events: FlightEvent[]; layout: [string, number][]
  stats: { passengers: number; at_risk: number; medium: number; avg_satisfaction: number | null; avg_risk: number | null; actions_cost: number; actions: number }
}
export type FlightSummary = { id: number; code: string; route: string; source: string; created_at: string; n: number; at_risk: number; avg_satisfaction: number | null; events: number }
export type RecoverAction = {
  passenger_id: number; seat: string; name: string; action: string; action_label: string; icon: string
  cost: number; reason: string; risk_before: number; risk_after: number; message: string
}
export type RecoverResult = { actions: number; total_cost: number; avg_risk_before: number; avg_risk_after: number; saved: number; list: RecoverAction[]; flight: Flight }
export type OptimizeResult = {
  plan: { passenger_id: number; seat: string; name: string; action: string; action_label: string; cost: number; risk_before: number; risk_after: number; gain: number }[]
  total_cost: number; budget: number; expected_saved: number; flipped: number; at_risk: number; flight: Flight
}
export type ModelMetrics = {
  accuracy: number; precision: number; recall: number; f1: number; roc_auc: number
  confusion_matrix: number[][]; roc_curve: [number, number][]; train_time_s: number; tuning_time_s?: number; note?: string
  best_params?: Record<string, unknown>
}
export type Segment = {
  id: number; name: string; size: number; share: number; satisfied_rate: number; avg_age: number; avg_distance: number
  business_class_share: number; business_travel_share: number; loyal_share: number; avg_rating: number
  avg_dep_delay: number; ratings: Record<string, number>; trait: string; mood: 'happy' | 'unhappy' | 'mixed'; tagline: string
}
export type Group = { group: string; n: number; satisfied_rate: number }
export type Insights = {
  metrics: {
    models: Record<string, ModelMetrics>; best_model: string; served_model: string; booking_model: ModelMetrics
    tree_importance: Record<string, { feature: string; label: string; importance: number }[]>
    split: { train: number; test: number; random_state: number }; serving_reason?: string
  }
  segments: { k: number; silhouette: Record<string, number>; segments: Segment[]; pca_explained: number[]; points: [number, number, number, number][] }
  fairness: { attribute: string; group: string; n: number; accuracy: number; f1: number; satisfied_rate: number }[]
  shap_global: { feature: string; label: string; importance: number }[]
  eda: {
    rows: number; train_rows: number; test_rows: number; satisfied_rate: number; missing_arrival_delay: number
    arrival_delay_train_median: number; by_class: Group[]; by_travel_type: Group[]; by_customer_type: Group[]
    by_delay: Group[]; by_age: Group[]; ratings_gap: { feature: string; label: string; satisfied: number; dissatisfied: number }[]
  }
  served_model: string
  actions: { key: string; label: string; cost: number; icon: string; boost: Record<string, number> }[]
  features: { key: string; label: string }[]
  rules: Record<string, string>
}
export type StrategyResult = {
  n: number; service: string; label: string; amount: number; before: number; after: number; lift_pp: number
  newly_satisfied: number; actual_rate: number; avg_prob_before: number; avg_prob_after: number
}
export type BatchResult = {
  rows: { row: number; name: string | null; class_name: string; age: number; prob: number; risk: number; band: Band; prediction: string; top_reason: string }[]
  csv: string; summary: { n: number; at_risk: number; avg_risk: number }
}

export const OFFLINE = 'Can’t reach the SkyPulse server. Make sure it is running (start.bat), then try again.'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response
  try { r = await fetch(BASE + path, init) } catch { throw new Error(OFFLINE) }
  if (r.status === 502 || r.status === 503 || r.status === 504) throw new Error(OFFLINE)
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try {
      const j = await r.json()
      msg = typeof j.detail === 'string' ? j.detail : j.detail?.[0]?.msg ?? msg
    } catch {
      // a non-JSON 5xx comes from the dev/preview proxy when the API process is down
      if (r.status >= 500) throw new Error(OFFLINE)
    }
    throw new Error(msg)
  }
  return r.json()
}
const post = <T,>(path: string, body: unknown) =>
  req<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

let insightsCache: Promise<Insights> | null = null

export const api = {
  insights: () => (insightsCache ??= req<Insights>('/insights').catch((e) => { insightsCache = null; throw e })),
  predict: (f: Features) => post<Prediction>('/predict', f),
  predictBooking: (f: Features) => post<BookingPrediction>('/predict/booking', f),
  recommend: (f: Features) => post<Recommendation>('/recommend', f),
  flights: () => req<FlightSummary[]>('/flights'),
  flight: (id: number) => req<Flight>(`/flight/${id}`),
  deleteFlight: (id: number) => req<{ deleted: number }>(`/flight/${id}`, { method: 'DELETE' }),
  createFlight: (form: FormData) => req<Flight>('/flight', { method: 'POST', body: form }),
  upsertPassenger: (body: { flight_id: number; passenger_id?: number; name: string; seat?: string; features: Features }) =>
    post<Flight>('/passenger', body),
  deletePassenger: (id: number) => req<Flight>(`/passenger/${id}`, { method: 'DELETE' }),
  event: (flight_id: number, kind: string, minutes = 0) =>
    post<{ changed: { passenger_id: number; seat: string; old_risk: number; new_risk: number }[]; flight: Flight }>('/flight/event', { flight_id, kind, minutes }),
  recover: (flight_id: number) => post<RecoverResult>('/flight/recover', { flight_id }),
  optimize: (flight_id: number, budget: number, apply = false) => post<OptimizeResult>('/flight/optimize', { flight_id, budget, apply }),
  strategy: (body: { service: string; amount: number; travel_class: number | null; segment: number | null }) =>
    post<StrategyResult>('/strategy', body),
  batch: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<BatchResult>('/batch', { method: 'POST', body: fd })
  },
}

export const RATING_KEYS = [
  'wifi', 'time_convenient', 'online_booking', 'gate_location', 'food', 'online_boarding', 'seat_comfort',
  'entertainment', 'onboard_service', 'leg_room', 'baggage', 'checkin', 'inflight_service', 'cleanliness',
] as const

export const LABELS: Record<string, string> = {
  gender: 'Gender', customer_type: 'Customer type', age: 'Age', travel_type: 'Type of travel', travel_class: 'Class',
  flight_distance: 'Flight distance', wifi: 'Inflight wifi', time_convenient: 'Departure/arrival time',
  online_booking: 'Online booking', gate_location: 'Gate location', food: 'Food and drink', online_boarding: 'Online boarding',
  seat_comfort: 'Seat comfort', entertainment: 'Inflight entertainment', onboard_service: 'On-board service',
  leg_room: 'Leg room', baggage: 'Baggage handling', checkin: 'Check-in service', inflight_service: 'Inflight service',
  cleanliness: 'Cleanliness', dep_delay: 'Departure delay', arr_delay: 'Arrival delay',
}

export const CLASS_NAMES = ['Eco', 'Eco Plus', 'Business']

export const DEFAULT_FEATURES: Features = {
  gender: 1, customer_type: 1, age: 34, travel_type: 1, travel_class: 0, flight_distance: 850,
  wifi: 2, time_convenient: 3, online_booking: 2, gate_location: 3, food: 3, online_boarding: 2, seat_comfort: 3,
  entertainment: 3, onboard_service: 3, leg_room: 3, baggage: 4, checkin: 3, inflight_service: 4, cleanliness: 3,
  dep_delay: 25, arr_delay: 30,
}

export const pct = (x: number | null | undefined, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
export const inr = (x: number) => '₹' + x.toLocaleString('en-IN')
