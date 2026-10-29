"""Segment profiles, short unique persona names and 3D PCA points.

Used by ml/train.py; can also refresh segments.json from the saved models:  python -m ml.segments
"""
import json

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA

from ml.pipeline import LABELS, RATINGS

RS = 42
SHORT = {"wifi": "Wi-Fi", "time_convenient": "Schedule", "online_booking": "Booking", "gate_location": "Gate",
         "food": "Food", "online_boarding": "Boarding", "seat_comfort": "Comfort", "entertainment": "Entertainment",
         "onboard_service": "Service", "leg_room": "Legroom", "baggage": "Baggage", "checkin": "Check-in",
         "inflight_service": "Cabin Crew", "cleanliness": "Cleanliness"}


def profile(g, n_total):
    return {"size": int(len(g)), "share": round(len(g) / n_total, 4),
            "satisfied_rate": round(float(g["satisfied"].mean()), 4),
            "avg_age": round(float(g["age"].mean()), 1),
            "avg_distance": round(float(g["flight_distance"].mean()), 0),
            "business_class_share": round(float((g["travel_class"] == 2).mean()), 4),
            "business_travel_share": round(float(g["travel_type"].mean()), 4),
            "loyal_share": round(float(g["customer_type"].mean()), 4),
            "avg_rating": round(float(g[RATINGS].mean().mean()), 2),
            "avg_dep_delay": round(float(g["dep_delay"].mean()), 1),
            "ratings": {LABELS[c]: round(float(g[c].mean()), 2) for c in RATINGS},
            "rating_keys": {c: round(float(g[c].mean()), 2) for c in RATINGS}}


def name_segments(segs):
    """Mood word + the trait that most sets this segment apart (z-score across segments), unique, <= 4 words."""
    def z(vals):
        v = np.array(vals, float)
        return (v - v.mean()) / (v.std() + 1e-9)

    cols = {"loyal_share": ("First-Time Flyers", -1, "first_time"), "business_travel_share": ("Holidaymakers", -1, "leisure"),
            "business_class_share": ("Business Class Regulars", 1, "business"), "avg_distance": ("Long-Haul Travellers", 1, "long_haul"),
            "avg_age": ("Young Travellers", -1, "young")}
    cand = {i: [] for i in range(len(segs))}
    for c, (phrase, sign, trait) in cols.items():
        for i, sc in enumerate(z([s[c] for s in segs]) * sign):
            cand[i].append((sc, phrase, trait))
    for r in RATINGS:
        zs = z([s["rating_keys"][r] for s in segs])
        for i, sc in enumerate(zs):
            cand[i].append((sc, f"{SHORT[r]} Fans", "rating_high"))
            cand[i].append((-sc, f"{SHORT[r]} Critics", "rating_low"))
    used = set()
    # most distinctive segments pick first
    order = sorted(range(len(segs)), key=lambda i: -max(c[0] for c in cand[i]))
    for i in order:
        s = segs[i]
        mood = "Happy" if s["satisfied_rate"] >= 0.7 else "Unhappy" if s["satisfied_rate"] < 0.35 else "Mixed"
        # a happy segment is described by what it loves, an unhappy one by what it hates or who it is
        options = sorted(cand[i], key=lambda c: -c[0])
        if mood == "Happy":
            options = [c for c in options if "Critics" not in c[1]]
        else:
            options = [c for c in options if "Fans" not in c[1]]
        sc, phrase, trait = next(c for c in options if c[1] not in used)
        used.add(phrase)
        s["name"] = f"{mood} {phrase}"
        s["trait"] = trait
        s["mood"] = mood.lower()
        haul = "Long-haul" if s["avg_distance"] >= 1500 else "Short-haul" if s["avg_distance"] < 800 else "Mid-haul"
        cabin = "mostly Business class" if s["business_class_share"] >= 0.6 else "mostly Eco" if s["business_class_share"] < 0.3 else "mixed cabins"
        trip = "business trips" if s["business_travel_share"] >= 0.6 else "leisure trips" if s["business_travel_share"] < 0.4 else "mixed trips"
        s["tagline"] = f"{haul} · {cabin} · {trip}"
    return segs


def build(train_df, Xtr_s, km, sil):
    segs = []
    for s, g in train_df.assign(segment=km.labels_).groupby("segment"):
        segs.append({"id": int(s), **profile(g, len(train_df))})
    name_segments(segs)
    pca = PCA(n_components=3, random_state=RS).fit(Xtr_s)
    idx = np.random.RandomState(RS).choice(len(Xtr_s), 2500, replace=False)
    pts = pca.transform(Xtr_s[idx])
    return {"k": int(km.n_clusters), "silhouette": sil, "segments": segs,
            "pca_explained": [round(float(v), 4) for v in pca.explained_variance_ratio_],
            "points": [[round(float(a), 3), round(float(b), 3), round(float(c), 3), int(km.labels_[i])]
                       for (a, b, c), i in zip(pts, idx)]}


if __name__ == "__main__":
    import joblib
    from sklearn.model_selection import train_test_split
    from ml.pipeline import ART, encode, load_raw, transform
    df = encode(load_raw())
    tr, _ = train_test_split(df, test_size=0.2, stratify=df["satisfied"], random_state=RS)
    arr_median = float(tr["arr_delay"].median())
    seg = joblib.load(ART / "segments.joblib")
    Xs = seg["scaler"].transform(transform(tr, arr_median))
    km = seg["kmeans"]
    km.labels_ = km.predict(Xs)
    old = json.load(open(ART / "segments.json"))
    out = build(tr, Xs, km, old["silhouette"])
    json.dump(out, open(ART / "segments.json", "w"))
    for s in out["segments"]:
        print(s["id"], s["name"], "|", s["tagline"], "|", s["satisfied_rate"])
