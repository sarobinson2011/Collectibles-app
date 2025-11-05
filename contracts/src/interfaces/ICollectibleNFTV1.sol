// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface ICollectibleNFTV1 {
    function mintNFT(address recipient, string memory tokenURI, string memory rfid) external returns (uint256);
    function getTokenIdByRFID(string memory rfid) external view returns (uint256);
    function burn(uint256 tokenId, string memory rfid) external;
}