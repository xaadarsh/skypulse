import os
import tempfile
from pathlib import Path

os.environ["SKYPULSE_DB"] = str(Path(tempfile.mkdtemp()) / "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
c = TestClient(app)

UNHAPPY = dict(gender=1, customer_type=0, age=24, travel_type=1, travel_class=0, flight_distance=500, wifi=2,
               time_convenient=2, online_booking=2, gate_location=3, food=2, online_boarding=2, seat_comfort=2,
               entertainment=2, onboard_service=3, leg_room=3, baggage=3, checkin=3, inflight_service=3,
               cleanliness=2, dep_delay=40, arr_delay=45)


def dataset_flight(count=60):
    r = c.post("/flight", data={"source": "dataset", "count": count, "seed": 7})
    assert r.status_code == 200, r.text
    return r.json()


def test_predict():
    r = c.post("/predict", json=UNHAPPY).json()
    assert 0 <= r["prob"] <= 1 and abs(r["prob"] + r["risk"] - 1) < 1e-3
    assert r["label"] == "at risk" and len(r["reasons"]) == 22
    assert all("→" in x["text"] for x in r["reasons"])


def test_predict_rejects_bad_input():
    assert c.post("/predict", json={**UNHAPPY, "wifi": 9}).status_code == 422


def test_predict_booking():
    r = c.post("/predict/booking", json={k: UNHAPPY[k] for k in
                                         ("gender", "customer_type", "age", "travel_type", "travel_class",
                                          "flight_distance")}).json()
    assert 0 <= r["prob"] <= 1 and 0 < r["accuracy"] < 1


def test_recommend_flips():
    r = c.post("/recommend", json=UNHAPPY).json()
    assert r["start_prob"] < 0.5
    assert r["flipped"] and r["end_prob"] >= 0.5 and r["changes"]
    assert all(0 < ch["to"] - ch["from"] <= 2 and ch["to"] <= 5 for ch in r["changes"])


def test_flight_lifecycle_event_recover_optimize():
    f = dataset_flight()
    assert f["source_label"] == "Passengers from real dataset" and len(f["seats"]) == 60
    assert all(s["seat"][-1] in "ACDF" for s in f["seats"] if s["travel_class"] == 2)
    assert all(int(s["seat"][:-1]) <= 5 for s in f["seats"] if s["travel_class"] == 2)
    assert all(0 <= s["risk"] <= 1 for s in f["seats"])
    fid = f["id"]

    ev = c.post("/flight/event", json={"flight_id": fid, "kind": "delay", "minutes": 120}).json()
    assert ev["changed"] and ev["flight"]["delay"] == 120
    assert all(x["new_risk"] >= x["old_risk"] - 1e-6 for x in ev["changed"])
    for kind in ("wifi_outage", "meal_shortage", "turbulence"):
        assert c.post("/flight/event", json={"flight_id": fid, "kind": kind}).status_code == 200

    before = c.get(f"/flight/{fid}").json()["stats"]["avg_risk"]
    rec = c.post("/flight/recover", json={"flight_id": fid}).json()
    assert rec["actions"] > 0 and rec["avg_risk_after"] < before
    assert all(a["message"].startswith("Dear ") for a in rec["list"])

    for budget in (0, 5000, 30000):
        opt = c.post("/flight/optimize", json={"flight_id": fid, "budget": budget}).json()
        assert opt["total_cost"] <= budget
        assert sum(p["cost"] for p in opt["plan"]) == opt["total_cost"]
        assert len({p["passenger_id"] for p in opt["plan"]}) == len(opt["plan"])
    applied = c.post("/flight/optimize", json={"flight_id": fid, "budget": 30000, "apply": True}).json()
    assert applied["flight"]["stats"]["actions_cost"] <= 30000

    kinds = [e["kind"] for e in c.get(f"/flight/{fid}").json()["events"]]
    assert {"created", "delay", "recover", "optimize"} <= set(kinds)
    assert any(x["id"] == fid for x in c.get("/flights").json())
    assert c.delete(f"/flight/{fid}").status_code == 200
    assert c.get(f"/flight/{fid}").status_code == 404


def test_manual_passenger_add_edit():
    fid = c.post("/flight", data={"source": "manual", "code": "SP-T1"}).json()["id"]
    f = c.post("/passenger", json={"flight_id": fid, "name": "Test Passenger", "seat": "2A",
                                   "features": {**UNHAPPY, "travel_class": 2}}).json()
    assert f["seats"][0]["seat"] == "2A" and f["source_label"] == "Manually entered passengers"
    pid = f["seats"][0]["id"]
    old_risk = f["seats"][0]["risk"]
    f = c.post("/passenger", json={"flight_id": fid, "passenger_id": pid, "name": "Test Passenger",
                                   "features": {**UNHAPPY, "travel_class": 2, "online_boarding": 5,
                                                "wifi": 5}}).json()
    assert f["seats"][0]["risk"] < old_risk


def test_manifest_upload_and_batch():
    sample = ROOT / "sample_passengers.csv"
    with open(sample, "rb") as fh:
        f = c.post("/flight", data={"source": "manifest"}, files={"file": ("m.csv", fh, "text/csv")})
    assert f.status_code == 200, f.text
    assert f.json()["source"] == "manifest" and len(f.json()["seats"]) > 0
    with open(sample, "rb") as fh:
        b = c.post("/batch", files={"file": ("m.csv", fh, "text/csv")}).json()
    assert b["summary"]["n"] == len(b["rows"]) and b["csv"].startswith("row,")
    assert all(0 <= r["risk"] <= 1 for r in b["rows"])


def test_bad_csv():
    r = c.post("/batch", files={"file": ("x.csv", b"a,b\n1,2\n", "text/csv")})
    assert r.status_code == 400 and "missing" in r.json()["detail"]


def test_strategy():
    r = c.post("/strategy", json={"service": "online_boarding", "amount": 2, "travel_class": 0}).json()
    assert 0 <= r["before"] <= r["after"] <= 1 and r["n"] > 1000


def test_insights():
    r = c.get("/insights").json()
    assert set(r["metrics"]["models"]) == {"Logistic Regression", "SVM (RBF)", "Random Forest", "XGBoost"}
    assert r["segments"]["segments"] and r["fairness"] and r["shap_global"] and r["eda"]["rows"] == 129880


def test_segment_names_unique_and_short():
    segs = c.get("/insights").json()["segments"]["segments"]
    names = [s["name"] for s in segs]
    assert len(set(names)) == len(names)
    assert all(len(n.split()) <= 4 for n in names)
    assert all(len(p) == 4 for p in c.get("/insights").json()["segments"]["points"][:10])  # 3D PCA + label


def test_recovery_estimates_are_realistic():
    from backend import engine as E
    # an action never lowers a rating and never lifts it above 4
    row = {**UNHAPPY, "wifi": 3, "food": 5}
    assert E.apply_boost(row, "wifi")["wifi"] == 4 and E.apply_boost(row, "meal")["food"] == 5
    fid = dataset_flight(120)["id"]
    c.post("/flight/event", json={"flight_id": fid, "kind": "delay", "minutes": 120})
    rec = c.post("/flight/recover", json={"flight_id": fid}).json()
    opt = c.post("/flight/optimize", json={"flight_id": fid, "budget": 30000}).json()
    rows = [(a["risk_before"], a["risk_after"]) for a in rec["list"]] + [(p["risk_before"], p["risk_after"]) for p in opt["plan"]]
    assert rows
    # one voucher or meal cannot take a near-certain unhappy passenger to near-certain happy
    assert not any(b > 0.9 and a < 0.1 for b, a in rows)
    assert all(a <= b + 1e-9 for b, a in rows)
