#!/usr/bin/env bash
# SkyPulse - one-command start (macOS / Linux / Git Bash). Installs anything missing, then launches API + web app.
set -e
cd "$(dirname "$0")"
PY=python3; command -v $PY >/dev/null || PY=python
if [ -x .venv/Scripts/python.exe ]; then VPY=.venv/Scripts/python.exe; else VPY=.venv/bin/python; fi
if [ ! -x "$VPY" ]; then
  echo "[1/5] Creating Python virtual environment..."; $PY -m venv .venv
  if [ -x .venv/Scripts/python.exe ]; then VPY=.venv/Scripts/python.exe; else VPY=.venv/bin/python; fi
fi
echo "[2/5] Checking Python packages..."; "$VPY" -m pip install -q --disable-pip-version-check -r requirements.txt
if [ ! -f ml/artifacts/model_full.joblib ]; then
  echo "[3/5] Training models - first run only, about 7 minutes..."; "$VPY" -m ml.train
else echo "[3/5] Trained models found."; fi
echo "[4/5] Building web app..."
( cd frontend && { [ -d node_modules ] || npm install --no-audit --no-fund; } && npm run build )
echo "[5/5] Starting SkyPulse at http://localhost:5173 (Ctrl+C to stop)"
"$VPY" -m uvicorn backend.main:app --port 8000 &
API=$!
trap 'kill $API 2>/dev/null' EXIT
npm --prefix frontend run preview
