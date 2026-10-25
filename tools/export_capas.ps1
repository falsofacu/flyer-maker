# Uso: powershell -File tools/export_capas.ps1 tools/cfg/movie-hor.jsx
param([Parameter(Mandatory)][string]$Cfg)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tmp = Join-Path $env:TEMP 'flyer-maker-run.jsx'
$code = (Get-Content -Raw -Encoding UTF8 $Cfg) + "`n" + (Get-Content -Raw -Encoding UTF8 (Join-Path $here 'export_capas.jsx'))
[IO.File]::WriteAllText($tmp, $code, (New-Object Text.UTF8Encoding $true))
$ps = New-Object -ComObject Photoshop.Application
$ps.DoJavaScriptFile($tmp)
