// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// @notice Mock price oracle simulating Chainlink feeds
contract MockPriceOracle {
    // Token => price (8 decimals, like Chainlink)
    mapping(address => uint256) public prices;
    
    constructor() {
        // Set default prices
        prices[address(0)] = 2500_00000000; // ETH = $2500
        // USDC price will be set per token address
    }
    
    /// @notice Set price for a token
    function setPrice(address token, uint256 price) external {
        prices[token] = price;
    }
    
    /// @notice Get price (simulates Chainlink latestRoundData)
    function getPrice(address token) external view returns (uint256) {
        return prices[token];
    }
    
    /// @notice Simulates Chainlink latestRoundData interface
    function latestRoundData(address token) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (
            1,
            int256(prices[token]),
            block.timestamp,
            block.timestamp,
            1
        );
    }
}
