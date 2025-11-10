// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

contract WireCollectibles is Script {
    // --- env helpers ---
    function _envAddress(string memory key) internal view returns (address) {
        return vm.envAddress(key);
    }

    function _envUintOr(string memory key, uint256 defval) internal view returns (uint256) {
        return vm.envOr(key, defval);
    }

    // best-effort call: returns true if succeeded
    function _try(address target, bytes memory data, string memory label) internal returns (bool ok) {
        (ok, ) = target.call(data);
        console2.log(
            ok
                ? string.concat("OK: ", label)
                : string.concat("SKIP: ", label, " (no func / not owner / reverted)")
        );
    }

    function run() external {
        // --- required addresses from .env ---
        address registry = _envAddress("COLLECTIBLE_REGISTRY_ADDRESS");
        address nft      = _envAddress("COLLECTIBLE_NFT_ADDRESS");
        address market   = _envAddress("COLLECTIBLE_MARKET_ADDRESS");

        // --- fee config for Market (optional override of default 200 bps) ---
        address feeTo  = _envAddress("DEV_WALLET1");
        uint256 feeBps = _envUintOr("MARKET_FEE_BPS", 250); // e.g. 2.5%

        vm.startBroadcast();

        // ---- Registry wiring ----
        _try(registry, abi.encodeWithSignature("setContractNFT(address)", nft), "registry.setContractNFT(nft)");
        _try(registry, abi.encodeWithSignature("setMarketplaceAddress(address)", market), "registry.setMarketplaceAddress(market)");

        // ---- NFT wiring ----
        _try(nft, abi.encodeWithSignature("setRegistry(address)", registry), "nft.setRegistry(registry)");
        _try(nft, abi.encodeWithSignature("setMarketplace(address)", market), "nft.setMarketplace(market)");

        // ---- Market wiring ----
        // MarketV1 has no setRegistry / setNFT / setPaymentToken; payment token was set in initialize.
        // You CAN update fees post-deploy:
        _try(market, abi.encodeWithSignature("setFeeConfig(address,uint256)", feeTo, feeBps), "market.setFeeConfig(addr,uint256)");

        vm.stopBroadcast();

        console2.log("--- Wiring Summary ---");
        console2.log("REGISTRY:", registry);
        console2.log("NFT     :", nft);
        console2.log("MARKET  :", market);
        console2.log("FEE_TO  :", feeTo);
        console2.log("FEE_BPS :", feeBps);
    }
}
