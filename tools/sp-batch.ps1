<#
.SYNOPSIS
  Lote headless de lanzamientos (L-01): abre ?lab=setpiece&batch=N&<Extra> en Chrome headless e imprime
  la línea [smoke-agg] {json} (la lee tools/bal-compare.mjs). Sin batch en -Extra, juega 200 duelos.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/sp-batch.ps1 -BaseUrl http://127.0.0.1:5173/ -Extra "batch=200&kind=penalty&human=none&diffRed=normal&seed=1"
#>
param(
  [string]$BaseUrl = 'http://127.0.0.1:5173/',
  [string]$Extra = '',
  [int]$WaitMs = 60000
)
$ErrorActionPreference = 'Stop'
$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'No se encontró Chrome ni Edge.' }
$query = if ($Extra -match '(^|&)batch=') { $Extra } elseif ($Extra) { "batch=200&$Extra" } else { 'batch=200' }
$url = "$BaseUrl`?lab=setpiece&$query"

$profileDir = Join-Path $env:TEMP ("rh-sp-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$png = Join-Path $env:TEMP ("rh-sp-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.png')
$chromeArgs = @('--headless=new', '--mute-audio', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=640,360', "--virtual-time-budget=$WaitMs", "--user-data-dir=$profileDir", '--enable-logging=stderr', '--v=0', "--screenshot=$png", $url)
$prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$lines = & $browser @chromeArgs 2>&1 | ForEach-Object { "$_" }
$ErrorActionPreference = $prev
Remove-Item -Force -ErrorAction SilentlyContinue $png
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $profileDir

# Errores de la página que no pasan por console.error (módulo que no carga, excepción al arrancar)
$pageErrors = @($lines | Where-Object { $_ -match 'CONSOLE.*(Uncaught|Error)' -and $_ -notmatch '\[smoke-agg\]' })
foreach ($e in $pageErrors) { Write-Output "ERROR: $e" }
$agg = @($lines | Where-Object { $_ -match '\[smoke-agg\] \{' })
if (-not $agg.Count) { Write-Output "SIN [smoke-agg] (¿WaitMs corto o servidor caído?) $url"; exit 1 }
$last = $agg[-1]
Write-Output ($last.Substring($last.IndexOf('[smoke-agg]')) -replace '", source:.*$', '')
