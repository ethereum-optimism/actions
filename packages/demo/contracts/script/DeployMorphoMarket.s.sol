// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";
import {DemoOP} from "../src/DemoOP.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";
import {IMorpho, IMetaMorpho, IMetaMorphoFactory, MarketParams} from "../src/interfaces/IMorpho.sol";

/// @title DeployMorphoMarket
/// @notice Deploys a complete Morpho lending market for demo purposes.
///         Creates tokens, oracle, market, vault, and sets up yield generation.
/// @dev Run with: forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarket \
///                --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --private-key $DEMO_MARKET_SETUP_PRIVATE_KEY
contract DeployMorphoMarket is Script {
    // Base Sepolia contract addresses
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant METAMORPHO_FACTORY = 0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;

    // Market parameters
    uint256 constant LLTV = 945000000000000000; // 94.5%

    // Amounts (in token decimals)
    uint256 constant INITIAL_USDC_SUPPLY = 1_000_000e6; // 1M USDC
    uint256 constant COLLATERAL_AMOUNT = 100_000_000e18; // 100M OP (100x buffer)
    uint256 constant BORROW_AMOUNT = 990_000e6; // 990K USDC (99% utilization)

    function run() public {
        console.log("=== Morpho Demo Market Deployment ===");
        console.log("Deployer:", msg.sender);

        vm.startBroadcast();

        // Step 1: Deploy tokens
        console.log("\n[1/9] Deploying DemoUSDC...");
        DemoUSDC usdc = new DemoUSDC();
        console.log("DemoUSDC deployed at:", address(usdc));

        console.log("\n[2/9] Deploying DemoOP...");
        DemoOP op = new DemoOP();
        console.log("DemoOP deployed at:", address(op));

        // Step 2: Deploy oracle
        console.log("\n[3/9] Deploying FixedPriceOracle...");
        FixedPriceOracle oracle = new FixedPriceOracle();
        console.log("FixedPriceOracle deployed at:", address(oracle));

        // Step 3: Create market params
        MarketParams memory marketParams = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(op),
            oracle: address(oracle),
            irm: IRM,
            lltv: LLTV
        });

        // Step 4: Create Morpho market
        console.log("\n[4/9] Creating Morpho market...");
        IMorpho(MORPHO).createMarket(marketParams);
        bytes32 marketId = _id(marketParams);
        console.log("Market created with ID:");
        console.logBytes32(marketId);

        // Step 5: Deploy MetaMorpho vault
        console.log("\n[5/9] Deploying MetaMorpho vault...");
        bytes32 salt = keccak256(abi.encodePacked("actions-demo-vault", block.timestamp));
        address vault = IMetaMorphoFactory(METAMORPHO_FACTORY).createMetaMorpho(
            msg.sender, // initialOwner
            0, // initialTimelock (0 for instant changes on testnet)
            address(usdc), // asset
            "Actions Demo USDC Vault", // name
            "dUSDC", // symbol
            salt
        );
        console.log("MetaMorpho vault deployed at:", vault);

        // Step 6: Configure vault - submit and accept cap
        console.log("\n[6/9] Configuring vault supply cap...");
        IMetaMorpho(vault).submitCap(marketParams, type(uint184).max);
        // With 0 timelock, we can accept immediately
        IMetaMorpho(vault).acceptCap(marketParams);
        console.log("Supply cap set to unlimited");

        // Step 7: Set up supply queue so vault can allocate to the market
        console.log("\n[7/9] Setting supply queue...");
        bytes32[] memory supplyQueue = new bytes32[](1);
        supplyQueue[0] = marketId;
        IMetaMorpho(vault).setSupplyQueue(supplyQueue);
        console.log("Supply queue configured");

        // Step 8: Seed the vault with initial supply
        console.log("\n[8/9] Seeding vault with initial USDC supply...");
        usdc.mint(msg.sender, INITIAL_USDC_SUPPLY);
        usdc.approve(vault, INITIAL_USDC_SUPPLY);
        IMetaMorpho(vault).deposit(INITIAL_USDC_SUPPLY, msg.sender);
        console.log("Deposited 1M USDC_DEMO into vault");

        // Step 9: Create yield-generating borrow position
        console.log("\n[9/9] Creating yield-generating borrow position...");

        // Mint collateral
        op.mint(msg.sender, COLLATERAL_AMOUNT);
        console.log("Minted 100M OP_DEMO collateral");

        // Supply collateral to Morpho
        op.approve(MORPHO, COLLATERAL_AMOUNT);
        IMorpho(MORPHO).supplyCollateral(marketParams, COLLATERAL_AMOUNT, msg.sender, "");
        console.log("Supplied collateral to Morpho market");

        // Borrow to create 99% utilization
        IMorpho(MORPHO).borrow(marketParams, BORROW_AMOUNT, 0, msg.sender, msg.sender);
        console.log("Borrowed 990K USDC_DEMO (99% utilization)");

        vm.stopBroadcast();

        // Output summary
        console.log("\n=== Deployment Complete ===");
        console.log("\nContract Addresses:");
        console.log("  DemoUSDC (USDC_DEMO):", address(usdc));
        console.log("  DemoOP (OP_DEMO):    ", address(op));
        console.log("  FixedPriceOracle:    ", address(oracle));
        console.log("  MetaMorpho Vault:    ", vault);
        console.log("\nMarket ID:");
        console.logBytes32(marketId);
        console.log("\nConfiguration:");
        console.log("  LLTV:        94.5%");
        console.log("  Utilization: 99%");
        console.log("  Collateral:  100x over-collateralized");
        console.log("\nNext steps:");
        console.log("  1. Update packages/sdk/src/supported/tokens.ts");
        console.log("  2. Update packages/demo/backend/src/config/assets.ts");
        console.log("  3. Update packages/demo/backend/src/config/markets.ts");
        console.log("  4. Update packages/demo/frontend/src/constants/markets.ts");
    }

    /// @notice Computes the market ID from market parameters
    function _id(MarketParams memory params) internal pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }
}
