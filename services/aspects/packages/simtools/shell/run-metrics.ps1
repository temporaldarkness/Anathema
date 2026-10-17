# run-metrics.ps1
[CmdletBinding()]
param(
    [Parameter(Position=0, ValueFromRemainingArguments=$true)]
    [string[]]$Names,

    [string]$File,
    [int]$Jobs = 0,
    [switch]$List,
    [switch]$Open,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
$env:NO_COLOR    = '1'
$env:FORCE_COLOR = '0'

# --- Каталог ---
$catalogPath = if ($File) { (Resolve-Path $File).Path } else { Join-Path $PSScriptRoot 'metrics.json' }
if (-not (Test-Path $catalogPath)) {
    Write-Host "Catalog not found: $catalogPath" -ForegroundColor Red; exit 2
}
$catalog  = Get-Content $catalogPath -Raw | ConvertFrom-Json
$allNames = @($catalog.PSObject.Properties.Name)

if ($Help) {
@"
Usage: run-metrics [options] [metric ...]

  (no names)        run all metrics from metrics.json
  name1 name2 ...   run only these, in this order in combined.log
  -File path.json   use another catalog
  -Jobs N           limit parallelism (default: unlimited)
  -List             print available metrics and exit
  -Open             open combined.log in the default app at the end
  -Help             show this help

Examples:
  run-metrics
  run-metrics card-stats pace
  run-metrics -Jobs 2 card-stats pace replacement
  run-metrics -File fast.json -Open
"@
    exit 0
}

if ($List) {
    Write-Host "Metrics in ${catalogPath}:"
    foreach ($n in $allNames) { Write-Host "  $n" }
    exit 0
}

if (-not $Names -or $Names.Count -eq 0) { $Names = $allNames }

$unknown = $Names | Where-Object { $allNames -notcontains $_ }
if ($unknown) {
    Write-Host "Unknown: $($unknown -join ', ')" -ForegroundColor Red
    Write-Host "Available: $($allNames -join ', ')"
    exit 2
}

# --- Подготовка ---
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$queue = for ($k = 0; $k -lt $Names.Count; $k++) {
    $n = $Names[$k]
    $mArgs = $catalog.$n
    if ($mArgs -isnot [array]) { $mArgs = @($mArgs) }
    [pscustomobject]@{ Name = $n; Args = $mArgs; Index = $k }
}

function Start-Metric($m) {
    $out = Join-Path $logDir "$($m.Name).log"
    if (Test-Path $out) { Remove-Item $out -Force }
    $inner  = 'pnpm.cmd ' + ($m.Args -join ' ')
    $cmdArg = "/c $inner > `"$out`" 2>&1"
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArg -PassThru -NoNewWindow
    Write-Host ("[{0,-12}] started pid {1,6}" -f $m.Name, $p.Id) -ForegroundColor Cyan
    [pscustomobject]@{ Name = $m.Name; Proc = $p; File = $out; Index = $m.Index }
}

# --- Запуск с учётом -Jobs ---
$entries = @()
$running = @()
$i = 0
$cap = if ($Jobs -gt 0) { $Jobs } else { [int]::MaxValue }

while ($i -lt $queue.Count -and $running.Count -lt $cap) {
    $running += Start-Metric $queue[$i]; $i++
}

while ($running.Count -gt 0) {
    $finished = @($running | Where-Object { $_.Proc.HasExited })
    foreach ($e in $finished) {
        $e.Proc.Refresh()
        $c = if ($e.Proc.ExitCode -eq 0) { 'Green' } else { 'Red' }
        Write-Host ("[{0,-12}] finished exit {1}" -f $e.Name, $e.Proc.ExitCode) -ForegroundColor $c
        $entries += $e
        $running = @($running | Where-Object { $_.Proc.Id -ne $e.Proc.Id })
        if ($i -lt $queue.Count) {
            $running += Start-Metric $queue[$i]; $i++
        }
    }
    if ($running.Count -gt 0) {
        $names = ($running | ForEach-Object { $_.Name }) -join ', '
        Write-Host ("`r[{0}] running ({1}): {2}      " -f (Get-Date -Format 'HH:mm:ss'), $running.Count, $names) -NoNewline
        Start-Sleep -Seconds 2
    }
}
Write-Host ""

# --- Склейка в порядке из cmd (не в порядке завершения) ---
$sorted   = $entries | Sort-Object Index
$combined = Join-Path $logDir 'combined.log'
$sb = [System.Text.StringBuilder]::new()
foreach ($e in $sorted) {
    [void]$sb.AppendLine(('=' * 80))
    [void]$sb.AppendLine("=== $($e.Name) ===")
    [void]$sb.AppendLine(('=' * 80))
    if (Test-Path $e.File) { $sb.AppendLine([IO.File]::ReadAllText($e.File)) }
    [void]$sb.AppendLine()
}
[IO.File]::WriteAllText($combined, $sb.ToString(), [Text.UTF8Encoding]::new($false))
Write-Host "Combined log: $combined" -ForegroundColor Yellow
if ($Open) { Start-Process $combined }

$fail = if ($sorted | Where-Object { $_.Proc.ExitCode -ne 0 }) { 1 } else { 0 }
exit $fail