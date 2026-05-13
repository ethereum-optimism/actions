// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title FixedPriceOracle
/// @notice Fixed price oracle for Morpho Blue markets.
///         Returns a constant price for demo/testing purposes.
/// @dev Implements the IOracle interface expected by Morpho Blue.
///      The price is scaled by 1e36 as per Morpho's oracle specification.
///
///      Formula: price = collateralPrice * 1e36 * 10^loanDecimals / 10^collateralDecimals
///
///      For 1 OP = $0.10 with OP_DEMO (18 decimals) and USDC_DEMO (6 decimals):
///      price = 0.10 * 1e36 * 1e6 / 1e18 = 1e23.
///      Matches the OP/USD peg used by the borrow market's MockChainlinkFeed.
contract FixedPriceOracle {
    /// @notice The fixed price returned by this oracle
    /// @dev For OP_DEMO:USDC_DEMO at 1 OP = $0.10 = 1e23
    uint256 public constant PRICE = 1e23;

    /// @notice Returns the price of 1 collateral token in loan tokens, scaled by 1e36
    /// @return The fixed price
    function price() external pure returns (uint256) {
        return PRICE;
    }
}
