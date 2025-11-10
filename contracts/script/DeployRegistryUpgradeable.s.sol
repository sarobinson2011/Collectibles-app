// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

// OZ transparent proxy stack (local paths from lib/)
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

// Your logic
import {CollectibleRegistryV1} from "../src/collectiblesRegistryV1.sol";

contract DeployRegistryUpgradeable is Script {
    function run() external {
        address owner = vm.envAddress("DEV_WALLET1");

        vm.startBroadcast(owner);

        // 1) Deploy logic
        CollectibleRegistryV1 impl = new CollectibleRegistryV1();
        console2.log("regImpl:", address(impl));

        // 2) Deploy ProxyAdmin (owned by `owner`)
        ProxyAdmin admin = new ProxyAdmin(owner);
        console2.log("proxyAdmin:", address(admin));

        // 3) Build init calldata and deploy proxy
        bytes memory init = abi.encodeWithSignature("initialize()");
        TransparentUpgradeableProxy proxy =
            new TransparentUpgradeableProxy(address(impl), address(admin), init);

        console2.log("REGISTRY_PROXY:", address(proxy));

        vm.stopBroadcast();
    }
}
