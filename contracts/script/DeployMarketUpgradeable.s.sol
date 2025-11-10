// pragma solidity ^0.8.22;

// import "forge-std/Script.sol";
// import "forge-std/console2.sol";

// // OZ transparent proxy stack (local paths from lib/)
// import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
// import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

// // Your logic
// import {CollectibleMarketV1} from "../src/collectiblesMarketV1.sol";

// contract DeployNFTUpgradeable is Script {
//     function run() external {
//         address owner = vm.envAddress("DEV_WALLET1");

//         vm.startBroadcast(owner);

//         // 1) Deploy logic
//         CollectibleMarketV1 impl = new CollectibleMarketV1();
//         console2.log("regImpl:", address(impl));

//         // 2) Deploy ProxyAdmin (owned by `owner`)
//         ProxyAdmin admin = new ProxyAdmin(owner);
//         console2.log("proxyAdmin:", address(admin));

//         // 3) Build init calldata and deploy proxy
//         bytes memory init = abi.encodeWithSignature("initialize()");
//         TransparentUpgradeableProxy proxy =
//             new TransparentUpgradeableProxy(address(impl), address(admin), init);

//         console2.log("REGISTRY_PROXY:", address(proxy));

//         vm.stopBroadcast();
//     }
// }
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

// OZ transparent proxy stack
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

// Your logic
import {CollectibleMarketV1} from "../src/collectiblesMarketV1.sol";

contract DeployMarketUpgradeable is Script {
    function run() external {
        address owner = vm.envAddress("DEV_WALLET1");
        // Market.initialize(address _paymentToken, address _feeRecipient)
        address usdc  = vm.envOr("COLLECTIBLE_USDC6MOCK_ADDRESS", address(0));
        require(usdc != address(0), "COLLECTIBLE_USDC6MOCK_ADDRESS not set");

        vm.startBroadcast(owner);

        // 1) Deploy logic
        CollectibleMarketV1 impl = new CollectibleMarketV1();
        console2.log("mktImpl:", address(impl));

        // 2) Deploy ProxyAdmin (owned by `owner`)
        ProxyAdmin admin = new ProxyAdmin(owner);
        console2.log("proxyAdmin:", address(admin));

        // 3) Build init calldata and deploy proxy
        // initialize(address paymentToken, address feeRecipient)
        bytes memory init = abi.encodeWithSignature(
            "initialize(address,address)",
            usdc,
            owner
        );

        TransparentUpgradeableProxy proxy =
            new TransparentUpgradeableProxy(address(impl), address(admin), init);

        console2.log("MARKET_PROXY:", address(proxy));

        vm.stopBroadcast();
    }
}
