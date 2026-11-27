# W7 STAGE1 verification run: launch the real Electron app once with the
# overlay opted in (VITE_UXFD_NATIVE_OVERLAY=1) and VITE_PERF_AGENT_MODE=1
# so it exits itself after one automated scenario. DirectComposition needs
# an interactive session (SSH direct exec fails with E_ACCESSDENIED), so we
# use schtasks /it the same way probe-sustained/run.ps1 does.
param(
  [string]$Tag = 'verify'
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = 'C:\Users\gzabu\UXFD'
$log = "$root\bench-w7\$Tag.log"
$done = "$root\bench-w7\$Tag.done"

New-Item -ItemType Directory -Force -Path "$root\bench-w7" | Out-Null
Remove-Item $log, $done -ErrorAction SilentlyContinue

$bat = @(
  '@echo off',
  "cd /d $root",
  'set VITE_PERF_AGENT_MODE=1',
  'set VITE_UXFD_NATIVE_OVERLAY=1',
  'set UXFD_NATIVE_OVERLAY=1',
  "npm run dev:native-overlay > $log 2>&1",
  "echo DONE_MARKER >> $log",
  "echo done > $done"
)
Set-Content -Path "$root\bench-w7\run-$Tag.bat" -Value $bat -Encoding ASCII

schtasks /create /tn "uxfdw7$Tag" /tr "$root\bench-w7\run-$Tag.bat" /sc once /st 23:59 /it /f | Out-Null
schtasks /run /tn "uxfdw7$Tag" | Out-Null

$deadline = (Get-Date).AddSeconds(180)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 5
  if (Test-Path $done) { break }
}

schtasks /delete /tn "uxfdw7$Tag" /f | Out-Null
if (Test-Path $log) { Get-Content $log } else { '(no log)' }
