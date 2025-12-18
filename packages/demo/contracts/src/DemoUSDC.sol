// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solady/tokens/ERC20.sol";

/// @title DemoUSDC
/// @notice Mintable ERC20 token for demo purposes. Anyone can mint.
contract DemoUSDC is ERC20 {
    function name() public pure override returns (string memory) {
        return "Demo USDC";
    }

    function symbol() public pure override returns (string memory) {
        return "USDC_DEMO";
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
