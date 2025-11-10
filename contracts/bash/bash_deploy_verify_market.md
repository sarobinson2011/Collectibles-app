#!/usr/bin/env bash
set -euo pipefail

# --- config ---
CHAIN=arbitrum-sepolia
RPC="$ARBITRUM_SEPOLIA_RPC_URL"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass

# --- 1) Deploy (broadcast) ---
forge script script/DeployMarketUpgradeable.s.sol:DeployMarketUpgradeable \
  --rpc-url "$RPC" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --broadcast \
  --skip-simulation \
  -vv | tee /tmp/deploy-market.out

# --- 2) Scrape addresses from console output ---
MKT_IMPL=$(grep -E "mktImpl:" /tmp/deploy-market.out | awk '{print $2}')
PROXY_ADMIN=$(grep -E "proxyAdmin:" /tmp/deploy-market.out | awk '{print $2}')
MKT_PROXY=$(grep -E "MARKET_PROXY:" /tmp/deploy-market.out | awk '{print $2}')

echo "IMPL_MKT=$MKT_IMPL"
echo "ADMIN_MKT=$PROXY_ADMIN"
echo "MKT_PROXY=$MKT_PROXY"

# --- 3) Verify implementation (logic) ---
forge verify-contract \
  --chain $CHAIN \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$MKT_IMPL" src/collectiblesMarketV1.sol:CollectibleMarketV1 \
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
# Build init calldata WITH selector (must match deploy: initialize(usdc, owner))
INIT=$(cast calldata "initialize(address,address)" "$COLLECTIBLE_USDC6MOCK_ADDRESS" "$DEV_WALLET1")

# EIP-1967 slots
IMPL_SLOT=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
ADMIN_SLOT=0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103

# Read and convert to addresses
RAW_IMPL=$(cast storage "$MKT_PROXY" $IMPL_SLOT --rpc-url "$RPC")
RAW_ADMIN=$(cast storage "$MKT_PROXY" $ADMIN_SLOT --rpc-url "$RPC")
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
  "$MKT_PROXY" lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --constructor-args "$ARGS" \
  --watch

echo "✅ Market implementation, ProxyAdmin, and proxy verified."




# ========================================================================================
# ========================================================================================

## EXTRA - use cast send - to set the feeBps

Optional: set feeBps post-deploy
If you want to immediately change the default feeBps (200) to your env (e.g., 250), run:

cast send "$MKT_PROXY" \
  "setFeeConfig(address,uint256)" "$DEV_WALLET1" "$MARKET_FEE_BPS" \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --from "$DEV_WALLET1" \
  --chain-id 421614
