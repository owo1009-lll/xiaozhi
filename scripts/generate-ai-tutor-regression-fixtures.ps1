$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $root "public\regression-images"
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

function New-Canvas {
  param([string]$Path)
  $bitmap = New-Object System.Drawing.Bitmap 1100, 650
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::White)
  return @{ Bitmap = $bitmap; Graphics = $graphics; Path = $Path }
}

function Save-Canvas {
  param($Canvas)
  $Canvas.Bitmap.Save($Canvas.Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Canvas.Graphics.Dispose()
  $Canvas.Bitmap.Dispose()
}

$fontTitle = New-Object System.Drawing.Font("Arial", 38, [System.Drawing.FontStyle]::Bold)
$font = New-Object System.Drawing.Font("Arial", 30, [System.Drawing.FontStyle]::Regular)
$small = New-Object System.Drawing.Font("Arial", 24, [System.Drawing.FontStyle]::Regular)
$black = [System.Drawing.Brushes]::Black
$red = [System.Drawing.Brushes]::Red
$blue = [System.Drawing.Brushes]::DodgerBlue
$green = [System.Drawing.Brushes]::Green
$bread = [System.Drawing.Brushes]::SandyBrown
$water = [System.Drawing.Brushes]::LightSkyBlue
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 4)

$canvas = New-Canvas (Join-Path $targetDir "ai-tutor-01-equal-correct.png")
$g = $canvas.Graphics
$g.DrawString("Music Theory Homework", $fontTitle, $black, 40, 35)
$g.DrawString("Topic: Enharmonic notes", $font, $black, 55, 130)
$g.DrawString("Question: C# = Db", $font, $black, 55, 210)
$g.DrawString("Is this correct? Explain why.", $small, $black, 55, 290)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "ai-tutor-02-equal-error.png")
$g = $canvas.Graphics
$g.DrawString("Music Theory Homework", $fontTitle, $black, 40, 35)
$g.DrawString("Topic: Enharmonic notes", $font, $black, 55, 130)
$g.DrawString("Question: C# = Eb", $font, $black, 55, 210)
$g.DrawString("Student answer: correct", $small, $black, 55, 290)
$g.DrawString("Please find the mistake.", $small, $black, 55, 350)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "ai-tutor-03-rhythm-missing-beat.png")
$g = $canvas.Graphics
$g.DrawString("Rhythm Homework", $fontTitle, $black, 40, 35)
$g.DrawString("Time signature: 4/4", $font, $black, 55, 130)
$g.DrawString("Measure: quarter + quarter + quarter", $font, $black, 55, 210)
$g.DrawString("Question: is the measure complete?", $small, $black, 55, 290)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "ai-tutor-04-staff-question.png")
$g = $canvas.Graphics
$g.DrawString("Staff Reading Question", $fontTitle, $black, 40, 35)
$g.DrawString("Treble clef note name?", $font, $black, 55, 115)
for ($i = 0; $i -lt 5; $i++) {
  $y = 250 + ($i * 32)
  $g.DrawLine($pen, 70, $y, 850, $y)
}
$g.DrawString("G clef", $small, $black, 80, 420)
$g.FillEllipse($black, 410, 298, 48, 32)
$g.DrawLine($pen, 455, 308, 455, 215)
$g.DrawString("What note is this?", $font, $black, 55, 500)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "ai-tutor-05-non-homework-shapes.png")
$g = $canvas.Graphics
$g.DrawString("NOT HOMEWORK", $fontTitle, $black, 40, 35)
$g.DrawString("red circle and blue square", $font, $black, 55, 130)
$g.FillEllipse($red, 120, 260, 180, 180)
$g.FillRectangle($blue, 430, 260, 200, 180)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "ai-tutor-06-non-music-menu.png")
$g = $canvas.Graphics
$g.DrawString("Lunch Menu", $fontTitle, $black, 40, 35)
$g.DrawString("apple  bread  water", $font, $black, 55, 130)
$g.FillEllipse($green, 120, 250, 150, 150)
$g.FillRectangle($bread, 390, 260, 220, 120)
$g.FillRectangle($water, 710, 230, 100, 210)
Save-Canvas $canvas

$fontTitle.Dispose()
$font.Dispose()
$small.Dispose()
$pen.Dispose()

Write-Host "Generated AI tutor regression fixtures in $targetDir"
