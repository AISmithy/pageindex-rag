# Stop PageIndex RAG application (backend + frontend)
$root = $PSScriptRoot
$pidFile = Join-Path $root ".app-pids"

Write-Host "Stopping PageIndex RAG..." -ForegroundColor Cyan

$stopped = 0

if (Test-Path $pidFile) {
    $pids = Get-Content $pidFile
    foreach ($line in $pids) {
        if ($line -match "^(\w+)=(\d+)$") {
            $name = $Matches[1]
            $pid = [int]$Matches[2]
            try {
                $proc = Get-Process -Id $pid -ErrorAction Stop
                # Kill the process tree (parent + children)
                Stop-Process -Id $pid -Force -ErrorAction Stop
                Write-Host "  Stopped $name (PID $pid)" -ForegroundColor Green
                $stopped++
            } catch {
                Write-Host "  $name (PID $pid) already stopped" -ForegroundColor Gray
            }
        }
    }
    Remove-Item $pidFile -Force
}

# Also kill any orphaned uvicorn/node processes on our ports
foreach ($port in @(8000, 5173, 5174)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        try {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction Stop
            if ($proc.ProcessName -in @("python", "node", "uvicorn", "esbuild")) {
                Stop-Process -Id $conn.OwningProcess -Force
                Write-Host "  Killed orphan $($proc.ProcessName) on port $port (PID $($conn.OwningProcess))" -ForegroundColor Yellow
                $stopped++
            }
        } catch {}
    }
}

if ($stopped -eq 0) {
    Write-Host "  No running services found." -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "All services stopped." -ForegroundColor Cyan
}
