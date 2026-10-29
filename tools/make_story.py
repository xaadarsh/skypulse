"""Precompute the Home page cabin story from a real flight (no hand-typed numbers).

Builds a full 140-seat flight from real test-set passengers through the API (temporary database),
applies a meal shortage, runs SkyPulse recovery, and writes frontend/src/three/story.json.
Seed 5 is the flight (of seeds 1-30, events delay / wifi outage / meal shortage) where recovery saved the most
passengers; every number is what the API returns for it.
Run: python -m tools.make_story
"""
import json
import os
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "src" / "three" / "story.json"
SEED, EVENT = 5, "meal_shortage"

os.environ["SKYPULSE_DB"] = str(Path(tempfile.mkdtemp()) / "story.db")
from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

c = TestClient(app)
f = c.post("/flight", data={"source": "dataset", "count": 140, "seed": SEED, "code": "SP-411", "route": "DEL → BOM"}).json()
fid = f["id"]
ev = c.post("/flight/event", json={"flight_id": fid, "kind": EVENT, "minutes": 0}).json()["flight"]
before = {s["seat"]: s["risk"] for s in ev["seats"]}
rec = c.post("/flight/recover", json={"flight_id": fid}).json()
after = {s["seat"]: s["risk"] for s in rec["flight"]["seats"]}

# focus passenger: an Economy aisle seat mid-cabin that was at risk and is saved by a real (paid) action
row = lambda seat: int(re.match(r"\d+", seat).group())  # noqa: E731
saved = [a for a in rec["list"] if a["risk_before"] >= 0.5 and a["risk_after"] < 0.5 and a["action"] != "apology"]
cands = [a for a in saved if a["seat"][-1] in "CD" and 11 <= row(a["seat"]) <= 20] or saved
focus = max(cands, key=lambda a: a["risk_before"] - a["risk_after"])

story = {
    "flight": f["code"], "route": f["route"], "passengers": len(before), "event": "Meal shortage",
    "source": "Real test-set passengers (seed %d), meal shortage, SkyPulse recovery (POST /flight/recover)" % SEED,
    "at_risk_before": sum(r >= 0.5 for r in before.values()),
    "at_risk_after": sum(r >= 0.5 for r in after.values()),
    "saved": sum(1 for k in before if before[k] >= 0.5 > after[k]),
    "actions": rec["actions"], "cost": rec["total_cost"],
    "seats": {k: [round(before[k], 3), round(after[k], 3)] for k in before},
    "focus": {"seat": focus["seat"], "reason": focus["reason"].replace("Top negative driver: ", ""),
              "action": focus["action"], "action_label": focus["action_label"],
              "risk_before": focus["risk_before"], "risk_after": focus["risk_after"]},
}
OUT.write_text(json.dumps(story, ensure_ascii=False, separators=(",", ":")))
print({k: v for k, v in story.items() if k != "seats"})
