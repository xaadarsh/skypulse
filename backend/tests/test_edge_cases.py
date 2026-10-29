"""Edge cases from the QA pass: big/bad CSVs, extreme events and budgets, tiny flights, persistence."""
import io
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
import pandas as pd

from backend.tests.test_api import UNHAPPY, c, dataset_flight

ROOT = Path(__file__).resolve().parents[2]


def csv_bytes(df):
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode()


def test_batch_5000_rows():
    df = pd.read_csv(ROOT / "data" / "test.csv").head(5000).drop(columns=["Unnamed: 0", "satisfaction"])
    r = c.post("/batch", files={"file": ("big.csv", csv_bytes(df), "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"]["n"] == 5000 and len(body["csv"].splitlines()) == 5001


def test_bad_csvs_give_friendly_errors():
    for payload in (b"name,colour\nx,blue\n", b"", b"\x00\x01\x02 not a csv"):
        r = c.post("/batch", files={"file": ("bad.csv", payload, "text/csv")})
        assert r.status_code == 400 and isinstance(r.json()["detail"], str)
    r = c.post("/flight", data={"source": "manifest"}, files={"file": ("bad.csv", b"a,b\n1,2\n", "text/csv")})
    assert r.status_code == 400 and "missing" in r.json()["detail"]
    assert c.post("/flight", data={"source": "manifest"}).status_code == 400  # no file


def test_delay_extremes_and_validation():
    fid = dataset_flight(30)["id"]
    zero = c.post("/flight/event", json={"flight_id": fid, "kind": "delay", "minutes": 0}).json()
    assert zero["flight"]["delay"] == 0
    top = c.post("/flight/event", json={"flight_id": fid, "kind": "delay", "minutes": 300}).json()
    assert top["flight"]["delay"] == 300
    assert top["flight"]["stats"]["avg_risk"] >= zero["flight"]["stats"]["avg_risk"] - 1e-9  # delay never helps
    assert c.post("/flight/event", json={"flight_id": fid, "kind": "delay", "minutes": 301}).status_code == 422
    assert c.post("/flight/event", json={"flight_id": fid, "kind": "fire"}).status_code == 422
    assert c.post("/flight/event", json={"flight_id": 999999, "kind": "delay", "minutes": 10}).status_code == 404


def test_budget_extremes():
    fid = dataset_flight(40)["id"]
    zero = c.post("/flight/optimize", json={"flight_id": fid, "budget": 0}).json()
    assert zero["total_cost"] == 0 and all(p["cost"] == 0 for p in zero["plan"])
    huge = c.post("/flight/optimize", json={"flight_id": fid, "budget": 10_000_000}).json()
    assert huge["total_cost"] <= 10_000_000 and len(huge["plan"]) <= huge["at_risk"]
    assert c.post("/flight/optimize", json={"flight_id": fid, "budget": -5}).status_code == 422


def test_empty_and_single_passenger_flights():
    fid = c.post("/flight", data={"source": "manual"}).json()["id"]
    assert c.post("/flight/recover", json={"flight_id": fid}).status_code == 400  # friendly "no passengers"
    opt = c.post("/flight/optimize", json={"flight_id": fid, "budget": 1000}).json()
    assert opt["plan"] == [] and opt["at_risk"] == 0
    assert c.post("/flight/event", json={"flight_id": fid, "kind": "wifi_outage"}).status_code == 200
    f = c.post("/passenger", json={"flight_id": fid, "name": "Only One", "features": UNHAPPY}).json()
    assert f["stats"]["passengers"] == 1
    rec = c.post("/flight/recover", json={"flight_id": fid}).json()
    assert rec["actions"] <= 1
    pid = f["seats"][0]["id"]
    assert c.delete(f"/passenger/{pid}").json()["stats"]["passengers"] == 0
    assert c.delete(f"/passenger/{pid}").status_code == 404


def test_passenger_validation():
    fid = c.post("/flight", data={"source": "manual"}).json()["id"]
    assert c.post("/passenger", json={"flight_id": fid, "name": "", "features": UNHAPPY}).status_code == 422
    assert c.post("/passenger", json={"flight_id": fid, "name": "X", "features": {**UNHAPPY, "age": 0}}).status_code == 422
    # taken seat falls back to a free seat in the same cabin
    a = c.post("/passenger", json={"flight_id": fid, "name": "A", "seat": "12C", "features": UNHAPPY}).json()
    b = c.post("/passenger", json={"flight_id": fid, "name": "B", "seat": "12C", "features": UNHAPPY}).json()
    assert {s["seat"] for s in b["seats"]} != {"12C"} and len(b["seats"]) == 2 and a["seats"][0]["seat"] == "12C"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_api(db, port):
    env = {**os.environ, "SKYPULSE_DB": db}
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.main:app", "--port", str(port)], cwd=ROOT, env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(120):
        try:
            if httpx.get(f"http://127.0.0.1:{port}/health", timeout=1).status_code == 200:
                return p
        except httpx.HTTPError:
            time.sleep(0.5)
    p.kill()
    raise RuntimeError("API did not start")


def test_data_persists_after_backend_restart():
    db = str(Path(tempfile.mkdtemp()) / "persist.db")
    port = free_port()
    api = start_api(db, port)
    try:
        base = f"http://127.0.0.1:{port}"
        fid = httpx.post(f"{base}/flight", data={"source": "dataset", "count": 20, "seed": 3}, timeout=60).json()["id"]
        httpx.post(f"{base}/flight/event", json={"flight_id": fid, "kind": "delay", "minutes": 90}, timeout=60)
        httpx.post(f"{base}/flight/recover", json={"flight_id": fid}, timeout=60)
        before = httpx.get(f"{base}/flight/{fid}", timeout=30).json()
    finally:
        api.terminate()
        api.wait(20)
    api = start_api(db, port)
    try:
        after = httpx.get(f"http://127.0.0.1:{port}/flight/{fid}", timeout=30).json()
    finally:
        api.terminate()
        api.wait(20)
    assert after["delay"] == 90 and after["stats"] == before["stats"]
    assert [e["kind"] for e in after["events"]] == [e["kind"] for e in before["events"]]
