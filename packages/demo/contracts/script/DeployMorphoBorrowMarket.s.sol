// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Script, console} from "forge-std/Script.sol";
import {MockChainlinkFeed} from "../src/MockChainlinkFeed.sol";
import {IMorpho, IMetaMorpho, MarketParams} from "../src/interfaces/IMorpho.sol";
import {MorphoConstants} from "../src/MorphoConstants.sol";
import {MorphoChainlinkOracleV2} from "morpho-blue-oracles/morpho-chainlink/MorphoChainlinkOracleV2.sol";
import {IERC4626} from "morpho-blue-oracles/morpho-chainlink/interfaces/IERC4626.sol";
import {AggregatorV3Interface} from "morpho-blue-oracles/morpho-chainlink/interfaces/AggregatorV3Interface.sol";

/// @dev Minimal interface for the local DemoOP / DemoUSDC tokens. We avoid
///      importing the concrete contracts so this script can compile under
///      solc 0.8.21 (Morpho's pinned version) without requiring the rest of
///      the package to do the same. Also covers the dUSDC vault's
///      ERC20 approve() needed for supplyCollateral.
interface IMintableToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @dev Morpho's IERC4626 in lib/morpho-blue-oracles only declares
///      convertToAssets. We need asset() for the vault-underlying validation
///      below, so declare it locally rather than pulling a fuller interface.
interface IVaultAsset {
    function asset() external view returns (address);
}

/// @title DeployMorphoBorrowMarket
/// @notice Deploys the borrow-direction Morpho Blue market: dUSDC vault shares as
///         collateral, OP as the loan token. Wires a `MorphoChainlinkOracleV2` that
///         tracks accrued vault yield via `convertToAssets`, paired with a
///         `MockChainlinkFeed` representing the OP/USD peg until a real Chainlink
///         feed exists on baseSepolia.
/// @dev    Reads `DEMO_VAULT_ADDRESS` and `DEMO_OP_ADDRESS` from env. Mints 100k OP
///         to the deployer and supplies it as borrowable liquidity in the same run
///         so the market is non-empty post-deploy.
contract DeployMorphoBorrowMarket is Script {
    /// @dev 86%: Morpho-enabled tier appropriate for yield-bearing collateral.
    ///      Not the lend market's 94.5% (that's a bootstrap-yield artifact in the
    ///      opposite direction).
    uint256 constant LLTV = 86e16;

    /// @dev OP/USD peg, 8 decimals: 1 OP = $0.10 -> 0.10 * 1e8 = 1e7.
    int256 constant MOCK_FEED_ANSWER = 1e7;
    uint8 constant MOCK_FEED_DECIMALS = 8;

    /// @dev MorphoChainlinkOracleV2 base/quote configuration:
    ///      - base = collateral = dUSDC vault shares (USDC underlying)
    ///      - quote = loan = OP
    ///      - mock feed sits in `quoteFeed1` slot as OP/USD
    ///      - base feeds = address(0) (USDC ~ USD, treated as 1)
    uint256 constant BASE_VAULT_CONVERSION_SAMPLE = 1e18;
    /// @dev CRITICAL: USDC underlying decimals (6), NOT the dUSDC vault's 18.
    ///      Per Morpho's MorphoChainlinkOracleV2 README: when `baseVault` is set,
    ///      `baseTokenDecimals` is the *underlying asset's* decimals. Wiring this
    ///      as 18 would skew the oracle by 12 orders of magnitude.
    uint256 constant BASE_TOKEN_DECIMALS = 6;
    uint256 constant QUOTE_TOKEN_DECIMALS = 18;

    uint256 constant BORROWABLE_OP = 100_000e18;

    /// @dev Seed amounts for the self-collateralized opening borrow.
    ///      20k USDC of collateral at ~40% LTV, 80k OP borrowed = 80%
    ///      utilization of the 100k OP pool.
    uint256 constant SEED_USDC_DEPOSIT = 20_000e6;
    uint256 constant SEED_OP_BORROW = 80_000e18;

    function run() public returns (bytes32 marketId, address oracleAddr, address mockFeedAddr) {
        address vaultAddr = vm.envAddress("DEMO_VAULT_ADDRESS");
        address opAddr = vm.envAddress("DEMO_OP_ADDRESS");

        // Defense in depth: when the orchestrator passes DEMO_USDC_ADDRESS,
        // require the vault's underlying to match. A wrong vault would skew
        // SCALE_FACTOR by 10^(underlying_decimals - 6) and silently mis-price
        // the market, far harder to debug after deploy.
        address expectedAsset = vm.envOr("DEMO_USDC_ADDRESS", address(0));
        if (expectedAsset != address(0)) {
            require(
                IVaultAsset(vaultAddr).asset() == expectedAsset,
                "DEMO_VAULT_ADDRESS asset does not match DEMO_USDC_ADDRESS"
            );
        }

        // Reuse existing mock feed and oracle if the orchestrator records them
        // in state. A rerun after a partial-write or a post-marketId revert
        // would otherwise deploy fresh contracts, orphaning the prior pair.
        // Matches the lend script's DEMO_USDC_ADDRESS / DEMO_OP_ADDRESS env-reuse.
        address existingMockFeed = vm.envOr("BORROW_MOCK_FEED_ADDRESS", address(0));
        address existingOracle = vm.envOr("BORROW_ORACLE_ADDRESS", address(0));

        vm.startBroadcast();

        MockChainlinkFeed mockFeed;
        if (existingMockFeed != address(0)) {
            mockFeed = MockChainlinkFeed(existingMockFeed);
            console.log("BorrowMockFeed (existing):", existingMockFeed);
        } else {
            mockFeed = new MockChainlinkFeed(MOCK_FEED_ANSWER, MOCK_FEED_DECIMALS, "OP / USD (mock)");
            console.log("BorrowMockFeed:", address(mockFeed));
        }

        // Yield-tracking oracle: dUSDC.convertToAssets gives USDC (~ 1:1 USD),
        // divided by mock OP/USD price gives dUSDC denominated in OP.
        MorphoChainlinkOracleV2 oracle;
        if (existingOracle != address(0)) {
            oracle = MorphoChainlinkOracleV2(existingOracle);
            console.log("BorrowOracle (existing):", existingOracle);
        } else {
            oracle = new MorphoChainlinkOracleV2(
                IERC4626(vaultAddr),
                BASE_VAULT_CONVERSION_SAMPLE,
                AggregatorV3Interface(address(0)),
                AggregatorV3Interface(address(0)),
                BASE_TOKEN_DECIMALS,
                IERC4626(address(0)),
                1,
                AggregatorV3Interface(address(mockFeed)),
                AggregatorV3Interface(address(0)),
                QUOTE_TOKEN_DECIMALS
            );
            console.log("BorrowOracle:", address(oracle));
        }

        // Create market: dUSDC collateral, OP loan.
        MarketParams memory marketParams = MarketParams({
            loanToken: opAddr,
            collateralToken: vaultAddr,
            oracle: address(oracle),
            irm: MorphoConstants.IRM,
            lltv: LLTV
        });
        IMorpho(MorphoConstants.MORPHO).createMarket(marketParams);

        marketId = keccak256(abi.encode(marketParams));
        console.log("BorrowMarketId:");
        console.logBytes32(marketId);

        // Emit each MarketParams field so deploy-demo.sh can persist them to
        // state/deployments.json without re-deriving constants. Consumers
        // (SDK MorphoBorrowProvider, demo backend) read these to encode
        // supplyCollateral/borrow/repay calldata without an extra RPC.
        console.log("BorrowMarketParamsLoanToken:", marketParams.loanToken);
        console.log("BorrowMarketParamsCollateralToken:", marketParams.collateralToken);
        console.log("BorrowMarketParamsOracle:", marketParams.oracle);
        console.log("BorrowMarketParamsIrm:", marketParams.irm);
        console.log("BorrowMarketParamsLltv:", marketParams.lltv);

        // Seed borrowable OP liquidity.
        IMintableToken(opAddr).mint(msg.sender, BORROWABLE_OP);
        IMintableToken(opAddr).approve(MorphoConstants.MORPHO, BORROWABLE_OP);
        IMorpho(MorphoConstants.MORPHO).supply(marketParams, BORROWABLE_OP, 0, msg.sender, "");

        // Open a self-collateralized borrow so the market starts at
        // non-zero utilization: mint USDC, deposit to the vault for
        // dUSDC shares, supply as collateral, borrow OP.
        address usdcAddr = IVaultAsset(vaultAddr).asset();
        IMintableToken(usdcAddr).mint(msg.sender, SEED_USDC_DEPOSIT);
        IMintableToken(usdcAddr).approve(vaultAddr, SEED_USDC_DEPOSIT);
        uint256 seedShares = IMetaMorpho(vaultAddr).deposit(SEED_USDC_DEPOSIT, msg.sender);
        IMintableToken(vaultAddr).approve(MorphoConstants.MORPHO, seedShares);
        IMorpho(MorphoConstants.MORPHO).supplyCollateral(marketParams, seedShares, msg.sender, "");
        IMorpho(MorphoConstants.MORPHO).borrow(marketParams, SEED_OP_BORROW, 0, msg.sender, msg.sender);
        console.log("BorrowMarketSeededWith dUSDC shares:", seedShares);
        console.log("BorrowMarketSeededWith OP debt:", SEED_OP_BORROW);

        vm.stopBroadcast();

        oracleAddr = address(oracle);
        mockFeedAddr = address(mockFeed);
    }
}
