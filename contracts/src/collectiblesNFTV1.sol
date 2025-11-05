// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin-upgradeable/contracts/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin-upgradeable/contracts/access/OwnableUpgradeable.sol";
import {ICollectibleMarket} from "./interfaces/ICollectibleMarket.sol";

/// @title CollectibleNFTV1
/// @notice Upgradeable ERC721 with loyalty points and transfer guard while listed on the marketplace
contract CollectibleNFTV1 is Initializable, ERC721URIStorageUpgradeable, OwnableUpgradeable {
    // v1 storage
    uint256 private _nextTokenId;
    address public registryContract;
    address public marketplaceAddress;

    // Use bytes32(rfid) for cheaper storage; keep string only for events/inputs
    mapping(bytes32 => uint256) private rfidHashToTokenId;

    // Loyalty system
    mapping(address => uint256) public loyaltyPoints;
    uint256 public bronzeThreshold; // kept for completeness; default 0
    uint256 public silverThreshold;
    uint256 public goldThreshold;

    // =========================
    // Events (indexing-friendly)
    // =========================
    /// Mint (convenience alongside standard Transfer)
    event MintedNFT(uint256 indexed tokenId, address indexed owner);

    /// Link human-readable RFID to on-chain tokenId (primary join for indexers)
    event RFIDLinked(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner, string rfid);

    /// Explicit burn paired with RFID
    event CollectibleBurned(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner);

    /// Loyalty events
    event PointsAdded(address indexed user, uint256 points);
    event AdminSetPoints(address indexed user, uint256 points);
    event TierThresholdsUpdated(uint256 silver, uint256 gold);

    /// Config events
    event MarketplaceSet(address indexed marketplace);
    event RegistrySet(address indexed registry);

    modifier onlyAuthorised() {
        require(msg.sender == registryContract || msg.sender == owner(), "Not authorised");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory _name, string memory _symbol) public initializer {
        __ERC721_init(_name, _symbol);
        __ERC721URIStorage_init();
        __Ownable_init(msg.sender);
        _nextTokenId = 1;

        bronzeThreshold = 0;
        silverThreshold = 1000;
        goldThreshold = 5000;
    }

    function setRegistry(address _registryContract) external onlyOwner {
        registryContract = _registryContract;
        emit RegistrySet(_registryContract);
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplaceAddress = _marketplace;
        emit MarketplaceSet(_marketplace);
    }

    function setTierThresholds(uint256 _silver, uint256 _gold) external onlyOwner {
        silverThreshold = _silver;
        goldThreshold = _gold;
        emit TierThresholdsUpdated(_silver, _gold);
    }

    function getTier(address user) external view returns (string memory) {
        uint256 points = loyaltyPoints[user];
        if (points >= goldThreshold) {
            return "Gold";
        } else if (points >= silverThreshold) {
            return "Silver";
        } else {
            return "Bronze";
        }
    }

    function mintNFT(address recipient, string memory tokenURI, string memory rfid)
        external
        onlyAuthorised
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, tokenURI);

        bytes32 rfidHash = keccak256(bytes(rfid));
        rfidHashToTokenId[rfidHash] = tokenId;

        // Events for indexers
        emit MintedNFT(tokenId, recipient);
        emit RFIDLinked(rfidHash, tokenId, recipient, rfid);

        addPoints(recipient, 100); // reward points for minting

        return tokenId;
    }

    function getTokenIdByRFID(string memory rfid) external view returns (uint256) {
        return rfidHashToTokenId[keccak256(bytes(rfid))];
    }

    function getTokenIdByRFIDHash(bytes32 rfidHash) external view returns (uint256) {
        return rfidHashToTokenId[rfidHash];
    }

    function burn(uint256 tokenId, string memory rfid) external onlyAuthorised {
        address owner_ = ownerOf(tokenId);

        // Keep mapping tidy
        bytes32 rfidHash = keccak256(bytes(rfid));
        if (rfidHashToTokenId[rfidHash] == tokenId) {
            delete rfidHashToTokenId[rfidHash];
        }

        _burn(tokenId);

        // Events for indexers (explicit burn paired with RFID)
        emit CollectibleBurned(rfidHash, tokenId, owner_);

        addPoints(owner_, 150); // reward points for redeeming
    }

    function addPoints(address user, uint256 points) internal {
        loyaltyPoints[user] += points;
        emit PointsAdded(user, points);
    }

    function getPoints(address user) external view returns (uint256) {
        return loyaltyPoints[user];
    }

    function adminSetPoints(address user, uint256 points) external onlyAuthorised {
        loyaltyPoints[user] = points;
        emit AdminSetPoints(user, points);
    }

    /// @dev In OZ v5, _update is the central hook for transfers/mints/burns.
    /// We block transfers while listed, except when initiated by the marketplace itself.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        if (marketplaceAddress != address(0) && auth != marketplaceAddress) {
            bool listed = ICollectibleMarket(marketplaceAddress).isListed(address(this), tokenId);
            require(!listed, "Collectible is listed: transfer blocked");
        }
        return super._update(to, tokenId, auth);
    }

    // ---- storage gap for future upgrades ----
    uint256[45] private __gap; // adjusted for new vars
}
