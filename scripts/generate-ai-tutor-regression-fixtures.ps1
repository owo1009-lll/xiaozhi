$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $root "public\\regression-images"
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

$fixtures = @(
  @{ Name = "fixture-01-treble.png"; Lines = @("Treble Clef", "Second line = G4", "G clef") },
  @{ Name = "fixture-02-bass.png"; Lines = @("Bass Clef", "Fourth line = F3", "F clef") },
  @{ Name = "fixture-03-dot-note.png"; Lines = @("Dotted quarter note", "= 1.5 beats", "adds half value") },
  @{ Name = "fixture-04-meter.png"; Lines = @("4/4 meter", "Strong weak medium weak", "common time") },
  @{ Name = "fixture-05-semitone.png"; Lines = @("Natural semitone", "E-F", "B-C") },
  @{ Name = "fixture-06-enharmonic.png"; Lines = @("Enharmonic", "C# = Db", "same pitch") },
  @{ Name = "fixture-07-dynamics.png"; Lines = @("Dynamics", "p = soft", "f = loud") },
  @{ Name = "fixture-08-repeat.png"; Lines = @("D.C. al Fine", "repeat from start", "stop at Fine") },
  @{ Name = "fixture-09-syncopation.png"; Lines = @("Syncopation", "start on weak beat", "sustain to strong beat") },
  @{ Name = "fixture-10-middle-c.png"; Lines = @("Middle C", "c1 = C4", "grand staff anchor") }
)

foreach ($fixture in $fixtures) {
  $path = Join-Path $targetDir $fixture.Name
  $bitmap = New-Object System.Drawing.Bitmap 1280, 720
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::FromArgb(248, 248, 248))

  $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(225, 225, 225), 2)
  $titleFont = New-Object System.Drawing.Font("Arial", 42, [System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font("Arial", 28, [System.Drawing.FontStyle]::Regular)
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 20, 20))
  $bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50, 50, 50))
  $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, 95, 95))

  $graphics.FillRectangle($cardBrush, 60, 60, 1160, 600)
  $graphics.DrawRectangle($borderPen, 60, 60, 1160, 600)
  $graphics.DrawString($fixture.Lines[0], $titleFont, $titleBrush, 120, 150)

  for ($i = 1; $i -lt $fixture.Lines.Count; $i++) {
    $y = 280 + (($i - 1) * 110)
    $graphics.FillEllipse($dotBrush, 130, $y + 12, 16, 16)
    $graphics.DrawString($fixture.Lines[$i], $bodyFont, $bodyBrush, 170, $y)
  }

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $cardBrush.Dispose()
  $borderPen.Dispose()
  $titleFont.Dispose()
  $bodyFont.Dispose()
  $titleBrush.Dispose()
  $bodyBrush.Dispose()
  $dotBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host "Generated AI tutor regression fixtures in $targetDir"
