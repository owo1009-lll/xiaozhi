param(
  [Parameter(Mandatory = $true)][string]$TextPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$VoiceName = "Microsoft Huihui Desktop",
  [int]$Rate = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

$text = Get-Content -LiteralPath $TextPath -Raw -Encoding UTF8
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($OutputPath)) | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$null = $synth.SelectVoice($VoiceName)
$synth.Rate = $Rate
$synth.Volume = 100
$synth.SetOutputToWaveFile($OutputPath)
$synth.Speak($text)
$synth.Dispose()
