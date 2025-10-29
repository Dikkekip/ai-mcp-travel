#!/bin/bash
# Script to load .env file and set azd environment variables
# Run this before 'azd up' to avoid prompts

echo "Loading environment variables from .env..."

# Check if .env exists, generate if not
if [ ! -f .env ]; then
    echo "Generating JWT tokens..."
    npm run generate-token -- --admin
fi

# Load .env file into current environment
set -a
[ -f .env ] && . .env
set +a

# Export key variables for azd
if [ -n "$JWT_AUDIENCE" ]; then
    azd env set JWT_AUDIENCE "$JWT_AUDIENCE"
fi
if [ -n "$JWT_ISSUER" ]; then
    azd env set JWT_ISSUER "$JWT_ISSUER"
fi
if [ -n "$JWT_EXPIRY" ]; then
    azd env set JWT_EXPIRY "$JWT_EXPIRY"
fi
if [ -n "$JWT_SECRET" ]; then
    azd env set JWT_SECRET "$JWT_SECRET"
fi
if [ -n "$JWT_TOKEN" ]; then
    azd env set JWT_TOKEN "$JWT_TOKEN"
fi
if [ -n "$SERPAPI_KEY" ]; then
    azd env set SERPAPI_KEY "$SERPAPI_KEY"
fi
if [ -n "$WEATHERSTACK_API_KEY" ]; then
    azd env set WEATHERSTACK_API_KEY "$WEATHERSTACK_API_KEY"
fi

echo "Environment variables loaded successfully!"
echo "You can now run: azd up"

