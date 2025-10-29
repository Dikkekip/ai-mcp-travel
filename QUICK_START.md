# Quick Start Guide - Deploy to Azure

## ✅ Prerequisites Met
- ✅ JWT tokens generated
- ✅ Environment variables loaded into azd
- ✅ SERPAPI_KEY configured
- ✅ Ready to deploy!

## Deploy Now

Simply run:

```powershell
azd up
```

This will **NOT** prompt you for any values - they're already loaded!

## What Happens Next

1. **Provisioning** (5-10 minutes)
   - Creates resource group
   - Creates Container Registry
   - Creates Container App Environment
   - Sets up Application Insights

2. **Building** (5-10 minutes)
   - Builds Docker image in Azure
   - Installs Node.js dependencies
   - Installs Python and travel servers

3. **Deployment** (2-5 minutes)
   - Pushes image to registry
   - Creates/revisions container app
   - Configures secrets and environment variables

4. **Complete!**
   - You'll get a URL like: `https://mcp-container-ts-xxxxxx.azurecontainerapps.io`
   - Access your MCP server at: `https://.../mcp`

## After Deployment

### View Your Resources
```powershell
azd show
```

### View Logs
```powershell
az containerapp logs show --name mcp-container-ts --resource-group <your-rg>
```

### Clean Up (when done)
```powershell
azd down --purge --force
```

## Troubleshooting

### If you get prompts for values:
```powershell
# Re-run the setup script
.\setup-azd-env.ps1

# Then try again
azd up
```

### To add more API keys later:
1. Edit `.env` file
2. Run: `.\setup-azd-env.ps1`
3. Redeploy: `azd deploy`

## Your Current Configuration

```
✓ JWT tokens: Configured
✓ SERPAPI_KEY: Configured  
✓ Deployment: Ready
```

## Need Help?

- See `DEPLOYMENT_GUIDE.md` for detailed steps
- See `DEPLOYMENT_STATUS.md` for status and fixes
- See `SETUP_API_KEYS.md` for API key setup

