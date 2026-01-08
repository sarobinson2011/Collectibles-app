#!/usr/bin/env bash
set -euo pipefail

# ====================================================================
# Deploy CollectibleRegistryV1 (Improved) on Aurora Testnet
# Note: Manual verification required via Blockscout web UI
# ====================================================================

# --- Configuration ---
CHAIN=aurora-testnet
RPC="${AURORA_TESTNET_RPC_URL:-https://testnet.aurora.dev}"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass
EXPLORER_URL="https://explorer.testnet.aurora.dev"

echo "======================================================================"
echo "Deploying CollectibleRegistryV1 (Improved) to Aurora Testnet"
echo "======================================================================"
echo "RPC: $RPC"
echo "Explorer: $EXPLORER_URL"
echo ""

# --- 1) Deploy (broadcast) ---
echo "Step 1: Deploying contracts..."
forge script script/DeployRegistryUpgradeable.s.sol:DeployRegistryUpgradeable \
  --rpc-url "$RPC" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --broadcast \
  --skip-simulation \
  --legacy \
  -vv | tee /tmp/deploy-registry-aurora-v1.out

echo ""
echo "Step 2: Extracting deployed addresses..."

# --- 2) Scrape addresses from console output ---
REG_IMPL=$(grep -E "regImpl:" /tmp/deploy-registry-aurora-v1.out | awk '{print $2}')
PROXY_ADMIN=$(grep -E "proxyAdmin:" /tmp/deploy-registry-aurora-v1.out | awk '{print $2}')
REG_PROXY=$(grep -E "REGISTRY_PROXY:" /tmp/deploy-registry-aurora-v1.out | awk '{print $2}')

echo "Implementation: $REG_IMPL"
echo "ProxyAdmin:     $PROXY_ADMIN"
echo "Proxy:          $REG_PROXY"
echo ""

# Save addresses to file for later use
cat > /tmp/aurora-registry-v1-addresses.txt <<EOF
REG_IMPL=$REG_IMPL
PROXY_ADMIN=$PROXY_ADMIN
REG_PROXY=$REG_PROXY
EOF

echo "Addresses saved to /tmp/aurora-registry-v1-addresses.txt"
echo ""

echo "======================================================================"
echo "✅ Registry (Improved V1) deployment complete!"
echo "======================================================================"
echo ""
echo "Deployed Addresses:"
echo "  Implementation: $REG_IMPL"
echo "  ProxyAdmin:     $PROXY_ADMIN"
echo "  Proxy (main):   $REG_PROXY"
echo ""
echo "View on Explorer:"
echo "  Implementation: $EXPLORER_URL/address/$REG_IMPL"
echo "  ProxyAdmin:     $EXPLORER_URL/address/$PROXY_ADMIN"
echo "  Proxy:          $EXPLORER_URL/address/$REG_PROXY"
echo ""
echo "⚠️  MANUAL VERIFICATION REQUIRED:"
echo "  Blockscout API verification is broken on Aurora."
echo "  Please verify manually via Blockscout web UI:"
echo ""
echo "  1. Go to $EXPLORER_URL/address/$REG_IMPL"
echo "  2. Click 'Verify & Publish'"
echo "  3. Contract: src/collectiblesRegistryV1.sol:CollectibleRegistryV1"
echo "  4. Compiler: v0.8.20 (match your foundry.toml)"
echo ""
echo "  Repeat for ProxyAdmin and Proxy if needed."
echo ""
echo "Next steps:"
echo "  1. Manually verify contracts (see above)"
echo "  2. Save proxy address: $REG_PROXY"
echo "  3. Deploy NFT contract"
echo "======================================================================"