Blockscout Verification Checklist - Aurora Testnet
Copy this checklist and check off as you complete each verification:

Registry Contracts

 Registry Implementation

URL: https://explorer.testnet.aurora.dev/address/0x50E1ec5D186b7eD5EcfD7118beb0947a5269FbBb
Contract: src/collectiblesRegistryV1.sol:CollectibleRegistryV1
Compiler: v0.8.20+commit.a1b79de6
Optimization: Enabled (200 runs)


 Registry ProxyAdmin

URL: https://explorer.testnet.aurora.dev/address/0x4B22976045D4b0e176a6a63E0C125C0949b52672
Contract: ProxyAdmin.sol:ProxyAdmin
Compiler: v0.8.20+commit.a1b79de6


 Registry Proxy

URL: https://explorer.testnet.aurora.dev/address/0xEb3f30Cae7085fdE13eEac6a9A178FE403310c7d
Contract: TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy
Compiler: v0.8.20+commit.a1b79de6




NFT Contracts

 NFT Implementation

URL: https://explorer.testnet.aurora.dev/address/0x37b2A374AE213Fc64c7D90BB9c93228b1C30619C
Contract: src/collectiblesNFTV1.sol:CollectibleNFTV1
Compiler: v0.8.20+commit.a1b79de6
Optimization: Enabled (200 runs)


 NFT ProxyAdmin

URL: https://explorer.testnet.aurora.dev/address/0x6E5ac5e1e75960047B7Bb227E0BEB3b603c4FF0C
Contract: ProxyAdmin.sol:ProxyAdmin
Compiler: v0.8.20+commit.a1b79de6


 NFT Proxy

URL: https://explorer.testnet.aurora.dev/address/0xd9F7874cCc13695b0B0EF8a61d9B87F53cf65541
Contract: TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy
Compiler: v0.8.20+commit.a1b79de6




Market Contracts

 Market Implementation

URL: https://explorer.testnet.aurora.dev/address/0x1E0e3Ba0078df85EB1FC6AACe55356324Ad4F994
Contract: src/collectiblesMarketV1.sol:CollectibleMarketV1
Compiler: v0.8.20+commit.a1b79de6
Optimization: Enabled (200 runs)


 Market ProxyAdmin

URL: https://explorer.testnet.aurora.dev/address/0x57916903421E151D89fB3e4A14aC78cA2A679cFD
Contract: ProxyAdmin.sol:ProxyAdmin
Compiler: v0.8.20+commit.a1b79de6


 Market Proxy

URL: https://explorer.testnet.aurora.dev/address/0x5f4F63164ffbD889fe8D1572C277509b1FA01B40
Contract: TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy
Compiler: v0.8.20+commit.a1b79de6




Quick Tips:
For Implementation contracts:

Paste entire .sol file contents
Make sure flattening is NOT needed (Blockscout handles imports)

For ProxyAdmin:

Often auto-verified by library match
If not, search for "ProxyAdmin" in OpenZeppelin contracts

For Proxy:

May need constructor arguments (implementation + admin addresses)
Check "Proxy" tab after verification to see if it links to implementation