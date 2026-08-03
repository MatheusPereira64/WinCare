# Regenera favicon.ico / electron/icon.ico a partir do logo canônico 512×512.
# Uso (na raiz do repo):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-app-icons.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$srcPng = Join-Path $root "public\icons\android\playstore-icon.png"

if (-not (Test-Path $srcPng)) {
  throw "Fonte nao encontrada: $srcPng"
}

function Write-Ico([string]$srcPng, [string]$destIco, [int[]]$sizes) {
  $src = [System.Drawing.Image]::FromFile($srcPng)
  $ms = New-Object System.IO.MemoryStream
  $images = @()
  foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $s, $s)
    $g.Dispose()
    $pngMs = New-Object System.IO.MemoryStream
    $bmp.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
    $images += ,@{ Size = $s; Data = $pngMs.ToArray() }
    $pngMs.Dispose()
    $bmp.Dispose()
  }
  $src.Dispose()

  $bw = New-Object System.IO.BinaryWriter $ms
  $count = $images.Count
  $bw.Write([uint16]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]$count)
  $offset = 6 + (16 * $count)
  foreach ($img in $images) {
    $s = [int]$img.Size
    $bw.Write([byte](if ($s -ge 256) { 0 } else { $s }))
    $bw.Write([byte](if ($s -ge 256) { 0 } else { $s }))
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$img.Data.Length)
    $bw.Write([uint32]$offset)
    $offset += $img.Data.Length
  }
  foreach ($img in $images) { $bw.Write($img.Data) }
  $bw.Flush()
  [IO.File]::WriteAllBytes($destIco, $ms.ToArray())
  $ms.Dispose()
}

$dests = @{
  logo = Join-Path $root "public\wincare-icon.png"
  electronPng = Join-Path $root "electron\icon.png"
  electronIco = Join-Path $root "electron\icon.ico"
  favicon = Join-Path $root "public\favicon.ico"
  buildIco = Join-Path $root "build\icons\icon.ico"
}

New-Item -ItemType Directory -Force -Path (Join-Path $root "build\icons") | Out-Null
Copy-Item $srcPng $dests.logo -Force
Copy-Item $srcPng $dests.electronPng -Force
Write-Ico $srcPng $dests.electronIco @(16, 24, 32, 48, 64, 128, 256)
Copy-Item $dests.electronIco $dests.favicon -Force
Copy-Item $dests.electronIco $dests.buildIco -Force

Write-Host "Ícones atualizados a partir de $srcPng"
Get-Item $dests.Values | Format-Table Name, Length, Directory -AutoSize
