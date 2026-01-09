# Aurora Testnet Contract Verification Guide

## Overview
This guide covers verification of all 9 upgradeable contracts (3 contracts × 3 parts each) deployed on Aurora Testnet using Foundry and Blockscout's v1 API endpoint.

## Important Discovery ✅
Blockscout's default API endpoint (`/api`) is broken on Aurora. Use the **v1 endpoint** instead:
```
👉👉👉   https://explorer.testnet.aurora.dev/api/v1    👈👈👈
```

## Deployed Contract Addresses

### Registry Contract
- **Implementation:** `0x50E1ec5D186b7eD5EcfD7118beb0947a5269FbBb`
- **ProxyAdmin:** `0x4B22976045D4b0e176a6a63E0C125C0949b52672`
- **Proxy (main):** `0xEb3f30Cae7085fdE13eEac6a9A178FE403310c7d`

### NFT Contract
- **Implementation:** `0xf8B163a5da322d6ED86044Cf27C564591D525e9A`
- **ProxyAdmin:** `0x49F62454e6cA45831977C1D9ed02360B115d30aF`
- **Proxy (main):** `0xd9F7874cCc13695b0B0EF8a61d9B87F53cf65541`

### Market Contract
- **Implementation:** `0x1E0e3Ba0078df85EB1FC6AACe55356324Ad4F994`
- **ProxyAdmin:** `0x57916903421E151D89fB3e4A14aC78cA2A679cFD`
- **Proxy (main):** `0x5f4F63164ffbD889fe8D1572C277509b1FA01B40`

### USDC Mock (Payment Token)
- **Address:** `0x8BC104732AF20584058D8eF68a4C448698fFB282`

## Verification Commands

### Step 1: Verify Implementation Contracts

**Registry Implementation:**
```bash
forge verify-contract \
  0x50E1ec5D186b7eD5EcfD7118beb0947a5269FbBb \
  src/collectiblesRegistryV1.sol:CollectibleRegistryV1 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

**NFT Implementation:**
```bash
forge verify-contract \
  0xf8B163a5da322d6ED86044Cf27C564591D525e9A \
  src/collectiblesNFTV1.sol:CollectibleNFTV1 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

**Market Implementation:**
```bash
forge verify-contract \
  0x1E0e3Ba0078df85EB1FC6AACe55356324Ad4F994 \
  src/collectiblesMarketV1.sol:CollectibleMarketV1 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

### Step 2: Verify ProxyAdmin Contracts

**Registry ProxyAdmin:**
```bash
forge verify-contract \
  0x4B22976045D4b0e176a6a63E0C125C0949b52672 \
  lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

**NFT ProxyAdmin:**
```bash
forge verify-contract \
  0x49F62454e6cA45831977C1D9ed02360B115d30aF \
  lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

**Market ProxyAdmin:**
```bash
forge verify-contract \
  0x57916903421E151D89fB3e4A14aC78cA2A679cFD \
  lib/openzeppelin-contracts/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

### Step 3: Verify Proxy Contracts

**Registry Proxy:**
```bash
forge verify-contract \
  0xEb3f30Cae7085fdE13eEac6a9A178FE403310c7d \
  lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

**NFT Proxy:**
```bash
forge verify-contract \
  0xd9F7874cCc13695b0B0EF8a61d9B87F53cf65541 \
  lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

**Market Proxy:**
```bash
forge verify-contract \
  0x5f4F63164ffbD889fe8D1572C277509b1FA01B40 \
  lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

### Step 4: Verify USDC Mock (Payment Token)

**USDC Mock:**
```bash
forge verify-contract \
  0x8BC104732AF20584058D8eF68a4C448698fFB282 \
  test/mocks/USDC6Mock.sol:USDC6Mock \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1 \
  --rpc-url https://testnet.aurora.dev \
  --watch
```

## Notes

- **Total contracts:** 10 verified (9 upgradeable contracts + 1 USDC Mock)
- **Auto-verification:** Blockscout often auto-verifies Proxy contracts after ProxyAdmin verification since they use standard OpenZeppelin bytecode
- **v1 API:** 👉 The `/api/v1` endpoint is critical 👈 - the default `/api` endpoint returns HTML errors instead of JSON
- **Watch flag:** The `--watch` flag monitors verification progress and waits for completion
- **All contracts verified:** As of deployment (2026-01-06), all 10 contracts are fully verified on Aurora Testnet

## Verification Links

- **Registry:** https://explorer.testnet.aurora.dev/address/0xEb3f30Cae7085fdE13eEac6a9A178FE403310c7d
- **NFT:** https://explorer.testnet.aurora.dev/address/0xd9F7874cCc13695b0B0EF8a61d9B87F53cf65541
- **Market:** https://explorer.testnet.aurora.dev/address/0x5f4F63164ffbD889fe8D1572C277509b1FA01B40
- **USDC Mock:** https://explorer.testnet.aurora.dev/address/0x8BC104732AF20584058D8eF68a4C448698fFB282

## Troubleshooting

If verification fails:
1. Check that you're using `/api/v1` endpoint (not `/api`)
2. Verify the contract address is correct (use `cast code <address> --rpc-url https://testnet.aurora.dev`)
3. Ensure you're in the `contracts/` directory when running commands
4. Check that OpenZeppelin dependencies are installed (`forge install`)

## Future Deployments

For future deployments, you can add `--verify` flags to deployment scripts:

```bash
forge script script/DeployRegistryUpgradeable.s.sol \
  --rpc-url https://testnet.aurora.dev \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.aurora.dev/api/v1
```