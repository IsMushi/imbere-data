<#
.SYNOPSIS
    Start the IMBERE DATA API and web app together with one command.

.DESCRIPTION
    Installs missing dependencies on first run, starts uvicorn (api/) and the
    Next.js dev server (web/), streams both logs into this window, opens the UI
    in the browser, and stops both services when you press Ctrl+C.

.PARAMETER ApiPort
    Port for the FastAPI service. Default 8000. The web app always uses 3000,
    because that port is fixed in web/package.json.

.PARAMETER SkipInstall
    Do not check or install dependencies. Use when you know they are present.

.PARAMETER NoBrowser
    Do not open the browser once the services are up.

.EXAMPLE
    .\run.ps1

.EXAMPLE
    .\run.ps1 -ApiPort 8001 -NoBrowser
#>
[CmdletBinding()]
param(
    [int]$ApiPort = 8000,
    [switch]$SkipInstall,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Continue'   # native stderr (pip/npm/uvicorn) must not abort the script

$root    = Split-Path -Parent $PSCommandPath
$apiDir  = Join-Path $root 'api'
$webDir  = Join-Path $root 'web'
$webPort = 3000
$apiUrl  = "http://127.0.0.1:$ApiPort"
$webUrl  = "http://localhost:$webPort"

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-PortOwner([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($conn) { return $conn.OwningProcess }
    return $null
}

function Write-JobOutput($Jobs) {
    foreach ($job in $Jobs) {
        $tag = if ($job.Name -eq 'imbere-api') { '[api]' } else { '[web]' }
        Receive-Job -Job $job -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "$tag $_"
        }
    }
}

# Runs a native command, echoes its output as plain text (so stderr does not become a
# PowerShell error record) and returns its exit code.
function Invoke-Native([string]$Label, [scriptblock]$Command) {
    Write-Host "--- $Label" -ForegroundColor DarkGray
    & $Command 2>&1 | ForEach-Object { Write-Host "    $_" }
    return $LASTEXITCODE
}

function Test-PythonDeps([string]$PythonPath) {
    # A temp file avoids Start-Process mangling the -c argument (it does not quote
    # argument-list items that contain spaces).
    $probeFile = Join-Path $env:TEMP 'imbere_dep_check.py'
    'import fastapi, uvicorn, pandas, numpy, sklearn' | Set-Content -Path $probeFile -Encoding ascii

    $log = Join-Path $env:TEMP 'imbere-python-deps.log'
    $probe = Start-Process -FilePath $PythonPath `
        -ArgumentList $probeFile `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput "$log.out" -RedirectStandardError "$log.err"

    return [pscustomobject]@{ Ok = ($probe.ExitCode -eq 0); ErrorLog = "$log.err" }
}

# api/requirements.txt is tested on Python 3.11-3.14. Newer interpreters can be missing
# wheels for some dependencies, so prefer a supported one when several are installed.
function Resolve-Python {
    if ($env:IMBERE_PYTHON) {
        if (-not (Test-Path $env:IMBERE_PYTHON)) {
            throw "IMBERE_PYTHON points to a missing file: $env:IMBERE_PYTHON"
        }
        return $env:IMBERE_PYTHON
    }

    if (Get-Command py -ErrorAction SilentlyContinue) {
        foreach ($version in @('3.14', '3.13', '3.12', '3.11')) {
            $exe = & py "-$version" -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $exe) {
                return "$exe".Trim()
            }
        }
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) { return $python.Source }

    throw "No Python found. Install Python 3.11-3.14, e.g. winget install Python.Python.3.13"
}

# --- preflight -------------------------------------------------------------
foreach ($dir in @($apiDir, $webDir)) {
    if (-not (Test-Path $dir)) { throw "Expected folder not found: $dir" }
}

foreach ($port in @($ApiPort, $webPort)) {
    $owner = Get-PortOwner $port
    if ($owner) {
        $name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
        throw "Port $port is already in use by $name (PID $owner). Stop it and run the script again."
    }
}

# --- dependencies ----------------------------------------------------------
$pythonExe = Resolve-Python
Write-Host "    python: $pythonExe" -ForegroundColor DarkGray

if (-not $SkipInstall) {
    Write-Step 'Checking Python dependencies'
    $probe = Test-PythonDeps $pythonExe
    if (-not $probe.Ok) {
        Write-Host '    Cannot import the API packages yet:' -ForegroundColor Yellow
        if (Test-Path $probe.ErrorLog) {
            Get-Content $probe.ErrorLog -Tail 4 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        }

        Write-Step 'Installing Python dependencies (api/requirements.txt)'
        Push-Location $apiDir
        try {
            $code = Invoke-Native 'pip install -r requirements.txt' { & $pythonExe -m pip install -r requirements.txt }
        } finally { Pop-Location }

        if ($code -ne 0) {
            throw @"
pip install failed (exit $code).

If the error is a source build of a package with no wheel for your Python version
(e.g. "Failed building wheel for pyyaml" on Python 3.15), use Python 3.11-3.14,
or install the same packages without that extra:

    pip install fastapi uvicorn pandas numpy scikit-learn pydantic `
        httptools watchfiles websockets python-dotenv
"@
        }

        $probe = Test-PythonDeps $pythonExe
        if (-not $probe.Ok) {
            Write-Host '    Packages are installed but still do not import:' -ForegroundColor Yellow
            if (Test-Path $probe.ErrorLog) {
                Get-Content $probe.ErrorLog -Tail 4 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            }
            throw @"
The Python packages are installed but cannot be loaded, so the API cannot start.

If the last lines mention "An Application Control policy has blocked this file",
Windows Smart App Control (Windows 11) is refusing compiled extensions such as
pandas and scikit-learn. Either allow them, or run the API where that policy does
not apply (WSL2 or a Linux container).
"@
        }
    }

    if (-not (Test-Path (Join-Path $webDir 'node_modules\next'))) {
        Write-Step 'Installing npm dependencies (web/, --no-bin-links)'
        Push-Location $webDir
        try {
            $code = Invoke-Native 'npm install --no-bin-links' { npm install --no-bin-links }
        } finally { Pop-Location }
        if ($code -ne 0) { throw "npm install failed (exit $code)." }
    }
}

# --- services --------------------------------------------------------------
Write-Step "Starting API on $apiUrl"
$apiJob = Start-Job -Name 'imbere-api' -ArgumentList $apiDir, $ApiPort, $pythonExe -ScriptBlock {
    param($Dir, $Port, $Python)
    Set-Location $Dir
    & $Python -m uvicorn app.main:app --host 127.0.0.1 --port $Port 2>&1
}

Write-Step "Starting web app on $webUrl"
$webJob = Start-Job -Name 'imbere-web' -ArgumentList $webDir -ScriptBlock {
    param($Dir)
    Set-Location $Dir
    & npm run dev 2>&1
}

$jobs = @($apiJob, $webJob)

try {
    $deadline  = (Get-Date).AddSeconds(180)
    $apiReady  = $false
    $webReady  = $false

    while (-not ($apiReady -and $webReady)) {
        Write-JobOutput $jobs

        if (-not $apiReady) {
            try {
                Invoke-RestMethod "$apiUrl/api/health" -TimeoutSec 2 -ErrorAction Stop | Out-Null
                $apiReady = $true
                Write-Host "    API ready: $apiUrl" -ForegroundColor Green
            } catch { }
        }

        if (-not $webReady) {
            $owner = Get-PortOwner $webPort
            if ($owner -and $owner -ne $PID) {
                $webReady = $true
                Write-Host "    Web ready: $webUrl" -ForegroundColor Green
            }
        }

        if ((Get-Date) -gt $deadline) {
            throw "Timed out waiting for the services to start. See the log above."
        }

        Start-Sleep -Milliseconds 400
    }

    Write-Host ''
    Write-Host "IMBERE DATA is running." -ForegroundColor Green
    Write-Host "  API : $apiUrl/docs"
    Write-Host "  Web : $webUrl"
    Write-Host "The first API call fits the poverty-risk model, so give it a few seconds." -ForegroundColor DarkGray
    Write-Host "Press Ctrl+C to stop both services." -ForegroundColor DarkGray

    if (-not $NoBrowser) { Start-Process $webUrl }

    while ($true) {
        Write-JobOutput $jobs
        Start-Sleep -Milliseconds 400
    }
}
finally {
    Write-Host ''
    Write-Step 'Stopping services'
    foreach ($job in $jobs) {
        Stop-Job -Job $job -ErrorAction SilentlyContinue
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
    foreach ($port in @($ApiPort, $webPort)) {
        $owner = Get-PortOwner $port
        if ($owner) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue }
    }
    Write-Host 'Stopped.' -ForegroundColor DarkGray
}
