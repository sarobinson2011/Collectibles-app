#!/usr/bin/env bash
set -euo pipefail

# ====================================================================
# Deploy CollectibleNFTV1 (Improved) on Aurora Testnet
# Note: Manual verification required via Blockscout web UI
# ====================================================================

# --- Configuration ---
CHAIN=aurora-testnet
RPC="${AURORA_TESTNET_RPC_URL:-https://testnet.aurora.dev}"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass
EXPLORER_URL="https://explorer.testnet.aurora.dev"

echo "======================================================================"
echo "Deploying CollectibleNFTV1 (Improved) to Aurora Testnet"
echo "======================================================================"
echo "RPC: $RPC"
echo "Explorer: $EXPLORER_URL"
echo ""

# --- 1) Deploy (broadcast) ---
echo "Step 1: Deploying contracts..."
forge script script/DeployNFTUpgradeable.s.sol:DeployNFTUpgradeable \
  --rpc-url "$RPC" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --broadcast \
  --skip-simulation \
  --legacy \
  -vv | tee /tmp/deploy-nft-aurora-v1.out

echo ""
echo "Step 2: Extracting deployed addresses..."

# --- 2) Scrape addresses from console output ---
NFT_IMPL=$(grep -E "nftImpl:" /tmp/deploy-nft-aurora-v1.out | awk '{print $2}')
PROXY_ADMIN=$(grep -E "proxyAdmin:" /tmp/deploy-nft-aurora-v1.out | awk '{print $2}')
NFT_PROXY=$(grep -E "NFT_PROXY:" /tmp/deploy-nft-aurora-v1.out | awk '{print $2}')

echo "Implementation: $NFT_IMPL"
echo "ProxyAdmin:     $PROXY_ADMIN"
echo "Proxy:          $NFT_PROXY"
echo ""

# Save addresses to file for later use
cat > /tmp/aurora-nft-v1-addresses.txt <<EOF
NFT_IMPL=$NFT_IMPL
PROXY_ADMIN=$PROXY_ADMIN
NFT_PROXY=$NFT_PROXY
EOF

echo "Addresses saved to /tmp/aurora-nft-v1-addresses.txt"
echo ""

echo "======================================================================"
echo "✅ NFT (Improved V1) deployment complete!"
echo "======================================================================"
echo ""
echo "Deployed Addresses:"
echo "  Implementation: $NFT_IMPL"
echo "  ProxyAdmin:     $PROXY_ADMIN"
echo "  Proxy (main):   $NFT_PROXY"
echo ""
echo "View on Explorer:"
echo "  Implementation: $EXPLORER_URL/address/$NFT_IMPL"
echo "  ProxyAdmin:     $EXPLORER_URL/address/$PROXY_ADMIN"
echo "  Proxy:          $EXPLORER_URL/address/$NFT_PROXY"
echo ""
echo "⚠️  MANUAL VERIFICATION REQUIRED:"
echo "  Blockscout API verification is broken on Aurora."
echo "  Please verify manually via Blockscout web UI:"
echo ""
echo "  1. Go to $EXPLORER_URL/address/$NFT_IMPL"
echo "  2. Click 'Verify & Publish'"
echo "  3. Contract: src/collectiblesNFTV1.sol:CollectibleNFTV1"
echo "  4. Compiler: v0.8.20 (match your foundry.toml)"
echo ""
echo "  Repeat for ProxyAdmin and Proxy if needed."
echo ""
echo "Next steps:"
echo "  1. Manually verify contracts (see above)"
echo "  2. Save proxy address: $NFT_PROXY"
echo "  3. Deploy Market contract (requires USDC address)"
echo "======================================================================"