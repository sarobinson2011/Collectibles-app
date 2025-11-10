## bash command to deploy and verify the registry

#!/usr/bin/env bash
set -euo pipefail

# --- config you may tweak ---
CHAIN=arbitrum-sepolia
RPC="$ARBITRUM_SEPOLIA_RPC_URL"
KEYSTORE=~/.foundry/keystores/dev-deployer
PASSFILE=~/.secrets/foundry-dev.pass

# --- 1) Deploy (broadcast) ---
forge script script/DeployRegistryUpgradeable.s.sol:DeployRegistryUpgradeable \
  --rpc-url "$RPC" \
  --keystore "$KEYSTORE" \
  --password-file "$PASSFILE" \
  --broadcast \
  --skip-simulation \
  -vv | tee /tmp/deploy-registry.out

# --- 2) Scrape addresses from console output ---
REG_IMPL=$(grep -E "regImpl:" /tmp/deploy-registry.out | awk '{print $2}')
PROXY_ADMIN=$(grep -E "proxyAdmin:" /tmp/deploy-registry.out | awk '{print $2}')
REG_PROXY=$(grep -E "REGISTRY_PROXY:" /tmp/deploy-registry.out | awk '{print $2}')

echo "IMPL_REG=$REG_IMPL"
echo "ADMIN_REG=$PROXY_ADMIN"
echo "REG_PROXY=$REG_PROXY"

# --- 3) Verify implementation (logic) ---
forge verify-contract \
  --chain $CHAIN \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$REG_IMPL" src/collectiblesRegistryV1.sol:CollectibleRegistryV1 \
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
# Build init calldata WITH selector (use cast calldata)
INIT=$(cast calldata "initialize()")
# Get implementation/admin again from slots (optional sanity):
IMPL_SLOT=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
ADMIN_SLOT=0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103
RAW_IMPL=$(cast storage "$REG_PROXY" $IMPL_SLOT --rpc-url "$RPC")
RAW_ADMIN=$(cast storage "$REG_PROXY" $ADMIN_SLOT --rpc-url "$RPC")
SLOT_TO_ADDR () { local v=${1#0x}; echo 0x${v: -40}; }
IMPL_FROM_SLOT=$(SLOT_TO_ADDR "$RAW_IMPL")
ADMIN_FROM_SLOT=$(SLOT_TO_ADDR "$RAW_ADMIN")
echo "IMPL_FROM_SLOT=$IMPL_FROM_SLOT"
echo "ADMIN_FROM_SLOT=$ADMIN_FROM_SLOT"

# Encode constructor args: (implementation, admin, data)
ARGS=$(cast abi-encode "constructor(address,address,bytes)" "$IMPL_FROM_SLOT" "$ADMIN_FROM_SLOT" "$INIT")

forge verify-contract \
  --chain $CHAIN \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$REG_PROXY" lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --constructor-args "$ARGS" \
  --watch

echo "✅ Registry implementation, ProxyAdmin, and proxy verified."



<!-- What this does:

1. Deploys the Registry upgradeable stack.
2. Pulls the three addresses from your script’s console output.
3. Verifies the implementation against src/collectiblesRegistryV1.sol:CollectibleRegistryV1.
4. Verifies the ProxyAdmin with the actual owner() read from chain.
5. Verifies the proxy using constructor args (implementation, admin, initData), making sure the init data includes the selector (cast calldata "initialize()"). 


6. If you prefer a true one-liner, you can wrap that bash block into a file like scripts/deploy_and_verify_registry.sh, chmod +x it, and run it whenever you need a single-contract deploy+verify cycle.
   
   -->