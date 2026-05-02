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

$canvas = New-Canvas (Join-Path $targetDir "fixture-01-treble.png")
$g = $canvas.Graphics
$g.DrawString("Treble Clef Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("G clef. The second line is G.", $font, $black, 55, 120)
for ($i = 0; $i -lt 5; $i++) {
  $y = 250 + ($i * 32)
  $g.DrawLine($pen, 70, $y, 850, $y)
}
$g.DrawString("G", $font, $black, 120, 300)
$g.FillEllipse($black, 430, 298, 48, 32)
$g.DrawString("Question: identify treble clef and line note.", $small, $black, 55, 500)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-02-bass.png")
$g = $canvas.Graphics
$g.DrawString("Bass Clef Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("F clef. The fourth line is F.", $font, $black, 55, 120)
for ($i = 0; $i -lt 5; $i++) {
  $y = 250 + ($i * 32)
  $g.DrawLine($pen, 70, $y, 850, $y)
}
$g.DrawString("F", $font, $black, 120, 270)
$g.FillEllipse($black, 430, 266, 48, 32)
$g.DrawString("Question: explain bass clef.", $small, $black, 55, 500)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-03-dot-note.png")
$g = $canvas.Graphics
$g.DrawString("Dotted Note Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("Dotted quarter note = 1.5 beats", $font, $black, 55, 130)
$g.FillEllipse($black, 150, 260, 70, 48)
$g.DrawLine($pen, 220, 280, 220, 170)
$g.FillEllipse($black, 245, 270, 14, 14)
$g.DrawString("quarter + dot = one and a half beats", $small, $black, 55, 410)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-04-meter.png")
$g = $canvas.Graphics
$g.DrawString("Meter Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("Time signature: 4/4", $font, $black, 55, 130)
$g.DrawString("Strong - weak - medium strong - weak", $font, $black, 55, 220)
$g.DrawString("Question: explain the accent pattern.", $small, $black, 55, 320)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-05-semitone.png")
$g = $canvas.Graphics
$g.DrawString("Whole Tone and Semitone", $fontTitle, $black, 40, 35)
$g.DrawString("C to C# = semitone", $font, $black, 55, 140)
$g.DrawString("C to D = whole tone", $font, $black, 55, 220)
$g.DrawString("Question: compare the two distances.", $small, $black, 55, 320)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-06-enharmonic.png")
$g = $canvas.Graphics
$g.DrawString("Enharmonic Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("C# = Db", $fontTitle, $blue, 55, 160)
$g.DrawString("Same pitch, different names.", $font, $black, 55, 260)
$g.DrawString("Question: explain enharmonic notes.", $small, $black, 55, 360)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-07-dynamics.png")
$g = $canvas.Graphics
$g.DrawString("Dynamics Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("p  <  mf  <  f", $fontTitle, $black, 80, 160)
$g.DrawString("crescendo means gradually louder", $font, $black, 55, 270)
$g.DrawString("Question: explain dynamic markings.", $small, $black, 55, 370)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-08-repeat.png")
$g = $canvas.Graphics
$g.DrawString("Repeat Sign Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("D.C. al Fine", $fontTitle, $black, 80, 160)
$g.DrawString("Return to the beginning and play to Fine.", $font, $black, 55, 270)
$g.DrawString("Question: explain the repeat route.", $small, $black, 55, 370)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-09-syncopation.png")
$g = $canvas.Graphics
$g.DrawString("Syncopation Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("Accent shifts to a weak beat", $font, $black, 55, 150)
$g.DrawString("1  &  2  &  3  &  4  &", $font, $black, 55, 240)
$g.DrawString("      >           >", $fontTitle, $red, 55, 290)
$g.DrawString("Question: explain syncopation.", $small, $black, 55, 410)
Save-Canvas $canvas

$canvas = New-Canvas (Join-Path $targetDir "fixture-10-middle-c.png")
$g = $canvas.Graphics
$g.DrawString("Middle C Fixture", $fontTitle, $black, 40, 35)
$g.DrawString("Middle C = C4", $fontTitle, $blue, 55, 145)
$g.DrawString("It sits between treble and bass staves.", $font, $black, 55, 260)
$g.DrawString("Question: explain common notation for middle C.", $small, $black, 55, 360)
Save-Canvas $canvas

$fontTitle.Dispose()
$font.Dispose()
$small.Dispose()
$pen.Dispose()

Write-Host "Generated AI tutor regression fixtures in $targetDir"
