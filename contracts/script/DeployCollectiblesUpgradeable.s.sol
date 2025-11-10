// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

// Logic contracts
import "../src/collectiblesRegistryV1.sol";
import "../src/collectiblesNFTV1.sol";
import "../src/collectiblesMarketV1.sol";

contract DeployCollectiblesUpgradeable is Script {
    function run() external {
        // --- env ---
        address owner  = vm.envAddress("DEV_WALLET1");              // will be msg.sender for all initialize() calls
        address feeTo  = owner;                                      // or vm.envAddress("DEV_WALLET1")
        uint256 feeBps = vm.envOr("MARKET_FEE_BPS", uint256(250));   // you want 2.5%
        address usdc   = vm.envOr("COLLECTIBLE_USDC6MOCK_ADDRESS", address(0));

        vm.startBroadcast(owner);

        // 1) Deploy logic contracts
        CollectibleRegistryV1 regImpl = new CollectibleRegistryV1();
        CollectibleNFTV1      nftImpl = new CollectibleNFTV1();
        CollectibleMarketV1   mktImpl = new CollectibleMarketV1();

        console2.log("regImpl:", address(regImpl));
        console2.log("nftImpl:", address(nftImpl));
        console2.log("mktImpl:", address(mktImpl));

        // 2) Deploy ProxyAdmin owned by `owner`
        ProxyAdmin proxyAdmin = new ProxyAdmin(owner);
        console2.log("proxyAdmin:", address(proxyAdmin));

        // 3) Initializer calldata (matches your code exactly)
        // Registry: initialize()
        bytes memory regInit = abi.encodeWithSignature("initialize()");

        // NFT: initialize(string,string)
        bytes memory nftInit = abi.encodeWithSignature(
            "initialize(string,string)",
            "Collectible",
            "COLL"
        );

        // Market: initialize(address paymentToken, address feeRecipient)
        // (feeBps defaults to 200 inside initialize; we will update to `feeBps` afterwards)
        require(usdc != address(0), "COLLECTIBLE_USDC6MOCK_ADDRESS not set");
        bytes memory mktInit = abi.encodeWithSignature(
            "initialize(address,address)",
            usdc,
            feeTo
        );

        // 4) Deploy proxies with init data (owner set to msg.sender via initialize())
        TransparentUpgradeableProxy regProxy =
            new TransparentUpgradeableProxy(address(regImpl), address(proxyAdmin), regInit);
        TransparentUpgradeableProxy nftProxy =
            new TransparentUpgradeableProxy(address(nftImpl), address(proxyAdmin), nftInit);
        TransparentUpgradeableProxy mktProxy =
            new TransparentUpgradeableProxy(address(mktImpl), address(proxyAdmin), mktInit);

        address registry = address(regProxy);
        address nft      = address(nftProxy);
        address market   = address(mktProxy);

        console2.log("--- Deployed ---");
        console2.log("REGISTRY:", registry);
        console2.log("NFT     :", nft);
        console2.log("MARKET  :", market);

        // 5) Post-init wiring
        // Registry events/fields per your ABI:
        // - setContractNFT(address)
        // - setMarketplaceAddress(address)
        (bool ok1,) = registry.call(abi.encodeWithSignature("setContractNFT(address)", nft));
        console2.log(ok1 ? "OK: registry.setContractNFT(nft)" : "SKIP: registry.setContractNFT(nft)");

        (bool ok2,) = registry.call(abi.encodeWithSignature("setMarketplaceAddress(address)", market));
        console2.log(ok2 ? "OK: registry.setMarketplaceAddress(market)" : "SKIP: registry.setMarketplaceAddress(market)");

        // NFT: setRegistry(address)
        (bool ok3,) = nft.call(abi.encodeWithSignature("setRegistry(address)", registry));
        console2.log(ok3 ? "OK: nft.setRegistry(registry)" : "SKIP: nft.setRegistry(registry)");

        // Market has no registry/nft fields in your snippet, so we don't call setRegistry/setNFT here.
        // If you later add those to the market, add calls similar to above.

        // Market: update feeBps from 200 default to desired `feeBps` (if your ABI has setFeeConfig)
        // You showed setFeeConfig(address,uint256) in your wiring script; use that.
        (bool ok4,) = market.call(abi.encodeWithSignature("setFeeConfig(address,uint256)", feeTo, feeBps));
        console2.log(ok4 ? "OK: market.setFeeConfig(feeTo,feeBps)" : "SKIP: market.setFeeConfig");

        vm.stopBroadcast();
    }
}
