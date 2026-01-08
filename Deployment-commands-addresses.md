# Arbitrum Sepolia

Registry Proxy (main):  0x75D34c21Ac5BFf805E68DC73a5dc534B355358C7
NFT Proxy (main):       0x6cecc2187EE1218988DaC70582ECe615987ce768
Market Proxy (main):    0xEce42dA8437980cB22AA09C9676e698AC054c95e


# Aurora Testnet (Improved V1 - deployed 05-01-2026)

Registry Proxy (main):  0xEb3f30Cae7085fdE13eEac6a9A178FE403310c7d
NFT Proxy (main):       0xd9F7874cCc13695b0B0EF8a61d9B87F53cf65541
Market Proxy (main):    0x5f4F63164ffbD889fe8D1572C277509b1FA01B40
USDC Mock:              0x8BC104732AF20584058D8eF68a4C448698fFB282


# Manual verification - addresses (Aurora Testnet)

Registry:

Implementation: 0x50E1ec5D186b7eD5EcfD7118beb0947a5269FbBb
ProxyAdmin: 0x4B22976045D4b0e176a6a63E0C125C0949b52672
Proxy: 0xEb3f30Cae7085fdE13eEac6a9A178FE403310c7d

NFT:

Implementation: 0x37b2A374AE213Fc64c7D90BB9c93228b1C30619C
ProxyAdmin: 0x6E5ac5e1e75960047B7Bb227E0BEB3b603c4FF0C
Proxy: 0xd9F7874cCc13695b0B0EF8a61d9B87F53cf65541

Market:

Implementation: 0x1E0e3Ba0078df85EB1FC6AACe55356324Ad4F994
ProxyAdmin: 0x57916903421E151D89fB3e4A14aC78cA2A679cFD
Proxy: 0x5f4F63164ffbD889fe8D1572C277509b1FA01B40


## Deployment Commands (Aurora Testnet)

Note: Manually paste deployed proxy addresses into contracts/wire_contracts_aurora.sh before wiring

```bash
cd ~/Documents/Coding/Collectibles-app/contracts

# Deploy all 3 contracts
./deploy_registry_aurora.sh
./deploy_nft_aurora.sh
COLLECTIBLE_USDC6MOCK_ADDRESS=0x8BC104732AF20584058D8eF68a4C448698fFB282 ./deploy_market_aurora.sh

# Extract proxy addresses
grep "PROXY=" /tmp/aurora-registry-v1-addresses.txt
grep "PROXY=" /tmp/aurora-nft-v1-addresses.txt
grep "PROXY=" /tmp/aurora-market-v1-addresses.txt

# Wire contracts together
./wire_contracts_aurora.sh

# Manual verification required via Blockscout web UI
# (Blockscout API is broken - cannot use forge verify-contract)
```

## Key Improvements in Aurora V1
- Added `setPaymentToken()` in Market (can switch USDC/other tokens)
- CEI pattern compliance (prevents reentrancy)
- Better input validation throughout
- Marketplace checks now optional in Registry
- RFID-tokenId verification in burn
- Overflow protection in loyalty points


## Generate .zip file
cd ~/Documents/Coding/Collectibles-app

zip -r collectibles-app-$(date +%Y%m%d-%H%M%S).zip . \
  -x "*/node_modules/*" \
  -x "*/out/*" \
  -x "*/cache/*" \
  -x "*/broadcast/*" \
  -x "*/.git/*" \
  -x "*/data/*" \
  -x "*/dist/*" \
  -x "*/.vite/*" \
  -x "*/lib/*" \
  -x "*/build/*"


## Make scripts readable (example)

chmod +x ~/Documents/Coding/Collectibles-app/contracts/generate-env-snippets.sh
