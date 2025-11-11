1) Dry-run (simulate only)

forge script script/DeployCollectibles.s.sol:DeployCollectiblesScript \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --chain arbitrum-sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -- watch \
  -vvvv

   
2) Real deploy (broadcast)
   

## Upgradeable Proxies - Registry, NFT, Market    <-- use this
forge script script/DeployCollectiblesUpgradeable.s.sol:DeployCollectiblesUpgradeable \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --keystore ~/.foundry/keystores/dev-deployer \
  --password-file ~/.secrets/foundry-dev.pass \
  --broadcast \
  --skip-simulation \
  -vvvv

## USDC (mock) - standard contract
forge script script/DeployUSDC6Mock.s.sol:DeployUSDC6Mock \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --keystore ~/.foundry/keystores/dev-deployer \
  --password-file ~/.secrets/foundry-dev.pass \
  --broadcast \
  --skip-simulation \
  -vvvv

# Wiring the system up - not working due to "owner thing"
forge script script/Wire.s.sol:WireCollectibles \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --keystore ~/.foundry/keystores/dev-deployer \
  --password-file ~/.secrets/foundry-dev.pass \
  --broadcast \
  --skip-simulation \
  -vvvv


## Cast calls - to check post-wiring   

# Registry wiring
cast call $REG "NFTContract()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call $REG "marketplaceAddress()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"

# NFT wiring
cast call $NFT "registryContract()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call $NFT "marketplaceAddress()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"

# Market fee config
cast call $MKT "feeRecipient()(address)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call $MKT "feeBps()(uint256)" --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"

# Test script runs
script/flow_mint_list_buy.sh

# Before another test run, grab current balances
cast call $USDC "balanceOf(address)(uint256)" $DEV_WALLET1 --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call $USDC "balanceOf(address)(uint256)" $MKT       --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call $MKT  "feeRecipient()(address)"                 --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" # DEV_WALLET1
cast call $MKT  "feeBps()(uint256)"                      --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"  # 250
