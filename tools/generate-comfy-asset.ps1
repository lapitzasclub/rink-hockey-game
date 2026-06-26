param(
  [Parameter(Mandatory = $true)]
  [string]$Prompt,

  [ValidateSet("pixel-sprite", "spritesheet", "legacy-sd15")]
  [string]$Profile = "pixel-sprite",
  [string]$Negative = "",
  [int]$Width = 1024,
  [int]$Height = 1024,
  [int]$Steps = 28,
  [double]$Cfg = 6.5,
  [int]$BatchSize = 1,
  [long]$Seed = 0,
  [string]$Prefix = "rink_asset",
  [string]$ProjectOutputDir = "public\assets\generated",
  [string]$ComfyRoot = "D:\AI\ComfyUI",
  [int]$Port = 8188,
  [switch]$NoCopy
)

$ErrorActionPreference = "Stop"

function Test-ComfyUi {
  param([string]$BaseUrl)

  try {
    Invoke-RestMethod -Uri "$BaseUrl/system_stats" -Method Get -TimeoutSec 5 | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

function Start-ComfyUi {
  param(
    [string]$Root,
    [string]$BaseUrl
  )

  $launcher = Join-Path $Root "launch-openclaw-detached.ps1"
  if (-not (Test-Path $launcher)) {
    throw "No existe el lanzador de ComfyUI: $launcher"
  }

  & powershell -NoProfile -ExecutionPolicy Bypass -File $launcher | Out-Null

  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if (Test-ComfyUi -BaseUrl $BaseUrl) {
      return
    }
  }

  throw "ComfyUI no responde en $BaseUrl tras arrancarlo."
}

function Get-GenerationProfile {
  param([string]$Name)

  $baseNegative = "photorealistic, photo, 3d render, realistic, blurry, low quality, text, watermark, logo, signature, ui, frame, cropped, cut off, duplicate character, extra limbs, missing limbs, malformed hands, bad anatomy, noisy background, complex background, arena, stadium, rink, court, boards, walls, field lines, scenery, crowd, shadows baked into transparent asset"

  switch ($Name) {
    "pixel-sprite" {
      return [ordered]@{
        checkpoint = "sd_xl_base_1.0.safetensors"
        promptPrefix = "detailed pixel art, three-quarter top-down arcade sports game character sprite, slightly tilted camera, single character only, isolated asset on plain solid off-white background, centered, readable silhouette, clean outline, limited palette, crisp edges, roller hockey videogame asset"
        negative = "$baseNegative, spritesheet, sprite sheet, character sheet, grid, multiple sprites, multiple characters, many views, animation frames, collage"
        sampler = "dpmpp_2m"
        scheduler = "karras"
        loras = @(
          [ordered]@{ name = "pixel-art-xl.safetensors"; model = 1.15; clip = 1.15 }
        )
      }
    }
    "spritesheet" {
      return [ordered]@{
        checkpoint = "sd_xl_base_1.0.safetensors"
        promptPrefix = "spritesheet, detailed pixel art, three-quarter top-down arcade sports game sprite animation sheet, slightly tilted camera, four consistent frames in a single row, single character only, isolated asset on plain solid off-white background, centered frames, readable silhouette, clean outline, limited palette, roller hockey videogame asset"
        negative = "$baseNegative, perspective camera, diagonal view, scene, crowd, ice rink background"
        sampler = "dpmpp_2m"
        scheduler = "karras"
        loras = @(
          [ordered]@{ name = "pixel-art-xl.safetensors"; model = 0.9; clip = 0.9 },
          [ordered]@{ name = "spritesheet.safetensors"; model = 1.6; clip = 1.6 }
        )
      }
    }
    "legacy-sd15" {
      return [ordered]@{
        checkpoint = "v1-5-pruned-emaonly-fp16.safetensors"
        promptPrefix = "top-down 2d game asset, clean minimal, centered, readable silhouette"
        negative = $baseNegative
        sampler = "euler"
        scheduler = "normal"
        loras = @()
      }
    }
  }
}

function Get-UniqueDestination {
  param(
    [string]$Directory,
    [string]$FileName
  )

  $candidate = Join-Path $Directory $FileName
  if (-not (Test-Path $candidate)) {
    return $candidate
  }

  $stem = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  $ext = [System.IO.Path]::GetExtension($FileName)
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  return Join-Path $Directory "$stem-$stamp$ext"
}

$baseUrl = "http://127.0.0.1:$Port"
if (-not (Test-ComfyUi -BaseUrl $baseUrl)) {
  Start-ComfyUi -Root $ComfyRoot -BaseUrl $baseUrl
}

if ($Seed -eq 0) {
  $Seed = Get-Random -Minimum 1 -Maximum ([int]::MaxValue)
}

$profileConfig = Get-GenerationProfile -Name $Profile
$checkpointName = $profileConfig.checkpoint
$positivePrompt = "$($profileConfig.promptPrefix), $Prompt"
if ([string]::IsNullOrWhiteSpace($Negative)) {
  $Negative = $profileConfig.negative
}

$filenamePrefix = "rink_hockey_game/$Prefix"

$workflow = [ordered]@{
  "1" = [ordered]@{
    class_type = "CheckpointLoaderSimple"
    inputs = [ordered]@{ ckpt_name = $checkpointName }
  }
}

$modelRef = @("1", 0)
$clipRef = @("1", 1)
$vaeRef = @("1", 2)
$nodeId = 10
foreach ($lora in $profileConfig.loras) {
  $id = [string]$nodeId
  $workflow[$id] = [ordered]@{
    class_type = "LoraLoader"
    inputs = [ordered]@{
      lora_name = $lora.name
      strength_model = $lora.model
      strength_clip = $lora.clip
      model = $modelRef
      clip = $clipRef
    }
  }
  $modelRef = @($id, 0)
  $clipRef = @($id, 1)
  $nodeId++
}

$workflow += [ordered]@{
  "2" = [ordered]@{
    class_type = "CLIPTextEncode"
    inputs = [ordered]@{
      text = $positivePrompt
      clip = $clipRef
    }
  }
  "7" = [ordered]@{
    class_type = "CLIPTextEncode"
    inputs = [ordered]@{
      text = $Negative
      clip = $clipRef
    }
  }
  "5" = [ordered]@{
    class_type = "EmptyLatentImage"
    inputs = [ordered]@{
      width = $Width
      height = $Height
      batch_size = $BatchSize
    }
  }
  "3" = [ordered]@{
    class_type = "KSampler"
    inputs = [ordered]@{
      seed = $Seed
      steps = $Steps
      cfg = $Cfg
      sampler_name = $profileConfig.sampler
      scheduler = $profileConfig.scheduler
      denoise = 1.0
      model = $modelRef
      positive = @("2", 0)
      negative = @("7", 0)
      latent_image = @("5", 0)
    }
  }
  "4" = [ordered]@{
    class_type = "VAEDecode"
    inputs = [ordered]@{
      samples = @("3", 0)
      vae = $vaeRef
    }
  }
  "6" = [ordered]@{
    class_type = "SaveImage"
    inputs = [ordered]@{
      filename_prefix = $filenamePrefix
      images = @("4", 0)
    }
  }
}

$request = @{
  prompt = $workflow
  client_id = "rink-hockey-game-agent"
} | ConvertTo-Json -Depth 80

$response = Invoke-RestMethod -Uri "$baseUrl/prompt" -Method Post -ContentType "application/json" -Body $request -TimeoutSec 20
$promptId = $response.prompt_id
if (-not $promptId) {
  throw "ComfyUI no devolvio prompt_id."
}

$entry = $null
for ($i = 0; $i -lt 300; $i++) {
  Start-Sleep -Seconds 1
  $history = Invoke-RestMethod -Uri "$baseUrl/history/$promptId" -Method Get -TimeoutSec 10
  $entry = $history.$promptId
  if ($entry) {
    if ($entry.status.status_str -eq "error") {
      $entry.status | ConvertTo-Json -Depth 20
      throw "ComfyUI fallo al generar el asset. prompt_id=$promptId"
    }
    if ($entry.status.completed -eq $true) {
      break
    }
  }
}

if (-not $entry -or $entry.status.completed -ne $true) {
  throw "Timeout esperando a ComfyUI. prompt_id=$promptId"
}

$images = @($entry.outputs."6".images)
if ($images.Count -eq 0) {
  throw "ComfyUI completo el prompt, pero no devolvio imagen en el nodo SaveImage."
}

$result = [ordered]@{
  prompt_id = $promptId
  profile = $Profile
  checkpoint = $checkpointName
  loras = @($profileConfig.loras | ForEach-Object { $_.name })
  seed = $Seed
  positive = $positivePrompt
  negative = $Negative
  images = @()
}

foreach ($image in $images) {
  $sourceDir = Join-Path (Join-Path $ComfyRoot "output") $image.subfolder
  $sourcePath = Join-Path $sourceDir $image.filename

  if (-not (Test-Path $sourcePath)) {
    throw "No se encontro el PNG generado: $sourcePath"
  }

  $imageResult = [ordered]@{
    source = $sourcePath
  }

  if (-not $NoCopy) {
    $projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
    $targetDir = Join-Path $projectRoot $ProjectOutputDir
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    $targetPath = Get-UniqueDestination -Directory $targetDir -FileName $image.filename
    Copy-Item -Path $sourcePath -Destination $targetPath
    $imageResult.project_copy = $targetPath
  }

  $result.images += $imageResult
}

$result | ConvertTo-Json -Depth 10
