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
  [int]$Runs = 1,
  # B-03: archivo al que se añade la línea [smoke] de cada partido (con shotLog) para analizarla aparte
  [string]$RawOut = ''
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
$keys = 'goalsPerMin', 'shotsPerMin', 'onTargetPerMin', 'savePct', 'foulsPerMin', 'redMinusBluePerMin',
  'goalsBluePerMin', 'goalsRedPerMin', 'shotsBluePerMin', 'shotsRedPerMin', 'savePctBlue', 'savePctRed',
  'passesPerMin', 'passPct', 'passesDoneBluePerMin', 'passesDoneRedPerMin', 'possessionBluePct', 'stealsPerMin',
  'shotQualityBlue', 'shotQualityRed', 'savePctBlueHi', 'savePctBlueLo', 'savePctRedHi', 'savePctRedLo',
  'afterPassPctBlue', 'afterPassPctRed', 'gkOffBlue', 'gkOffRed', 'placeBlue', 'placeRed',
  'savePctPassBlue', 'savePctPassRed', 'savePctNoPassBlue', 'savePctNoPassRed',
  'unmarkedBlue', 'unmarkedRed', 'doublePctBlue', 'doublePctRed', 'humanOnCarrierPctBlue',
  'lossesBluePerMin', 'lossesRedPerMin', 'lossesCheckBluePerMin', 'lossesCheckRedPerMin', 'stealTriesBluePerMin', 'stealTriesRedPerMin', 'stealPctBlue', 'stealPctRed',
  'humanStealTriesPerMin', 'humanStealsPerMin', 'goalieHumanPctBlue', 'goalsVsHumanGoaliePerMin',
  'humanTryPerPressS', 'humanStealPerPressS', 'redTryPerPressS', 'redStealPerPressS', 'humanLossPerPressS', 'blueLossPerPressS', 'humanGoalSidePctBlue',
  'passivityCallsBlue', 'passivityCallsRed'
$samples = @{}; foreach ($k in $keys) { $samples[$k] = @() }
# B-08: tiros y goles por banda de distancia a la línea de gol (px) y equipo que tira, sumados en el lote
$bands = @(@{ k = 'B0'; lo = 0; hi = 50 }, @{ k = 'B50'; lo = 50; hi = 100 }, @{ k = 'B100'; lo = 100; hi = 180 }, @{ k = 'B180'; lo = 180; hi = 1e9 })
$bandN = @{}; $bandG = @{}; foreach ($b in $bands) { foreach ($t in 'Blue', 'Red') { $bandN["$t$($b.k)"] = 0; $bandG["$t$($b.k)"] = 0 } }
$tot = @{ goalsNoShot = 0; goalsCarriedOwn = 0; jams = 0; jamSec = 0; badPlayerFrames = 0; consoleErrors = 0; failed = 0; freeHits = 0; directFreeHits = 0; penalties = 0; neutralRestarts = 0; blueCards = 0;
  possCallsBlue = 0; possCallsRed = 0; passiveCallsBlue = 0; passiveCallsRed = 0; passiveWarnings = 0; countdowns = 0 }
foreach ($i in 1..$Runs) {
  $line = Invoke-Smoke
  if (-not $line) { $tot.failed++; Write-Output ("run {0}/{1}: SIN [smoke]" -f $i, $Runs); continue }
  if ($RawOut) { Add-Content -Encoding utf8 -Path $RawOut -Value $line }
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
  # E-00: métricas por equipo (los campos faltan en versiones anteriores del humo)
  if ($null -ne $j.passes) {
    $samples.goalsBluePerMin += $j.goals.blue / $min; $samples.goalsRedPerMin += $j.goals.red / $min
    $samples.shotsBluePerMin += $j.shots.blue / $min; $samples.shotsRedPerMin += $j.shots.red / $min
    # Paradas del portero azul frente a los goles que encaja (los del rojo), y al revés
    if ($j.savesBy.blue + $j.goals.red -gt 0) { $samples.savePctBlue += 100 * $j.savesBy.blue / ($j.savesBy.blue + $j.goals.red) }
    if ($j.savesBy.red + $j.goals.blue -gt 0) { $samples.savePctRed += 100 * $j.savesBy.red / ($j.savesBy.red + $j.goals.blue) }
    $pa = $j.passes.blue + $j.passes.red; $pd = $j.passesDone.blue + $j.passesDone.red
    $samples.passesPerMin += $pa / $min
    if ($pa -gt 0) { $samples.passPct += 100 * $pd / $pa }
    $samples.passesDoneBluePerMin += $j.passesDone.blue / $min; $samples.passesDoneRedPerMin += $j.passesDone.red / $min
    $ps = $j.possessionSec.blue + $j.possessionSec.red
    if ($ps -gt 0) { $samples.possessionBluePct += 100 * $j.possessionSec.blue / $ps }
    $samples.stealsPerMin += ($j.steals.blue + $j.steals.red) / $min
  }
  # B-01: calidad media de los tiros de cada equipo y % de paradas de cada portero (azul = el que defiende
  # la portería azul) en tiros buenos (Hi) y malos (Lo); sin tiros de un tipo, el partido no aporta muestra
  if ($null -ne $j.savesHiBy) {
    if ($j.shots.blue -gt 0) { $samples.shotQualityBlue += $j.shotQualitySum.blue / $j.shots.blue }
    if ($j.shots.red -gt 0) { $samples.shotQualityRed += $j.shotQualitySum.red / $j.shots.red }
    if ($j.savesHiBy.blue + $j.goalsHiAgainst.blue -gt 0) { $samples.savePctBlueHi += 100 * $j.savesHiBy.blue / ($j.savesHiBy.blue + $j.goalsHiAgainst.blue) }
    if ($j.savesLoBy.blue + $j.goalsLoAgainst.blue -gt 0) { $samples.savePctBlueLo += 100 * $j.savesLoBy.blue / ($j.savesLoBy.blue + $j.goalsLoAgainst.blue) }
    if ($j.savesHiBy.red + $j.goalsHiAgainst.red -gt 0) { $samples.savePctRedHi += 100 * $j.savesHiBy.red / ($j.savesHiBy.red + $j.goalsHiAgainst.red) }
    if ($j.savesLoBy.red + $j.goalsLoAgainst.red -gt 0) { $samples.savePctRedLo += 100 * $j.savesLoBy.red / ($j.savesLoBy.red + $j.goalsLoAgainst.red) }
  }
  # B-03: contexto de los tiros a puerta que recibe cada portero (azul = el de la portería azul)
  if ($null -ne $j.afterPassPct) {
    foreach ($t in 'Blue', 'Red') {
      $c = $t.ToLower()
      if ($null -ne $j.afterPassPct.$c) { $samples["afterPassPct$t"] += $j.afterPassPct.$c; $samples["gkOff$t"] += $j.gkOff.$c; $samples["place$t"] += $j.place.$c }
      if ($null -ne $j.savePctPass.$c) { $samples["savePctPass$t"] += $j.savePctPass.$c }
      if ($null -ne $j.savePctNoPass.$c) { $samples["savePctNoPass$t"] += $j.savePctNoPass.$c }
      if ($null -ne $j.unmarked.$c) { $samples["unmarked$t"] += $j.unmarked.$c; $samples["doublePct$t"] += $j.doublePct.$c }
    }
  }
  if ($null -ne $j.humanOnCarrierPct -and $j.human) { $samples.humanOnCarrierPctBlue += $j.humanOnCarrierPct.blue }
  # B-06: pérdidas del portador de campo, intentos de robo (y % que acaban en robo) y portero en manos de la persona
  if ($null -ne $j.losses) {
    $samples.lossesBluePerMin += $j.losses.blue / $min; $samples.lossesRedPerMin += $j.losses.red / $min
    $samples.lossesCheckBluePerMin += $j.lossesCheck.blue / $min; $samples.lossesCheckRedPerMin += $j.lossesCheck.red / $min
    $samples.stealTriesBluePerMin += $j.stealTries.blue / $min; $samples.stealTriesRedPerMin += $j.stealTries.red / $min
    if ($j.stealTries.blue -gt 0) { $samples.stealPctBlue += 100 * $j.steals.blue / $j.stealTries.blue }
    if ($j.stealTries.red -gt 0) { $samples.stealPctRed += 100 * $j.steals.red / $j.stealTries.red }
    if ($j.human) {
      $samples.humanStealTriesPerMin += $j.stealTriesHuman.blue / $min; $samples.humanStealsPerMin += $j.stealsHuman.blue / $min
      $samples.goalieHumanPctBlue += 100 * $j.goalieHumanSec.blue / [math]::Max(0.001, $j.sec)
      $samples.goalsVsHumanGoaliePerMin += $j.goalsAgainstHumanGoalie.blue / $min
    }
  }
  # B-07: por segundo a distancia de robo (jugador·s): intentos y robos directos de la persona y del rojo,
  # y pérdidas de la persona (y del azul entero) por segundo de rival encima; autogoles sin tiro y conduciendo
  if ($null -ne $j.pressSec) {
    if ($j.pressSecHuman.blue -gt 1) {
      $samples.humanTryPerPressS += $j.stealTriesHuman.blue / $j.pressSecHuman.blue
      $samples.humanStealPerPressS += $j.stealsHuman.blue / $j.pressSecHuman.blue
    }
    if ($j.pressSec.red -gt 1) {
      $samples.redTryPerPressS += $j.stealTries.red / $j.pressSec.red
      $samples.redStealPerPressS += $j.stealsDirect.red / $j.pressSec.red
      $samples.blueLossPerPressS += $j.losses.blue / $j.pressSec.red
    }
    if ($j.human -and $j.defSec.blue -gt 1) { $samples.humanGoalSidePctBlue += 100 * $j.humanGoalSideSec.blue / $j.defSec.blue }
    if ($j.pressOnHumanSec.red -gt 1) { $samples.humanLossPerPressS += $j.lossesHuman.blue / $j.pressOnHumanSec.red }
    $tot.goalsCarriedOwn += [int]($j.goalsCarriedOwn.blue + $j.goalsCarriedOwn.red)
  }
  # B-10: pitadas de tiempo de posesión y de juego pasivo (por partido y equipo), avisos y cuentas atrás del HUD
  if ($null -ne $j.passivityCalls) {
    $pc = $j.passivityCalls
    $samples.passivityCallsBlue += $pc.possession.blue + $pc.passive.blue; $samples.passivityCallsRed += $pc.possession.red + $pc.passive.red
    $tot.possCallsBlue += [int]$pc.possession.blue; $tot.possCallsRed += [int]$pc.possession.red
    $tot.passiveCallsBlue += [int]$pc.passive.blue; $tot.passiveCallsRed += [int]$pc.passive.red
    $tot.passiveWarnings += [int]($pc.warnings.blue + $pc.warnings.red); $tot.countdowns += [int]$pc.countdowns
  }
  foreach ($r in @($j.shotLog)) {
    if ($null -eq $r) { continue }
    $t = if ($r.team -eq 'blue') { 'Blue' } else { 'Red' }
    foreach ($b in $bands) { if ($r.dist -ge $b.lo -and $r.dist -lt $b.hi) { $bandN["$t$($b.k)"]++; if ($r.result -eq 'goal') { $bandG["$t$($b.k)"]++ } } }
  }
  $tot.goalsNoShot += [int]($j.goalsNoShotAgainst.blue + $j.goalsNoShotAgainst.red)
  # Reinicios del reglamento (E-05): sumados en el lote
  $tot.freeHits += [int]$j.freeHits; $tot.directFreeHits += [int]$j.directFreeHits; $tot.penalties += [int]$j.penalties
  $tot.neutralRestarts += [int]$j.neutralRestarts; $tot.blueCards += [int]($j.blueCards.blue + $j.blueCards.red)
  $tot.jams += $j.jams; $tot.jamSec += $j.jamSec; $tot.badPlayerFrames += $j.badPlayerFrames; $tot.consoleErrors += $j.consoleErrors
  Write-Output ("run {0}/{1}: goles {2}-{3} · tiros {4}-{5} · paradas {6}-{7} · pases {8}/{9}-{10}/{11} · atascos {12} · errores {13}" -f $i, $Runs, $j.goals.blue, $j.goals.red, $j.shots.blue, $j.shots.red, $j.savesBy.blue, $j.savesBy.red, $j.passesDone.blue, $j.passes.blue, $j.passesDone.red, $j.passes.red, $j.jams, $j.consoleErrors)
}

$agg = [ordered]@{ mode = $Mode; extra = $Extra; smokeMs = $SmokeMs; runs = $Runs - $tot.failed }
$inv = [Globalization.CultureInfo]::InvariantCulture
foreach ($k in $keys) {
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
# % de gol por banda con todos los tiros del lote juntos; ci95 = semiancho del intervalo de Wilson
$bandLine = @()
foreach ($b in $bands) {
  foreach ($t in 'Blue', 'Red') {
    $n = $bandN["$t$($b.k)"]; if ($n -eq 0) { continue }
    $p = $bandG["$t$($b.k)"] / $n; $z2 = 1.96 * 1.96
    $hw = 100 * 1.96 * [math]::Sqrt($p * (1 - $p) / $n + $z2 / (4 * $n * $n)) / (1 + $z2 / $n)
    $agg["goalPct$t$($b.k)"] = [ordered]@{ mean = [math]::Round(100 * $p, 1); ci95 = [math]::Round($hw, 1); sd = 0; n = $n }
    $bandLine += [string]::Format($inv, '{0} {1}: {2:F0} % ± {3:F0} (n {4})', $t.ToLower(), $b.k, 100 * $p, $hw, $n)
  }
}
if ($bandLine.Count) { Write-Output ('gol por banda: ' + ($bandLine -join ' · ')) }
foreach ($k in $tot.Keys) { $agg[$k] = $tot[$k] }
Write-Output ("reinicios: libres {0} · directos {1} · penaltis {2} · neutrales {3} · azules {4}" -f $tot.freeHits, $tot.directFreeHits, $tot.penalties, $tot.neutralRestarts, $tot.blueCards)
Write-Output ("pasividad: posesión azul {0} rojo {1} · pasivo azul {2} rojo {3} · avisos {4} · cuentas atrás {5}" -f $tot.possCallsBlue, $tot.possCallsRed, $tot.passiveCallsBlue, $tot.passiveCallsRed, $tot.passiveWarnings, $tot.countdowns)
Write-Output ("autogoles: sin tiro {0} · conduciendo hacia la propia {1}" -f $tot.goalsNoShot, $tot.goalsCarriedOwn)
Write-Output ("totales: atascos {0} ({1:F1} s) · fuera de pista {2} · errores de consola {3} · fallidas {4}" -f $tot.jams, $tot.jamSec, $tot.badPlayerFrames, $tot.consoleErrors, $tot.failed)
Write-Output ('[smoke-agg] ' + ($agg | ConvertTo-Json -Compress -Depth 4))
