<#
.SYNOPSIS
  Partido de humo headless (WP-64): IA contra IA, imprime la última línea [smoke] {json}.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode reglamento -BaseUrl http://127.0.0.1:5173/
#>
param(
  [string]$Mode = 'reglamento',
  [int]$SmokeMs = 120000,
  [string]$BaseUrl = 'http://127.0.0.1:5173/',
  [int]$WaitMs = 0
)
$ErrorActionPreference = 'Stop'
if ($WaitMs -le 0) { $WaitMs = $SmokeMs + 20000 }
$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'No se encontró Chrome ni Edge.' }
$url = "$BaseUrl`?lab=match&mode=$Mode&auto=1&smokeMs=$SmokeMs&hud=0"
$profileDir = Join-Path $env:TEMP ("rh-smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$png = Join-Path $env:TEMP ("rh-smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.png')
$chromeArgs = @('--headless=new', '--mute-audio', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=640,360', "--virtual-time-budget=$WaitMs", "--user-data-dir=$profileDir", '--enable-logging=stderr', '--v=0', "--screenshot=$png", $url)
$prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$lines = & $browser @chromeArgs 2>&1 | ForEach-Object { "$_" }
$ErrorActionPreference = $prev
Remove-Item -Force -ErrorAction SilentlyContinue $png
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $profileDir
$smoke = @($lines | Where-Object { $_ -match '\[smoke\] \{' })
if (-not $smoke.Count) { Write-Output "SIN [smoke] (¿WaitMs corto?) mode=$Mode"; $lines | Where-Object { $_ -match 'Uncaught|CONSOLE' } | Select-Object -First 5; exit 1 }
$last = $smoke[-1]
Write-Output ($last.Substring($last.IndexOf('[smoke]')) -replace '", source:.*$', '')
