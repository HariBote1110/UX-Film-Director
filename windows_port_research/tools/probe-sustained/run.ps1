# Windows 実機で probe-sustained を回す。
#
# DirectComposition は SSH 直実行だと E_ACCESSDENIED になるため、
# schtasks /it でログオン済みセッションへ流し込む。GPU 使用率は
# nvidia-smi を 1Hz で並走させ、probe が出す epoch_ms で突き合わせる。
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File run.ps1 [-PresentMode fifo|immediate|mailbox]
#
# 完了判定はプロセスの有無ではなくログ末尾のマーカーで行う。schtasks が起こす
# プロセスは SSH 側の Get-Process から取りこぼすことがあり、固定 sleep や
# プロセス監視だとログを途中で読んでしまう。
param(
  [string]$PresentMode = 'fifo',
  [int]$BaselineSecs = 20,
  [int]$StaticSecs = 60,
  [int]$MoveSecs = 45,
  [int]$ResizeSecs = 45
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = 'C:\Users\gzabu\uxfd-win-probe'
$exe = "$root\probe-sustained\target\release\uxfd-win-sustained-probe.exe"
$log = "$root\sustained-$PresentMode.log"
$csv = "$root\sustained-frames-$PresentMode.csv"
$gpu = "$root\sustained-gpu-$PresentMode.csv"

$bat = @(
  '@echo off',
  "cd /d $root\probe-sustained",
  "$exe $BaselineSecs $StaticSecs $MoveSecs $ResizeSecs $csv $PresentMode > $log 2>&1"
)
Set-Content -Path "$root\runsustained.bat" -Value $bat -Encoding ASCII
Remove-Item $log, $csv, $gpu -ErrorAction SilentlyContinue

Start-Process -FilePath 'nvidia-smi' -WindowStyle Hidden -ArgumentList `
  '--query-gpu=timestamp,utilization.gpu,utilization.memory,clocks.sm,power.draw',
  '--format=csv', '-l', '1', '-f', $gpu

schtasks /create /tn uxfdsustained /tr "$root\runsustained.bat" /sc once /st 23:59 /it /f | Out-Null
schtasks /run /tn uxfdsustained | Out-Null

$budget = $BaselineSecs + $StaticSecs + $MoveSecs + $ResizeSecs + 120
$deadline = (Get-Date).AddSeconds($budget)
$done = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  if (Test-Path $log) {
    if (Select-String -Path $log -Pattern 'csv saved|csv write failed' -Quiet) { $done = $true; break }
  }
}

Stop-Process -Name nvidia-smi -ErrorAction SilentlyContinue
schtasks /delete /tn uxfdsustained /f | Out-Null

if (-not $done) { "*** TIMED OUT after $budget s ***" }
"--- $log ---"
if (Test-Path $log) { Get-Content $log } else { '(no log)' }
