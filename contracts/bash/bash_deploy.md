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



