param(
  [Parameter(Mandatory=$true)]
  [string]$SearchServiceName,              # e.g. "my-search"

  [Parameter(Mandatory=$true)]
  [string]$AdminApiKey,                    # Search admin key

  [Parameter(Mandatory=$true)]
  [string]$StorageConnectionString,        # Storage account connection string (for Azure Files)

  [Parameter(Mandatory=$true)]
  [string]$FileShareName,                  # Azure Files share name

  [string]$Subfolder = "",                 # optional, e.g. "invoices/2025"

  [string]$DataSourceName = "files-ds",
  [string]$IndexName = "files-index",
  [string]$IndexerName = "files-indexer",

  # Indexer filters (optional)
  [string[]]$IncludeExtensions = @(".pdf",".docx",".xlsx",".pptx",".txt"),
  [string[]]$ExcludeExtensions = @(".png",".jpg",".jpeg",".gif",".bmp"),

  # Toggle whether to also create a minimal index
  [bool]$CreateIndex = $true
)

# ==== Configuration ====
$ApiVersion = "2024-05-01-preview"  # Update if you're targeting a newer Search data-plane API
$Base = "https://$SearchServiceName.search.windows.net"
$Headers = @{
  "api-key"      = $AdminApiKey
  "Content-Type" = "application/json"
}

function Invoke-SearchApi {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PUT","DELETE")]
    [string]$Method,
    [Parameter(Mandatory=$true)]
    [string]$Path,   # e.g. "/datasources"
    [hashtable]$Body
  )

  # Ensure $Path starts with a leading slash
  if (-not $Path.StartsWith("/")) { $Path = "/$Path" }

  $uri = "{0}{1}?api-version={2}" -f $Base, $Path, $ApiVersion   # <-- fixed

  $json = $null
  if ($Body) { $json = ($Body | ConvertTo-Json -Depth 20) }

  try {
    if ($json) {
      return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -Body $json
    } else {
      return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
    }
  } catch {
    Write-Error "Search API $Method $Path failed. $($_.Exception.Message)"
    if ($_.Exception.Response) {
      try {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $respBody = $sr.ReadToEnd()
        Write-Host "Response:" $respBody -ForegroundColor DarkYellow
      } catch {}
    }
    throw
  }
}


# ==== 1) Create the data source (POST /datasources) ====
# type must be "azurefile" for Azure Files
$container = @{ name = $FileShareName }
if ($Subfolder -and $Subfolder.Trim() -ne "") {
  # follow the "query" convention to target a subfolder
  $container.query = $Subfolder
}

$dsBody = @{
  name        = $DataSourceName
  type        = "azurefile"
  credentials = @{
    connectionString = $StorageConnectionString
  }
  container   = $container
}

Write-Host "Creating data source '$DataSourceName' (type=azurefile)..." -ForegroundColor Cyan
# NOTE: POST creates and fails if it already exists (409). If you want idempotency, switch to PUT.
Invoke-SearchApi -Method POST -Path "/datasources" -Body $dsBody | Out-Null
Write-Host "Data source created." -ForegroundColor Green

# ==== 2) (Optional) Create a minimal index (POST /indexes) ====
if ($CreateIndex) {
  $indexBody = @{
    name   = $IndexName
    fields = @(
      @{ name="id"; type="Edm.String"; key=$true; filterable=$false; sortable=$false; facetable=$false },
      @{ name="content"; type="Edm.String"; searchable=$true; filterable=$false; sortable=$false; facetable=$false },
      @{ name="metadata_storage_name"; type="Edm.String"; searchable=$false; filterable=$true; sortable=$true },
      @{ name="metadata_storage_path"; type="Edm.String"; searchable=$false; filterable=$true; sortable=$true },
      @{ name="metadata_storage_size"; type="Edm.Int64";  searchable=$false; filterable=$true; sortable=$true },
      @{ name="metadata_storage_content_type"; type="Edm.String"; searchable=$false; filterable=$true; sortable=$true }
    )
  }

  Write-Host "Creating index '$IndexName'..." -ForegroundColor Cyan
  Invoke-SearchApi -Method POST -Path "/indexes" -Body $indexBody | Out-Null
  Write-Host "Index created." -ForegroundColor Green
} else {
  Write-Host "Skipping index creation as requested." -ForegroundColor Yellow
}

# ==== 3) Create the indexer (POST /indexers) ====
# Attach include/exclude file extension filters
$cfg = @{}
if ($IncludeExtensions -and $IncludeExtensions.Count -gt 0) {
  $cfg.indexedFileNameExtensions = ($IncludeExtensions -join ",")
}
if ($ExcludeExtensions -and $ExcludeExtensions.Count -gt 0) {
  $cfg.excludedFileNameExtensions = ($ExcludeExtensions -join ",")
}

$indexerBody = @{
  name           = $IndexerName
  dataSourceName = $DataSourceName
  targetIndexName= $IndexName
  parameters     = @{
    configuration = $cfg
  }
}

Write-Host "Creating indexer '$IndexerName'..." -ForegroundColor Cyan
Invoke-SearchApi -Method POST -Path "/indexers" -Body $indexerBody | Out-Null
Write-Host "Indexer created." -ForegroundColor Green

# (Optional) Kick off the indexer immediately (POST /indexers/{name}/run)
Write-Host "Starting indexer '$IndexerName'..." -ForegroundColor Cyan
Invoke-SearchApi -Method POST -Path "/indexers/$IndexerName/run" -Body @{} | Out-Null
Write-Host "Indexer run started." -ForegroundColor Green

# ==== 4) Show indexer status (GET /indexers/{name}/status) ====
Write-Host "Fetching indexer status..." -ForegroundColor Cyan
$status = Invoke-SearchApi -Method GET -Path "/indexers/$IndexerName/status"
$status | ConvertTo-Json -Depth 20
