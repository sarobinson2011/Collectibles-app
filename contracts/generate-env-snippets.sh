#!/usr/bin/env bash
# contracts/generate-env-snippets.sh
# Run this after deploying contracts to generate .env snippets for backend and frontend

set -euo pipefail

echo "========================================================================"
echo "Generate .env Snippets from Deployment"
echo "========================================================================"
echo ""

# Check if address files exist
if [ ! -f /tmp/aurora-registry-v1-addresses.txt ] || \
   [ ! -f /tmp/aurora-nft-v1-addresses.txt ] || \
   [ ! -f /tmp/aurora-market-v1-addresses.txt ]; then
    echo "❌ Error: Deployment address files not found in /tmp/"
    echo ""
    echo "Please run deployment scripts first:"
    echo "  ./deploy_registry_aurora.sh"
    echo "  ./deploy_nft_aurora.sh"
    echo "  ./deploy_market_aurora.sh"
    echo ""
    exit 1
fi

# Source the address files
source /tmp/aurora-registry-v1-addresses.txt
source /tmp/aurora-nft-v1-addresses.txt
source /tmp/aurora-market-v1-addresses.txt

echo "========================================================================"
echo "📋 BACKEND .env Snippet (Aurora Testnet)"
echo "========================================================================"
echo ""
cat << EOF
# Aurora Testnet Contract Addresses
NETWORK_NAME=aurora-testnet
AURORA_REGISTRY_ADDRESS=$REG_PROXY
AURORA_NFT_ADDRESS=$NFT_PROXY
AURORA_MARKET_ADDRESS=$MKT_PROXY
EOF

echo ""
echo "========================================================================"
echo "📋 FRONTEND .env Snippet (Aurora Testnet)"
echo "========================================================================"
echo ""
cat << EOF
# Aurora Testnet Contract Addresses
VITE_NETWORK=aurora-testnet
VITE_AURORA_REGISTRY_ADDRESS=$REG_PROXY
VITE_AURORA_NFT_ADDRESS=$NFT_PROXY
VITE_AURORA_MARKET_ADDRESS=$MKT_PROXY
VITE_AURORA_ADMIN_ADDRESS=0xF8f8269488f73fab3935555FCDdD6035699deE25
EOF

echo ""
echo "========================================================================"
echo "📋 Quick Copy for Deployment-commands-addresses.md"
echo "========================================================================"
echo ""
cat << EOF
# Aurora Testnet (Improved V1 - deployed $(date +%Y-%m-%d))

Registry Proxy (main):  $REG_PROXY
NFT Proxy (main):       $NFT_PROXY
Market Proxy (main):    $MKT_PROXY
USDC Mock:              0x8BC104732AF20584058D8eF68a4C448698fFB282
EOF

echo ""
echo "========================================================================"
echo "✅ Copy the snippets above and paste into:"
echo "   - backend/.env"
echo "   - frontend/.env"
echo "   - Deployment-commands-addresses.md"
echo "========================================================================"