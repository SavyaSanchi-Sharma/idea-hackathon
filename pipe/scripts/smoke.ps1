<#
.SYNOPSIS
  Smoke-test the pipe backend end-to-end. Exits non-zero on any failure.

.DESCRIPTION
  Hits five validation layers in order:
    1. REST hygiene   - /health and /api/stats/summary respond with sane shape
    2. Classification - seeded endpoints classify as expected (active vs zombie)
    3. Detail + graph - per-endpoint detail and blast-radius respond
    4. SLM generation - Qwen 2.5-0.5B produces a non-empty grounded narrative
    5. Persistence    - the generated report is fetchable

  If the database is empty, the script seeds it first via /api/_dev/seed.

.PARAMETER BaseUrl
  Pipe backend base URL. Defaults to http://localhost:8000.

.PARAMETER SkipSlm
  Skip the layer-4 SLM call (10-30s on CPU). Useful in tight CI loops.

.EXAMPLE
  pwsh pipe/scripts/smoke.ps1
  pwsh pipe/scripts/smoke.ps1 -BaseUrl http://127.0.0.1:8000 -SkipSlm
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:8000",
  [switch]$SkipSlm
)

$ErrorActionPreference = "Stop"
$script:Failures = 0

function Write-Header([string]$Text) {
  Write-Host ""
  Write-Host ("=" * 72) -ForegroundColor DarkGray
  Write-Host $Text -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkGray
}

function Assert-True([bool]$Condition, [string]$Name, [string]$Detail = "") {
  if ($Condition) {
    Write-Host ("  PASS  " + $Name) -ForegroundColor Green
    if ($Detail) { Write-Host ("        " + $Detail) -ForegroundColor DarkGray }
  } else {
    Write-Host ("  FAIL  " + $Name) -ForegroundColor Red
    if ($Detail) { Write-Host ("        " + $Detail) -ForegroundColor Yellow }
    $script:Failures++
  }
}

function Invoke-Pipe([string]$Path, [string]$Method = "GET", [int]$TimeoutSec = 10) {
  $url = "$BaseUrl$Path"
  try {
    return Invoke-RestMethod -Uri $url -Method $Method -TimeoutSec $TimeoutSec
  } catch {
    Write-Host ("  ERR   $Method $Path failed: " + $_.Exception.Message) -ForegroundColor Red
    $script:Failures++
    return $null
  }
}

# --- LAYER 1: REST HYGIENE ------------------------------------------------
Write-Header "LAYER 1: REST hygiene"
$health = Invoke-Pipe "/health"
Assert-True ($health.status -eq "healthy")      "/health status=healthy"     "got: $($health.status)"
Assert-True ($health.slm_loaded -eq $true)      "/health slm_loaded=true"    "model: $($health.slm_model)"
Assert-True ($health.model_loader_loaded)       "/health model_loader=true"
Assert-True ($health.db_ok -eq $true)           "/health db_ok=true"

$summary = Invoke-Pipe "/api/stats/summary"
Assert-True ($null -ne $summary.total_discovered) "/api/stats/summary returns counts" "total_discovered=$($summary.total_discovered)"

if ($summary.total_discovered -lt 2) {
  Write-Host ""
  Write-Host "  (no data, seeding via /api/_dev/seed)" -ForegroundColor DarkYellow
  $seed = Invoke-Pipe "/api/_dev/seed" "POST" 30
  Assert-True ($seed.seeded -eq 6) "seed inserted 6 events"
  $summary = Invoke-Pipe "/api/stats/summary"
}

# --- LAYER 2: CLASSIFICATION ----------------------------------------------
Write-Header "LAYER 2: classification correctness"
$list = Invoke-Pipe "/api/endpoints"
$total = if ($null -eq $list) { 0 } else { $list.total }
Assert-True ($total -ge 2) "list has 2 or more endpoints" "total=$total"

$active = $list.items | Where-Object { $_.path -eq "/v2/upi/collect" } | Select-Object -First 1
$zombie = $list.items | Where-Object { $_.path -eq "/internal/legacy/customer-search" } | Select-Object -First 1

if ($active) {
  Assert-True ($active.rule_state -eq "active")       "active endpoint rule_state=active"       "got: $($active.rule_state)"
  $bandOk = ($active.risk_band -eq "low") -or ($active.risk_band -eq "medium")
  Assert-True $bandOk                                  "active endpoint risk_band is low or medium" "got: $($active.risk_band) score=$([math]::Round($active.risk_score,1))"
  $owaspCount = @($active.owasp_findings).Count
  Assert-True ($owaspCount -eq 0)                      "active endpoint has 0 OWASP findings"    "got: $($active.owasp_findings -join ',')"
  Assert-True ($active.rule_is_zombie -eq $false)      "active endpoint not flagged zombie"
} else {
  Assert-True $false "active endpoint /v2/upi/collect found in list"
}

if ($zombie) {
  Assert-True ($zombie.rule_state -eq "orphaned")      "zombie endpoint rule_state=orphaned"     "got: $($zombie.rule_state)"
  Assert-True ($zombie.rule_is_zombie -eq $true)       "zombie endpoint rule_is_zombie=true"
  $hasApi2 = $zombie.owasp_findings -contains "API2:Broken-Authentication"
  $hasApi9 = $zombie.owasp_findings -contains "API9:Improper-Inventory-Management"
  Assert-True $hasApi2                                 "zombie has API2:Broken-Authentication"   "findings: $($zombie.owasp_findings -join ', ')"
  Assert-True $hasApi9                                 "zombie has API9:Improper-Inventory-Management"
} else {
  Assert-True $false "zombie endpoint /internal/legacy/customer-search found in list"
}

# --- LAYER 3: DETAIL + GRAPH ----------------------------------------------
Write-Header "LAYER 3: detail + graph"
if ($zombie) {
  $detail = Invoke-Pipe "/api/endpoints/$($zombie.endpoint_id)"
  Assert-True ($null -ne $detail.prediction)              "detail.prediction present"
  Assert-True ($detail.prediction.ml_confidence -gt 0.5)  "detail.prediction.ml_confidence above 0.5" "got: $($detail.prediction.ml_confidence)"
  Assert-True ($null -ne $detail.prediction.rule_reason)  "detail.prediction.rule_reason present" "reason: $($detail.prediction.rule_reason)"
  Assert-True ($null -ne $detail.graph_features)          "detail.graph_features present"
  $stale = $detail.graph_features.days_since_last_commit
  Assert-True ($stale -ge 700)                            "zombie is 700+ days stale" "got: $stale"

  $graph = Invoke-Pipe "/api/graph"
  $nodeCount = @($graph.nodes).Count
  $edgeCount = @($graph.edges).Count
  Assert-True ($nodeCount -ge 2) "graph has 2 or more nodes" "nodes=$nodeCount edges=$edgeCount"

  $blast = Invoke-Pipe "/api/graph/blast-radius/$($zombie.endpoint_id)"
  Assert-True ($null -ne $blast) "blast-radius responds"
}

# --- LAYER 4: SLM ---------------------------------------------------------
Write-Header "LAYER 4: SLM generation"
if ($SkipSlm) {
  Write-Host "  SKIP  (-SkipSlm)" -ForegroundColor DarkYellow
} elseif ($zombie) {
  Write-Host "  (calling /narrative on Qwen 2.5-0.5B, CPU - typically 10-30s)" -ForegroundColor DarkGray
  $started = Get-Date
  $narr = Invoke-Pipe "/api/endpoints/$($zombie.endpoint_id)/narrative" "POST" 90
  $elapsed = [int]((Get-Date) - $started).TotalSeconds
  if ($narr) {
    Assert-True ($narr.output.Length -gt 80)           "narrative.output non-empty"           "$($narr.output.Length) chars in ${elapsed}s"
    $mentionsPath = $narr.output -match "customer-search|legacy|/internal"
    Assert-True $mentionsPath                          "narrative grounds in the endpoint path"
    Assert-True ($narr.model -eq "Qwen/Qwen2.5-0.5B-Instruct") "narrative.model is Qwen" "got: $($narr.model)"
    Assert-True ($narr.generation_ms -gt 0)            "narrative.generation_ms reported"     "$($narr.generation_ms)ms"

    Write-Host ""
    Write-Host "  --- generated output ---" -ForegroundColor DarkGray
    Write-Host "  $($narr.output)" -ForegroundColor White
  }
}

# --- LAYER 5: PERSISTENCE -------------------------------------------------
Write-Header "LAYER 5: persistence"
if ($zombie) {
  $reports = Invoke-Pipe "/api/endpoints/$($zombie.endpoint_id)/reports"
  $reportCount = if ($null -eq $reports) { 0 } else { @($reports).Count }
  $expected = if ($SkipSlm) { 0 } else { 1 }
  Assert-True ($reportCount -ge $expected) "cached reports at least $expected" "got: $reportCount"

  $healthAfter = Invoke-Pipe "/health"
  Assert-True ($healthAfter.metrics.predictions_written -ge 2) "metrics.predictions_written at least 2" "got: $($healthAfter.metrics.predictions_written)"
  if (-not $SkipSlm) {
    Assert-True ($healthAfter.metrics.reports_written -ge 1)   "metrics.reports_written at least 1"   "got: $($healthAfter.metrics.reports_written)"
  }
}

# --- SUMMARY --------------------------------------------------------------
Write-Host ""
Write-Host ("=" * 72) -ForegroundColor DarkGray
if ($script:Failures -eq 0) {
  Write-Host "ALL GREEN" -ForegroundColor Green
  exit 0
} else {
  Write-Host "$($script:Failures) FAILURE(S)" -ForegroundColor Red
  exit 1
}
