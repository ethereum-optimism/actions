// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {AggregatorV3Interface} from "morpho-blue-oracles/morpho-chainlink/interfaces/AggregatorV3Interface.sol";

/// @title MockChainlinkFeed
/// @notice Chainlink-V3-shaped feed that returns a constant `latestRoundData` for demo
///         and testing. Drop-in replacement for a real Chainlink aggregator on chains
///         where one does not yet exist; mainnet swap-in is a one-line address change
///         in the consumer.
/// @dev Truly immutable: no setters, no admin, no upgradeability. `getRoundData`
///      returns the same data as `latestRoundData` regardless of `_roundId`.
contract MockChainlinkFeed is AggregatorV3Interface {
    int256 private immutable _answer;
    uint8 private immutable _decimals;
    string private _description;
    uint256 private immutable _deployedAt;

    constructor(int256 answer_, uint8 decimals_, string memory description_) {
        // Reject zero or negative answers up front. Morpho's
        // ChainlinkDataFeedLib reverts on negative reads but accepts zero,
        // which then divides by zero in downstream price math: revert here
        // so a misconfigured deploy fails at construction instead of later.
        require(answer_ > 0, "MockChainlinkFeed: answer must be positive");
        _answer = answer_;
        _decimals = decimals_;
        _description = description_;
        _deployedAt = block.timestamp;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (0, _answer, _deployedAt, _deployedAt, 0);
    }

    function getRoundData(uint80)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (0, _answer, _deployedAt, _deployedAt, 0);
    }
}
