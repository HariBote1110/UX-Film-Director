$log = 'C:\Users\gzabu\UXFD\bench-w7\bench-24h.log'
if (-not (Test-Path $log)) { '(no log)'; exit 0 }
$m = Select-String -Path $log -Pattern '\[native-overlay-bench\] run ', 'gate failed', 'EINVAL', 'skipped_no_heavy_mp4'
if ($m) { $m | ForEach-Object { $_.Line } } else { 'no match yet' }
