// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Store.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ISaver {
    function save(string calldata sku) external returns (bool);
}

contract Cart is Ownable, ISaver {
    struct Item { uint256 qty; }
    event Added(string sku);

    function add(string memory sku, uint256 qty) public returns (uint256) {
        check(sku);
        uint256 total = helper(qty);
        Store(address(0)).save(sku);
        emit Added(sku);
        return total;
    }

    function check(string memory sku) internal pure returns (bool) { return bytes(sku).length > 0; }
    function helper(uint256 n) private pure returns (uint256) { return n * 2; }
}
