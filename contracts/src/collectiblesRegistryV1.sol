// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin-upgradeable/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin-upgradeable/contracts/access/OwnableUpgradeable.sol";
import "@openzeppelin-upgradeable/contracts/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ICollectibleMarket} from "./interfaces/ICollectibleMarket.sol";
import {ICollectibleNFTV1} from "./interfaces/ICollectibleNFTV1.sol";


/// @title CollectibleRegistryV1 (refactored for indexable events)
/// @notice Registry for authenticity data; ownership is taken from the ERC721 contract (no duplication)
contract CollectibleRegistryV1 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    /// @dev v1 storage layout (registry no longer stores owners)
    struct Collectible {
        bytes32 authenticityHash;
        bool exists;
    }

    address public NFTContract;
    address public marketplaceAddress;
    /// @dev key: keccak256(bytes(rfid))
    mapping(bytes32 => Collectible) public collectibles;

    // =========================
    // Events (indexing-friendly)
    // =========================

    /// @notice Emitted whenever NFT/marketplace addresses are (re)configured
    event RegistryConfigured(address indexed nft, address indexed marketplace);

    /// @notice New collectible registered + authenticity stored (mint happens in NFT)
    /// @dev Index rfidHash + initialOwner for efficient queries; keep human-readable rfid for UX
    event CollectibleRegistered(
        bytes32 indexed rfidHash,
        address indexed initialOwner,
        bytes32 authenticityHash,
        string rfid
    );

    /// @notice Off-market ownership transfer initiated via registry
    event CollectibleOwnershipTransferred(
        bytes32 indexed rfidHash,
        address indexed oldOwner,
        address indexed newOwner,
        string rfid
    );

    /// @notice Collectible redeemed (burned) and removed from registry
    event CollectibleRedeemed(
        bytes32 indexed rfidHash,
        string rfid
    );

    // ================
    // Access modifiers
    // ================

    modifier onlyAdmin() {
        require(msg.sender == owner(), "Not admin");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
    }

    // =====================
    // Admin configuration
    // =====================

    function setContractNFT(address _NFTContract) external onlyAdmin {
        require(_NFTContract != address(0), "Invalid NFT contract");
        NFTContract = _NFTContract;
        emit RegistryConfigured(NFTContract, marketplaceAddress);
    }

    function setMarketplaceAddress(address _marketplaceAddress) external onlyAdmin {
        require(_marketplaceAddress != address(0), "Invalid marketplace address");
        marketplaceAddress = _marketplaceAddress;
        emit RegistryConfigured(NFTContract, marketplaceAddress);
    }

    // =====================
    // Core functionality
    // =====================

    /// @notice Registers authenticity data and mints the NFT to the initial owner
    function registerCollectible(
        string memory rfid,
        bytes32 authenticityHash,
        address initialOwner,
        string memory tokenURI
    ) external onlyAdmin {
        require(NFTContract != address(0), "NFT contract not set");
        bytes32 key = keccak256(bytes(rfid));
        require(!collectibles[key].exists, "RFID already registered");

        collectibles[key] = Collectible({ authenticityHash: authenticityHash, exists: true });

        // Emit indexable registration record (off-chain can join with NFT Minted/Transfer to get tokenId if needed)
        emit CollectibleRegistered(key, initialOwner, authenticityHash, rfid);

        ICollectibleNFTV1(NFTContract).mintNFT(initialOwner, tokenURI, rfid);
    }

    /// @notice Returns (rfid, authenticityHash, currentOwner) using ERC721 as single source of truth
    function getCollectible(string memory rfid)
        external
        view
        returns (string memory, bytes32, address)
    {
        require(NFTContract != address(0), "NFT contract not set");
        bytes32 key = keccak256(bytes(rfid));
        require(collectibles[key].exists, "Collectible not found");

        uint256 tokenId = ICollectibleNFTV1(NFTContract).getTokenIdByRFID(rfid);
        address currentOwner = IERC721(NFTContract).ownerOf(tokenId);
        return (rfid, collectibles[key].authenticityHash, currentOwner);
    }

    /// @notice Owner-initiated transfer; blocked if listed on marketplace
    function transferCollectibleOwnership(string memory rfid, address newOwner) external nonReentrant {
        require(NFTContract != address(0), "NFT contract not set");
        require(marketplaceAddress != address(0), "Marketplace not set");

        uint256 tokenId = ICollectibleNFTV1(NFTContract).getTokenIdByRFID(rfid);
        address oldOwner = IERC721(NFTContract).ownerOf(tokenId);
        require(msg.sender == oldOwner, "Not the owner");
        require(!ICollectibleMarket(marketplaceAddress).isListed(NFTContract, tokenId), "Listed for sale");

        // Perform the transfer (frontend should ensure registry has approval)
        IERC721(NFTContract).safeTransferFrom(oldOwner, newOwner, tokenId);

        // Emit indexable transfer record
        emit CollectibleOwnershipTransferred(keccak256(bytes(rfid)), oldOwner, newOwner, rfid);
    }

    /// @notice Burns the NFT and removes authenticity record; only the current owner can redeem
    function redeemCollectible(string memory rfid) external nonReentrant {
        require(NFTContract != address(0), "NFT contract not set");
        require(marketplaceAddress != address(0), "Marketplace not set");

        bytes32 key = keccak256(bytes(rfid));
        require(collectibles[key].exists, "Collectible does not exist");

        uint256 tokenId = ICollectibleNFTV1(NFTContract).getTokenIdByRFID(rfid);
        address currentOwner = IERC721(NFTContract).ownerOf(tokenId);
        require(msg.sender == currentOwner, "Not the owner");
        require(!ICollectibleMarket(marketplaceAddress).isListed(NFTContract, tokenId), "Listed for sale");

        // Burn first; revert preserves registry state if burn fails
        ICollectibleNFTV1(NFTContract).burn(tokenId, rfid);

        // Remove authenticity record
        delete collectibles[key];

        // Emit indexable redemption record
        emit CollectibleRedeemed(key, rfid);
    }

    // ---- storage gap for future upgrades ----
    uint256[49] private __gap;
}