// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solady/tokens/ERC20.sol";

/// @title DemoOP
/// @notice Mintable ERC20 token for demo purposes. Anyone can mint.
///         Used as collateral in the demo Morpho market.
contract DemoOP is ERC20 {
    function name() public pure override returns (string memory) {
        return "Demo OP";
    }

    function symbol() public pure override returns (string memory) {
        return "OP_DEMO";
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
