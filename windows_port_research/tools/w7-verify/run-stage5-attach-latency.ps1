# W7 STAGE5: async-attach + Option C deferral, real-hardware measurement.
#
# Measures, for a single real Electron app launch (VITE_UXFD_NATIVE_OVERLAY=1
# + VITE_PERF_AGENT_MODE=1, same perf-harness-driven auto-attach trigger as
# STAGE2's run-verify.ps1):
#   (a) attach window duration: process-launch wall clock -> the wall clock
#       at which the `[NativeOverlay] attach {"success":true...}` log line
#       first appears in main-process stdout (this is the moment the async
#       attach Promise resolved and Viewport's state machine switches from
#       presenter to overlay).
#   (b) UI-thread responsiveness DURING that window: polls
#       `Get-Process -Name electron | Select -First 1 -ExpandProperty Responding`
#       once per second from launch until attach resolves. `.Responding` is
#       Windows' own message-pump liveness check (the same signal Task
#       Manager uses for "Not Responding") — if the Electron main process's
#       message queue is not being pumped (the STAGE2 symptom, synchronous
#       attach blocking Electron's main/UI thread), this flips to $false.
#       Chosen over adding a bespoke IPC ping because it needs no app code
#       changes and is a strictly OS-level, harder-to-fake liveness signal.
#
# DirectComposition needs an interactive session (SSH direct exec fails with
# E_ACCESSDENIED), so this uses schtasks /it, same as STAGE1/STAGE2 tooling.
param(
  [string]$Tag = 'stage5run'
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = 'C:\Users\gzabu\UXFD'
$log = "$root\bench-w7\$Tag.log"
$done = "$root\bench-w7\$Tag.done"
$respondingCsv = "$root\bench-w7\$Tag-responding.csv"
$stopPoll = "$root\bench-w7\$Tag-stop.flag"
$resultJson = "$root\bench-w7\$Tag-result.json"

New-Item -ItemType Directory -Force -Path "$root\bench-w7" | Out-Null
Remove-Item $log, $done, $respondingCsv, $stopPoll, $resultJson -ErrorAction SilentlyContinue

$bat = @(
  '@echo off',
  "cd /d $root",
  'set VITE_PERF_AGENT_MODE=1',
  'set ELECTRON_ENABLE_LOGGING=1',
  'set ELECTRON_ENABLE_STACK_DUMPING=1',
  'set VITE_UXFD_NATIVE_OVERLAY=1',
  'set UXFD_NATIVE_OVERLAY=1',
  "npm run dev:native-overlay > $log 2>&1",
  "echo DONE_MARKER >> $log",
  "echo done > $done"
)
Set-Content -Path "$root\bench-w7\run-$Tag.bat" -Value $bat -Encoding ASCII

$launchTime = Get-Date
schtasks /create /tn "uxfdw7$Tag" /tr "$root\bench-w7\run-$Tag.bat" /sc once /st 23:59 /it /f | Out-Null
schtasks /run /tn "uxfdw7$Tag" | Out-Null

# Background job: poll Electron process responsiveness once a second until
# told to stop (the caller stops it right after the attach line is seen, or
# this script's own timeout below stops it).
$pollJob = Start-Job -ScriptBlock {
  param($respondingCsv, $stopPoll)
  "timestamp,responding,pid_count" | Out-File -FilePath $respondingCsv -Encoding utf8
  while (-not (Test-Path $stopPoll)) {
    $procs = Get-Process -Name electron -ErrorAction SilentlyContinue
    $responding = if ($procs) { ($procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).Responding } else { $null }
    $ts = (Get-Date).ToString('o')
    "$ts,$responding,$($procs.Count)" | Out-File -FilePath $respondingCsv -Append -Encoding utf8
    Start-Sleep -Milliseconds 1000
  }
} -ArgumentList $respondingCsv, $stopPoll

$attachTime = $null
$deadline = (Get-Date).AddSeconds(180)
$lastLineIndex = 0
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $lines = Get-Content -Path $log -ErrorAction SilentlyContinue
    if ($lines) {
      for ($i = $lastLineIndex; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '\[NativeOverlay\] attach.*"success":true') {
          $attachTime = Get-Date
          break
        }
      }
      $lastLineIndex = $lines.Count
    }
  }
  if ($attachTime) { break }
  if (Test-Path $done) { break }  # process exited without ever attaching
}

Start-Sleep -Seconds 1
New-Item -ItemType File -Path $stopPoll -Force | Out-Null
Wait-Job $pollJob -Timeout 10 | Out-Null
Receive-Job $pollJob | Out-Null
Remove-Job $pollJob -Force | Out-Null

# Let the app run a little longer so the log captures a few post-attach
# frames (interim-presenter -> overlay evidence), then stop it.
Start-Sleep -Seconds 5
schtasks /end /tn "uxfdw7$Tag" 2>$null | Out-Null
schtasks /delete /tn "uxfdw7$Tag" /f | Out-Null
Get-Process -Name electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$attachSeconds = if ($attachTime) { [Math]::Round(($attachTime - $launchTime).TotalSeconds, 2) } else { -1 }

$responding = Import-Csv $respondingCsv -ErrorAction SilentlyContinue
$respondingDuringAttach = @($responding | Where-Object { $_.responding -eq 'False' })

$result = [ordered]@{
  tag = $Tag
  launchTime = $launchTime.ToString('o')
  attachTime = if ($attachTime) { $attachTime.ToString('o') } else { $null }
  attachSeconds = $attachSeconds
  respondingSamples = $responding.Count
  respondingFalseSamples = $respondingDuringAttach.Count
}
$result | ConvertTo-Json | Set-Content -Path $resultJson -Encoding utf8
$result | ConvertTo-Json
