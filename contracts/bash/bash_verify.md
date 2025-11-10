## Verify standard - USDC (mock) comtract

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $COLLECTIBLE_USDC6MOCK_ADDRESS test/mocks/USDC6Mock.sol:USDC6Mock --watch



## Verify Upgradeable :- 


# 1/. Implementations (logic contracts)

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $IMPL_REG src/collectiblesRegistryV1.sol:CollectibleRegistryV1 --watch

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $IMPL_NFT src/collectiblesNFTV1.sol:CollectibleNFTV1 --watch

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $IMPL_MKT src/collectiblesMarketV1.sol:CollectibleMarketV1 --watch



## 2/. Proxy admins (one for each contract)

# Registry ProxyAdmin
export OWNER_ADMIN_REG=$(cast call 0xb8BFaDf470768C7ba9cd6c7d708B79AF4B7b10b3 "owner()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")
echo $OWNER_ADMIN_REG

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  0xb8BFaDf470768C7ba9cd6c7d708B79AF4B7b10b3 \
  lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --constructor-args $(cast abi-encode "constructor(address)" $OWNER_ADMIN_REG) \
  --watch

# NFT ProxyAdmin
export OWNER_ADMIN_NFT=$(cast call 0x9e49e6319cdb7f1ae8b4a1c6d0f146ab6576c641 "owner()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")
echo $OWNER_ADMIN_NFT

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  0x9e49e6319cdb7f1ae8b4a1c6d0f146ab6576c641 \
  lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --constructor-args $(cast abi-encode "constructor(address)" $OWNER_ADMIN_NFT) \
  --watch

# Market ProxyAdmin
export OWNER_ADMIN_MKT=$(cast call 0xb1770de25ef1085f12f28c9fa99ed23e412a84ac "owner()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")
echo OWNER_ADMIN_MKT

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  0xb1770de25ef1085f12f28c9fa99ed23e412a84ac \
  lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --constructor-args $(cast abi-encode "constructor(address)" $OWNER_ADMIN_MKT) \
  --watch



## 3/. TransparentUpgradeableProxy (the 3 proxy contracts)

# INCLUDE function selector:
export DATA_REG=$(cast calldata "initialize()")
export DATA_NFT=$(cast calldata "initialize(string,string)" "Collectible" "COLL")
export DATA_MKT=$(cast calldata "initialize(address,address)" $USDC $OWNER)

# Encode constructor args (implementation, admin, data)
export ARGS_REG=$(cast abi-encode "constructor(address,address,bytes)" $IMPL_REG $ADMIN_REG $DATA_REG)
export ARGS_NFT=$(cast abi-encode "constructor(address,address,bytes)" $IMPL_NFT $ADMIN_NFT $DATA_NFT)
export ARGS_MKT=$(cast abi-encode "constructor(address,address,bytes)" $IMPL_MKT $ADMIN_MKT $DATA_MKT)


# Verify proxies
forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $REG lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --constructor-args $ARGS_REG --watch

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $NFT lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --constructor-args $ARGS_NFT --watch

forge verify-contract --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $MKT lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --constructor-args $ARGS_MKT --watch

