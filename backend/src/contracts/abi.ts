// src/contracts/abi.ts

// --- Registry (CollectibleRegistryV1) ---
export const REGISTRY_ABI = [
    // Config
    "event RegistryConfigured(address indexed nft, address indexed marketplace)",

    // Core
    "event CollectibleRegistered(bytes32 indexed rfidHash, address indexed initialOwner, bytes32 authenticityHash, string rfid)",
    "event CollectibleOwnershipTransferred(bytes32 indexed rfidHash, address indexed oldOwner, address indexed newOwner, string rfid)",
    "event CollectibleRedeemed(bytes32 indexed rfidHash, string rfid)"
] as const;

// --- NFT (CollectibleNFTV1) ---
export const NFT_ABI = [
    // Mint / link / burn
    "event MintedNFT(uint256 indexed tokenId, address indexed owner)",
    "event RFIDLinked(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner, string rfid)",
    "event CollectibleBurned(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner)",

    // Loyalty + config
    "event PointsAdded(address indexed user, uint256 points)",
    "event AdminSetPoints(address indexed user, uint256 points)",
    "event TierThresholdsUpdated(uint256 silver, uint256 gold)",
    "event MarketplaceSet(address indexed marketplace)",
    "event RegistrySet(address indexed registry)"
] as const;

// --- Market (CollectibleMarketV1) ---
export const MARKET_ABI = [
    // Config
    "event PaymentTokenSet(address indexed paymentToken)",
    "event FeeConfigUpdated(address indexed feeRecipient, uint256 feeBps)",

    // Listings
    "event CollectibleListed(address indexed nft, uint256 indexed tokenId, address indexed seller, uint256 price)",
    "event CollectibleCanceled(address indexed nft, uint256 indexed tokenId)",
    "event CollectiblePriceUpdated(address indexed nft, uint256 indexed tokenId, uint256 newPrice)",
    // Note: seller is indexed; buyer is NOT indexed here; matches your contract
    "event CollectiblePurchased(address indexed nft, uint256 indexed tokenId, address indexed seller, address buyer, uint256 price)",

    // Pausable (from OZ)
    "event Paused(address account)",
    "event Unpaused(address account)"
] as const;
