#!/usr/bin/env bash
# One-time Azure setup for the go-green-hr Static Web App. It creates no database:
# without SQL_CONNECTION_STRING, the API uses its built-in SQLite demo database.
# Requires the Azure CLI (az login first, or use Azure Cloud Shell). Run:
#   bash scripts/azure-setup.sh
set -euo pipefail

APP_NAME="go-green-hr"                 # Static Web App name (portal name)
RG="${RG:-rg-go-green-hr}"
LOCATION="${LOCATION:-westeurope}"     # Static Web Apps regions: westeurope, eastus2, centralus, westus2, eastasia
SKU="${SKU:-Free}"                     # Free or Standard
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

echo "Creating resource group $RG in $LOCATION"
az group create -n "$RG" -l "$LOCATION" -o none

echo "Creating Static Web App $APP_NAME ($SKU plan)"
az staticwebapp create -g "$RG" -n "$APP_NAME" -l "$LOCATION" --sku "$SKU" -o none

az staticwebapp appsettings set -n "$APP_NAME" -g "$RG" --setting-names \
  "JWT_SECRET=$JWT_SECRET" "NODE_ENV=production" -o none

TOKEN=$(az staticwebapp secrets list -n "$APP_NAME" -g "$RG" --query properties.apiKey -o tsv)
HOST=$(az staticwebapp show -n "$APP_NAME" -g "$RG" --query defaultHostname -o tsv)
echo
echo "Done. Next steps:"
echo "  1. Add this as the GitHub repository secret AZURE_STATIC_WEB_APPS_API_TOKEN:"
echo "     $TOKEN"
echo "  2. Push to main. GitHub Actions tests and deploys the app."
echo "  3. Open https://$HOST and sign in with a demo account."
echo
echo "Note: with no SQL_CONNECTION_STRING set, the app runs on its built-in demo database,"
echo "which reloads the demo data whenever Azure restarts the API. To keep real data, add a"
echo "database later and set SQL_CONNECTION_STRING in the Static Web App's environment variables."
