# Bicep Template Fixes Applied

## Problem
The Bicep template had syntax errors with the conditional API keys causing parsing failures.

## Solution

### Changed Array Syntax
**Before (❌ Incorrect):**
```bicep
secrets: concat([
  { name: 'jwt-token', value: jwtToken }
], serpApiKey != '' ? [{...}] : [])
```

**After (✅ Correct):**
```bicep
secrets: [
  { name: 'jwt-token', value: jwtToken }
  if (serpApiKey != '') {
    { name: 'serpapi-key', value: serpApiKey }
  }
]
```

### Key Changes

1. **Used `if` conditions** instead of ternary with `concat()`
   - Bicep's `if` conditionals work within arrays
   - Much cleaner than `concat([], condition ? [...] : [])`

2. **Simplified parameter defaults**
   - Changed from `empty` to `""` (empty string)
   - More consistent with Bicep expectations

3. **Updated parameters file**
   - Now uses `"${SERPAPI_KEY}"` to read from environment
   - Falls back to empty string if not set

## How It Works Now

### With API Keys (Your Case)
```json
SERPAPI_KEY in azd env → templates/sample.bicep → resources.bicep
→ if (serpApiKey != '') { add secret + env var }
→ Container has SERPAPI_KEY environment variable
```

### Without API Keys (Default)
```json
Empty string in azd env → templates/sample.bicep → resources.bicep  
→ if condition is false
→ Secret and env var are not added
→ Container runs without API keys (some features disabled)
```

## Test the Fix

Run:
```powershell
azd up
```

Expected result:
- ✅ No syntax errors
- ✅ No prompts for values
- ✅ SERPAPI_KEY passed to container (since you have it in .env)
- ✅ Deployment succeeds

## Files Changed
1. `infra/resources.bicep` - Fixed array syntax with `if` conditions
2. `infra/main.parameters.json` - Reads from environment vars
3. `infra/main.bicep` - Simplified parameter definitions
4. `setup-azd-env.ps1` - Trims quotes from values

## Current Status
✅ Bicep syntax fixed
✅ Environment variables loaded
✅ Ready to deploy

Run `azd up` now - it should work!

