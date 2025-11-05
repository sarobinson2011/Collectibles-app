// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../src/collectiblesRegistryV1.sol";
import "../src/collectiblesNFTV1.sol";
import "../src/collectiblesMarketV1.sol";

// Env expected (via contracts/.env and direnv):
// - DEV_WALLET1           (address) fee recipient / admin
// - USDC_ADDRESS          (address) optional; 0x0 if unset
// - MARKET_FEE_BPS        (uint256) optional; default 250 (2.5%)

contract DeployCollectiblesScript is Script {
    // Return address(var) or zero if missing
    function _envAddressOrZero(string memory key) internal view returns (address) {
        // vm.envAddress reverts if missing; envOr with bytes32 lets us handle absence
        bytes32 raw = vm.envOr(key, bytes32(0));
        return address(uint160(uint256(raw)));
    }

    function _envUintOrDefault(string memory key, uint256 defval) internal view returns (uint256) {
        return vm.envOr(key, defval);
    }

    function _tryCall(address target, bytes memory data, string memory label) internal returns (bool) {
        (bool ok, bytes memory ret) = target.call(data);
        if (ok) {
            console2.log(string.concat("OK: ", label));
        } else {
            // keep output terse but informative
            console2.log(string.concat("SKIP: ", label, " (no func or reverted)"));
            if (ret.length != 0) {
                // Optional: decode Error(string) selector 0x08c379a0 if you want more detail
            }
        }
        return ok;
    }

    function run() external {
        address feeRecipient = vm.envAddress("DEV_WALLET1");
        address usdc         = _envAddressOrZero("USDC_ADDRESS");
        uint256 feeBps       = _envUintOrDefault("MARKET_FEE_BPS", 250); // 2.5%

        vm.startBroadcast();

        // 1) Deploy Registry
        CollectibleRegistryV1 registry = new CollectibleRegistryV1();
        console2.log("CollectibleRegistryV1:", address(registry));

        // 2) Deploy NFT (adjust ctor args here if your actual NFT requires any)
        CollectibleNFTV1 nft = new CollectibleNFTV1();
        console2.log("CollectibleNFTV1     :", address(nft));

        // 3) Deploy Market (adjust ctor args here if needed)
        CollectibleMarketV1 market = new CollectibleMarketV1();
        console2.log("CollectibleMarketV1  :", address(market));

        // --- Optional wiring (best-effort) ---
        // If these functions don't exist in your contracts, they will be skipped gracefully.

        // NFT <- Registry
        _tryCall(address(nft),
            abi.encodeWithSignature("setRegistry(address)", address(registry)),
            "nft.setRegistry(registry)"
        );

        // Market <- Registry
        _tryCall(address(market),
            abi.encodeWithSignature("setRegistry(address)", address(registry)),
            "market.setRegistry(registry)"
        );

        // Market <- NFT
        _tryCall(address(market),
            abi.encodeWithSignature("setNFT(address)", address(nft)),
            "market.setNFT(nft)"
        );

        // Market <- Payment token (USDC) (only if provided)
        if (usdc != address(0)) {
            _tryCall(address(market),
                abi.encodeWithSignature("setPaymentToken(address)", usdc),
                "market.setPaymentToken(USDC)"
            );
        }

        // Fee config: try (address,uint96) then (address,uint256)
        if (!_tryCall(address(market),
            abi.encodeWithSignature("setFeeConfig(address,uint96)", feeRecipient, uint96(feeBps)),
            "market.setFeeConfig(recipient,uint96)"))
        {
            _tryCall(address(market),
                abi.encodeWithSignature("setFeeConfig(address,uint256)", feeRecipient, feeBps),
                "market.setFeeConfig(recipient,uint256)"
            );
        }

        vm.stopBroadcast();

        console2.log("--- Deployed ---");
        console2.log("REGISTRY:", address(registry));
        console2.log("NFT     :", address(nft));
        console2.log("MARKET  :", address(market));
    }
}
