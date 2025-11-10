//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

// OZ transparent proxy stack (you can keep @openzeppelin if your remapping is set)
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

// Your logic
import {CollectibleNFTV1} from "../src/collectiblesNFTV1.sol";

contract DeployNFTUpgradeable is Script {
    function run() external {
        address owner = vm.envAddress("DEV_WALLET1");

        // Name/symbol must match what you verify with
        string memory name = "Collectible";
        string memory symbol = "COLL";

        vm.startBroadcast(owner);

        // 1) Deploy logic
        CollectibleNFTV1 impl = new CollectibleNFTV1();
        console2.log("nftImpl:", address(impl));

        // 2) Deploy ProxyAdmin (owned by `owner`)
        ProxyAdmin admin = new ProxyAdmin(owner);
        console2.log("proxyAdmin:", address(admin));

        // 3) Build init calldata and deploy proxy
        // initialize(string,string)
        bytes memory init = abi.encodeWithSignature(
            "initialize(string,string)",
            name,
            symbol
        );

        TransparentUpgradeableProxy proxy =
            new TransparentUpgradeableProxy(address(impl), address(admin), init);

        console2.log("NFT_PROXY:", address(proxy));

        vm.stopBroadcast();
    }
}

