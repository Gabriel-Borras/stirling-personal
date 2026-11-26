Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Port = if ($env:STIRLING_PORT) { $env:STIRLING_PORT } else { '4175' }
$Url = "http://127.0.0.1:$Port"
$ServerScript = Join-Path $PSScriptRoot 'serve-dist.mjs'
$DistIndex = Join-Path $RepoRoot 'frontend\dist\index.html'
$ProfileDir = Join-Path $RepoRoot '.stirling-app-profile'

function Test-ServerReady {
    param([string]$TargetUrl)
    try {
        $response = Invoke-WebRequest -Uri "$TargetUrl/api/v1/info/status" -Method Get -TimeoutSec 2 -UseBasicParsing
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Find-ChromiumBrowser {
    $roots = @(
        ${env:ProgramFiles(x86)},
        $env:ProgramFiles,
        $env:LOCALAPPDATA
    ) | Where-Object { $_ }

    foreach ($root in $roots) {
        $edge = Join-Path $root 'Microsoft\Edge\Application\msedge.exe'
        if (Test-Path -LiteralPath $edge) {
            return $edge
        }
    }

    foreach ($root in $roots) {
        $chrome = Join-Path $root 'Google\Chrome\Application\chrome.exe'
        if (Test-Path -LiteralPath $chrome) {
            return $chrome
        }
    }

    foreach ($name in @('msedge.exe', 'chrome.exe')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            return $cmd.Source
        }
    }

    return $null
}

$ServerProcess = $null

try {
    if (-not (Test-ServerReady -TargetUrl $Url)) {
        if (-not (Test-Path -LiteralPath $DistIndex)) {
            throw "Frontend build not found at $DistIndex. Run the frontend build first."
        }
        if (-not (Test-Path -LiteralPath $ServerScript)) {
            throw "Static server script not found at $ServerScript."
        }

        $NodeCmd = Get-Command node -ErrorAction Stop
        $ServerProcess = Start-Process `
            -FilePath $NodeCmd.Source `
            -ArgumentList "`"$ServerScript`"" `
            -WorkingDirectory $RepoRoot `
            -WindowStyle Hidden `
            -PassThru

        $deadline = (Get-Date).AddSeconds(10)
        $ready = $false
        while ((Get-Date) -lt $deadline) {
            if ($ServerProcess.HasExited) {
                throw "Static server exited unexpectedly with code $($ServerProcess.ExitCode)."
            }
            if (Test-ServerReady -TargetUrl $Url) {
                $ready = $true
                break
            }
            Start-Sleep -Milliseconds 200
        }

        if (-not $ready) {
            throw "Timed out waiting for Stirling-PDF server at $Url."
        }
    }

    $BrowserExe = Find-ChromiumBrowser
    if (-not $BrowserExe) {
        throw 'Could not find Microsoft Edge (msedge.exe) or Google Chrome (chrome.exe).'
    }

    $BrowserArgs = @(
        "--app=$Url",
        "--user-data-dir=`"$ProfileDir`"",
        '--window-size=1360,860',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-mode'
    )

    $BrowserProcess = Start-Process -FilePath $BrowserExe -ArgumentList $BrowserArgs -PassThru
    Wait-Process -Id $BrowserProcess.Id
} finally {
    if ($ServerProcess -and -not $ServerProcess.HasExited) {
        Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
