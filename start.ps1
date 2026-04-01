# Start PageIndex RAG application (backend + frontend)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting PageIndex RAG..." -ForegroundColor Cyan

# ── Backend ────────────────────────────────────────────────────────────────────
$backendDir = Join-Path $root "backend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$uvicorn = Join-Path $backendDir ".venv\Scripts\uvicorn.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv (Join-Path $backendDir ".venv")
}

Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
& $venvPython -m pip install -q -r (Join-Path $backendDir "requirements.txt")

Write-Host "Starting backend on http://localhost:8000" -ForegroundColor Green
$backendProc = Start-Process -FilePath $uvicorn `
    -ArgumentList "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory $backendDir `
    -PassThru -NoNewWindow

# ── Frontend ───────────────────────────────────────────────────────────────────
$frontendDir = Join-Path $root "frontend"

Push-Location $frontendDir
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host "Starting frontend on http://localhost:5173" -ForegroundColor Green
$frontendProc = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $frontendDir `
    -PassThru -NoNewWindow
Pop-Location

# ── Save PIDs for stop script ─────────────────────────────────────────────────
$pidFile = Join-Path $root ".app-pids"
@"
backend=$($backendProc.Id)
frontend=$($frontendProc.Id)
"@ | Set-Content $pidFile

Write-Host ""
Write-Host "Application started!" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:8000"
Write-Host "  Frontend: http://localhost:5173"
Write-Host ""
Write-Host "Run .\stop.ps1 to stop both services." -ForegroundColor Gray
