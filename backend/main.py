"""SkyPulse API. Run: uvicorn backend.main:app --port 8000"""
import io
import json
import os
import random
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend import engine as E
from ml.pipeline import CLASS_NAMES, COLS, DATA, LABELS, RATINGS

DB = os.environ.get("SKYPULSE_DB", str(DATA / "skypulse.db"))
MAX_UPLOAD = 5 * 1024 * 1024

app = FastAPI(title="SkyPulse API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


SCHEMA = """
    CREATE TABLE IF NOT EXISTS flights (id INTEGER PRIMARY KEY, code TEXT, route TEXT, source TEXT,
        delay INTEGER DEFAULT 0, created_at TEXT);
    CREATE TABLE IF NOT EXISTS passengers (id INTEGER PRIMARY KEY,
        flight_id INTEGER REFERENCES flights(id) ON DELETE CASCADE, seat TEXT, name TEXT, dataset_id INTEGER,
        base TEXT, state TEXT, action TEXT, message TEXT, risk REAL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY,
        flight_id INTEGER REFERENCES flights(id) ON DELETE CASCADE, kind TEXT, detail TEXT, created_at TEXT);
    """


@contextmanager
def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)  # cheap no-op once tables exist; recreates them if the db file was deleted
    try:
        yield con
        con.commit()
    finally:
        con.close()




class Passenger(BaseModel):
    gender: int = Field(1, ge=0, le=1)
    customer_type: int = Field(1, ge=0, le=1)
    age: int = Field(35, ge=1, le=100)
    travel_type: int = Field(1, ge=0, le=1)
    travel_class: int = Field(0, ge=0, le=2)
    flight_distance: int = Field(1000, ge=10, le=10000)
    wifi: int = Field(3, ge=0, le=5)
    time_convenient: int = Field(3, ge=0, le=5)
    online_booking: int = Field(3, ge=0, le=5)
    gate_location: int = Field(3, ge=0, le=5)
    food: int = Field(3, ge=0, le=5)
    online_boarding: int = Field(3, ge=0, le=5)
    seat_comfort: int = Field(3, ge=0, le=5)
    entertainment: int = Field(3, ge=0, le=5)
    onboard_service: int = Field(3, ge=0, le=5)
    leg_room: int = Field(3, ge=0, le=5)
    baggage: int = Field(3, ge=0, le=5)
    checkin: int = Field(3, ge=0, le=5)
    inflight_service: int = Field(3, ge=0, le=5)
    cleanliness: int = Field(3, ge=0, le=5)
    dep_delay: float = Field(0, ge=0, le=2000)
    arr_delay: float = Field(0, ge=0, le=2000)


class PassengerIn(BaseModel):
    flight_id: int
    passenger_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=60)
    seat: Optional[str] = Field(None, max_length=4)
    features: Passenger


class EventIn(BaseModel):
    flight_id: int
    kind: str = Field(..., pattern="^(delay|wifi_outage|meal_shortage|turbulence)$")
    minutes: int = Field(0, ge=0, le=300)


class FlightRef(BaseModel):
    flight_id: int


class OptimizeIn(BaseModel):
    flight_id: int
    budget: int = Field(..., ge=0, le=10_000_000)
    apply: bool = False


class StrategyIn(BaseModel):
    service: str
    amount: int = Field(1, ge=1, le=3)
    travel_class: Optional[int] = Field(None, ge=0, le=2)
    segment: Optional[int] = None


# ---------- seat map ----------
def layout():
    seats = []
    for r in range(1, 26):
        cls, letters = (2, "ACDF") if r <= 5 else (1, "ABCDEF") if r <= 9 else (0, "ABCDEF")
        seats += [(f"{r}{l}", cls) for l in letters]
    return seats


SEATS = layout()
SEAT_CLASS = dict(SEATS)


def pick_seat(cls, taken, wanted=None):
    if wanted:
        wanted = wanted.upper().strip()
        if wanted in SEAT_CLASS and wanted not in taken:
            return wanted
    free = [s for s, c in SEATS if c == cls and s not in taken] or [s for s, _ in SEATS if s not in taken]
    if not free:
        raise HTTPException(400, "Flight is full (140 seats)")
    return free[0]


# ---------- helpers ----------
def now():
    return datetime.now().isoformat(timespec="seconds")


def log(c, fid, kind, detail):
    c.execute("INSERT INTO events (flight_id, kind, detail, created_at) VALUES (?,?,?,?)",
              (fid, kind, json.dumps(detail), now()))


def get_flight_row(c, fid):
    f = c.execute("SELECT * FROM flights WHERE id=?", (fid,)).fetchone()
    if not f:
        raise HTTPException(404, "Flight not found")
    return f


def passengers(c, fid):
    out = []
    for p in c.execute("SELECT * FROM passengers WHERE flight_id=?", (fid,)):
        out.append({**dict(p), "base": json.loads(p["base"]), "state": json.loads(p["state"])})
    return out


def rescore(c, fid):
    """Re-score every passenger on current state + action boost. Returns changed seats."""
    ps = passengers(c, fid)
    if not ps:
        return []
    probs = E.score([E.apply_boost(p["state"], p["action"]) for p in ps])
    changed = []
    for p, pr in zip(ps, probs):
        risk = round(1 - float(pr), 4)
        if p["risk"] is None or abs(risk - p["risk"]) > 1e-4:
            changed.append({"passenger_id": p["id"], "seat": p["seat"], "old_risk": p["risk"], "new_risk": risk})
            c.execute("UPDATE passengers SET risk=? WHERE id=?", (risk, p["id"]))
    return changed


def flight_json(c, fid):
    f = get_flight_row(c, fid)
    ps = passengers(c, fid)
    seats = []
    for p in ps:
        row = int("".join(ch for ch in p["seat"] if ch.isdigit()))
        seats.append({"id": p["id"], "seat": p["seat"], "row": row, "letter": p["seat"][-1], "name": p["name"],
                      "dataset_id": p["dataset_id"], "travel_class": p["state"]["travel_class"],
                      "class_name": CLASS_NAMES[p["state"]["travel_class"]], "risk": p["risk"],
                      "band": E.band(p["risk"]), "action": p["action"],
                      "action_label": E.ACTIONS[p["action"]]["label"] if p["action"] else None,
                      "message": p["message"], "features": E.apply_boost(p["state"], p["action"]),
                      "state": p["state"], "base": p["base"]})
    seats.sort(key=lambda s: (s["row"], s["letter"]))
    events = [{**dict(e), "detail": json.loads(e["detail"])}
              for e in c.execute("SELECT * FROM events WHERE flight_id=? ORDER BY id DESC", (fid,))]
    risks = [s["risk"] for s in seats]
    cost = sum(E.ACTIONS[s["action"]]["cost"] for s in seats if s["action"])
    return {"id": f["id"], "code": f["code"], "route": f["route"], "source": f["source"], "delay": f["delay"],
            "source_label": {"dataset": "Passengers from real dataset", "manifest": "Uploaded passenger manifest",
                             "manual": "Manually entered passengers"}[f["source"]],
            "created_at": f["created_at"], "seats": seats, "events": events, "layout": [list(s) for s in SEATS],
            "stats": {"passengers": len(seats), "at_risk": sum(r >= 0.5 for r in risks),
                      "medium": sum(0.3 <= r < 0.5 for r in risks),
                      "avg_satisfaction": round(1 - float(np.mean(risks)), 4) if risks else None,
                      "avg_risk": round(float(np.mean(risks)), 4) if risks else None,
                      "actions_cost": cost, "actions": sum(1 for s in seats if s["action"])}}


def insert_passenger(c, fid, row, name, seat, dataset_id, delay):
    state = {**row, "dep_delay": row["dep_delay"] + delay, "arr_delay": row["arr_delay"] + delay}
    c.execute("INSERT INTO passengers (flight_id, seat, name, dataset_id, base, state, action, message, risk) "
              "VALUES (?,?,?,?,?,?,NULL,NULL,NULL)", (fid, seat, name, dataset_id, json.dumps(row), json.dumps(state)))


def clean(row):
    return {k: (float(row[k]) if k in ("dep_delay", "arr_delay") else int(row[k])) for k in COLS}


async def read_csv(file: UploadFile):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "CSV larger than 5 MB")
    try:
        return E.parse_csv(pd.read_csv(io.BytesIO(raw)))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(400, "Could not read that file as CSV")


# ---------- prediction ----------
@app.get("/health")
def health():
    return {"ok": True, "model": E.MODEL_NAME}


@app.post("/predict")
def predict(p: Passenger):
    row = p.model_dump()
    prob = float(E.score(row)[0])
    reasons, base = E.explain(row, top=22)
    return {"prob": round(prob, 4), "risk": round(1 - prob, 4), "label": "satisfied" if prob >= 0.5 else "at risk",
            "band": E.band(1 - prob), "reasons": reasons, "base_prob": base, "model": E.MODEL_NAME,
            "segment": E.SEG_NAMES[int(E.segment_of(row)[0])]}


@app.post("/predict/booking")
def predict_booking(p: Passenger):
    prob = E.score_booking(p.model_dump())
    m = E.INSIGHTS["metrics"]["booking_model"]
    return {"prob": round(prob, 4), "risk": round(1 - prob, 4), "label": "satisfied" if prob >= 0.5 else "at risk",
            "band": E.band(1 - prob), "model": "XGBoost (booking-time, 6 features)",
            "accuracy": m["accuracy"], "f1": m["f1"]}


@app.post("/recommend")
def recommend(p: Passenger):
    return E.recommend(p.model_dump())


# ---------- flights ----------
@app.post("/flight")
async def create_flight(source: str = Form(...), code: str = Form(""), route: str = Form(""),
                        count: int = Form(120), seed: Optional[int] = Form(None),
                        file: Optional[UploadFile] = File(None)):
    if source not in ("dataset", "manifest", "manual"):
        raise HTTPException(400, "source must be dataset, manifest or manual")
    count = max(10, min(count, 140))
    if source == "manifest" and file is None:
        raise HTTPException(400, "Upload a manifest CSV")
    manifest = await read_csv(file) if source == "manifest" else None
    if source == "manifest" and (manifest is None or manifest.empty):
        raise HTTPException(400, "Upload a manifest CSV")
    if manifest is not None and len(manifest) > 140:
        raise HTTPException(400, "Manifest has more than 140 passengers")
    with db() as c:
        cur = c.execute("INSERT INTO flights (code, route, source, delay, created_at) VALUES (?,?,?,0,?)",
                        (code.strip()[:12] or "SP", route.strip()[:40] or "DEL → BOM", source, now()))
        fid = cur.lastrowid
        if not code.strip():
            c.execute("UPDATE flights SET code=? WHERE id=?", (f"SP-{100 + fid}", fid))
        taken = set()
        if source == "dataset":
            rng = random.Random(seed if seed is not None else fid)
            # fill ~ the share of seats per cabin: 20 Business, 24 Eco Plus, 96 Eco
            quota = {2: round(count * 20 / 140), 1: round(count * 24 / 140)}
            quota[0] = count - quota[1] - quota[2]
            for cls, n in quota.items():
                pool = E.TEST[E.TEST.travel_class == cls].sample(n, random_state=rng.randint(0, 10**6))
                zone = [s for s, k in SEATS if k == cls]
                for seat, (_, r) in zip(sorted(rng.sample(zone, n), key=zone.index), pool.iterrows()):
                    # profile and ratings are real; the flight starts on time, delay comes from events
                    row = {**clean(r), "dep_delay": 0.0, "arr_delay": 0.0}
                    insert_passenger(c, fid, row, f"Passenger {seat}", seat, int(r["dataset_id"]), 0)
            log(c, fid, "created", {"source": "dataset", "passengers": count,
                                    "note": "Real test-set passengers (profile + ratings); delay set by events"})
        elif source == "manifest":
            for _, r in manifest.iterrows():
                row = clean(r)
                seat = pick_seat(row["travel_class"], taken, r["seat"] if isinstance(r["seat"], str) else None)
                taken.add(seat)
                name = str(r["name"]).strip()[:60] if isinstance(r["name"], str) and r["name"].strip() else f"Passenger {seat}"
                insert_passenger(c, fid, row, name, seat, None, 0)
            log(c, fid, "created", {"source": "manifest", "passengers": len(manifest),
                                    "file": (file.filename or "")[:80]})
        else:
            log(c, fid, "created", {"source": "manual", "passengers": 0})
        rescore(c, fid)
        return flight_json(c, fid)


@app.get("/flights")
def list_flights():
    with db() as c:
        rows = c.execute("""SELECT f.*, COUNT(p.id) n, SUM(p.risk >= 0.5) at_risk, AVG(p.risk) avg_risk,
                            (SELECT COUNT(*) FROM events e WHERE e.flight_id=f.id) events
                            FROM flights f LEFT JOIN passengers p ON p.flight_id=f.id GROUP BY f.id ORDER BY f.id DESC""")
        return [{**dict(r), "at_risk": r["at_risk"] or 0,
                 "avg_satisfaction": round(1 - r["avg_risk"], 4) if r["avg_risk"] is not None else None}
                for r in rows]


@app.get("/flight/{fid}")
def get_flight(fid: int):
    with db() as c:
        return flight_json(c, fid)


@app.delete("/flight/{fid}")
def delete_flight(fid: int):
    with db() as c:
        get_flight_row(c, fid)
        c.execute("DELETE FROM flights WHERE id=?", (fid,))
    return {"deleted": fid}


@app.post("/passenger")
def upsert_passenger(p: PassengerIn):
    row = p.features.model_dump()
    with db() as c:
        f = get_flight_row(c, p.flight_id)
        if p.passenger_id:
            old = c.execute("SELECT * FROM passengers WHERE id=? AND flight_id=?",
                            (p.passenger_id, p.flight_id)).fetchone()
            if not old:
                raise HTTPException(404, "Passenger not found")
            taken = {r["seat"] for r in c.execute("SELECT seat FROM passengers WHERE flight_id=? AND id!=?",
                                                  (p.flight_id, p.passenger_id))}
            seat = pick_seat(row["travel_class"], taken, p.seat or old["seat"])
            state = {**row, "dep_delay": row["dep_delay"] + f["delay"], "arr_delay": row["arr_delay"] + f["delay"]}
            c.execute("UPDATE passengers SET name=?, seat=?, base=?, state=? WHERE id=?",
                      (p.name, seat, json.dumps(row), json.dumps(state), p.passenger_id))
            log(c, p.flight_id, "passenger_edited", {"seat": seat, "name": p.name})
        else:
            taken = {r["seat"] for r in c.execute("SELECT seat FROM passengers WHERE flight_id=?", (p.flight_id,))}
            seat = pick_seat(row["travel_class"], taken, p.seat)
            insert_passenger(c, p.flight_id, row, p.name, seat, None, f["delay"])
            log(c, p.flight_id, "passenger_added", {"seat": seat, "name": p.name})
        rescore(c, p.flight_id)
        return flight_json(c, p.flight_id)


@app.delete("/passenger/{pid}")
def delete_passenger(pid: int):
    with db() as c:
        p = c.execute("SELECT * FROM passengers WHERE id=?", (pid,)).fetchone()
        if not p:
            raise HTTPException(404, "Passenger not found")
        c.execute("DELETE FROM passengers WHERE id=?", (pid,))
        log(c, p["flight_id"], "passenger_removed", {"seat": p["seat"], "name": p["name"]})
        return flight_json(c, p["flight_id"])


@app.post("/flight/event")
def flight_event(ev: EventIn):
    with db() as c:
        f = get_flight_row(c, ev.flight_id)
        ps = passengers(c, ev.flight_id)
        before = {p["id"]: p["risk"] for p in ps}
        for p in ps:
            s, b = p["state"], p["base"]
            if ev.kind == "delay":
                s["dep_delay"] = b["dep_delay"] + ev.minutes
                s["arr_delay"] = b["arr_delay"] + ev.minutes
            elif ev.kind == "wifi_outage" and s["wifi"] > 0:
                s["wifi"] = max(1, s["wifi"] - 3)
            elif ev.kind == "meal_shortage" and s["travel_class"] != 2 and s["food"] > 0:
                s["food"] = max(1, s["food"] - 2)  # Business cabin is catered first
            elif ev.kind == "turbulence":
                for k in ("seat_comfort", "inflight_service", "food"):
                    if s[k] > 0:
                        s[k] = max(1, s[k] - 1)
            c.execute("UPDATE passengers SET state=? WHERE id=?", (json.dumps(s), p["id"]))
        if ev.kind == "delay":
            c.execute("UPDATE flights SET delay=? WHERE id=?", (ev.minutes, ev.flight_id))
        changed = rescore(c, ev.flight_id)
        out = flight_json(c, ev.flight_id)
        log(c, ev.flight_id, ev.kind, {"minutes": ev.minutes if ev.kind == "delay" else None,
                                       "changed": len(changed), "at_risk_after": out["stats"]["at_risk"],
                                       "avg_risk_before": round(float(np.mean(list(before.values()))), 4) if ps else None,
                                       "avg_risk_after": out["stats"]["avg_risk"]})
        out["events"] = flight_json(c, ev.flight_id)["events"]
        return {"changed": changed, "flight": out}


@app.post("/flight/recover")
def flight_recover(req: FlightRef):
    with db() as c:
        get_flight_row(c, req.flight_id)
        ps = passengers(c, req.flight_id)
        if not ps:
            raise HTTPException(400, "Flight has no passengers")
        state_probs = E.score([p["state"] for p in ps])
        avg_before = float(np.mean([p["risk"] for p in ps]))
        actions = []
        for p, pr in zip(ps, state_probs):
            if 1 - pr < 0.5:
                continue
            act, reason = E.choose_action(p["state"])
            after = float(E.score(E.apply_boost(p["state"], act))[0])
            if after < pr:  # rule action would make things worse: best action at the same or lower cost
                opts = [a for a in E.ACTIONS if E.ACTIONS[a]["cost"] <= E.ACTIONS[act]["cost"]]
                ps = E.score([E.apply_boost(p["state"], a) for a in opts])
                act, after = opts[int(np.argmax(ps))], float(ps.max())
                if after < pr:  # nothing helps: personal apology, no expected change
                    act, after = "apology", float(pr)
            msg = E.message(p["name"], reason, act)
            c.execute("UPDATE passengers SET action=?, message=? WHERE id=?", (act, msg, p["id"]))
            actions.append({"passenger_id": p["id"], "seat": p["seat"], "name": p["name"], "action": act,
                            "action_label": E.ACTIONS[act]["label"], "icon": E.ACTIONS[act]["icon"],
                            "cost": E.ACTIONS[act]["cost"],
                            "reason": f"Top negative driver: {E.describe(reason['feature'], reason['value'])}" if reason else "No single negative driver",
                            "risk_before": round(1 - float(pr), 4), "risk_after": round(1 - after, 4),
                            "message": msg})
        rescore(c, req.flight_id)
        out = flight_json(c, req.flight_id)
        summary = {"actions": len(actions), "total_cost": sum(a["cost"] for a in actions),
                   "avg_risk_before": round(avg_before, 4), "avg_risk_after": out["stats"]["avg_risk"],
                   "saved": sum(1 for a in actions if a["risk_after"] < 0.5)}
        log(c, req.flight_id, "recover", summary)
        actions.sort(key=lambda a: a["risk_after"] - a["risk_before"])  # biggest risk drop first
        out["events"] = flight_json(c, req.flight_id)["events"]
        return {**summary, "list": actions, "flight": out}


@app.post("/flight/optimize")
def flight_optimize(req: OptimizeIn):
    with db() as c:
        get_flight_row(c, req.flight_id)
        ps = passengers(c, req.flight_id)
        probs = E.score([p["state"] for p in ps]) if ps else []
        at_risk = [(p["id"], p["state"]) for p, pr in zip(ps, probs) if 1 - pr >= 0.5]
        res = E.optimize(at_risk, req.budget)
        seat = {p["id"]: p for p in ps}
        for r in res["plan"]:
            r["seat"], r["name"] = seat[r["passenger_id"]]["seat"], seat[r["passenger_id"]]["name"]
        if req.apply:
            c.execute("UPDATE passengers SET action=NULL, message=NULL WHERE flight_id=?", (req.flight_id,))
            for r in res["plan"]:
                p = seat[r["passenger_id"]]
                _, reason = E.choose_action(p["state"])
                c.execute("UPDATE passengers SET action=?, message=? WHERE id=?",
                          (r["action"], E.message(p["name"], reason, r["action"]), p["id"]))
            rescore(c, req.flight_id)
        log(c, req.flight_id, "optimize", {"budget": req.budget, "applied": req.apply, "total_cost": res["total_cost"],
                                           "expected_saved": res["expected_saved"], "flipped": res["flipped"]})
        res["flight"] = flight_json(c, req.flight_id)
        return res


# ---------- airline-wide ----------
@app.post("/strategy")
def strategy(req: StrategyIn):
    if req.service not in RATINGS:
        raise HTTPException(400, "service must be one of the 14 rating features")
    df = E.TEST
    if req.travel_class is not None:
        df = df[df.travel_class == req.travel_class]
    if req.segment is not None:
        df = df[df.segment == req.segment]
    if df.empty:
        raise HTTPException(400, "No passengers match that filter")
    before = E.score(df)
    after_df = df.copy()
    m = after_df[req.service] > 0
    after_df.loc[m, req.service] = (after_df.loc[m, req.service] + req.amount).clip(upper=5)
    after = E.score(after_df)
    b, a = float((before >= 0.5).mean()), float((after >= 0.5).mean())
    return {"n": int(len(df)), "service": req.service, "label": LABELS[req.service], "amount": req.amount,
            "before": round(b, 4), "after": round(a, 4), "lift_pp": round((a - b) * 100, 2),
            "newly_satisfied": int(((after >= 0.5) & (before < 0.5)).sum()),
            "actual_rate": round(float(df["satisfied"].mean()), 4),
            "avg_prob_before": round(float(before.mean()), 4), "avg_prob_after": round(float(after.mean()), 4)}


@app.post("/batch")
async def batch(file: UploadFile = File(...)):
    df = await read_csv(file)
    if len(df) > 10000:
        raise HTTPException(400, "Batch limited to 10,000 rows")
    X = df[COLS]
    probs = E.score(X)
    sv = E.EXPLAINER.shap_values(E.transform(X, E.ARR_MEDIAN))
    sv = np.asarray(sv[1] if isinstance(sv, list) else sv)
    if sv.ndim == 3:
        sv = sv[:, :, 1]
    rows = []
    for i, (pr, s) in enumerate(zip(probs, sv)):
        j = int(np.argmin(s))
        risk = round(1 - float(pr), 4)
        r = X.iloc[i]
        rows.append({"row": i + 1, "name": df["name"].iloc[i] if isinstance(df["name"].iloc[i], str) else None,
                     "class_name": CLASS_NAMES[int(r.travel_class)], "age": int(r.age), "prob": round(float(pr), 4),
                     "risk": risk, "band": E.band(risk), "prediction": "satisfied" if pr >= 0.5 else "at risk",
                     "top_reason": E.describe(COLS[j], r[COLS[j]]) if s[j] < 0 else "No negative driver"})
    out = pd.DataFrame(rows)
    return {"rows": rows, "csv": out.to_csv(index=False), "summary": {
        "n": len(rows), "at_risk": int((out.risk >= 0.5).sum()), "avg_risk": round(float(out.risk.mean()), 4)}}


@app.get("/insights")
def insights():
    return {**E.INSIGHTS, "served_model": E.MODEL_NAME,
            "actions": [{"key": k, **{x: v[x] for x in ("label", "cost", "icon", "boost")}} for k, v in E.ACTIONS.items()],
            "features": [{"key": k, "label": LABELS[k]} for k in COLS],
            "rules": E.RULES}
