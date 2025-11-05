// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {USDC6Mock} from "./mocks/USDC6Mock.sol";
import {CollectibleRegistryV1} from "../src/collectiblesRegistryV1.sol";
import {CollectibleNFTV1}      from "../src/collectiblesNFTV1.sol";
import {CollectibleMarketV1}   from "../src/collectiblesMarketV1.sol";

import {
    ITransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

abstract contract Collectibles_Base is Test {
    // —— Actors
    address internal deployer     = makeAddr("deployer");
    address internal seller       = makeAddr("seller");
    address internal buyer        = makeAddr("buyer");
    address internal feeRecipient = makeAddr("feeRecipient");

    // —— System (proxies)
    ProxyAdmin            internal proxyAdmin;
    CollectibleRegistryV1 internal registry;
    CollectibleNFTV1      internal nft;
    CollectibleMarketV1   internal market;
    USDC6Mock             internal usdc;

    // —— Proxy addresses (handy in child tests if needed)
    address internal regProxyAddr;
    address internal nftProxyAddr;
    address internal mktProxyAddr;

    // —— Config
    uint16  internal feeBps   = 250; // 2.5%
    uint256 internal tokenId;
    string  internal seedRfid;
    bytes32 internal rfidHash;

    // Deploy a TransparentUpgradeableProxy with init data and admin
    function _deployProxy(address impl, bytes memory initData, address admin)
        internal
        returns (address)
    {
        return address(new TransparentUpgradeableProxy(impl, admin, initData));
    }

    // Optional: simulate an upgrade in derived tests
    function _upgrade(address payable proxy, address newImpl, bytes memory initData) internal {
        vm.prank(deployer);
        proxyAdmin.upgradeAndCall(ITransparentUpgradeableProxy(proxy), newImpl, initData);
    }

    function setUp() public virtual {
        vm.startPrank(deployer);

        // 1) External deps
        usdc = new USDC6Mock();
        proxyAdmin = new ProxyAdmin(deployer);

        // 2) Deploy logic contracts
        address regImpl = address(new CollectibleRegistryV1());
        address nftImpl = address(new CollectibleNFTV1());
        address mktImpl = address(new CollectibleMarketV1());

        // 3) Proxies + initialize
        // Registry.initialize()  — no args
        regProxyAddr = _deployProxy(
            regImpl,
            abi.encodeCall(CollectibleRegistryV1.initialize, ()),
            address(proxyAdmin)
        );
        registry = CollectibleRegistryV1(regProxyAddr);

        // NFT.initialize(name, symbol)
        nftProxyAddr = _deployProxy(
            nftImpl,
            abi.encodeCall(CollectibleNFTV1.initialize, ("Collectible", "COLL")),
            address(proxyAdmin)
        );
        nft = CollectibleNFTV1(nftProxyAddr);

        // Market.initialize(paymentToken, owner)
        // If your signature differs, adjust the tuple accordingly.
        mktProxyAddr = _deployProxy(
            mktImpl,
            abi.encodeCall(CollectibleMarketV1.initialize, (address(usdc), deployer)),
            address(proxyAdmin)
        );
        market = CollectibleMarketV1(mktProxyAddr);

        // 4) Post-init wiring
        nft.setRegistry(regProxyAddr);
        nft.setMarketplace(mktProxyAddr);
        market.setFeeConfig(feeRecipient, feeBps);
        registry.setContractNFT(nftProxyAddr);
        registry.setMarketplaceAddress(mktProxyAddr);

        // 5) Labels (nice traces)
        vm.label(address(proxyAdmin), "ProxyAdmin");
        vm.label(regProxyAddr, "Registry(Proxy)");
        vm.label(nftProxyAddr, "NFT(Proxy)");
        vm.label(mktProxyAddr, "Market(Proxy)");
        vm.label(address(usdc), "USDC");

        vm.stopPrank();

        // 6) Common test seed: register + mint one NFT to seller via Registry (admin = deployer)
        seedRfid = "RFID-DEMO-0001";
        string memory seedUri = "ipfs://demo-token-uri-0001";
        bytes32 seedAuth = keccak256("auth-demo-0001");

        vm.prank(deployer); // Registry onlyAdmin
        registry.registerCollectible(seedRfid, seedAuth, seller, seedUri);

        // Resolve the tokenId from NFT by RFID
        tokenId = CollectibleNFTV1(nftProxyAddr).getTokenIdByRFID(seedRfid);
        rfidHash = keccak256(bytes(seedRfid));
    }
}
