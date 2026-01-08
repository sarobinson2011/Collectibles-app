// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin-upgradeable/contracts/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin-upgradeable/contracts/utils/PausableUpgradeable.sol";
import "@openzeppelin-upgradeable/contracts/access/OwnableUpgradeable.sol";
import "@openzeppelin-upgradeable/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/// @title CollectibleMarketV1 (improved with payment token setter and emergency functions)
/// @notice Simple fixed-price marketplace with ERC20 payments and fee, plus helpful views and pause
contract CollectibleMarketV1 is Initializable, ReentrancyGuardUpgradeable, PausableUpgradeable, OwnableUpgradeable {
    struct Listing {
        address seller;
        uint256 price;
        bool isListed;
    }

    // NFT address => tokenId => Listing
    mapping(address => mapping(uint256 => Listing)) public listings;

    // Payment and fee config
    IERC20 public paymentToken;
    address public feeRecipient;
    uint256 public feeBps;
    uint256 public constant MAX_BPS = 10000;

    // =========================
    // Events (indexing-friendly)
    // =========================
    event PaymentTokenSet(address indexed paymentToken);
    event FeeConfigUpdated(address indexed feeRecipient, uint256 feeBps);
    event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount);

    event CollectibleListed(address indexed nft, uint256 indexed tokenId, address indexed seller, uint256 price);
    event CollectibleCanceled(address indexed nft, uint256 indexed tokenId);
    event CollectiblePriceUpdated(address indexed nft, uint256 indexed tokenId, uint256 newPrice);
    /// @dev We index seller (not buyer) to align with listing flows; switch if your queries prefer buyer
    event CollectiblePurchased(address indexed nft, uint256 indexed tokenId, address indexed seller, address buyer, uint256 price);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _paymentToken, address _feeRecipient) public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();
        __Ownable_init(msg.sender);

        require(_paymentToken != address(0), "Invalid payment token");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        paymentToken = IERC20(_paymentToken);
        feeRecipient = _feeRecipient;
        feeBps = 200; // default 2%

        emit PaymentTokenSet(_paymentToken);
        emit FeeConfigUpdated(_feeRecipient, feeBps);
    }

    // =====================
    // Admin configuration
    // =====================

    /// @notice Update the payment token (critical for multi-network deployments)
    function setPaymentToken(address _paymentToken) external onlyOwner {
        require(_paymentToken != address(0), "Invalid payment token");
        paymentToken = IERC20(_paymentToken);
        emit PaymentTokenSet(_paymentToken);
    }

    /// @notice Update fee configuration
    function setFeeConfig(address _feeRecipient, uint256 _feeBps) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        require(_feeBps <= MAX_BPS, "Fee too high");

        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
        emit FeeConfigUpdated(_feeRecipient, _feeBps);
    }

    /// @notice Emergency token recovery (in case tokens get stuck)
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(IERC20(token).transfer(owner(), amount), "Transfer failed");
        emit EmergencyWithdrawal(token, owner(), amount);
    }

    // Pausable controls (OZ emits Paused(address)/Unpaused(address))
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // =====================
    // Marketplace functions
    // =====================

    function listCollectible(address nft, uint256 tokenId, uint256 price) external whenNotPaused nonReentrant {
        require(price > 0, "Price must be greater than zero");

        IERC721 erc721 = IERC721(nft);
        address owner = erc721.ownerOf(tokenId);
        require(msg.sender == owner, "Only the owner can list");
        require(
            erc721.getApproved(tokenId) == address(this) || erc721.isApprovedForAll(owner, address(this)),
            "Marketplace not approved"
        );
        require(!listings[nft][tokenId].isListed, "Already listed");

        listings[nft][tokenId] = Listing({ seller: msg.sender, price: price, isListed: true });
        emit CollectibleListed(nft, tokenId, msg.sender, price);
    }

    /// @dev Allow cancel even when paused (lets sellers unlock items during emergencies)
    function cancelListing(address nft, uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[nft][tokenId];
        require(listing.isListed, "Not listed");
        require(listing.seller == msg.sender, "Only seller can cancel");

        listing.isListed = false;
        emit CollectibleCanceled(nft, tokenId);
    }

    function amendListing(address nft, uint256 tokenId, uint256 newPrice) external whenNotPaused nonReentrant {
        Listing storage listing = listings[nft][tokenId];
        require(listing.isListed, "Not listed");
        require(listing.seller == msg.sender, "Only seller can amend");
        require(newPrice > 0, "Invalid price");

        listing.price = newPrice;
        emit CollectiblePriceUpdated(nft, tokenId, newPrice);
    }

    /// @notice Purchase a listed collectible with front-running protection
    /// @param maxPrice Maximum price buyer is willing to pay (protects against seller raising price)
    function purchaseCollectible(address nft, uint256 tokenId, uint256 maxPrice) external whenNotPaused nonReentrant {
        Listing storage listing = listings[nft][tokenId];
        require(listing.isListed, "Not listed");

        uint256 price = listing.price;
        require(price <= maxPrice, "Price increased beyond max");
        
        address seller = listing.seller;

        // Ensure the listed seller still owns the token
        require(IERC721(nft).ownerOf(tokenId) == seller, "Owner changed");

        uint256 feeAmount = (price * feeBps) / MAX_BPS;
        uint256 sellerAmount = price - feeAmount;

        require(paymentToken.balanceOf(msg.sender) >= price, "Insufficient balance");
        require(paymentToken.allowance(msg.sender, address(this)) >= price, "Insufficient allowance");

        // Delist BEFORE transfers (CEI pattern - prevents reentrancy)
        listing.isListed = false;

        // Pull funds; entire tx reverts if anything below fails (atomic)
        require(paymentToken.transferFrom(msg.sender, feeRecipient, feeAmount), "Fee transfer failed");
        require(paymentToken.transferFrom(msg.sender, seller, sellerAmount), "Seller payment failed");

        // Move the NFT
        IERC721(nft).safeTransferFrom(seller, msg.sender, tokenId);

        emit CollectiblePurchased(nft, tokenId, seller, msg.sender, price);
    }

    /// @notice Backward compatibility: purchase without maxPrice check
    function purchaseCollectible(address nft, uint256 tokenId) external whenNotPaused nonReentrant {
        Listing storage listing = listings[nft][tokenId];
        require(listing.isListed, "Not listed");

        uint256 price = listing.price;
        address seller = listing.seller;

        // Ensure the listed seller still owns the token
        require(IERC721(nft).ownerOf(tokenId) == seller, "Owner changed");

        uint256 feeAmount = (price * feeBps) / MAX_BPS;
        uint256 sellerAmount = price - feeAmount;

        require(paymentToken.balanceOf(msg.sender) >= price, "Insufficient balance");
        require(paymentToken.allowance(msg.sender, address(this)) >= price, "Insufficient allowance");

        // Delist BEFORE transfers (CEI pattern)
        listing.isListed = false;

        // Pull funds; entire tx reverts if anything below fails (atomic)
        require(paymentToken.transferFrom(msg.sender, feeRecipient, feeAmount), "Fee transfer failed");
        require(paymentToken.transferFrom(msg.sender, seller, sellerAmount), "Seller payment failed");

        // Move the NFT
        IERC721(nft).safeTransferFrom(seller, msg.sender, tokenId);

        emit CollectiblePurchased(nft, tokenId, seller, msg.sender, price);
    }

    // =====================
    // View functions
    // =====================

    function isListed(address nft, uint256 tokenId) external view returns (bool) {
        return listings[nft][tokenId].isListed;
    }

    /// @notice Convenience view for UIs / indexers
    function getListing(address nft, uint256 tokenId)
        external
        view
        returns (address seller, uint256 price, bool listed)
    {
        Listing memory l = listings[nft][tokenId];
        return (l.seller, l.price, l.isListed);
    }

    // ---- storage gap for future upgrades ----
    uint256[48] private __gap;
}
