# Deployment Status and Fixes

## ✅ Issues Fixed

### Problem
The original `npm run generate-token` command failed because:
1. It tried to install ALL project dependencies including `better-sqlite3`
2. `better-sqlite3` requires Visual Studio C++ build tools to compile
3. Your system has Node.js v25.0.0, but `better-sqlite3` only supports up to v24

### Solution
Created a new **standalone token generator** (`scripts/generate-token-simple.js`) that:
- ✅ Uses only Node.js built-in modules
- ✅ No external dependencies required
- ✅ Implements JWT signing using native crypto
- ✅ Works on any Node.js version
- ✅ Updated `package.json` to use the new script
- ✅ Fixed PowerShell path handling in `azure.yaml`

## Current Status

✅ JWT token generation is now working
✅ `.env` file has been created with authentication credentials
✅ Ready for Azure deployment

### Your Current .env File

```
JWT_AUDIENCE="urn:foo"
JWT_ISSUER="urn:bar"
JWT_EXPIRY="48h"
JWT_SECRET="<random-secret>"
JWT_TOKEN="<generated-jwt-token>"
```

### Optional: Add Travel Assistant API Keys

If you want to use the travel assistant tools (flights, hotels, events, finance, weather), add these to your `.env` file:

```bash
SERPAPI_KEY="your-serpapi-key-here"
WEATHERSTACK_API_KEY="your-weatherstack-key-here"
```

Then regenerate the .env or just append these lines:
```powershell
# Add to existing .env file
"SERPAPI_KEY=""your-key""`n" | Add-Content .env
"WEATHERSTACK_API_KEY=""your-key""`n" | Add-Content .env
```

## Next Steps to Deploy

### 1. Authenticate with Azure (if not already done)
```powershell
azd auth login --use-device-code
```

### 2. Deploy to Azure
You now have two options:

**Option A: Use the automated script**
```powershell
.\deploy.ps1
```

**Option B: Run commands manually**
```powershell
azd up
```

### 3. After Deployment
Your MCP server will be available at:
```
https://<environment-name>.<container-id>.<region>.azurecontainerapps.io/mcp
```

Get the URL with:
```powershell
azd show
```

## Important Notes

### For Local Development
If you want to run the server locally (`npm run dev`), you'll still need to install full dependencies. You have two options:

**Option 1: Install Visual Studio C++ Build Tools**
- Download from: https://visualstudio.microsoft.com/downloads/
- Install "Desktop development with C++" workload

**Option 2: Use Docker instead**
```powershell
docker-compose up
```

This will run the server in a container without needing to build native modules locally.

### For Deployment Only
✅ You can deploy without installing local dependencies!
- The token generator works standalone
- `azd` will handle the full build in Azure Container Registry
- No Visual Studio needed on your machine

## Troubleshooting

### If token generation fails
```powershell
# Clean and regenerate
Remove-Item .env -ErrorAction SilentlyContinue
npm run generate-token -- --admin
```

### To regenerate with different role
```powershell
npm run generate-token -- --user    # Standard user role
npm run generate-token -- --readonly # Read-only role  
npm run generate-token -- --admin   # Admin role
```

## Deployment Commands Reference

```powershell
# Authenticate (first time only)
azd auth login --use-device-code

# Deploy everything
azd up

# Redeploy after code changes (no infrastructure changes)
azd deploy

# View deployment status
azd monitor

# View resources
azd show

# View logs
az containerapp logs show --name mcp-container-ts --resource-group rg-<environment-name>

# Clean up everything
azd down --purge --force
```

