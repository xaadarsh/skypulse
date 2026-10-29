"""Model loading, scoring, explanations, recommendations and recovery logic."""
import json
import math

import joblib
import numpy as np
import pandas as pd
import shap

from ml.pipeline import ART, BOOKING, CLASS_NAMES, COLS, DATA, LABELS, RATINGS, encode, transform

_full = joblib.load(ART / "model_full.joblib")
MODEL, MODEL_NAME, ARR_MEDIAN = _full["model"], _full["name"], _full["arr_median"]
BOOKING_MODEL = joblib.load(ART / "model_booking.joblib")
_seg = joblib.load(ART / "segments.joblib")
EXPLAINER = shap.TreeExplainer(MODEL)
TEST = pd.read_csv(DATA / "test_encoded.csv")


def _load(name):
    return json.load(open(ART / name))


INSIGHTS = {"metrics": _load("metrics.json"), "segments": _load("segments.json"),
            "fairness": _load("fairness.json"), "shap_global": _load("shap_global.json"), "eda": _load("eda.json")}
SEG_NAMES = {s["id"]: s["name"] for s in INSIGHTS["segments"]["segments"]}

# Assumed costs (configurable) and the feature boost each action is assumed to give
ACTIONS = {
    "apology": {"label": "Apology message", "cost": 0, "icon": "message",
                "boost": {}},  # goodwill only: no rating change is assumed
    "meal": {"label": "Free meal", "cost": 400, "icon": "meal",
             "boost": {"food": 2, "inflight_service": 1}},
    "wifi": {"label": "Wifi voucher", "cost": 300, "icon": "wifi",
             "boost": {"wifi": 2, "entertainment": 1}},
    "baggage": {"label": "Priority baggage", "cost": 200, "icon": "bag",
                "boost": {"baggage": 2, "checkin": 1}},
    "lounge": {"label": "Lounge pass", "cost": 1500, "icon": "lounge",
               "boost": {"food": 1, "onboard_service": 1, "inflight_service": 1, "time_convenient": 1}},
    "upgrade": {"label": "Seat upgrade", "cost": 4000, "icon": "seat",
                "boost": {"seat_comfort": 2, "leg_room": 2, "travel_class": 2}},
}
# Rule table: top negative reason -> action
RULES = {
    "wifi": "wifi", "entertainment": "wifi", "online_booking": "wifi",
    "food": "meal", "inflight_service": "meal",
    "baggage": "baggage", "checkin": "baggage", "gate_location": "baggage", "online_boarding": "baggage",
    "dep_delay": "lounge", "arr_delay": "lounge", "time_convenient": "lounge",
    "seat_comfort": "upgrade", "leg_room": "upgrade", "travel_class": "upgrade",
}
ACTIONABLE = set(RATINGS) | {"dep_delay", "arr_delay"}


def frame(rows):
    return pd.DataFrame(rows if isinstance(rows, list) else [rows])[COLS]


def score(rows) -> np.ndarray:
    """P(satisfied) for one dict or a list of dicts / DataFrame."""
    df = rows if isinstance(rows, pd.DataFrame) else frame(rows)
    return MODEL.predict_proba(transform(df, ARR_MEDIAN))[:, 1]


def score_booking(row) -> float:
    return float(BOOKING_MODEL.predict_proba(pd.DataFrame([row])[BOOKING].astype(float))[:, 1][0])


def band(risk):
    return "high" if risk >= 0.5 else "medium" if risk >= 0.3 else "low"


def describe(key, value):
    if key in RATINGS:
        return f"{LABELS[key]} rated {int(value)}"
    if key in ("dep_delay", "arr_delay"):
        return f"{LABELS[key]} {int(value)} min"
    if key == "gender":
        return "Gender: " + ("Male" if value else "Female")
    if key == "customer_type":
        return "Loyal customer" if value else "Disloyal (new) customer"
    if key == "travel_type":
        return "Business trip" if value else "Personal trip"
    if key == "travel_class":
        return "Class: " + CLASS_NAMES[int(value)]
    if key == "age":
        return f"Age {int(value)}"
    return f"Flight distance {int(value)}"


def explain(row, top=8):
    """SHAP reasons in plain English.

    impact = percentage-point change in P(satisfied), from walking the SHAP values in order of size
    (a waterfall from the base rate), so the impacts add up exactly to prediction - base rate.
    """
    x = transform(frame(row), ARR_MEDIAN)
    sv = EXPLAINER.shap_values(x)
    sv = np.asarray(sv[1] if isinstance(sv, list) else sv)
    if sv.ndim == 3:
        sv = sv[:, :, 1]
    sv = sv[0]
    base = float(np.ravel(EXPLAINER.expected_value)[-1])
    sig = lambda z: 1 / (1 + math.exp(-z))
    reasons, z = [], base
    for i in np.argsort(-np.abs(sv)):
        k, s = COLS[i], float(sv[i])
        impact = round((sig(z + s) - sig(z)) * 100, 1)
        z += s
        reasons.append({"feature": k, "label": LABELS[k], "value": row[k], "shap": round(s, 4), "impact": impact,
                        "text": f"{describe(k, row[k])} → {'+' if impact >= 0 else '−'}{abs(impact):.0f}%"})
    return reasons[:top], round(sig(base), 4)


def recommend(row, max_step=2):
    """Greedy: smallest set of rating increases (max +2 each, cap 5) that makes P(satisfied) >= 0.5."""
    start = float(score(row)[0])
    cur = dict(row)
    if start >= 0.5:
        return {"already_satisfied": True, "start_prob": round(start, 4), "end_prob": round(start, 4),
                "changes": [], "flipped": True}
    prob = start
    while prob < 0.5:
        cands = []
        for k in RATINGS:
            if row[k] == 0:  # 0 = not applicable in the survey
                continue
            for v in (cur[k] + 1, cur[k] + 2):
                if v <= 5 and v - row[k] <= max_step:
                    cands.append({**cur, k: v})
        if not cands:
            break
        ps = score(cands)
        i = int(np.argmax(ps))
        if ps[i] <= prob:
            break
        cur, prob = cands[i], float(ps[i])
    changed = [k for k in RATINGS if cur[k] != row[k]]
    if prob >= 0.5:  # prune changes that are not needed
        for k in sorted(changed, key=lambda k: cur[k] - row[k]):
            trial = {**cur, k: row[k]}
            p = float(score(trial)[0])
            if p >= 0.5:
                cur, prob = trial, p
    changes = [{"feature": k, "label": LABELS[k], "from": int(row[k]), "to": int(cur[k])}
               for k in RATINGS if cur[k] != row[k]]
    return {"already_satisfied": False, "start_prob": round(start, 4), "end_prob": round(prob, 4),
            "changes": changes, "flipped": prob >= 0.5}


BOOST_CAP = 4  # an action can lift a service to "good" (4), never to "perfect" (5)


def apply_boost(row, action):
    """Ratings the action improves go up by its boost, capped at 4 and never lowered.

    In this dataset a rating of 5 (especially wifi) almost guarantees "satisfied"; a voucher or meal
    cannot buy that, so letting actions reach 5 gave unrealistic 100% -> 0% risk drops.
    """
    if not action:
        return dict(row)
    out = dict(row)
    for k, d in ACTIONS[action]["boost"].items():
        if k == "travel_class":
            out[k] = 2
        elif out[k] > 0:  # 0 = not applicable in the survey
            out[k] = max(out[k], min(BOOST_CAP, out[k] + d))
    return out


def choose_action(row):
    reasons, _ = explain(row, top=len(COLS))
    neg = [r for r in reasons if r["shap"] < 0 and r["feature"] in RULES]
    if not neg:
        return "apology", None
    top = neg[0]
    act = RULES[top["feature"]]
    if act == "upgrade" and row["travel_class"] == 2:  # already in Business
        act = "apology"
    return act, top


def message(name, reason, action):
    why = f"your {reason['label'].lower()} experience ({describe(reason['feature'], reason['value']).lower()})" \
        if reason else "your journey today"
    return (f"Dear {name}, we're sorry about {why}. As a small gesture, our crew has arranged a "
            f"{ACTIONS[action]['label'].lower()} for you. Thank you for flying with us.")


def optimize(passengers, budget):
    """Multiple-choice knapsack, greedy on extra satisfaction probability per rupee.

    passengers: list of (pid, state_features). Each passenger gets at most one action.
    """
    options = {}
    for pid, row in passengers:
        rows = [apply_boost(row, a) for a in ACTIONS]
        ps = score(rows)
        base = float(score(row)[0])
        options[pid] = {"base": base, "opts": {a: float(p) for a, p in zip(ACTIONS, ps)}}
    chosen = {pid: None for pid in options}
    spent = 0
    # ponytail: greedy incremental MCKP, not exact DP; fine for <500 passengers
    while True:
        best = None
        for pid, o in options.items():
            ca = chosen[pid]
            cur_p = o["opts"][ca] if ca else o["base"]
            cur_c = ACTIONS[ca]["cost"] if ca else 0
            for a, p in o["opts"].items():
                gain, cost = p - cur_p, ACTIONS[a]["cost"] - cur_c
                if gain <= 1e-4 or spent + cost > budget:
                    continue
                ratio = (gain / cost if cost > 0 else float("inf"), gain)
                if best is None or ratio > best[0]:
                    best = (ratio, pid, a, cost)
        if best is None:
            break
        _, pid, a, cost = best
        chosen[pid] = a
        spent += cost
    plan = []
    for pid, a in chosen.items():
        o = options[pid]
        if a:
            plan.append({"passenger_id": pid, "action": a, "action_label": ACTIONS[a]["label"],
                         "cost": ACTIONS[a]["cost"], "risk_before": round(1 - o["base"], 4),
                         "risk_after": round(1 - o["opts"][a], 4), "gain": round(o["opts"][a] - o["base"], 4)})
    plan.sort(key=lambda r: -r["gain"])
    return {"plan": plan, "total_cost": spent, "budget": budget,
            "expected_saved": round(sum(r["gain"] for r in plan), 2),
            "flipped": sum(1 for r in plan if r["risk_before"] >= 0.5 > r["risk_after"]),
            "at_risk": len(passengers)}


def parse_csv(df: pd.DataFrame) -> pd.DataFrame:
    """Accept the original Kaggle format (text values) or the encoded snake_case format."""
    extra = {c.lower(): c for c in df.columns}
    name = df[extra["name"]] if "name" in extra else None
    seat = df[extra["seat"]] if "seat" in extra else None
    if "Customer Type" in df.columns:
        if "satisfaction" in df.columns:
            df = df.drop(columns="satisfaction")
        enc = encode(df)
    else:
        enc = df.copy()
    missing = [c for c in COLS if c not in enc.columns]
    if missing:
        raise ValueError(f"CSV is missing columns: {', '.join(missing)}")
    out = enc[COLS].copy()
    out["arr_delay"] = out["arr_delay"].fillna(out["dep_delay"])
    if out.isna().any().any():
        bad = out.columns[out.isna().any()].tolist()
        raise ValueError(f"CSV has empty or unrecognised values in: {', '.join(bad)}")
    out["name"] = name.values if name is not None else None
    out["seat"] = seat.values if seat is not None else None
    return out


def segment_of(rows):
    x = _seg["scaler"].transform(transform(frame(rows), ARR_MEDIAN))
    return _seg["kmeans"].predict(x)
