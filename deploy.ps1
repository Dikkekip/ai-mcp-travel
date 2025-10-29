# Quick Deployment Script for MCP Server to Azure Container Apps
# Run this script after completing azd authentication

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "MCP Server Deployment to Azure" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Generate JWT Token
Write-Host "Step 1: Loading environment variables into azd..." -ForegroundColor Yellow
.\setup-azd-env.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error setting up azd environment." -ForegroundColor Red
    exit 1
}

# Step 2: Deploy to Azure
Write-Host ""
Write-Host "Step 2: Deploying to Azure Container Apps..." -ForegroundColor Yellow
Write-Host "This may take several minutes..." -ForegroundColor Yellow
azd up

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "===================================" -ForegroundColor Green
    Write-Host "Deployment Successful!" -ForegroundColor Green
    Write-Host "===================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your MCP server is now running on Azure Container Apps." -ForegroundColor Green
    Write-Host "Check the output above for the endpoint URL." -ForegroundColor Green
    Write-Host ""
    Write-Host "To view your resources:" -ForegroundColor Cyan
    Write-Host "  azd show" -ForegroundColor White
    Write-Host ""
    Write-Host "To clean up resources:" -ForegroundColor Cyan
    Write-Host "  azd down --purge --force" -ForegroundColor White
} else {
    Write-Host "Deployment failed. Check the error messages above." -ForegroundColor Red
}

