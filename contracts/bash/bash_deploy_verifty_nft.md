#!/usr/bin/env bash
set -euo pipefail

# --- config ---
CHAIN=arbitrum-sepolia
RPC="$ARBITRUM_SEPOLIA_RPC_URL"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass

# --- 1) Deploy (broadcast) ---
forge script script/DeployNFTUpgradeable.s.sol:DeployNFTUpgradeable \
  --rpc-url "$RPC" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --broadcast \
  --skip-simulation \
  -vv | tee /tmp/deploy-nft.out

# --- 2) Scrape addresses from console output ---
NFT_IMPL=$(grep -E "nftImpl:" /tmp/deploy-nft.out | awk '{print $2}')
PROXY_ADMIN=$(grep -E "proxyAdmin:" /tmp/deploy-nft.out | awk '{print $2}')
NFT_PROXY=$(grep -E "NFT_PROXY:" /tmp/deploy-nft.out | awk '{print $2}')

echo "IMPL_NFT=$NFT_IMPL"
echo "ADMIN_NFT=$PROXY_ADMIN"
echo "NFT_PROXY=$NFT_PROXY"

# --- 3) Verify implementation (logic) ---
forge verify-contract \
  --chain $CHAIN \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$NFT_IMPL" src/collectiblesNFTV1.sol:CollectibleNFTV1 \
  --watch

# --- 4) Verify ProxyAdmin (constructor: owner) ---
OWNER_ON_ADMIN=$(cast call "$PROXY_ADMIN" "owner()(address)" --rpc-url "$RPC")
forge verify-contract \
  --chain $CHAIN \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$PROXY_ADMIN" lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --constructor-args $(cast abi-encode "constructor(address)" "$OWNER_ON_ADMIN") \
  --watch

# --- 5) Verify TransparentUpgradeableProxy ---
# Build init calldata WITH selector (must match deploy: initialize("Collectible","COLL"))
INIT=$(cast calldata "initialize(string,string)" "Collectible" "COLL")

# EIP-1967 slots
IMPL_SLOT=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
ADMIN_SLOT=0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103

# Read and convert to addresses (last 20 bytes)
RAW_IMPL=$(cast storage "$NFT_PROXY" $IMPL_SLOT --rpc-url "$RPC")
RAW_ADMIN=$(cast storage "$NFT_PROXY" $ADMIN_SLOT --rpc-url "$RPC")
slot_to_addr () { local v=${1#0x}; echo 0x${v: -40}; }
IMPL_FROM_SLOT=$(slot_to_addr "$RAW_IMPL")
ADMIN_FROM_SLOT=$(slot_to_addr "$RAW_ADMIN")
echo "IMPL_FROM_SLOT=$IMPL_FROM_SLOT"
echo "ADMIN_FROM_SLOT=$ADMIN_FROM_SLOT"

# Encode constructor args: (implementation, admin, data)
ARGS=$(cast abi-encode "constructor(address,address,bytes)" "$IMPL_FROM_SLOT" "$ADMIN_FROM_SLOT" "$INIT")

forge verify-contract \
  --chain $CHAIN \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$NFT_PROXY" lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --constructor-args "$ARGS" \
  --watch

echo "✅ NFT implementation, ProxyAdmin, and proxy verified."
