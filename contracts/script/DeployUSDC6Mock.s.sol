// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../test/mocks/USDC6Mock.sol";

contract DeployUSDC6Mock is Script {
    function run() external {
        address recipient = vm.envAddress("DEV_WALLET1"); // who gets the initial mint
        uint256 amount = vm.envOr("USDC_MINT", uint256(1_000_000e6)); // 1,000,000 USDC (6 dp)

        vm.startBroadcast();
        USDC6Mock usdc = new USDC6Mock();
        usdc.mint(recipient, amount);
        vm.stopBroadcast();

        console2.log("USDC6Mock deployed at:", address(usdc));
        console2.log("Minted", amount, "to", recipient);
    }
}
