// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// Re-export Uniswap V4 types used by deployment scripts.
// Most types come from the installed v4-periphery dependency.
// This file provides a minimal IAllowanceTransfer subset for Permit2
// approval without pulling the full Permit2 interface tree.

/// @notice Minimal Permit2 allowance interface for token approvals
interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}
