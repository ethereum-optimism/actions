// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Script, console} from "forge-std/Script.sol";
import {IMorpho, IMetaMorpho, MarketParams} from "../src/interfaces/IMorpho.sol";
import {MorphoConstants} from "../src/MorphoConstants.sol";

/// @dev Minimal interface for DemoUSDC / DemoOP / dUSDC vault token. Avoids
///      importing the concrete contracts so this script compiles under
///      solc 0.8.21 (Morpho's pinned version).
interface IMintableToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title SeedMorphoBorrowMarket
/// @notice One-off helper to push the *existing* live demo borrow market off
///         0% utilization without redeploying. Mirrors the seed step now baked
///         into DeployMorphoBorrowMarket.s.sol but works against a market that
///         has already been created on-chain.
/// @dev    Idempotent: aborts when the broadcasting account already holds a
///         borrow position on this market, so reruns don't stack debt. Reads
///         all market addresses from env, matching deploy-demo.sh conventions.
///         Required env: DEMO_USDC_ADDRESS, DEMO_VAULT_ADDRESS, DEMO_OP_ADDRESS,
///         BORROW_ORACLE_ADDRESS. Run with:
///           forge script script/SeedMorphoBorrowMarket.s.sol:SeedMorphoBorrowMarket \
///             --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PK
contract SeedMorphoBorrowMarket is Script {
    /// @dev Must match DeployMorphoBorrowMarket.LLTV so reconstructed
    ///      MarketParams hash to the live market id.
    uint256 constant LLTV = 86e16;

    /// @dev Seed amounts. ~$20k collateral against ~$8k debt (OP @ $0.10) lands
    ///      at ~40% LTV (well under LLTV 86%) and 80% utilization of the
    ///      100k OP pool — near AdaptiveCurveIrm's 90% target.
    uint256 constant SEED_USDC_DEPOSIT = 20_000e6;
    uint256 constant SEED_OP_BORROW = 80_000e18;

    function run() public {
        address usdcAddr = vm.envAddress("DEMO_USDC_ADDRESS");
        address vaultAddr = vm.envAddress("DEMO_VAULT_ADDRESS");
        address opAddr = vm.envAddress("DEMO_OP_ADDRESS");
        address oracleAddr = vm.envAddress("BORROW_ORACLE_ADDRESS");

        MarketParams memory marketParams = MarketParams({
            loanToken: opAddr,
            collateralToken: vaultAddr,
            oracle: oracleAddr,
            irm: MorphoConstants.IRM,
            lltv: LLTV
        });
        bytes32 marketId = keccak256(abi.encode(marketParams));

        vm.startBroadcast();

        (, uint128 existingBorrowShares,) = IMorpho(MorphoConstants.MORPHO).position(marketId, msg.sender);
        if (existingBorrowShares > 0) {
            console.log("Seed skipped: caller already holds borrow shares for this market");
            vm.stopBroadcast();
            return;
        }

        IMintableToken(usdcAddr).mint(msg.sender, SEED_USDC_DEPOSIT);
        IMintableToken(usdcAddr).approve(vaultAddr, SEED_USDC_DEPOSIT);
        uint256 seedShares = IMetaMorpho(vaultAddr).deposit(SEED_USDC_DEPOSIT, msg.sender);
        IMintableToken(vaultAddr).approve(MorphoConstants.MORPHO, seedShares);
        IMorpho(MorphoConstants.MORPHO).supplyCollateral(marketParams, seedShares, msg.sender, "");
        IMorpho(MorphoConstants.MORPHO).borrow(marketParams, SEED_OP_BORROW, 0, msg.sender, msg.sender);

        vm.stopBroadcast();

        console.log("SeededWith dUSDC shares:", seedShares);
        console.log("SeededWith OP debt:", SEED_OP_BORROW);
    }
}
