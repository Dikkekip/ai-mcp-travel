# Script to load .env file and set azd environment variables
# Run this before 'azd up' to avoid prompts

Write-Host "Loading environment variables from .env..." -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host ".env file not found. Generating tokens..." -ForegroundColor Yellow
    npm run generate-token -- --admin
}

# Load .env file
$envVars = @{}
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^=]+)="?(.+?)"?\s*$') {
            $key = $matches[1]
            $value = $matches[2]
            $envVars[$key] = $value
            Write-Host "Found: $key" -ForegroundColor Gray
        }
    }
} else {
    Write-Error ".env file not found after generation. Please check npm run generate-token."
    exit 1
}

# Check if azd environment is initialized
try {
    $envName = azd env get-values --output json 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty AZURE_ENV_NAME
    if ($envName) {
        Write-Host "Azd environment: $envName" -ForegroundColor Green
    }
} catch {
    Write-Host "No azd environment found. Will be created on first deploy." -ForegroundColor Yellow
}

# Set environment variables in azd
Write-Host "`nSetting azd environment variables..." -ForegroundColor Cyan
foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    # Trim quotes from value if present
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Trim('"')
    } elseif ($value.StartsWith("'") -and $value.EndsWith("'")) {
        $value = $value.Trim("'")
    }
    try {
        azd env set $key $value 2>$null | Out-Null
        Write-Host "  ✓ $key" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ $key (failed)" -ForegroundColor Red
    }
}

Write-Host "`nEnvironment variables loaded successfully!" -ForegroundColor Green
Write-Host "You can now run: azd up" -ForegroundColor Yellow

