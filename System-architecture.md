# Collectibles-App System Architecture

## Executive Summary

The Collectibles-App is a decentralized on-chain ownership registry with marketplace functionality. It consists of three upgradeable smart contracts (Registry, NFT, Market), a TypeScript event indexer backend, and a React frontend. Currently deployed to Arbitrum Sepolia, with planned deployment to Aurora testnet.

---

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BLOCKCHAIN LAYER                            │
│                      (Arbitrum Sepolia / Aurora)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   Registry V1    │  │     NFT V1       │  │    Market V1     │  │
│  │                  │  │                  │  │                  │  │
│  │ - Authenticity   │  │ - ERC721         │  │ - Listings       │  │
│  │ - RFID mapping   │  │ - Loyalty points │  │ - Fixed price    │  │
│  │ - Minting coord  │  │ - Transfer guard │  │ - ERC20 payment  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│           │                      │                      │            │
│           └──────────────────────┴──────────────────────┘            │
│                              Events ↓                                │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ WebSocket / HTTP RPC
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           BACKEND LAYER                              │
│                        (Node.js + TypeScript)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Event Indexer Worker                         │ │
│  │                                                                  │ │
│  │  - Auto-discovers contract deployment blocks                    │ │
│  │  - Fetches historical logs (2000 block chunks)                  │ │
│  │  - Parses events using ABIs                                     │ │
│  │  - Applies events to state (SQLite)                             │ │
│  │  - Writes JSONL logs for replay/audit                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                   │                                  │
│                                   ↓                                  │
│  ┌─────────────┐         ┌──────────────┐                           │
│  │ JSONL Logs  │         │   SQLite DB  │                           │
│  │             │         │              │                           │
│  │ - registry  │         │ - collectibles│                          │
│  │ - nft       │         │ - listings    │                          │
│  │ - market    │         │ - ownership   │                          │
│  │ - combined  │         │ - points      │                          │
│  └─────────────┘         └──────────────┘                           │
│                                   │                                  │
│                                   ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      HTTP Server (Express)                      │ │
│  │                                                                  │ │
│  │  GET /api/collectibles        - All collectibles                │ │
│  │  GET /api/collectibles/:rfid  - Single collectible              │ │
│  │  GET /api/listings            - Active marketplace listings     │ │
│  │  GET /api/users/:address      - User data & loyalty points      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ REST API
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND LAYER                              │
│                        (Vite + React + TypeScript)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                       Wallet Connection                         │ │
│  │                                                                  │ │
│  │  - MetaMask / EIP-1193 injected provider                        │ │
│  │  - Auto-restore on page load                                    │ │
│  │  - Network detection & switching                                │ │
│  │  - Context-based state management                               │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                   │                                  │
│                                   ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      Contract Interactions                      │ │
│  │                                                                  │ │
│  │  Registry:    Register, Transfer, Redeem, Query                 │ │
│  │  NFT:         Query ownership, tokenURI, loyalty points         │ │
│  │  Market:      List, Cancel, Amend, Purchase                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                   │                                  │
│                                   ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                           UI Pages                               │ │
│  │                                                                  │ │
│  │  HomePage              - Landing & overview                      │ │
│  │  AllCollectiblesPage   - Browse all collectibles                │ │
│  │  MyCollectiblesPage    - User's owned items                     │ │
│  │  MarketplacePage       - Active listings                        │ │
│  │  CollectibleDetails    - Single item view                       │ │
│  │  AdminPage             - Admin minting & config                 │ │
│  │  AccountPage           - User profile & loyalty tier            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Smart Contract Architecture

### 1. CollectibleRegistryV1 (Registry of Truth)

**Purpose:** Manages authenticity data and coordinates minting/burning operations.

**Key Features:**
- Stores authenticity hash per RFID (using keccak256(rfid) as key)
- Does NOT duplicate ownership (delegates to NFT contract)
- Acts as admin gateway for minting
- Enforces marketplace listing checks before transfers
- Upgradeable (UUPS pattern)

**Events Emitted:**
```solidity
event RegistryConfigured(address indexed nft, address indexed marketplace)
event CollectibleRegistered(bytes32 indexed rfidHash, address indexed initialOwner, bytes32 authenticityHash, string rfid)
event CollectibleOwnershipTransferred(bytes32 indexed rfidHash, address indexed oldOwner, address indexed newOwner, string rfid)
event CollectibleRedeemed(bytes32 indexed rfidHash, string rfid)
```

**Core Functions:**
- `registerCollectible(rfid, authenticityHash, initialOwner, tokenURI)` - Admin only
- `transferCollectibleOwnership(rfid, newOwner)` - Owner only, not if listed
- `redeemCollectible(rfid)` - Burns NFT and removes registry entry
- `getCollectible(rfid)` - Returns (rfid, authenticityHash, currentOwner)

### 2. CollectibleNFTV1 (ERC721 + Loyalty)

**Purpose:** Standard ERC721 with loyalty points system and marketplace integration.

**Key Features:**
- ERC721URIStorage for metadata
- RFID → tokenId mapping (using bytes32 for efficiency)
- Loyalty points per address
- Tier system (Bronze/Silver/Gold)
- Transfer blocking when listed on marketplace
- Upgradeable (UUPS pattern)

**Events Emitted:**
```solidity
event MintedNFT(uint256 indexed tokenId, address indexed owner)
event RFIDLinked(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner, string rfid)
event CollectibleBurned(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner)
event PointsAdded(address indexed user, uint256 points)
event AdminSetPoints(address indexed user, uint256 points)
event TierThresholdsUpdated(uint256 silver, uint256 gold)
event MarketplaceSet(address indexed marketplace)
event RegistrySet(address indexed registry)
```

**Core Functions:**
- `mintNFT(recipient, tokenURI, rfid)` - Called by Registry
- `burn(tokenId, rfid)` - Called by Registry
- `getTokenIdByRFID(rfid)` - Lookup helper
- `getTier(user)` - Returns Bronze/Silver/Gold
- `_update()` - Override to block transfers when listed

**Loyalty System:**
- Mint: +100 points
- Redeem: +150 points
- Silver: 1000+ points
- Gold: 5000+ points

### 3. CollectibleMarketV1 (Fixed-Price Marketplace)

**Purpose:** Simple fixed-price listing and purchase with ERC20 payment.

**Key Features:**
- Fixed-price listings (no auctions)
- ERC20 payment token (configurable)
- Platform fee in basis points (default 2%)
- Pausable for emergencies
- Sellers can cancel even when paused
- Upgradeable (UUPS pattern)

**Events Emitted:**
```solidity
event PaymentTokenSet(address indexed paymentToken)
event FeeConfigUpdated(address indexed feeRecipient, uint256 feeBps)
event CollectibleListed(address indexed nft, uint256 indexed tokenId, address indexed seller, uint256 price)
event CollectibleCanceled(address indexed nft, uint256 indexed tokenId)
event CollectiblePriceUpdated(address indexed nft, uint256 indexed tokenId, uint256 newPrice)
event CollectiblePurchased(address indexed nft, uint256 indexed tokenId, address indexed seller, address buyer, uint256 price)
```

**Core Functions:**
- `listCollectible(nft, tokenId, price)` - Requires approval
- `cancelListing(nft, tokenId)` - Seller only
- `amendListing(nft, tokenId, newPrice)` - Seller only
- `purchaseCollectible(nft, tokenId)` - Transfers ERC20 & NFT atomically
- `isListed(nft, tokenId)` - Query helper

**Purchase Flow:**
1. Buyer approves paymentToken for full price
2. Contract splits: fee → feeRecipient, rest → seller
3. NFT transferred from seller to buyer
4. Listing marked inactive

---

## Backend Event Indexer Design

### Architecture Principles

1. **Event Sourcing**: Blockchain events are the source of truth
2. **Idempotency**: Can replay from any block without corruption
3. **Resilience**: Auto-retry with exponential backoff
4. **Efficiency**: Batch fetching, smart chunking

### Components

#### 1. Backfill Worker (`backfill-all.ts`)

**Responsibilities:**
- Auto-discovers contract deployment blocks (scans backwards)
- Fetches historical logs in configurable chunks (default 2000 blocks)
- Parses events using contract ABIs
- Applies events to SQLite state in block order
- Writes audit trail to JSONL files

**Key Features:**
- **Smart Start Block Detection**: Automatically finds first contract logs
- **Adaptive Rate Limiting**: Exponential backoff on 429 errors
- **Response Size Handling**: Auto-splits large responses recursively
- **Strict Ordering**: Sorts by (block, logIndex) before applying

**Configuration:**
```typescript
STEP = 2_000               // Block chunk size
AUTO_FIND_MAX_LOOKBACK = 200_000  // How far to search backwards
AUTO_FIND_STRIDE = 10_000  // Jump size during search
PACE_MS = 200             // Delay between RPC calls
```

#### 2. State Manager (`state.ts`)

**Purpose**: Maintain normalized database from events

**Schema (SQLite):**
```sql
-- Collectibles table
CREATE TABLE collectibles (
  rfid TEXT PRIMARY KEY,
  rfidHash TEXT NOT NULL,
  tokenId INTEGER NOT NULL,
  authenticityHash TEXT NOT NULL,
  owner TEXT NOT NULL,
  tokenURI TEXT,
  mintBlock INTEGER NOT NULL,
  mintTx TEXT NOT NULL,
  lastTransferBlock INTEGER,
  lastTransferTx TEXT,
  redeemed BOOLEAN DEFAULT 0,
  redeemBlock INTEGER,
  redeemTx TEXT
);

-- Listings table
CREATE TABLE listings (
  nft TEXT NOT NULL,
  tokenId INTEGER NOT NULL,
  seller TEXT NOT NULL,
  price TEXT NOT NULL,
  isListed BOOLEAN NOT NULL,
  listedBlock INTEGER NOT NULL,
  listedTx TEXT NOT NULL,
  lastUpdateBlock INTEGER,
  lastUpdateTx TEXT,
  PRIMARY KEY (nft, tokenId)
);

-- User points table
CREATE TABLE user_points (
  address TEXT PRIMARY KEY,
  points INTEGER NOT NULL,
  lastUpdateBlock INTEGER NOT NULL,
  lastUpdateTx TEXT NOT NULL
);
```

**Event Processing Logic:**
```typescript
// Registry Events
CollectibleRegistered → Insert into collectibles
CollectibleOwnershipTransferred → Update owner
CollectibleRedeemed → Mark redeemed

// NFT Events
MintedNFT → Join with RFIDLinked for full record
RFIDLinked → Primary source for RFID→tokenId mapping
CollectibleBurned → Confirm redemption
PointsAdded → Increment user_points
AdminSetPoints → Set user_points

// Market Events
CollectibleListed → Insert/update listing (isListed=true)
CollectibleCanceled → Update listing (isListed=false)
CollectiblePriceUpdated → Update price
CollectiblePurchased → Update listing (isListed=false) + owner
```

#### 3. HTTP Server (`server.ts`)

**Endpoints:**
```
GET /api/collectibles
  → Returns all collectibles (paginated)
  
GET /api/collectibles/:rfid
  → Returns single collectible with current owner & metadata
  
GET /api/listings
  → Returns active marketplace listings
  
GET /api/users/:address
  → Returns user's collectibles, points, tier
  
GET /health
  → Backend health check
```

### JSONL Audit Trail

**Files Created:**
- `raw_logs.jsonl` - Raw blockchain logs (optional)
- `registry_log.jsonl` - Parsed Registry events
- `nft_log.jsonl` - Parsed NFT events
- `market_log.jsonl` - Parsed Market events
- `collectible_log.jsonl` - Combined event stream

**Format:**
```json
{
  "t": 1731368200000,
  "contract": "registry",
  "event": "CollectibleRegistered",
  "args": {
    "rfidHash": "0xabc...",
    "initialOwner": "0xF8f...",
    "authenticityHash": "0x123...",
    "rfid": "RFID-001"
  },
  "tx": "0x123...",
  "block": 12345700,
  "logIndex": 0
}
```

**Benefits:**
- Replay entire state from scratch
- Audit trail for compliance
- Easy debugging
- Portable backups

---

## Frontend Architecture

### Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Routing**: React Router DOM 7
- **Blockchain**: ethers.js 6
- **State**: Context API + Hooks

### Wallet Integration

**Current Implementation (MetaMask/EIP-1193):**

```typescript
// WalletProvider context manages:
- address: string | null          // Connected account
- chainId: number | null          // Current network
- provider: BrowserProvider | null // ethers.js provider
- connecting: boolean              // Connection state
- hasProvider: boolean             // Is MetaMask installed?
- wrongNetwork: boolean            // Chain mismatch?
- connect(): Promise<void>         // Explicit connect

// Features:
1. Soft connect on page load (eth_accounts)
2. Explicit connect on button click (eth_requestAccounts)
3. Auto-detect account changes
4. Auto-detect network changes
5. Network validation against CHAIN_ID
```

**How It Works:**
1. On mount: Check `window.ethereum`, create BrowserProvider
2. Query `eth_accounts` (no popup) to restore previous session
3. Listen to `accountsChanged` and `chainChanged` events
4. User clicks "Connect" → trigger `eth_requestAccounts` (popup)
5. Validate chainId matches expected network

### Contract Interactions

**Pattern:**
```typescript
const { provider, address } = useWallet();
const signer = await provider.getSigner();

// Registry contract
const registry = new ethers.Contract(
  REGISTRY_ADDRESS,
  REGISTRY_ABI,
  signer
);

// Call functions
await registry.registerCollectible(rfid, hash, owner, uri);
const [rfid, hash, owner] = await registry.getCollectible(rfid);
```

### Custom Hooks

**useCollectibles.ts:**
```typescript
// Fetches all collectibles from backend API
// Filters by owner if address provided
// Auto-refreshes on wallet changes
```

**useListings.ts:**
```typescript
// Fetches active marketplace listings
// Enriches with collectible metadata
// Handles loading/error states
```

**usePoints.ts:**
```typescript
// Fetches user's loyalty points & tier
// Auto-updates on wallet changes
```

### Pages

1. **HomePage**: Landing page with stats
2. **AllCollectiblesPage**: Browse all items (paginated)
3. **MyCollectiblesPage**: User's owned items
4. **MarketplacePage**: Active listings with buy functionality
5. **CollectibleDetailsPage**: Single item view with actions
6. **AdminPage**: Minting interface (owner only)
7. **AccountPage**: User profile, loyalty tier, points

---

## Aurora/NEAR Integration Design

### Current State Analysis

**What Works on Arbitrum:**
- MetaMask wallet connectivity via EIP-1193
- Standard Ethereum RPC (eth_accounts, eth_requestAccounts, eth_chainId)
- ethers.js BrowserProvider wrapping window.ethereum
- Contract interactions via ethers.js

**Aurora Compatibility:**
Aurora is EVM-compatible, so:
- ✅ Smart contracts deploy without changes
- ✅ ethers.js works identically
- ✅ Standard EIP-1193 wallets (MetaMask) work
- ✅ Same RPC methods

**NEAR Wallet Integration (New Requirement):**
Aurora supports NEAR wallets through a special connector that bridges NEAR accounts to Ethereum addresses.

### Integration Strategy

#### Option 1: Multi-Wallet Support (Recommended)

Support both MetaMask AND NEAR wallets:

**Architecture:**
```typescript
// New WalletProvider with multi-wallet support
type WalletType = 'metamask' | 'near';

interface WalletState {
  walletType: WalletType | null;
  address: string | null;
  chainId: number | null;
  provider: BrowserProvider | null;
  connecting: boolean;
  hasMetaMask: boolean;
  hasNearWallet: boolean;
  wrongNetwork: boolean;
  connect(type: WalletType): Promise<void>;
  disconnect(): void;
}
```

**Implementation Steps:**

1. **Install NEAR Wallet Selector:**
```bash
npm install @near-wallet-selector/core @near-wallet-selector/modal-ui @near-wallet-selector/my-near-wallet @near-wallet-selector/aurora-wallet
```

2. **Create NEAR Wallet Connector:**
```typescript
// src/eth/nearWallet.tsx
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupAuroraWallet } from '@near-wallet-selector/aurora-wallet';

export async function setupNearWallet() {
  const selector = await setupWalletSelector({
    network: 'testnet', // or 'mainnet'
    modules: [
      setupMyNearWallet(),
      setupAuroraWallet(),
    ],
  });
  
  const modal = setupModal(selector, {
    contractId: 'your-aurora-contract.testnet',
  });
  
  return { selector, modal };
}
```

3. **Unified Wallet Provider:**
```typescript
// src/eth/walletUnified.tsx
export function UnifiedWalletProvider({ children }: { children: ReactNode }) {
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  
  // MetaMask connection (existing)
  async function connectMetaMask() {
    const eth = window.ethereum;
    const prov = new BrowserProvider(eth);
    const accounts = await prov.send('eth_requestAccounts', []);
    setAddress(accounts[0]);
    setProvider(prov);
    setWalletType('metamask');
  }
  
  // NEAR wallet connection (new)
  async function connectNear() {
    const { selector, modal } = await setupNearWallet();
    modal.show();
    
    // After user selects wallet
    const wallet = await selector.wallet();
    const accounts = await wallet.getAccounts();
    
    // Convert NEAR account to Ethereum address
    const evmAddress = deriveAuroraAddress(accounts[0].accountId);
    setAddress(evmAddress);
    
    // Create ethers provider from NEAR wallet
    const nearProvider = new NEARWalletProvider(wallet);
    setProvider(nearProvider);
    setWalletType('near');
  }
  
  async function connect(type: WalletType) {
    if (type === 'metamask') await connectMetaMask();
    if (type === 'near') await connectNear();
  }
  
  return (
    <WalletContext.Provider value={{
      walletType,
      address,
      provider,
      connect,
      // ... rest of state
    }}>
      {children}
    </WalletContext.Provider>
  );
}
```

4. **Update UI Components:**
```typescript
// Connect button component
function ConnectButton() {
  const { walletType, connect } = useWallet();
  const [showModal, setShowModal] = useState(false);
  
  if (walletType) {
    return <div>Connected with {walletType}</div>;
  }
  
  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Connect Wallet
      </button>
      
      {showModal && (
        <Modal>
          <button onClick={() => connect('metamask')}>
            MetaMask
          </button>
          <button onClick={() => connect('near')}>
            NEAR Wallet
          </button>
        </Modal>
      )}
    </>
  );
}
```

#### Option 2: NEAR-Only (Simpler)

If you only want NEAR wallets on Aurora:

1. Replace current WalletProvider entirely
2. Use NEAR Wallet Selector as primary
3. Derive Ethereum addresses from NEAR accounts
4. Use NEAR wallet's Aurora connector for signing

**Pros:**
- Simpler UX (one wallet type)
- Better NEAR ecosystem integration

**Cons:**
- Loses MetaMask support
- May confuse users familiar with Ethereum

### Network Configuration

**Update config.ts:**
```typescript
// src/eth/config.ts
export const NETWORKS = {
  arbitrumSepolia: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  },
  auroraTestnet: {
    chainId: 1313161555,
    name: 'Aurora Testnet',
    rpcUrl: 'https://testnet.aurora.dev',
    nearNetwork: 'testnet',
  },
  auroraMainnet: {
    chainId: 1313161554,
    name: 'Aurora Mainnet',
    rpcUrl: 'https://mainnet.aurora.dev',
    nearNetwork: 'mainnet',
  },
};

export const CURRENT_NETWORK = NETWORKS.auroraTestnet;
export const CHAIN_ID = CURRENT_NETWORK.chainId;
```

### Backend Adjustments

**RPC Configuration:**
```typescript
// backend/src/config/env.ts
export const env = {
  // ... existing
  RPC_HTTP_URL: process.env.RPC_HTTP_URL || 'https://testnet.aurora.dev',
  RPC_WS_URL: process.env.RPC_WS_URL, // Aurora doesn't have WS, use polling
  CHAIN_ID: parseInt(process.env.CHAIN_ID || '1313161555'),
  
  // Aurora-specific
  NEAR_NETWORK: process.env.NEAR_NETWORK || 'testnet',
};
```

**Polling vs WebSocket:**
Aurora testnet may not support WebSocket, so update indexer:

```typescript
// Use HTTP polling instead of WebSocket
const provider = new JsonRpcProvider(env.RPC_HTTP_URL);

// Poll for new blocks
async function pollNewBlocks() {
  let lastBlock = await getLastProcessedBlock();
  
  setInterval(async () => {
    const latest = await provider.getBlockNumber();
    if (latest > lastBlock) {
      await backfillChunk(lastBlock + 1, latest);
      lastBlock = latest;
    }
  }, 2000); // Poll every 2 seconds
}
```

### Deployment Checklist for Aurora

**Smart Contracts:**
1. Update foundry.toml for Aurora RPC
2. Deploy contracts to Aurora testnet
3. Verify on Aurora Explorer
4. Update frontend contract addresses

**Backend:**
1. Update RPC URL to Aurora
2. Change WebSocket to HTTP polling
3. Update CHAIN_ID
4. Backfill from deployment block

**Frontend:**
1. Add NEAR Wallet Selector
2. Update wallet connection logic
3. Update CHAIN_ID and RPC
4. Test both MetaMask and NEAR wallets

---

## Deployment Architecture

### Smart Contract Deployment

**Current (Arbitrum Sepolia):**
```
Registry: 0x... (upgradeable proxy)
NFT: 0x... (upgradeable proxy)  
Market: 0x... (upgradeable proxy)
```

**Deployment Script Pattern:**
```bash
# Deploy with Foundry
forge script script/DeployRegistryUpgradeable.s.sol \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

**Aurora Deployment:**
```bash
# Update .env
RPC_URL=https://testnet.aurora.dev
CHAIN_ID=1313161555

# Deploy all contracts
./script/deploy_and_verify_registry.sh
./script/deploy_and_verify_nft.sh
./script/deploy_and_verify_market.sh
```

### Backend Deployment

**Local Development:**
```bash
cd backend
npm install
npm run dev  # Runs with nodemon hot-reload
```

**Production:**
```bash
# Using PM2 for process management
pm2 start src/index.ts --name collectibles-indexer --interpreter ts-node

# Or using Docker
docker build -t collectibles-backend .
docker run -d \
  -e RPC_HTTP_URL=https://testnet.aurora.dev \
  -e CHAIN_ID=1313161555 \
  -v /data:/app/data \
  collectibles-backend
```

### Frontend Deployment

**Build:**
```bash
cd frontend
npm install
npm run build  # Creates dist/ folder
```

**Deploy to:**
- Vercel: `vercel deploy`
- Netlify: `netlify deploy --prod`
- IPFS: `ipfs add -r dist/`
- GitHub Pages: Push dist/ to gh-pages branch

---

## Data Flow Examples

### Example 1: Register New Collectible

```
1. Admin calls frontend AdminPage
2. Frontend calls Registry.registerCollectible()
   - Tx sent to blockchain
3. Registry emits CollectibleRegistered event
4. Registry calls NFT.mintNFT()
5. NFT emits MintedNFT + RFIDLinked events
6. Backend indexer detects events:
   - Writes to registry_log.jsonl
   - Writes to nft_log.jsonl
   - Writes to collectible_log.jsonl
   - Applies to SQLite state
7. Frontend queries /api/collectibles
8. New item appears in UI
```

### Example 2: List & Purchase on Marketplace

```
1. Owner calls Market.listCollectible()
   - Requires prior approval
2. Market emits CollectibleListed
3. Backend updates listings table
4. Buyer sees listing on MarketplacePage
5. Buyer calls Market.purchaseCollectible()
   - ERC20 tokens transferred
   - NFT transferred
6. Market emits CollectiblePurchased
7. NFT emits Transfer (standard ERC721)
8. Backend updates:
   - listing.isListed = false
   - collectibles.owner = buyer
9. UI refreshes, item removed from marketplace
10. Buyer sees item in MyCollectiblesPage
```

### Example 3: Transfer via Registry

```
1. Owner calls Registry.transferCollectibleOwnership()
2. Registry checks if listed (reverts if true)
3. Registry calls NFT.safeTransferFrom()
4. NFT._update() checks marketplace (allowed)
5. NFT emits Transfer event
6. Registry emits CollectibleOwnershipTransferred
7. Backend updates owner in collectibles table
8. UI reflects new ownership
```

---

## Security Considerations

### Smart Contracts

**Access Control:**
- Registry: Only owner can register/set contracts
- NFT: Only Registry or owner can mint/burn
- Market: Only seller can cancel/amend listings

**Reentrancy Protection:**
- All contracts use `ReentrancyGuardUpgradeable`
- Purchase flow: Pull payments → Transfer NFT

**Transfer Guards:**
- NFT blocks transfers when listed
- Registry checks listing status before transfer
- Marketplace validates ownership before purchase

**Upgradability:**
- UUPS pattern (proxy + implementation)
- Storage gaps for future variables
- Careful initialization in `initialize()`

### Backend

**RPC Security:**
- Rate limiting on provider calls
- Exponential backoff on errors
- Multiple RPC endpoints for redundancy

**Data Integrity:**
- Events processed in strict block order
- JSONL logs for replay/verification
- Database constraints & indexes

### Frontend

**Wallet Security:**
- Never request private keys
- Use read-only provider for queries
- Only use signer for transactions
- Validate network before transactions

**API Security:**
- CORS configured properly
- Rate limiting on backend
- Input validation on all endpoints

---

## Future Enhancements

### Phase 1: Aurora Migration (Current)
- Deploy to Aurora testnet
- Add NEAR wallet support
- Test multi-wallet UX

### Phase 2: Enhanced Backend
- PostgreSQL for better query performance
- GraphQL API for flexible queries
- Real-time WebSocket updates to frontend
- Caching layer (Redis)

### Phase 3: Advanced Features
- NFT metadata on IPFS
- Image upload & storage
- Collection categories
- Search & filtering
- Auction marketplace (timed listings)

### Phase 4: NEAR Native Features
- NEAR native contracts (Rust)
- Cross-chain bridging
- NEAR social integration
- NFT on NEAR blockchain

### Phase 5: Mobile
- React Native app
- WalletConnect support
- QR code scanning for RFID
- Push notifications

---

## Development Workflow

### Local Development Setup

**1. Clone repo:**
```bash
git clone https://github.com/sarobinson2011/Collectibles-app.git
cd Collectibles-app
```

**2. Smart Contracts:**
```bash
cd contracts
forge install
forge test
```

**3. Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your RPC URLs and contract addresses
npm run dev
```

**4. Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Testing Strategy

**Smart Contracts:**
- Unit tests in `test/`
- Flow tests for complete workflows
- Foundry fuzzing for edge cases

**Backend:**
- Replay JSONL logs to verify state
- Compare SQLite state to on-chain data
- Load testing with historical blocks

**Frontend:**
- Manual testing with testnet
- E2E tests with Playwright
- Network switching scenarios

### Deployment Workflow

**1. Deploy Contracts:**
```bash
cd contracts
./script/deploy_and_verify_registry.sh
./script/deploy_and_verify_nft.sh
./script/deploy_and_verify_market.sh
```

**2. Configure Backend:**
```bash
cd backend
# Update .env with new contract addresses
npm run start
```

**3. Deploy Frontend:**
```bash
cd frontend
# Update src/eth/config.ts with contract addresses
npm run build
# Deploy dist/ to hosting service
```

---

## Monitoring & Observability

### Metrics to Track

**Smart Contracts:**
- Total collectibles registered
- Active marketplace listings
- Transaction volume (ETH/ERC20)
- Unique users
- Gas costs per operation

**Backend:**
- Indexer block lag
- Event processing rate
- API response times
- Database size
- RPC call failures

**Frontend:**
- Page load times
- Wallet connection success rate
- Transaction success rate
- User bounce rate

### Logging

**Backend Logs:**
```json
{
  "level": "info",
  "msg": "backfill-chunk",
  "fromBlock": 12345,
  "toBlock": 14345,
  "count": 42
}
```

**Error Tracking:**
- Sentry for frontend errors
- Structured logging in backend
- Alert on indexer lag > 100 blocks

---

## FAQ & Troubleshooting

**Q: Why are events processed in strict order?**
A: To ensure state consistency. A purchase event must come after the listing event.

**Q: What happens if the indexer crashes?**
A: Restart from last processed block. JSONL logs allow full replay.

**Q: Can I change contract logic after deployment?**
A: Yes, contracts are upgradeable via UUPS proxies. Storage layout must be preserved.

**Q: Why SQLite instead of PostgreSQL?**
A: Simplicity for MVP. Upgrade to Postgres for production scale.

**Q: What if user switches network mid-transaction?**
A: Frontend detects via `chainChanged` event and shows network mismatch warning.

**Q: How do I backfill from block 0?**
A: Delete `state.db`, update env, run `npm run backfill`. Auto-find will locate deployment.

---

## Glossary

- **RFID**: Unique identifier for physical collectible
- **Authenticity Hash**: Cryptographic proof of item provenance
- **Registry**: Smart contract coordinating ownership records
- **Indexer**: Backend service syncing blockchain to database
- **JSONL**: JSON Lines format (one JSON object per line)
- **UUPS**: Universal Upgradeable Proxy Standard
- **Aurora**: EVM-compatible chain on NEAR Protocol
- **Loyalty Points**: Reward system for minting/redeeming

---

## Summary

This architecture provides:
1. ✅ Robust on-chain ownership via upgradeable contracts
2. ✅ Efficient event-driven indexing with audit trails
3. ✅ Clean separation of concerns (3-tier architecture)
4. ✅ Multi-wallet support (MetaMask + NEAR)
5. ✅ Chain-agnostic design (Arbitrum → Aurora migration ready)
6. ✅ Developer-friendly (hot reload, TypeScript, modern tooling)

Ready for Aurora deployment and NEAR wallet integration. The system is designed to scale from MVP to production while maintaining data integrity and user experience quality.