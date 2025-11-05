// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {Collectibles_Base} from "./collectibles_Base.t.sol";

contract Collectibles_Flow is Collectibles_Base {
    // USDC-style units (your Base uses a 6-decimal mock)
    uint256 internal price = 1_000e6; // 1,000 USDC

    function _isContract(address a) internal view returns (bool) {
        return a.code.length > 0;
    }

    function test_FullFlow_RegisterViaRegistry_List_Buy_Redeem() public {
        // Sanity
        assertTrue(_isContract(mktProxyAddr), "market proxy has no code");
        assertEq(nft.marketplaceAddress(), mktProxyAddr, "NFT.marketplace not proxy");

        // Seed was registered & minted in Base: tokenId belongs to seller, RFID recorded.

        // Seller approves market & lists
        vm.startPrank(seller);
        nft.approve(mktProxyAddr, tokenId);
        market.listCollectible(address(nft), tokenId, price);
        vm.stopPrank();

        // Buyer gets funds and approves exactly 'price' (buyer pays 'price'; fee is taken from price)
        vm.prank(deployer);
        usdc.mint(buyer, 2_000e6);

        uint16 usedFeeBps = feeBps;
        uint256 fee = (price * usedFeeBps) / 10_000;
        uint256 sellerAmount = price - fee;

        uint256 buyerBefore = usdc.balanceOf(buyer);
        assertEq(buyerBefore, 2_000e6, "buyerBefore != 2,000e6");

        vm.startPrank(buyer);
        usdc.approve(mktProxyAddr, price);
        market.purchaseCollectible(address(nft), tokenId);
        vm.stopPrank();

        // Balances & ownership
        assertEq(usdc.balanceOf(buyer), 2_000e6 - price, "buyer bal");
        assertEq(usdc.balanceOf(feeRecipient), fee, "feeRecipient bal");
        assertEq(usdc.balanceOf(seller), sellerAmount, "seller proceeds");
        assertEq(nft.ownerOf(tokenId), buyer, "ownership not transferred");

        // Redeem via Registry (only current owner can call)
        vm.prank(buyer);
        registry.redeemCollectible(seedRfid);

        // Token burned
        vm.expectRevert(); // ERC721: invalid token ID
        nft.ownerOf(tokenId);
    }

    function test_Register_Duplicate_Reverts() public {
        // Use a fresh RFID to avoid colliding with Base seed unintentionally
        string memory rfid2 = "RFID-DEMO-DUP-0002";
        string memory uri2  = "ipfs://demo-token-uri-0002";
        bytes32 auth2       = keccak256("auth-demo-0002");

        // First registration succeeds (admin only)
        vm.prank(deployer);
        registry.registerCollectible(rfid2, auth2, seller, uri2);

        // Duplicate should revert
        vm.prank(deployer);
        vm.expectRevert(bytes("RFID already registered"));
        registry.registerCollectible(rfid2, auth2, seller, uri2);
    }

    function test_List_NotOwner_Reverts() public {
        vm.prank(seller);
        nft.approve(mktProxyAddr, tokenId);

        vm.prank(buyer);
        vm.expectRevert();
        market.listCollectible(address(nft), tokenId, price);
    }

    function test_List_ZeroPrice_Reverts() public {
        vm.prank(seller);
        nft.approve(mktProxyAddr, tokenId);

        vm.prank(seller);
        vm.expectRevert();
        market.listCollectible(address(nft), tokenId, 0);
    }

    function test_Purchase_InsufficientAllowance_Reverts() public {
        // List
        vm.startPrank(seller);
        nft.approve(mktProxyAddr, tokenId);
        market.listCollectible(address(nft), tokenId, price);
        vm.stopPrank();

        // Fund buyer exactly price, but under-approve
        vm.prank(deployer);
        usdc.mint(buyer, price);

        vm.prank(buyer);
        usdc.approve(mktProxyAddr, price - 1); // insufficient for price
        vm.expectRevert();
        market.purchaseCollectible(address(nft), tokenId);
    }

    function test_TransferGuard_ListedToken_NonTransferable() public {
        // List
        vm.startPrank(seller);
        nft.approve(mktProxyAddr, tokenId);
        market.listCollectible(address(nft), tokenId, price);

        // Direct transfer should be blocked by _update guard
        vm.expectRevert(bytes("Collectible is listed: transfer blocked"));
        nft.safeTransferFrom(seller, buyer, tokenId);
        vm.stopPrank();
    }

    function test_FeeRounding_SmallValues() public {
        assertTrue(_isContract(mktProxyAddr), "market proxy has no code");

        uint256 tiny = 3; // 3 units (6 decimals)
        vm.startPrank(seller);
        nft.approve(mktProxyAddr, tokenId);
        market.listCollectible(address(nft), tokenId, tiny);
        vm.stopPrank();

        vm.prank(deployer);
        usdc.mint(buyer, 1_000_000);

        uint256 fee = (tiny * feeBps) / 10_000;
        uint256 sellerAmount = tiny - fee;

        vm.startPrank(buyer);
        usdc.approve(mktProxyAddr, tiny); // buyer pays only 'tiny'
        market.purchaseCollectible(address(nft), tokenId);
        vm.stopPrank();

        assertEq(usdc.balanceOf(feeRecipient), fee, "fee rounding mismatch");
        assertEq(usdc.balanceOf(seller), sellerAmount, "seller net proceeds");
    }
}
