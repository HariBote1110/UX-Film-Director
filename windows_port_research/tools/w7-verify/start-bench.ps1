# W7 STAGE1: start the 24h native-overlay stability bench in the background.
# Uses scripts/run-native-overlay-long-bench.mjs (npm run bench:native-overlay),
# which repeatedly launches the real Electron app (VITE_PERF_AGENT_MODE=1,
# VITE_UXFD_NATIVE_OVERLAY=1) via the perf agent harness until the wall-clock
# duration elapses, and fails fast (non-zero exit) if any single run's
# native_overlay_steady_playback scenario is skipped or exceeds its frame
# time budget. DirectComposition needs an interactive session, so this uses
# schtasks /it, same as probe-sustained/run.ps1 and w7-verify/run-verify.ps1.
# Unlike those, this task is left running (not deleted) so it survives past
# this script's own return — the caller collects results after 24h.

$root = 'C:\Users\gzabu\UXFD'
$log = "$root\bench-w7\bench-24h.log"
$doneMarker = "$root\bench-w7\bench-24h.done"

New-Item -ItemType Directory -Force -Path "$root\bench-w7" | Out-Null
Remove-Item $log, $doneMarker -ErrorAction SilentlyContinue

$bat = @(
  '@echo off',
  "cd /d $root",
  'set UXFD_NATIVE_OVERLAY_BENCH_DURATION_MS=86400000',
  # The steady-playback fps budget baked into run-native-overlay-long-bench.mjs
  # (mean 16.8ms / p95 20.0ms) assumes macOS in-process decode. Windows has no
  # in-process decode path yet (falls back to the ffmpeg pipeline, a known
  # pre-existing gap unrelated to W7) so it cannot hit that budget. This 24h
  # run is a stability/crash/leak soak, not an fps-parity gate, so the budget
  # is widened via the script's documented env-var override rather than
  # editing the gate itself.
  'set UXFD_NATIVE_OVERLAY_STEADY_MEAN_BUDGET_MS=120',
  'set UXFD_NATIVE_OVERLAY_STEADY_P95_BUDGET_MS=180',
  "npm run bench:native-overlay > $log 2>&1",
  "echo BENCH_DONE_MARKER exitcode=%errorlevel% >> $log",
  "echo done > $doneMarker"
)
Set-Content -Path "$root\bench-w7\run-bench-24h.bat" -Value $bat -Encoding ASCII

schtasks /create /tn uxfdw7bench24h /tr "$root\bench-w7\run-bench-24h.bat" /sc once /st 23:59 /it /f | Out-Null
schtasks /run /tn uxfdw7bench24h | Out-Null

Start-Sleep -Seconds 5
"started, log=$log"
Get-Date -Format o
