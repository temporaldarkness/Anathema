# run-metrics.ps1
$ErrorActionPreference = 'Stop'

$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'

$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$metrics = @(
    @{ Name = 'card-stats';  Args = @('run','--filter','@aspects/simtools','card-stats','main','100') },
    @{ Name = 'replacement'; Args = @('run','--filter','@aspects/simtools','replacement-analysis','main','100') },
    @{ Name = 'pace';        Args = @('run','--filter','@aspects/simtools','pace-report','main','100') },
    @{ Name = 'deck-diff';   Args = @('run','--filter','@aspects/simtools','deck-diff','main','strazha','divan') },
    @{ Name = 'attack';      Args = @('run','--filter','@aspects/simtools','attack-efficiency','main','100') }
)

$entries = @()
foreach ($m in $metrics) {
    $outFile = Join-Path $logDir "$($m.Name).log"
    if (Test-Path $outFile) { Remove-Item $outFile -Force }

    $inner  = 'pnpm.cmd ' + ($m.Args -join ' ')
    $cmdArg = "/c $inner > `"$outFile`" 2>&1"

    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArg -PassThru -NoNewWindow
    Write-Host ("[{0,-12}] pid {1,6} -> {2}" -f $m.Name, $p.Id, (Split-Path $outFile -Leaf)) -ForegroundColor Cyan
    $entries += [pscustomobject]@{ Name = $m.Name; Proc = $p; File = $outFile }
}

$total = $entries.Count
while (($entries | Where-Object { -not $_.Proc.HasExited }).Count -gt 0) {
    $running = @($entries | Where-Object { -not $_.Proc.HasExited })
    $names   = ($running | ForEach-Object { $_.Name }) -join ', '
    Write-Host ("`r[{0}] still running ({1}/{2}): {3}      " -f (Get-Date -Format 'HH:mm:ss'), $running.Count, $total, $names) -NoNewline
    Start-Sleep -Seconds 5
}
Write-Host "`r[{0}] all processes finished.                    " -f (Get-Date -Format 'HH:mm:ss')

$fail = 0
foreach ($e in $entries) {
    $e.Proc.Refresh()
    $code = $e.Proc.ExitCode
    $color = if ($code -eq 0) { 'Green' } else { 'Red' }
    Write-Host ("[{0,-12}] exit {1}" -f $e.Name, $code) -ForegroundColor $color
    if ($code -ne 0) { $fail = 1 }
}

$combined = Join-Path $logDir 'combined.log'
$sb = [System.Text.StringBuilder]::new()
foreach ($e in $entries) {
    [void]$sb.AppendLine(('=' * 80))
    [void]$sb.AppendLine("=== $($e.Name) ===")
    [void]$sb.AppendLine(('=' * 80))
    $body = ''
    if (Test-Path $e.File) { $body = [IO.File]::ReadAllText($e.File) }
    $sb.AppendLine($body)
    [void]$sb.AppendLine()
}
[IO.File]::WriteAllText($combined, $sb.ToString(), [Text.UTF8Encoding]::new($false))
Write-Host "Combined log: $combined" -ForegroundColor Yellow

exit $fail
