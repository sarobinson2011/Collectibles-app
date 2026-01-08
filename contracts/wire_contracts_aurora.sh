#!/usr/bin/env bash
set -euo pipefail

# ====================================================================
# Wire Aurora Testnet Contracts Together
# ====================================================================

echo "======================================================================"
echo "Wiring Aurora Testnet Contracts"
echo "======================================================================"

# --- Your deployed PROXY addresses ---
REGISTRY="0xEb3f30Cae7085fdE13eEac6a9A178FE403310c7d" 
NFT="0xd9F7874cCc13695b0B0EF8a61d9B87F53cf65541"
MARKET="0x5f4F63164ffbD889fe8D1572C277509b1FA01B40"

# --- Configuration ---
RPC="https://testnet.aurora.dev"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass

echo "Registry: $REGISTRY"
echo "NFT:      $NFT"
echo "Market:   $MARKET"
echo ""

# --- 1. Registry: Set NFT contract ---
echo "Step 1/4: Setting NFT contract in Registry..."
cast send $REGISTRY \
  "setContractNFT(address)" $NFT \
  --rpc-url $RPC \
  --keystore $KEYSTORE \
  --password-file $PASSFILE \
  --legacy

echo "✅ Registry.setContractNFT($NFT) complete"
echo ""

# --- 2. Registry: Set Marketplace ---
echo "Step 2/4: Setting Marketplace in Registry..."
cast send $REGISTRY \
  "setMarketplaceAddress(address)" $MARKET \
  --rpc-url $RPC \
  --keystore $KEYSTORE \
  --password-file $PASSFILE \
  --legacy

echo "✅ Registry.setMarketplaceAddress($MARKET) complete"
echo ""

# --- 3. NFT: Set Registry ---
echo "Step 3/4: Setting Registry in NFT..."
cast send $NFT \
  "setRegistry(address)" $REGISTRY \
  --rpc-url $RPC \
  --keystore $KEYSTORE \
  --password-file $PASSFILE \
  --legacy

echo "✅ NFT.setRegistry($REGISTRY) complete"
echo ""

# --- 4. NFT: Set Marketplace ---
echo "Step 4/4: Setting Marketplace in NFT..."
cast send $NFT \
  "setMarketplace(address)" $MARKET \
  --rpc-url $RPC \
  --keystore $KEYSTORE \
  --password-file $PASSFILE \
  --legacy

echo "✅ NFT.setMarketplace($MARKET) complete"
echo ""

# --- Verify wiring ---
echo "======================================================================"
echo "Verifying wiring..."
echo "======================================================================"

echo "Registry.NFTContract():"
cast call $REGISTRY "NFTContract()(address)" --rpc-url $RPC

echo "Registry.marketplaceAddress():"
cast call $REGISTRY "marketplaceAddress()(address)" --rpc-url $RPC

echo "NFT.registryContract():"
cast call $NFT "registryContract()(address)" --rpc-url $RPC

echo "NFT.marketplaceAddress():"
cast call $NFT "marketplaceAddress()(address)" --rpc-url $RPC

echo ""
echo "======================================================================"
echo "✅ All contracts wired successfully!"
echo "======================================================================"
echo ""
echo "Next steps:"
echo "  1. Update backend/.env:"
echo "     AURORA_REGISTRY_ADDRESS=$REGISTRY"
echo "     AURORA_NFT_ADDRESS=$NFT"
echo "     AURORA_MARKET_ADDRESS=$MARKET"
echo ""
echo "  2. Update frontend/.env:"
echo "     VITE_AURORA_REGISTRY_ADDRESS=$REGISTRY"
echo "     VITE_AURORA_NFT_ADDRESS=$NFT"
echo "     VITE_AURORA_MARKET_ADDRESS=$MARKET"
echo ""
echo "  3. Switch to Aurora testnet and test!"
echo "======================================================================"
