// src/eth/abis.ts

// Registry functions we call
export const REGISTRY_ABI = [
    // registerCollectible(string rfid, bytes32 authenticityHash, address initialOwner, string tokenURI)
    "function registerCollectible(string rfid, bytes32 authenticityHash, address initialOwner, string tokenURI)",

    // transferCollectibleOwnership(string rfid, address newOwner)
    "function transferCollectibleOwnership(string rfid, address newOwner)",

    // redeemCollectible(string rfid)
    "function redeemCollectible(string rfid)",
];

// NFT (CollectibleNFTV1) ABI
export const NFT_ABI = [
    // ---- ERC721 standard ----
    "function approve(address to, uint256 tokenId)",
    "function getApproved(uint256 tokenId) view returns (address)",
    "function ownerOf(uint256 tokenId) view returns (address)",

    // ---- Metadata ----
    "function tokenURI(uint256 tokenId) view returns (string)",

    // ---- Loyalty / points ----
    "function getPoints(address user) view returns (uint256)",
    "function loyaltyPoints(address user) view returns (uint256)",
    "function getTier(address user) view returns (string)",

    // ---- Thresholds (future-proof for progress UI) ----
    "function silverThreshold() view returns (uint256)",
    "function goldThreshold() view returns (uint256)",

    // ---- Events (needed for live updates) ----
    "event PointsAdded(address indexed user, uint256 points)",
    "event AdminSetPoints(address indexed user, uint256 points)",
    "event TierThresholdsUpdated(uint256 silver, uint256 gold)",
];

// Marketplace functions we'll call
export const MARKET_ABI = [
    // listCollectible(address nft, uint256 tokenId, uint256 price)
    "function listCollectible(address nft, uint256 tokenId, uint256 price)",

    // cancelListing(address nft, uint256 tokenId)
    "function cancelListing(address nft, uint256 tokenId)",

    // amendListing(address nft, uint256 tokenId, uint256 newPrice)
    "function amendListing(address nft, uint256 tokenId, uint256 newPrice)",

    // purchaseCollectible(address nft, uint256 tokenId, uint256 maxPrice) - with front-running protection
    "function purchaseCollectible(address nft, uint256 tokenId, uint256 maxPrice)",
];

// Minimal ERC20 ABI for USDC (or your mock USDC)
export const USDC_ERC20_ABI = [
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
];