#!/usr/bin/env bash
set -euo pipefail

# ====================================================================
# Deploy CollectibleMarketV1 (Improved) on Aurora Testnet
# Note: Manual verification required via Blockscout web UI
# REQUIRES: USDC address via COLLECTIBLE_USDC6MOCK_ADDRESS env var
# ====================================================================

# Check for required USDC address
if [ -z "${COLLECTIBLE_USDC6MOCK_ADDRESS:-}" ]; then
    echo "❌ Error: COLLECTIBLE_USDC6MOCK_ADDRESS not set"
    echo ""
    echo "Usage:"
    echo "  export COLLECTIBLE_USDC6MOCK_ADDRESS=0x..."
    echo "  ./deploy_market_aurora_final.sh"
    echo ""
    echo "Or inline:"
    echo "  COLLECTIBLE_USDC6MOCK_ADDRESS=0x... ./deploy_market_aurora_final.sh"
    echo ""
    echo "If you haven't deployed USDC yet:"
    echo "  cd contracts"
    echo "  forge script script/DeployUSDC6Mock.s.sol:DeployUSDC6Mock \\"
    echo "    --rpc-url https://testnet.aurora.dev \\"
    echo "    --keystore ~/.foundry/keystores/dev-deployer \\"
    echo "    --password-file ~/.secrets/foundry-dev.pass \\"
    echo "    --broadcast --legacy -vv"
    echo ""
    echo "Existing USDC on Aurora Testnet: 0x8BC104732AF20584058D8eF68a4C448698fFB282"
    exit 1
fi

# --- Configuration ---
CHAIN=aurora-testnet
RPC="${AURORA_TESTNET_RPC_URL:-https://testnet.aurora.dev}"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass
EXPLORER_URL="https://explorer.testnet.aurora.dev"

echo "======================================================================"
echo "Deploying CollectibleMarketV1 (Improved) to Aurora Testnet"
echo "======================================================================"
echo "RPC: $RPC"
echo "Explorer: $EXPLORER_URL"
echo "Payment Token (USDC): $COLLECTIBLE_USDC6MOCK_ADDRESS"
echo ""

# --- 1) Deploy (broadcast) ---
echo "Step 1: Deploying contracts..."
forge script script/DeployMarketUpgradeable.s.sol:DeployMarketUpgradeable \
  --rpc-url "$RPC" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --broadcast \
  --skip-simulation \
  --legacy \
  -vv | tee /tmp/deploy-market-aurora-v1.out

echo ""
echo "Step 2: Extracting deployed addresses..."

# --- 2) Scrape addresses from console output ---
MKT_IMPL=$(grep -E "mktImpl:" /tmp/deploy-market-aurora-v1.out | awk '{print $2}')
PROXY_ADMIN=$(grep -E "proxyAdmin:" /tmp/deploy-market-aurora-v1.out | awk '{print $2}')
MKT_PROXY=$(grep -E "MARKET_PROXY:" /tmp/deploy-market-aurora-v1.out | awk '{print $2}')

echo "Implementation: $MKT_IMPL"
echo "ProxyAdmin:     $PROXY_ADMIN"
echo "Proxy:          $MKT_PROXY"
echo ""

# Save addresses to file for later use
cat > /tmp/aurora-market-v1-addresses.txt <<EOF
MKT_IMPL=$MKT_IMPL
PROXY_ADMIN=$PROXY_ADMIN
MKT_PROXY=$MKT_PROXY
USDC_ADDRESS=$COLLECTIBLE_USDC6MOCK_ADDRESS
EOF

echo "Addresses saved to /tmp/aurora-market-v1-addresses.txt"
echo ""

echo "======================================================================"
echo "✅ Market (Improved V1) deployment complete!"
echo "======================================================================"
echo ""
echo "Deployed Addresses:"
echo "  Implementation: $MKT_IMPL"
echo "  ProxyAdmin:     $PROXY_ADMIN"
echo "  Proxy (main):   $MKT_PROXY"
echo "  Payment Token:  $COLLECTIBLE_USDC6MOCK_ADDRESS"
echo ""
echo "View on Explorer:"
echo "  Implementation: $EXPLORER_URL/address/$MKT_IMPL"
echo "  ProxyAdmin:     $EXPLORER_URL/address/$PROXY_ADMIN"
echo "  Proxy:          $EXPLORER_URL/address/$MKT_PROXY"
echo ""
echo "⚠️  MANUAL VERIFICATION REQUIRED:"
echo "  Blockscout API verification is broken on Aurora."
echo "  Please verify manually via Blockscout web UI:"
echo ""
echo "  1. Go to $EXPLORER_URL/address/$MKT_IMPL"
echo "  2. Click 'Verify & Publish'"
echo "  3. Contract: src/collectiblesMarketV1.sol:CollectibleMarketV1"
echo "  4. Compiler: v0.8.20 (match your foundry.toml)"
echo ""
echo "  Repeat for ProxyAdmin and Proxy if needed."
echo ""
echo "Next steps:"
echo "  1. Manually verify contracts (see above)"
echo "  2. Save proxy address: $MKT_PROXY"
echo "  3. Wire all contracts together"
echo "======================================================================"