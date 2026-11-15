<#
.SYNOPSIS
  Capturas headless del juego para el workflow gráfico (docs/graphics/WORKFLOW.md).

.DESCRIPTION
  Abre la URL del servidor de desarrollo en Chrome/Edge headless, guarda la captura en JPG
  y vuelca los mensajes de consola del navegador (errores incluidos) a un .console.txt junto
  a cada imagen. No usa dependencias del proyecto: solo el navegador instalado.

  Requiere `npm run dev` arrancado. Las escenas `lab=...` las crea el WP-00 (LabScene);
  antes de que exista, cualquier query abre el menú.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-shot.ps1 -Query "lab=rink" -Out docs/graphics/shots/WP-10/after/rink.jpg

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-shot.ps1 -Set camera -Dir docs/graphics/shots/WP-10/after
#>
param(
  [string]$Query = '',
  [string]$Out = '',
  [string]$Set = '',
  [string]$Dir = '',
  [string]$BaseUrl = '',
  [int]$Width = 1280,
  [int]$Height = 720,
  [int]$WaitMs = 6000,
  [int]$Quality = 82
)

$ErrorActionPreference = 'Stop'

# Escenas estándar del laboratorio. Los nombres son los ficheros de salida.
$Shots = [ordered]@{
  rink       = 'lab=rink'
  scale      = 'lab=scale'
  goal       = 'lab=goal'
  players    = 'lab=players'
  strip      = 'lab=players&strip=stride'
  officials  = 'lab=officials'
  style      = 'lab=style'
  arcade     = 'lab=match&mode=arcade&freeze=4000'
  reglamento = 'lab=match&mode=reglamento&freeze=4000'
}
$Sets = @{
  standard  = @('rink', 'scale', 'goal', 'players', 'officials', 'arcade', 'reglamento')
  camera    = @('rink', 'scale', 'reglamento')
  players   = @('players', 'strip', 'arcade')
  rink      = @('rink', 'goal', 'reglamento')
  officials = @('officials', 'reglamento')
  style     = @('style', 'players')
}

function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  throw 'No se encontró Chrome ni Edge.'
}

function Convert-ToJpg([string]$png, [string]$jpg, [int]$q) {
  try {
    Add-Type -AssemblyName System.Drawing
    $bytes = [System.IO.File]::ReadAllBytes($png)
    $ms = New-Object System.IO.MemoryStream(, $bytes)
    $img = [System.Drawing.Image]::FromStream($ms)
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$q)
    $img.Save($jpg, $codec, $params)
    $img.Dispose(); $ms.Dispose()
    Remove-Item $png
    return $jpg
  } catch {
    # Sin System.Drawing: se conserva el PNG.
    $fallback = [System.IO.Path]::ChangeExtension($jpg, '.png')
    Move-Item -Force $png $fallback
    return $fallback
  }
}

function Invoke-Shot([string]$query, [string]$outPath) {
  $outPath = [System.IO.Path]::GetFullPath($outPath)
  New-Item -ItemType Directory -Force (Split-Path $outPath) | Out-Null
  $tmpPng = [System.IO.Path]::ChangeExtension($outPath, '.tmp.png')
  $url = if ($query) { "$BaseUrl`?$query" } else { $BaseUrl }
  $profileDir = Join-Path $env:TEMP 'rh-gfx-shot-chrome'
  $logPath = [System.IO.Path]::ChangeExtension($outPath, '.console.txt')

  $chromeArgs = @(
    '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    "--window-size=$Width,$Height", "--virtual-time-budget=$WaitMs",
    "--user-data-dir=$profileDir", '--enable-logging=stderr', '--v=0',
    "--screenshot=$tmpPng", $url
  )
  # En Windows PowerShell 5.1 el stderr nativo con 'Stop' aborta el script.
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $stderr = & $script:Browser @chromeArgs 2>&1 | ForEach-Object { "$_" }
  $ErrorActionPreference = $prev
  # Solo interesan los mensajes de consola de la página.
  $console = $stderr | Where-Object { $_ -match 'CONSOLE|Uncaught|ERROR:.*(source|javascript)' } |
    ForEach-Object { if ($_.Length -gt 300) { $_.Substring(0, 300) + ' [...]' } else { $_ } }
  Set-Content -Encoding utf8 -Path $logPath -Value ($console -join "`n")

  if (-not (Test-Path $tmpPng)) { throw "Sin captura para $url" }
  $final = Convert-ToJpg $tmpPng $outPath $Quality
  $errors = @($console | Where-Object { $_ -match 'Uncaught|error|Error' }).Count
  Write-Output ("{0}  <- {1}  (consola: {2} lineas, {3} con error)" -f $final, $url, @($console).Count, $errors)
}

# Vite en Windows puede escuchar en IPv4 o IPv6, y puede haber otro proyecto en el mismo puerto:
# se usa el primer candidato que sirva este juego (título de index.html).
$candidates = if ($BaseUrl) { @($BaseUrl) } else { @('http://127.0.0.1:5173/', 'http://[::1]:5173/') }
$BaseUrl = $null
foreach ($c in $candidates) {
  try {
    $page = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $c
    if ($page.Content -match '<title>Rink Hockey Game</title>') { $BaseUrl = $c; break }
  } catch { }
}
if (-not $BaseUrl) {
  throw "Ningún servidor de este juego en: $($candidates -join ', '). Arranca 'npm run dev' o pasa -BaseUrl (si el puerto lo ocupa otro proyecto, usa otro puerto)."
}

$script:Browser = Find-Browser

if ($Set) {
  if (-not $Sets.ContainsKey($Set)) { throw "Set desconocido: $Set. Opciones: $($Sets.Keys -join ', ')" }
  if (-not $Dir) { throw 'Con -Set hace falta -Dir.' }
  foreach ($name in $Sets[$Set]) { Invoke-Shot $Shots[$name] (Join-Path $Dir "$name.jpg") }
} else {
  if (-not $Out) { throw 'Falta -Out (o usa -Set + -Dir).' }
  Invoke-Shot $Query $Out
}
