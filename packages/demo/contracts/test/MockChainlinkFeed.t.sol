// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockChainlinkFeed} from "../src/MockChainlinkFeed.sol";

contract MockChainlinkFeedTest is Test {
    MockChainlinkFeed internal feed;

    int256 internal constant ANSWER = 1e7; // 0.10 USD at 8 decimals
    uint8 internal constant DECIMALS = 8;
    string internal constant DESCRIPTION = "OP / USD (mock)";

    function setUp() public {
        feed = new MockChainlinkFeed(ANSWER, DECIMALS, DESCRIPTION);
    }

    function test_latestRoundData_returnsConstantAnswer() public view {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();

        assertEq(answer, ANSWER, "answer should match constructor argument");
        assertEq(roundId, 0, "roundId is constant 0");
        assertEq(answeredInRound, 0, "answeredInRound is constant 0");
        assertEq(startedAt, block.timestamp, "startedAt should be deploy time");
        assertEq(updatedAt, block.timestamp, "updatedAt should be deploy time");
    }

    function test_decimals_matchesConstructorArgument() public view {
        assertEq(feed.decimals(), DECIMALS);
    }

    function test_description_matchesConstructorArgument() public view {
        assertEq(feed.description(), DESCRIPTION);
    }

    function test_version_returnsOne() public view {
        assertEq(feed.version(), 1);
    }

    function test_answerIsImmutableAcrossBlocks() public {
        (, int256 answerBefore,,,) = feed.latestRoundData();
        vm.warp(block.timestamp + 365 days);
        vm.roll(block.number + 1_000_000);
        (, int256 answerAfter,,,) = feed.latestRoundData();
        assertEq(answerBefore, answerAfter, "answer must not change after warp/roll");
    }

    function test_getRoundData_ignoresRoundIdArgument() public view {
        (, int256 answerLatest,,,) = feed.latestRoundData();
        (, int256 answerSpecific,,,) = feed.getRoundData(uint80(42));
        assertEq(answerLatest, answerSpecific, "getRoundData should mirror latestRoundData");
    }

    function test_zeroDecimalsPreservesAnswer() public {
        MockChainlinkFeed zeroDec = new MockChainlinkFeed(int256(7), 0, "test");
        (, int256 answer,,,) = zeroDec.latestRoundData();
        assertEq(answer, 7);
        assertEq(zeroDec.decimals(), 0);
    }
}
