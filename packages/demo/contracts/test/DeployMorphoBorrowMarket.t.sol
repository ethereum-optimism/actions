// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Test, console} from "forge-std/Test.sol";
import {DeployMorphoBorrowMarket} from "../script/DeployMorphoBorrowMarket.s.sol";
import {IMorpho, IOracle, MarketParams} from "../src/interfaces/IMorpho.sol";

interface IDemoToken {
    function balanceOf(address) external view returns (uint256);
}

/// @notice Fork test for the borrow-market deploy script.
/// @dev Skips silently if `BASE_SEPOLIA_RPC_URL` is not set so the same test file
///      can live in CI without an RPC URL configured.
///
///      The deploy state file `state/deployments.json` is the source of truth
///      for the existing demo vault + DemoOP token addresses on baseSepolia.
contract DeployMorphoBorrowMarketTest is Test {
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    uint256 constant LLTV = 86e16;

    /// @dev Pinned baseSepolia block. Pick any block >= the demo vault deploy
    ///      (2026-04-15). Bump if archive-RPC drops this block from history.
    uint256 constant PIN_BLOCK = 24_000_000;

    /// @dev Existing baseSepolia demo deployments, sourced from
    ///      packages/demo/contracts/state/deployments.json (chain 84532).
    address constant DEMO_VAULT = 0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1;
    address constant DEMO_OP = 0xD6169405013E92387b78457Fa77d377cE8cD3EE8;

    DeployMorphoBorrowMarket internal script;
    bool internal forkActive;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            console.log("BASE_SEPOLIA_RPC_URL not set; skipping fork test.");
            return;
        }
        vm.createSelectFork(rpc, PIN_BLOCK);
        forkActive = true;

        script = new DeployMorphoBorrowMarket();
        vm.setEnv("DEMO_VAULT_ADDRESS", vm.toString(DEMO_VAULT));
        vm.setEnv("DEMO_OP_ADDRESS", vm.toString(DEMO_OP));
    }

    function test_run_createsMarketInMorphoBlue() public {
        if (!forkActive) return;

        (bytes32 marketId,,) = script.run();

        // Market id is keccak256(abi.encode(MarketParams)) which depends on the
        // oracle address (deployed inside the script). We assert the id is
        // non-zero and that Morpho Blue actually recorded the market.
        assertTrue(marketId != bytes32(0), "marketId should be set");

        (,,,, uint128 lastUpdate,) = IMorpho(MORPHO).market(marketId);
        assertGt(lastUpdate, 0, "market should be registered in Morpho Blue");
    }

    function test_run_oraclePriceIsInPlausibleMagnitude() public {
        if (!forkActive) return;

        (, address oracleAddr,) = script.run();

        uint256 price = IOracle(oracleAddr).price();

        // Catches the 12-orders-of-magnitude decimals trap. With baseTokenDecimals
        // correctly set to 6 (USDC underlying) and the OP/USD mock at $0.10, the
        // returned price falls in a wide-but-bounded range. If baseTokenDecimals
        // were mistakenly 18 (vault decimals), the price would be off by ~1e12 in
        // either direction and these bounds would fail loudly.
        assertGt(price, 1e15, "oracle price too small -- decimals trap?");
        assertLt(price, 1e35, "oracle price too large -- decimals trap?");
    }

    function test_run_seedsBorrowableLiquidity() public {
        if (!forkActive) return;

        (bytes32 marketId,,) = script.run();

        (uint128 totalSupplyAssets,,,,,) = IMorpho(MORPHO).market(marketId);
        // 100k OP at 18 decimals = 1e23
        assertEq(totalSupplyAssets, 100_000e18, "exactly 100k OP should be seeded as supply");
    }
}
