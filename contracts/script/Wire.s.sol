// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

contract WireCollectibles is Script {
    // --- env helpers ---
    function _envAddress(string memory key) internal view returns (address) {
        return vm.envAddress(key);
    }

    function _envAddressOrZero(string memory key) internal view returns (address) {
        // read as bytes32 to allow "unset" without revert
        bytes32 raw = vm.envOr(key, bytes32(0));
        return address(uint160(uint256(raw)));
    }

    function _envUintOr(string memory key, uint256 defval) internal view returns (uint256) {
        return vm.envOr(key, defval);
    }

    // best-effort call: returns true if succeeded
    function _try(address target, bytes memory data, string memory label) internal returns (bool ok) {
        (ok, ) = target.call(data);
        console2.log(ok ? string.concat("OK: ", label) : string.concat("SKIP: ", label, " (no func / not owner / reverted)"));
    }

    function run() external {
        // --- required (taken from your .env; the later Arbitrum values override Aurora) ---
        address registry = _envAddress("COLLECTIBLE_REGISTRY_ADDRESS");
        address nft      = _envAddress("COLLECTIBLE_NFT_ADDRESS");
        address market   = _envAddress("COLLECTIBLE_MARKET_ADDRESS");

        // --- payment token ---
        address usdc = _envAddressOrZero("COLLECTIBLE_USDC6MOCK_ADDRESS");
        
        // fee config
        address feeTo  = _envAddress("DEV_WALLET1");
        uint256 feeBps = _envUintOr("MARKET_FEE_BPS", 250);

        vm.startBroadcast();

        // ---- Registry wiring ----
        _try(registry, abi.encodeWithSignature("setContractNFT(address)", nft), "registry.setContractNFT(nft)");
        _try(registry, abi.encodeWithSignature("setMarketplaceAddress(address)", market), "registry.setMarketplaceAddress(market)");

        // ---- NFT wiring ----
        _try(nft, abi.encodeWithSignature("setRegistry(address)", registry), "nft.setRegistry(registry)");

        // ---- Market wiring ----
        _try(market, abi.encodeWithSignature("setRegistry(address)", registry), "market.setRegistry(registry)");
        _try(market, abi.encodeWithSignature("setNFT(address)", nft), "market.setNFT(nft)");
        if (usdc != address(0)) {
            _try(market, abi.encodeWithSignature("setPaymentToken(address)", usdc), "market.setPaymentToken(USDC)");
        } else {
            console2.log("SKIP: market.setPaymentToken - no USDC address provided");
        }
        _try(market, abi.encodeWithSignature("setFeeConfig(address,uint256)", feeTo, feeBps), "market.setFeeConfig(addr,uint256)");

        vm.stopBroadcast();

        console2.log("--- Wiring Summary ---");
        console2.log("REGISTRY:", registry);
        console2.log("NFT     :", nft);
        console2.log("MARKET  :", market);
        console2.log("USDC    :", usdc);
        console2.log("FEE_TO  :", feeTo);
        console2.log("FEE_BPS :", feeBps);
    }
}
