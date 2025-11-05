// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface ICollectibleMarket {
    function isListed(address nftAddress, uint256 tokenId) external view returns (bool);
}