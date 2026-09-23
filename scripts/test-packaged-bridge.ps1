param([string]$Executable = 'output\bridge\portable\OkashaBridge.exe')
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $Executable).Path
$testRoot = Join-Path (Get-Location).Path ('.bridge\smoke-' + [Guid]::NewGuid().ToString('N'))
$previous = @{}
foreach ($key in @('INSTITUTE_BRIDGE_DATA_DIR','BRIDGE_PORT','WHATSAPP_BRIDGE_PORT')) { $previous[$key] = [Environment]::GetEnvironmentVariable($key) }
$env:INSTITUTE_BRIDGE_DATA_DIR = Join-Path $testRoot 'Bridge'
$env:BRIDGE_PORT = '15418'
$env:WHATSAPP_BRIDGE_PORT = '15420'
$launcher = $null
try {
  $launcher = Start-Process -FilePath $exe -ArgumentList '--background' -WindowStyle Hidden -PassThru
  $ready = $false
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 1000
    try {
      $h = Invoke-RestMethod 'http://127.0.0.1:15418/health' -TimeoutSec 2
      $w = Invoke-RestMethod 'http://127.0.0.1:15420/health' -TimeoutSec 2
      if ($h.status -eq 'ok' -and $w.status -eq 'ok') {$ready = $true; break}
    } catch {}
  }
  if (!$ready) { throw "Packaged services did not become ready; inspect $testRoot" }
  $token = (Get-Content -LiteralPath (Join-Path $env:INSTITUTE_BRIDGE_DATA_DIR 'bridge.token') -Raw).Trim()
  $headers = @{Authorization="Bearer $token"; Origin='https://institute.example'}
  foreach ($port in @(15418,15420)) {
    $component = if ($port -eq 15418) {'hardware'} else {'whatsapp'}
    $response = Invoke-WebRequest "http://127.0.0.1:$port/v1/functions?component=$component" -Headers $headers
    if ($response.Headers['Access-Control-Allow-Origin'] -notcontains '*') {throw "CORS failed on $port"}
    $catalog = $response.Content | ConvertFrom-Json
    if ($catalog.functions.Count -lt 5) {throw "Function catalog missing on $port"}
    $unauth = Invoke-WebRequest "http://127.0.0.1:$port/v1/functions" -SkipHttpErrorCheck
    if ($unauth.StatusCode -ne 403) {throw "Authentication missing on $port"}
    Write-Output "PASS packaged adapter ${port}: health, catalog, wildcard origin and authentication"
  }
  $body = @{component='hardware';method='delete_identity_if_unchanged';arguments=@{uid=1;user_id='10';revision=('a'*64)};target=@{device=@{address='192.0.2.1'}}} | ConvertTo-Json -Depth 5
  $denied = Invoke-WebRequest 'http://127.0.0.1:15418/v1/execute' -Method Post -Headers $headers -ContentType 'application/json' -Body $body -SkipHttpErrorCheck
  if ($denied.StatusCode -ne 400 -or $denied.Content -notmatch 'serial and expiry') {throw 'Native conditional-delete guard missing'}
  Write-Output 'PASS packaged hardware rejects incomplete conditional deletion before device I/O'
  $session = Invoke-RestMethod 'http://127.0.0.1:15420/v1/execute' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"component":"whatsapp","method":"status","arguments":{},"target":{}}'
  if ($session.state -ne 'succeeded' -or $session.result.account) {throw 'Isolated WhatsApp session was not empty'}
  Write-Output 'PASS packaged WhatsApp starts with an isolated empty account'
} finally {
  if ($launcher) {
    Start-Process -FilePath $exe -ArgumentList '--exit' -WindowStyle Hidden -Wait
    if (!$launcher.WaitForExit(10000)) {$launcher.Kill(); throw 'Launcher did not exit gracefully'}
  }
  foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key]) }
}
Start-Sleep -Milliseconds 500
if (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in @(15418,15420)) {throw 'Packaged child process remained after exit'}
Write-Output 'PASS launcher exits and closes both child adapters'
