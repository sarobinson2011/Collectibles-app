#!/usr/bin/env bash
set -euo pipefail

CHAIN=arbitrum-sepolia
RPC="$ARBITRUM_SEPOLIA_RPC_URL"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass

echo "🚀 Deploying Registry (Upgradeable)..."

forge script script/DeployRegistryUpgradeable.s.sol:DeployRegistryUpgradeable \
  --rpc-url "$RPC" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --broadcast \
  --skip-simulation \
  -vv | tee /tmp/deploy-registry.out

REG_IMPL=$(grep -E "regImpl:" /tmp/deploy-registry.out | awk '{print $2}')
PROXY_ADMIN=$(grep -E "proxyAdmin:" /tmp/deploy-registry.out | awk '{print $2}')
REG_PROXY=$(grep -E "REGISTRY_PROXY:" /tmp/deploy-registry.out | awk '{print $2}')

echo "IMPL_REG=$REG_IMPL"
echo "ADMIN_REG=$PROXY_ADMIN"
echo "REG_PROXY=$REG_PROXY"

forge verify-contract --chain $CHAIN --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$REG_IMPL" src/collectiblesRegistryV1.sol:CollectibleRegistryV1 --watch

OWNER_ON_ADMIN=$(cast call "$PROXY_ADMIN" "owner()(address)" --rpc-url "$RPC")
forge verify-contract --chain $CHAIN --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$PROXY_ADMIN" lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --constructor-args $(cast abi-encode "constructor(address)" "$OWNER_ON_ADMIN") --watch

INIT=$(cast calldata "initialize()")
IMPL_SLOT=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
ADMIN_SLOT=0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103
RAW_IMPL=$(cast storage "$REG_PROXY" $IMPL_SLOT --rpc-url "$RPC")
RAW_ADMIN=$(cast storage "$REG_PROXY" $ADMIN_SLOT --rpc-url "$RPC")
slot_to_addr () { local v=${1#0x}; echo 0x${v: -40}; }
IMPL_FROM_SLOT=$(slot_to_addr "$RAW_IMPL")
ADMIN_FROM_SLOT=$(slot_to_addr "$RAW_ADMIN")
ARGS=$(cast abi-encode "constructor(address,address,bytes)" "$IMPL_FROM_SLOT" "$ADMIN_FROM_SLOT" "$INIT")

forge verify-contract --chain $CHAIN --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$REG_PROXY" lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --constructor-args "$ARGS" --watch

echo "✅ Registry deploy + verify complete!"
