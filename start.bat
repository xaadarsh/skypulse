@echo off
REM SkyPulse - one-command start (Windows). Installs anything missing, then launches API + web app.
cd /d "%~dp0"
where python >nul 2>nul || (echo Python 3.12 is required: https://www.python.org/downloads/ & pause & exit /b 1)
where npm >nul 2>nul || (echo Node.js 18+ is required: https://nodejs.org/ & pause & exit /b 1)

if not exist .venv\Scripts\python.exe (
  echo [1/5] Creating Python virtual environment...
  python -m venv .venv || (pause & exit /b 1)
)
echo [2/5] Checking Python packages...
.venv\Scripts\python -m pip install -q --disable-pip-version-check -r requirements.txt || (pause & exit /b 1)

if not exist ml\artifacts\model_full.joblib (
  echo [3/5] Training models - first run only, takes about 7 minutes...
  .venv\Scripts\python -m ml.train || (pause & exit /b 1)
) else (echo [3/5] Trained models found.)

echo [4/5] Building web app...
pushd frontend
if not exist node_modules call npm install --no-audit --no-fund || (popd & pause & exit /b 1)
call npm run build || (popd & pause & exit /b 1)
popd

echo [5/5] Starting SkyPulse...
start "SkyPulse API (port 8000)" cmd /k ".venv\Scripts\python -m uvicorn backend.main:app --port 8000"
start "SkyPulse Web (port 5173)" cmd /k "npm --prefix frontend run preview"
timeout /t 8 /nobreak >nul
start "" http://localhost:5173
echo SkyPulse is running at http://localhost:5173  (close the two server windows to stop it)
