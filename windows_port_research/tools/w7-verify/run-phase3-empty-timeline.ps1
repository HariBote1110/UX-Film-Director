# Phase 7 (W7) 需要駆動staged attach: Phase 3実機検証
# （空タイムラインでのattach→overlay switch時間 + nv12バックグラウンド
# ready時間 + UIスレッド応答性）。stage5/6のrun-stage5-attach-latency.ps1
# と同じ手法（schtasks /it 経由起動、Chromium CONSOLE出力のリアルタイム
# grep、Get-Process応答性ポーリング）をベースに、以下2点を拡張した:
#   (a) 'attach' ログ（`[NativeOverlay] attach ... "success":true`）は
#       stage6以降、essential集合の完成だけでattachが解決するようになった
#       ため、このログの意味そのものが「attach→overlay switch時間」を
#       指すようになっている（コード変更不要、意味だけが変わった）。
#   (b) 新設した'nv12Ready'ログ（`[NativeOverlay] nv12Ready {"ready":true}`、
#       Viewport.tsxのpollNv12Ready成功時）を追加検出し、nv12バックグラウンド
#       構築完了までの時間を別途記録する。
#   (d) UIスレッド応答性ポーリングは attach 解決後も止めず、nv12Ready
#       （またはタイムアウト）まで継続する——「essential windowだけでなく
#       backgroundのnv12 windowもUIスレッドをブロックしないこと」を
#       同一計測で証明するため。
param(
  [string]$Tag = 'phase3run'
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
$nv12ReadyTime = $null
$deadline = (Get-Date).AddSeconds(150)
$lastLineIndex = 0
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $lines = Get-Content -Path $log -ErrorAction SilentlyContinue
    if ($lines) {
      for ($i = $lastLineIndex; $i -lt $lines.Count; $i++) {
        if (-not $attachTime -and $lines[$i] -match '\[NativeOverlay\] attach.*"success":true') {
          $attachTime = Get-Date
        }
        if (-not $nv12ReadyTime -and $lines[$i] -match '\[NativeOverlay\] nv12Ready.*"ready":true') {
          $nv12ReadyTime = Get-Date
        }
      }
      $lastLineIndex = $lines.Count
    }
  }
  if ($nv12ReadyTime) { break }  # 両方揃った、または attach 自体が発火しなかった
  if (Test-Path $done) { break }  # process exited early
}

Start-Sleep -Seconds 2
New-Item -ItemType File -Path $stopPoll -Force | Out-Null
Wait-Job $pollJob -Timeout 10 | Out-Null
Receive-Job $pollJob | Out-Null
Remove-Job $pollJob -Force | Out-Null

schtasks /end /tn "uxfdw7$Tag" 2>$null | Out-Null
schtasks /delete /tn "uxfdw7$Tag" /f | Out-Null
Get-Process -Name electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$attachSeconds = if ($attachTime) { [Math]::Round(($attachTime - $launchTime).TotalSeconds, 2) } else { -1 }
$nv12ReadySeconds = if ($nv12ReadyTime) { [Math]::Round(($nv12ReadyTime - $launchTime).TotalSeconds, 2) } else { -1 }
$nv12FromAttachSeconds = if ($attachTime -and $nv12ReadyTime) { [Math]::Round(($nv12ReadyTime - $attachTime).TotalSeconds, 2) } else { -1 }

$responding = Import-Csv $respondingCsv -ErrorAction SilentlyContinue
$respondingFalseSamples = @($responding | Where-Object { $_.responding -eq 'False' })

$result = [ordered]@{
  tag = $Tag
  launchTime = $launchTime.ToString('o')
  attachTime = if ($attachTime) { $attachTime.ToString('o') } else { $null }
  attachSeconds = $attachSeconds
  nv12ReadyTime = if ($nv12ReadyTime) { $nv12ReadyTime.ToString('o') } else { $null }
  nv12ReadySeconds = $nv12ReadySeconds
  nv12FromAttachSeconds = $nv12FromAttachSeconds
  respondingSamples = $responding.Count
  respondingFalseSamples = $respondingFalseSamples.Count
}
$result | ConvertTo-Json | Set-Content -Path $resultJson -Encoding utf8
$result | ConvertTo-Json
