# Windows 実機で probe-sustained を回す。
#
# DirectComposition は SSH 直実行だと E_ACCESSDENIED になるため、
# schtasks /it でログオン済みセッションへ流し込む。GPU 使用率は
# nvidia-smi を 1Hz で並走させ、probe が出す epoch_ms で突き合わせる。
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File run.ps1
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = 'C:\Users\gzabu\uxfd-win-probe'
$exe = "$root\probe-sustained\target\release\uxfd-win-sustained-probe.exe"

$bat = @(
  '@echo off',
  "cd /d $root\probe-sustained",
  "$exe 20 60 45 45 $root\sustained-frames.csv > $root\sustained.log 2>&1"
)
Set-Content -Path "$root\runsustained.bat" -Value $bat -Encoding ASCII
Remove-Item "$root\sustained.log", "$root\sustained-frames.csv", "$root\sustained-gpu.csv" -ErrorAction SilentlyContinue

Start-Process -FilePath 'nvidia-smi' -WindowStyle Hidden -ArgumentList `
  '--query-gpu=timestamp,utilization.gpu,utilization.memory,clocks.sm,power.draw',
  '--format=csv', '-l', '1', '-f', "$root\sustained-gpu.csv"

schtasks /create /tn uxfdsustained /tr "$root\runsustained.bat" /sc once /st 23:59 /it /f | Out-Null
schtasks /run /tn uxfdsustained | Out-Null

# プロセスの出現と終了を待つ（固定 sleep だとログを途中で読んでしまう）。
$deadline = (Get-Date).AddSeconds(420)
while ((Get-Date) -lt $deadline -and -not (Get-Process uxfd-win-sustained-probe -ErrorAction SilentlyContinue)) {
  Start-Sleep -Milliseconds 500
}
while ((Get-Date) -lt $deadline -and (Get-Process uxfd-win-sustained-probe -ErrorAction SilentlyContinue)) {
  Start-Sleep -Seconds 2
}
Start-Sleep -Seconds 2

Stop-Process -Name nvidia-smi -ErrorAction SilentlyContinue
schtasks /delete /tn uxfdsustained /f | Out-Null

'--- sustained.log ---'
if (Test-Path "$root\sustained.log") { Get-Content "$root\sustained.log" } else { '(no log)' }
