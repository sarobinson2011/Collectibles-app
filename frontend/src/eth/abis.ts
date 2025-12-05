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

// Minimal ERC721 we need for approvals + metadata
export const NFT_ABI = [
    // standard ERC721
    "function approve(address to, uint256 tokenId)",
    "function getApproved(uint256 tokenId) view returns (address)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    // metadata
    "function tokenURI(uint256 tokenId) view returns (string)",
];

// Marketplace functions we’ll call
export const MARKET_ABI = [
    // listCollectible(address nft, uint256 tokenId, uint256 price)
    "function listCollectible(address nft, uint256 tokenId, uint256 price)",

    // cancelListing(address nft, uint256 tokenId)
    "function cancelListing(address nft, uint256 tokenId)",

    // amendListing(address nft, uint256 tokenId, uint256 newPrice)
    "function amendListing(address nft, uint256 tokenId, uint256 newPrice)",

    // purchaseCollectible(address nft, uint256 tokenId)
    "function purchaseCollectible(address nft, uint256 tokenId)",
];

// Minimal ERC20 ABI for USDC (or your mock USDC)
export const USDC_ERC20_ABI = [
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
];
