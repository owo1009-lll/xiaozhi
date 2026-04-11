param(
  [Parameter(Mandatory = $true)][string]$JsonPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$payload = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

$width = 1600
$height = 900
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function Draw-TextBlock {
  param(
    [System.Drawing.Graphics]$G,
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Brush]$Brush,
    [int]$X,
    [int]$Y,
    [int]$W,
    [int]$H
  )
  $rect = New-Object System.Drawing.RectangleF($X, $Y, $W, $H)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Near
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::Word
  $G.DrawString($Text, $Font, $Brush, $rect, $format)
  $format.Dispose()
}

$bgRect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, ([System.Drawing.Color]::FromArgb(14, 14, 14)), ([System.Drawing.Color]::FromArgb(54, 54, 54)), 35
$graphics.FillRectangle($gradient, $bgRect)

$glowA = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28, 255, 255, 255))
$glowB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 255, 255, 255))
$graphics.FillEllipse($glowA, 1060, -110, 440, 440)
$graphics.FillEllipse($glowB, -130, 640, 300, 300)

$mainCardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(239, 248, 248, 248))
$sideCardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(228, 255, 255, 255))
$chipBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(232, 232, 232))
$lineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 18, 18))
$softBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(88, 88, 88))
$mutedBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 120, 120))
$lightBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 245, 245))
$accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 26, 26))
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 220, 220)), 2
$thinPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(206, 206, 206)), 1

$titleFont = New-Object System.Drawing.Font("Microsoft YaHei", 34, [System.Drawing.FontStyle]::Bold)
$subtitleFont = New-Object System.Drawing.Font("Microsoft YaHei", 16, [System.Drawing.FontStyle]::Regular)
$lessonFont = New-Object System.Drawing.Font("Microsoft YaHei", 14, [System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font("Microsoft YaHei", 18, [System.Drawing.FontStyle]::Regular)
$smallFont = New-Object System.Drawing.Font("Microsoft YaHei", 13, [System.Drawing.FontStyle]::Regular)
$smallBoldFont = New-Object System.Drawing.Font("Microsoft YaHei", 13, [System.Drawing.FontStyle]::Bold)
$iconFont = New-Object System.Drawing.Font("Segoe UI Symbol", 34, [System.Drawing.FontStyle]::Regular)

$graphics.FillRectangle($mainCardBrush, 72, 78, 998, 744)
$graphics.FillRectangle($sideCardBrush, 1090, 78, 438, 744)

$graphics.FillRectangle($chipBrush, 104, 110, 184, 34)
Draw-TextBlock -G $graphics -Text $payload.lessonLabel -Font $lessonFont -Brush $lineBrush -X 122 -Y 116 -W 148 -H 22

$graphics.FillRectangle($chipBrush, 1360, 110, 124, 34)
Draw-TextBlock -G $graphics -Text $payload.pageLabel -Font $lessonFont -Brush $lineBrush -X 1376 -Y 116 -W 96 -H 22

Draw-TextBlock -G $graphics -Text $payload.lessonTitle -Font $subtitleFont -Brush $mutedBrush -X 104 -Y 170 -W 900 -H 28
Draw-TextBlock -G $graphics -Text $payload.title -Font $titleFont -Brush $lineBrush -X 104 -Y 202 -W 900 -H 86
Draw-TextBlock -G $graphics -Text $payload.subtitle -Font $subtitleFont -Brush $softBrush -X 104 -Y 290 -W 900 -H 40

$graphics.FillEllipse($chipBrush, 1320, 170, 120, 120)
Draw-TextBlock -G $graphics -Text "*" -Font $iconFont -Brush $accentBrush -X 1350 -Y 196 -W 60 -H 60
Draw-TextBlock -G $graphics -Text "Teaching Focus" -Font $smallBoldFont -Brush $lineBrush -X 1178 -Y 336 -W 180 -H 22
Draw-TextBlock -G $graphics -Text "Explain concepts in conversational Mandarin and anchor them in concrete classroom examples." -Font $smallFont -Brush $softBrush -X 1178 -Y 366 -W 296 -H 70

$bulletCards = @(
  @{ X = 104; Y = 368; W = 432; H = 126 },
  @{ X = 560; Y = 368; W = 432; H = 126 },
  @{ X = 104; Y = 514; W = 432; H = 126 },
  @{ X = 560; Y = 514; W = 432; H = 126 }
)

for ($i = 0; $i -lt $payload.bullets.Count -and $i -lt $bulletCards.Count; $i++) {
  $card = $bulletCards[$i]
  $graphics.FillRectangle($lightBrush, $card.X, $card.Y, $card.W, $card.H)
  $graphics.DrawRectangle($thinPen, $card.X, $card.Y, $card.W, $card.H)
  $graphics.FillEllipse($accentBrush, $card.X + 18, $card.Y + 18, 14, 14)
  Draw-TextBlock -G $graphics -Text $payload.bullets[$i] -Font $bodyFont -Brush $lineBrush -X ($card.X + 44) -Y ($card.Y + 18) -W ($card.W - 62) -H ($card.H - 26)
}

$graphics.DrawRectangle($borderPen, 104, 670, 888, 108)
Draw-TextBlock -G $graphics -Text "Narration Cue" -Font $smallBoldFont -Brush $lineBrush -X 126 -Y 690 -W 140 -H 22
Draw-TextBlock -G $graphics -Text $payload.footer -Font $smallFont -Brush $softBrush -X 126 -Y 720 -W 830 -H 42

Draw-TextBlock -G $graphics -Text "Scene Flow" -Font $smallBoldFont -Brush $lineBrush -X 1178 -Y 466 -W 120 -H 22
$graphics.FillRectangle($chipBrush, 1178, 504, 274, 34)
$graphics.FillRectangle($chipBrush, 1178, 556, 238, 34)
$graphics.FillRectangle($chipBrush, 1178, 608, 286, 34)
Draw-TextBlock -G $graphics -Text "Concept" -Font $lessonFont -Brush $lineBrush -X 1196 -Y 510 -W 120 -H 22
Draw-TextBlock -G $graphics -Text "Example" -Font $lessonFont -Brush $lineBrush -X 1196 -Y 562 -W 120 -H 22
Draw-TextBlock -G $graphics -Text "Focus" -Font $lessonFont -Brush $lineBrush -X 1196 -Y 614 -W 120 -H 22

$progressWidth = [math]::Max(40, [int](1300 * [double]$payload.progress))
$graphics.FillRectangle([System.Drawing.Brushes]::Gainsboro, 150, 846, 1300, 6)
$graphics.FillRectangle($accentBrush, 150, 846, $progressWidth, 6)

[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($OutputPath)) | Out-Null
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$titleFont.Dispose()
$subtitleFont.Dispose()
$lessonFont.Dispose()
$bodyFont.Dispose()
$smallFont.Dispose()
$smallBoldFont.Dispose()
$iconFont.Dispose()
$gradient.Dispose()
$glowA.Dispose()
$glowB.Dispose()
$mainCardBrush.Dispose()
$sideCardBrush.Dispose()
$chipBrush.Dispose()
$lineBrush.Dispose()
$softBrush.Dispose()
$mutedBrush.Dispose()
$lightBrush.Dispose()
$accentBrush.Dispose()
$borderPen.Dispose()
$thinPen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
