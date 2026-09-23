[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$stage = Join-Path $projectRoot ('.bridge\package-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$payload = Join-Path $stage 'payload'
$output = Join-Path $projectRoot 'output\bridge'
$python = Join-Path $projectRoot '.venv-bridge\Scripts\python.exe'
New-Item -ItemType Directory -Force -Path $payload,$output,(Join-Path $payload 'runtime'),(Join-Path $payload 'whatsapp'),(Join-Path $payload 'local'),(Join-Path $payload 'scripts') | Out-Null
Push-Location $projectRoot
try {
  & node bridge/packaging/build-branding.mjs
  if($LASTEXITCODE -ne 0){throw 'Icon build failed'}
  & $python -m PyInstaller --noconfirm --distpath (Join-Path $stage 'hardware') --workpath (Join-Path $stage 'work') bridge/packaging/okasha-hardware.spec
  if($LASTEXITCODE -ne 0){throw 'Hardware build failed'}
  Copy-Item -LiteralPath (Join-Path $stage 'hardware\OkashaHardware.exe') -Destination $payload
  $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $assembly = Join-Path $stage 'AssemblyInfo.cs'
  @'
using System.Reflection;
[assembly: AssemblyTitle("Okasha Bridge")]
[assembly: AssemblyProduct("Okasha Bridge")]
[assembly: AssemblyCompany("Okasha Institute")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]
'@ | Set-Content -LiteralPath $assembly
  & $csc /nologo /target:winexe /platform:x64 "/out:$payload\OkashaBridge.exe" "/win32icon:$PSScriptRoot\okasha.ico" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'OkashaBridgeLauncher.cs') (Join-Path $PSScriptRoot 'BridgeStatusWindow.cs') $assembly
  if($LASTEXITCODE -ne 0){throw 'Tray launcher build failed'}
  Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $payload 'runtime\node.exe')
  Copy-Item -LiteralPath (Join-Path $projectRoot 'bridge\whatsapp\src') -Destination (Join-Path $payload 'whatsapp\src') -Recurse
  foreach($file in @('package.json','package-lock.json')){Copy-Item -LiteralPath (Join-Path $projectRoot "bridge\whatsapp\$file") -Destination (Join-Path $payload "whatsapp\$file")}
  Copy-Item -LiteralPath (Join-Path $projectRoot 'bridge\whatsapp\node_modules') -Destination (Join-Path $payload 'whatsapp\node_modules') -Recurse
  foreach($file in @('bridge.mjs','http.mjs','bridge-config.mjs')){Copy-Item -LiteralPath (Join-Path $projectRoot "local\$file") -Destination (Join-Path $payload "local\$file")}
  Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts\raw-bridge.mjs') -Destination (Join-Path $payload 'scripts\raw-bridge.mjs')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.txt') -Destination $payload
  # License text only; never package local .env files, databases, tokens or sessions.
  $notices = Join-Path $payload 'THIRD-PARTY-NOTICES.txt'
  'Okasha Bridge 0.1.0: Python, Node.js, pyzk, FastAPI, uvicorn, Baileys and dependencies.' | Set-Content -LiteralPath $notices
  $pythonBase = & $python -c 'import sys; print(sys.base_prefix)'
  Get-Content -LiteralPath (Join-Path $pythonBase 'LICENSE.txt') | Add-Content -LiteralPath $notices
  $nodeVersion = & node --version
  $nodeLicense = Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE"
  Add-Content -LiteralPath $notices -Value $nodeLicense.Content
  foreach($base in @((Join-Path $payload 'whatsapp\node_modules'),(Join-Path $projectRoot '.venv-bridge\Lib\site-packages'))){
    Get-ChildItem -LiteralPath $base -Recurse -File | Where-Object {$_.Name -match '^(LICENSE|COPYING)(\..*)?$'} | ForEach-Object {Add-Content -LiteralPath $notices -Value ("`n--- " + $_.FullName.Substring($base.Length) + " ---`n");Get-Content -LiteralPath $_.FullName | Add-Content -LiteralPath $notices}
  }
  $nsis = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe'
  $setup = Join-Path $output 'OkashaBridgeSetup-0.1.0.exe'
  & $nsis /V2 "/DPAYLOAD=$payload" "/DSETUP_OUTPUT=$setup" (Join-Path $PSScriptRoot 'OkashaBridgeSetup.nsi')
  if($LASTEXITCODE -ne 0){throw 'Installer build failed'}
  $portable = Join-Path $output 'portable'
  New-Item -ItemType Directory -Force -Path $portable | Out-Null
  Get-ChildItem -LiteralPath $payload | Copy-Item -Destination $portable -Recurse -Force
  $downloads = Join-Path $projectRoot 'public\downloads'
  New-Item -ItemType Directory -Force -Path $downloads | Out-Null
  Copy-Item -LiteralPath $setup -Destination $downloads -Force
  $hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  OkashaBridgeSetup-0.1.0.exe" | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt')
  @{version='0.1.0';setup=$setup;portable=$portable;sha256=$hash;node=$nodeVersion;signing='unsigned'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'build-info.json')
  Write-Output "Built $setup"
} finally {Pop-Location}
