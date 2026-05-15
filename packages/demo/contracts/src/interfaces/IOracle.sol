// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @notice Minimal Morpho Blue oracle interface. Mirrors morpho-blue's IOracle
///         (one method, `price()` returning a 1e36-scaled price).
interface IOracle {
    function price() external view returns (uint256);
}
