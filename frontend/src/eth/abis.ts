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

// Minimal ERC721 we need for approvals
export const NFT_ABI = [
    // standard ERC721
    "function approve(address to, uint256 tokenId)",
    "function getApproved(uint256 tokenId) view returns (address)",
    "function ownerOf(uint256 tokenId) view returns (address)",
];

// Marketplace functions we’ll call
export const MARKET_ABI = [
    // listCollectible(address nft, uint256 tokenId, uint256 price)
    "function listCollectible(address nft, uint256 tokenId, uint256 price)",
];
