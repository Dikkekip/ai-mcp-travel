# Setting Up API Keys for Travel Assistant

The MCP server includes travel assistant tools that require API keys from external services.

## Required API Keys

### SERPAPI_KEY (Required for most travel tools)
Used by:
- Flights server
- Hotels server  
- Events server
- Finance server

**Get your key:**
1. Sign up at [serpapi.com](https://serpapi.com)
2. Get your API key from the dashboard
3. Add to `.env` file

### WEATHERSTACK_API_KEY (Optional)
Used by:
- Weather server

**Get your key:**
1. Sign up at [weatherstack.com](https://weatherstack.com)
2. Get your API key from the dashboard  
3. Add to `.env` file

## Adding Keys to Your Deployment

### Before First Deployment

1. Generate JWT tokens:
```powershell
npm run generate-token -- --admin
```

2. Add API keys to `.env`:
```powershell
"SERPAPI_KEY=""your-serpapi-key""`n" | Add-Content .env
"WEATHERSTACK_API_KEY=""your-weatherstack-key""`n" | Add-Content .env
```

3. Deploy:
```powershell
azd up
```

The deployment will automatically:
- Load JWT values from `.env`
- Load SERPAPI_KEY and WEATHERSTACK_API_KEY from `.env`
- Pass them as secrets to the container app

### After Deployment

If you need to add keys to an existing deployment:

**Option 1: Via Azure Portal**
1. Go to your Container App in Azure Portal
2. Navigate to "Configuration" > "Environment variables"
3. Add new variables:
   - Name: `SERPAPI_KEY`
   - Value: Your API key
   - Name: `WEATHERSTACK_API_KEY`
   - Value: Your API key
4. Save and restart the container app

**Option 2: Via Azure CLI**
```powershell
# Set as secrets in the container app
az containerapp secret set \
  --name mcp-container-ts \
  --resource-group <your-rg> \
  --secrets "serpapi-key=your-key"

az containerapp update \
  --name mcp-container-ts \
  --resource-group <your-rg> \
  --set-env-vars "SERPAPI_KEY=secretref:serpapi-key"
```

## Verifying Keys Are Loaded

After deployment, check the container logs:

```powershell
az containerapp logs show --name mcp-container-ts --resource-group <your-rg>
```

You should see the travel servers starting up. If API keys are missing, you'll see error messages in the logs.

## Testing the Travel Tools

Once deployed with API keys:

1. Connect to your MCP server (see DEPLOYMENT_GUIDE.md)
2. Try calling travel tools:
   - `search_flights` - Search for flights
   - `search_hotels` - Find hotels
   - `search_events` - Discover events
   - `lookup_stock` - Get stock information
   - `get_current_weather` - Get weather data

## Security Notes

- API keys are stored as secrets in Azure Container Apps
- Keys are encrypted at rest
- Keys are only accessible within the container
- Never commit `.env` files to git (they're in `.gitignore`)

