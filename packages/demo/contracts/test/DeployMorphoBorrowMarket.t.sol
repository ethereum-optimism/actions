// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Test, console} from "forge-std/Test.sol";
import {MockChainlinkFeed} from "../src/MockChainlinkFeed.sol";
import {IMorpho, IOracle, MarketParams} from "../src/interfaces/IMorpho.sol";
import {MorphoConstants} from "../src/MorphoConstants.sol";
import {MorphoChainlinkOracleV2} from "morpho-blue-oracles/morpho-chainlink/MorphoChainlinkOracleV2.sol";
import {IERC4626} from "morpho-blue-oracles/morpho-chainlink/interfaces/IERC4626.sol";
import {AggregatorV3Interface} from "morpho-blue-oracles/morpho-chainlink/interfaces/AggregatorV3Interface.sol";

interface IDemoOP {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Fork test for the borrow-market deploy. Verifies the oracle/market
///         wiring against real baseSepolia state.
/// @dev Calls vm.skip(true) when BASE_SEPOLIA_RPC_URL is unset so forge reports
///      these as SKIPPED rather than PASSED. Tests deploy contracts directly
///      rather than invoking script.run() so msg.sender semantics are
///      controlled within the test context.
contract DeployMorphoBorrowMarketTest is Test {
    uint256 constant LLTV = 86e16;

    /// @dev Mirrors DeployMorphoBorrowMarket constants. Kept in sync with the
    ///      script under review.
    int256 constant MOCK_FEED_ANSWER = 1e7;
    uint8 constant MOCK_FEED_DECIMALS = 8;
    uint256 constant BASE_VAULT_CONVERSION_SAMPLE = 1e18;
    uint256 constant CORRECT_BASE_TOKEN_DECIMALS = 6;
    uint256 constant WRONG_BASE_TOKEN_DECIMALS = 18;
    uint256 constant QUOTE_TOKEN_DECIMALS = 18;
    uint256 constant BORROWABLE_OP = 100_000e18;

    /// @dev Pinned baseSepolia block. Pick a block at or after the demo vault
    ///      deploy (2026-04-15). Bump if archive-RPC drops this block.
    uint256 constant PIN_BLOCK = 24_000_000;

    /// @dev Existing baseSepolia demo deployments, sourced from
    ///      packages/demo/contracts/state/deployments.json (chain 84532).
    address constant DEMO_VAULT = 0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1;
    address constant DEMO_OP = 0xD6169405013E92387b78457Fa77d377cE8cD3EE8;

    bool internal forkActive;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            console.log("BASE_SEPOLIA_RPC_URL not set; tests will skip.");
            return;
        }
        vm.createSelectFork(rpc, PIN_BLOCK);
        forkActive = true;
    }

    function _deployOracle(uint256 baseTokenDecimals) internal returns (MorphoChainlinkOracleV2) {
        MockChainlinkFeed feed = new MockChainlinkFeed(MOCK_FEED_ANSWER, MOCK_FEED_DECIMALS, "OP / USD (mock)");
        return new MorphoChainlinkOracleV2(
            IERC4626(DEMO_VAULT),
            BASE_VAULT_CONVERSION_SAMPLE,
            AggregatorV3Interface(address(0)),
            AggregatorV3Interface(address(0)),
            baseTokenDecimals,
            IERC4626(address(0)),
            1,
            AggregatorV3Interface(address(feed)),
            AggregatorV3Interface(address(0)),
            QUOTE_TOKEN_DECIMALS
        );
    }

    /// @dev Direct differential check: deploy two oracles that differ only in
    ///      baseTokenDecimals (correct=6 vs trap=18) and assert the prices
    ///      differ by at least 10 orders of magnitude. The 12-order skew is
    ///      load-bearing for catching the README foot-gun; this assertion does
    ///      not depend on the absolute price (which depends on accrued vault
    ///      yield at PIN_BLOCK and is hard to pin precisely).
    function test_correctBaseTokenDecimalsDiffersByOrdersOfMagnitudeFromTrap() public {
        if (!forkActive) {
            vm.skip(true);
            return;
        }

        uint256 correct = _deployOracle(CORRECT_BASE_TOKEN_DECIMALS).price();
        uint256 wrong = _deployOracle(WRONG_BASE_TOKEN_DECIMALS).price();

        uint256 ratio = correct >= wrong ? correct / wrong : wrong / correct;
        assertGt(ratio, 1e10, "correct vs trap config must differ by >=10 orders of magnitude");
    }

    /// @dev End-to-end wiring: deploy oracle, create the market in Morpho Blue,
    ///      mint and supply 100k OP, assert market state. This replicates the
    ///      script's behavior in a controlled sender context.
    function test_endToEndDeployCreatesAndSeedsMarket() public {
        if (!forkActive) {
            vm.skip(true);
            return;
        }

        MorphoChainlinkOracleV2 oracle = _deployOracle(CORRECT_BASE_TOKEN_DECIMALS);

        MarketParams memory marketParams = MarketParams({
            loanToken: DEMO_OP,
            collateralToken: DEMO_VAULT,
            oracle: address(oracle),
            irm: MorphoConstants.IRM,
            lltv: LLTV
        });
        IMorpho(MorphoConstants.MORPHO).createMarket(marketParams);

        bytes32 marketId = keccak256(abi.encode(marketParams));

        // Mint 100k OP to this test contract and supply on its behalf. msg.sender
        // here is the test contract for both mint and supply, avoiding the
        // sender mismatch that occurs when calling script.run() directly.
        IDemoOP(DEMO_OP).mint(address(this), BORROWABLE_OP);
        IDemoOP(DEMO_OP).approve(MorphoConstants.MORPHO, BORROWABLE_OP);
        IMorpho(MorphoConstants.MORPHO).supply(marketParams, BORROWABLE_OP, 0, address(this), "");

        (uint128 totalSupplyAssets,,,, uint128 lastUpdate,) = IMorpho(MorphoConstants.MORPHO).market(marketId);
        assertGt(lastUpdate, 0, "market should be registered in Morpho Blue");
        assertEq(totalSupplyAssets, BORROWABLE_OP, "exactly 100k OP should be seeded as supply");
    }
}
