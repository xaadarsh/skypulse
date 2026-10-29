"""Shared pre-processing for SkyPulse (same steps as Review 1).

Used by train.py, the notebook and the FastAPI backend so that a passenger is
encoded exactly the same way everywhere.
"""
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ART = ROOT / "ml" / "artifacts"

URLS = {
    "train.csv": "https://raw.githubusercontent.com/saulventura/Airline-Passenger-Satisfaction/master/train.csv",
    "test.csv": "https://raw.githubusercontent.com/saulventura/Airline-Passenger-Satisfaction/master/test.csv",
}

# (dataset column, api key, label shown in UI)
FEATURES = [
    ("Gender", "gender", "Gender"),
    ("Customer Type", "customer_type", "Customer type"),
    ("Age", "age", "Age"),
    ("Type of Travel", "travel_type", "Type of travel"),
    ("Class", "travel_class", "Class"),
    ("Flight Distance", "flight_distance", "Flight distance"),
    ("Inflight wifi service", "wifi", "Inflight wifi"),
    ("Departure/Arrival time convenient", "time_convenient", "Departure/arrival time"),
    ("Ease of Online booking", "online_booking", "Online booking"),
    ("Gate location", "gate_location", "Gate location"),
    ("Food and drink", "food", "Food and drink"),
    ("Online boarding", "online_boarding", "Online boarding"),
    ("Seat comfort", "seat_comfort", "Seat comfort"),
    ("Inflight entertainment", "entertainment", "Inflight entertainment"),
    ("On-board service", "onboard_service", "On-board service"),
    ("Leg room service", "leg_room", "Leg room"),
    ("Baggage handling", "baggage", "Baggage handling"),
    ("Checkin service", "checkin", "Check-in service"),
    ("Inflight service", "inflight_service", "Inflight service"),
    ("Cleanliness", "cleanliness", "Cleanliness"),
    ("Departure Delay in Minutes", "dep_delay", "Departure delay"),
    ("Arrival Delay in Minutes", "arr_delay", "Arrival delay"),
]
COLS = [k for _, k, _ in FEATURES]
LABELS = {k: l for _, k, l in FEATURES}
RENAME = {c: k for c, k, _ in FEATURES}
RATINGS = COLS[6:20]
DELAYS = ["dep_delay", "arr_delay"]
BOOKING = ["gender", "customer_type", "age", "travel_type", "travel_class", "flight_distance"]
CLASS_NAMES = {0: "Eco", 1: "Eco Plus", 2: "Business"}


def load_raw() -> pd.DataFrame:
    """Download once, cache in data/, return train+test concatenated."""
    import urllib.request
    DATA.mkdir(exist_ok=True)
    frames = []
    for name, url in URLS.items():
        path = DATA / name
        if not path.exists():
            urllib.request.urlretrieve(url, path)
        frames.append(pd.read_csv(path))
    return pd.concat(frames, ignore_index=True)


def encode(df: pd.DataFrame) -> pd.DataFrame:
    """Review 1 encoding. Returns snake_case columns + 'satisfied' target if present."""
    df = df.drop(columns=[c for c in ("Unnamed: 0", "id") if c in df.columns]).copy()
    df["Customer Type"] = df["Customer Type"].str.title()
    df["Type of Travel"] = df["Type of Travel"].str.title()
    df["Gender"] = df["Gender"].map({"Female": 0, "Male": 1})
    df["Customer Type"] = df["Customer Type"].map({"Disloyal Customer": 0, "Loyal Customer": 1})
    df["Type of Travel"] = df["Type of Travel"].map({"Personal Travel": 0, "Business Travel": 1})
    df["Class"] = df["Class"].map({"Eco": 0, "Eco Plus": 1, "Business": 2})
    if "satisfaction" in df.columns:
        df["satisfied"] = (df["satisfaction"] == "satisfied").astype(int)
        df = df.drop(columns="satisfaction")
    return df.rename(columns=RENAME)


def transform(X: pd.DataFrame, arr_median: float) -> pd.DataFrame:
    """Median-impute arrival delay (train median) and log1p both delays."""
    X = X[COLS].astype(float).copy()
    X["arr_delay"] = X["arr_delay"].fillna(arr_median)
    for c in DELAYS:
        X[c] = np.log1p(X[c].clip(lower=0))
    return X
