<#
.SYNOPSIS
  Partido de humo headless (WP-64): IA contra IA, imprime la última línea [smoke] {json}.
  Con -Runs N > 1 juega N partidos y resume cada métrica como media ± IC 95 % (línea [smoke-agg] {json} al final).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode reglamento -BaseUrl http://127.0.0.1:5173/
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode arcade -SmokeMs 240000 -Runs 20 -BaseUrl http://127.0.0.1:5173/
#>
param(
  [string]$Mode = 'reglamento',
  [int]$SmokeMs = 120000,
  [string]$BaseUrl = 'http://127.0.0.1:5173/',
  [int]$WaitMs = 0,
  [string]$Extra = '',
  [int]$Runs = 1
)
$ErrorActionPreference = 'Stop'
if ($WaitMs -le 0) { $WaitMs = $SmokeMs + 20000 }
$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'No se encontró Chrome ni Edge.' }
$url = "$BaseUrl`?lab=match&mode=$Mode&auto=1&smokeMs=$SmokeMs&hud=0"
if ($Extra) { $url = "$url&$Extra" }

function Invoke-Smoke {
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
  if (-not $smoke.Count) { return $null }
  $last = $smoke[-1]
  return ($last.Substring($last.IndexOf('[smoke]')) -replace '", source:.*$', '')
}

if ($Runs -le 1) {
  $line = Invoke-Smoke
  if (-not $line) { Write-Output "SIN [smoke] (¿WaitMs corto?) mode=$Mode"; exit 1 }
  Write-Output $line
  exit 0
}

# Lote: una muestra por partido; el ruido entre partidos es grande, así que se compara por IC 95 %.
$samples = @{ goalsPerMin = @(); shotsPerMin = @(); onTargetPerMin = @(); savePct = @(); foulsPerMin = @(); redMinusBluePerMin = @() }
$tot = @{ jams = 0; jamSec = 0; badPlayerFrames = 0; consoleErrors = 0; failed = 0 }
foreach ($i in 1..$Runs) {
  $line = Invoke-Smoke
  if (-not $line) { $tot.failed++; Write-Output ("run {0}/{1}: SIN [smoke]" -f $i, $Runs); continue }
  $j = ($line -replace '^\[smoke\] ', '') | ConvertFrom-Json
  $min = [math]::Max(0.001, $j.sec / 60)
  $g = $j.goals.blue + $j.goals.red
  $sv = $j.saves.blue + $j.saves.red
  $samples.goalsPerMin += $g / $min
  $samples.shotsPerMin += ($j.shots.blue + $j.shots.red) / $min
  $samples.onTargetPerMin += ($j.onTarget.blue + $j.onTarget.red) / $min
  if ($sv + $g -gt 0) { $samples.savePct += 100 * $sv / ($sv + $g) }
  $samples.foulsPerMin += ($j.fouls.blue + $j.fouls.red) / $min
  $samples.redMinusBluePerMin += ($j.goals.red - $j.goals.blue) / $min
  $tot.jams += $j.jams; $tot.jamSec += $j.jamSec; $tot.badPlayerFrames += $j.badPlayerFrames; $tot.consoleErrors += $j.consoleErrors
  Write-Output ("run {0}/{1}: goles {2}-{3} · tiros {4} · paradas {5} · atascos {6} · errores {7}" -f $i, $Runs, $j.goals.blue, $j.goals.red, ($j.shots.blue + $j.shots.red), $sv, $j.jams, $j.consoleErrors)
}

$agg = [ordered]@{ mode = $Mode; extra = $Extra; smokeMs = $SmokeMs; runs = $Runs - $tot.failed }
$inv = [Globalization.CultureInfo]::InvariantCulture
foreach ($k in 'goalsPerMin', 'shotsPerMin', 'onTargetPerMin', 'savePct', 'foulsPerMin', 'redMinusBluePerMin') {
  $xs = @($samples[$k]); $n = $xs.Count
  if ($n -eq 0) { continue }
  $mean = ($xs | Measure-Object -Average).Average
  $sd = if ($n -gt 1) { [math]::Sqrt((($xs | ForEach-Object { ($_ - $mean) * ($_ - $mean) }) | Measure-Object -Sum).Sum / ($n - 1)) } else { 0 }
  # t de Student aproximada para 95 % (exacta a ±0,01 desde n ≈ 8)
  $t = if ($n -gt 1) { 1.96 + 2.4 / ($n - 1) } else { 0 }
  $ci = $t * $sd / [math]::Sqrt($n)
  $agg[$k] = [ordered]@{ mean = [math]::Round($mean, 3); ci95 = [math]::Round($ci, 3); sd = [math]::Round($sd, 3); n = $n }
  Write-Output ([string]::Format($inv, "{0,-20} {1,7:F2} ± {2:F2}  (sd {3:F2}, n {4})", $k, $mean, $ci, $sd, $n))
}
foreach ($k in $tot.Keys) { $agg[$k] = $tot[$k] }
Write-Output ("totales: atascos {0} ({1:F1} s) · fuera de pista {2} · errores de consola {3} · fallidas {4}" -f $tot.jams, $tot.jamSec, $tot.badPlayerFrames, $tot.consoleErrors, $tot.failed)
Write-Output ('[smoke-agg] ' + ($agg | ConvertTo-Json -Compress -Depth 4))
