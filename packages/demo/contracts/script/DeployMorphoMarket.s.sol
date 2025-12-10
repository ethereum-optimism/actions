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
/// @dev The V1.0 MetaMorpho factory requires minimum 1 day timelock. This script uses
///      vm.warp() to skip the timelock wait, which works on anvil/fork but NOT on real networks.
///      For real testnet deployment, run DeployMorphoMarketStep1 first, wait 1 day, then run
///      DeployMorphoMarketStep2 with the vault address from step 1.
///
///      Anvil/Fork (single command):
///      forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarket \
///          --rpc-url http://127.0.0.1:8545 --broadcast --private-key $DEMO_MARKET_SETUP_PRIVATE_KEY
///
///      Real testnet (two-stage):
///      1. forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep1 \
///           --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --private-key $DEMO_MARKET_SETUP_PRIVATE_KEY
///      2. Wait 1 day for timelock
///      3. VAULT_ADDRESS=0x... forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep2 \
///           --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --private-key $DEMO_MARKET_SETUP_PRIVATE_KEY
contract DeployMorphoMarket is Script {
    // Base Sepolia contract addresses
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant METAMORPHO_FACTORY = 0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;

    // Market parameters
    uint256 constant LLTV = 945000000000000000; // 94.5%
    uint256 constant MIN_TIMELOCK = 1 days; // Factory minimum

    // Amounts (in token decimals)
    uint256 constant INITIAL_USDC_SUPPLY = 1_000_000e6; // 1M USDC
    uint256 constant COLLATERAL_AMOUNT = 100_000_000e18; // 100M OP (100x buffer)
    uint256 constant BORROW_AMOUNT = 990_000e6; // 990K USDC (99% utilization)

    function run() public {
        console.log("=== Morpho Demo Market Deployment ===");
        console.log("Deployer:", msg.sender);
        console.log("NOTE: Using vm.warp() - only works on anvil/fork!");

        vm.startBroadcast();

        // Step 1: Deploy tokens
        console.log("\n[1/10] Deploying DemoUSDC...");
        DemoUSDC usdc = new DemoUSDC();
        console.log("DemoUSDC deployed at:", address(usdc));

        console.log("\n[2/10] Deploying DemoOP...");
        DemoOP op = new DemoOP();
        console.log("DemoOP deployed at:", address(op));

        // Step 2: Deploy oracle
        console.log("\n[3/10] Deploying FixedPriceOracle...");
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
        console.log("\n[4/10] Creating Morpho market...");
        IMorpho(MORPHO).createMarket(marketParams);
        bytes32 marketId = _id(marketParams);
        console.log("Market created with ID:");
        console.logBytes32(marketId);

        // Step 5: Deploy MetaMorpho vault with minimum timelock
        console.log("\n[5/10] Deploying MetaMorpho vault (1 day timelock)...");
        bytes32 salt = keccak256(abi.encodePacked("actions-demo-vault", block.timestamp));
        address vault = IMetaMorphoFactory(METAMORPHO_FACTORY).createMetaMorpho(
            msg.sender, // initialOwner
            MIN_TIMELOCK, // 1 day minimum required by V1.0 factory
            address(usdc), // asset
            "Actions Demo USDC Vault", // name
            "dUSDC", // symbol
            salt
        );
        console.log("MetaMorpho vault deployed at:", vault);

        // Step 6: Submit supply cap (requires timelock to accept)
        console.log("\n[6/7] Submitting vault supply cap...");
        IMetaMorpho(vault).submitCap(marketParams, type(uint184).max);
        console.log("Cap submitted, requires timelock to accept");

        vm.stopBroadcast();

        // Output Step 1 complete
        console.log("\n=== Step 1 Complete ===");
        console.log("Contracts deployed. Now run the following to continue:");
        console.log("");
        console.log("# Warp time forward (anvil only):");
        console.log("cast rpc evm_increaseTime 86401 --rpc-url http://127.0.0.1:8545");
        console.log("cast rpc evm_mine --rpc-url http://127.0.0.1:8545");
        console.log("");
        console.log("# Then run step 2:");
        console.log("VAULT_ADDRESS=", vault);
        console.log("USDC_ADDRESS=", address(usdc));
        console.log("OP_ADDRESS=", address(op));
        console.log("ORACLE_ADDRESS=", address(oracle));
        console.log("");
        console.log("forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep2 \\");
        console.log("  --rpc-url http://127.0.0.1:8545 --broadcast --private-key $PRIVATE_KEY");
    }

    /// @notice Computes the market ID from market parameters
    function _id(MarketParams memory params) internal pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }
}

/// @title DeployMorphoMarketStep1
/// @notice Step 1 of 2 for real testnet deployment. Deploys everything and submits cap.
///         Wait 1 day, then run DeployMorphoMarketStep2 with the vault address.
contract DeployMorphoMarketStep1 is Script {
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant METAMORPHO_FACTORY = 0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    uint256 constant LLTV = 945000000000000000;
    uint256 constant MIN_TIMELOCK = 1 days;

    function run() public {
        console.log("=== Morpho Demo Market - Step 1 of 2 ===");
        console.log("Deployer:", msg.sender);

        vm.startBroadcast();

        // Deploy tokens
        DemoUSDC usdc = new DemoUSDC();
        console.log("DemoUSDC:", address(usdc));

        DemoOP op = new DemoOP();
        console.log("DemoOP:", address(op));

        // Deploy oracle
        FixedPriceOracle oracle = new FixedPriceOracle();
        console.log("Oracle:", address(oracle));

        // Create market
        MarketParams memory marketParams = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(op),
            oracle: address(oracle),
            irm: IRM,
            lltv: LLTV
        });
        IMorpho(MORPHO).createMarket(marketParams);
        bytes32 marketId = keccak256(abi.encode(marketParams));
        console.log("Market ID:");
        console.logBytes32(marketId);

        // Deploy vault
        bytes32 salt = keccak256(abi.encodePacked("actions-demo-vault", block.timestamp));
        address vault = IMetaMorphoFactory(METAMORPHO_FACTORY).createMetaMorpho(
            msg.sender, MIN_TIMELOCK, address(usdc), "Actions Demo USDC Vault", "dUSDC", salt
        );
        console.log("Vault:", vault);

        // Submit cap (must wait 1 day to accept)
        IMetaMorpho(vault).submitCap(marketParams, type(uint184).max);
        console.log("Cap submitted");

        vm.stopBroadcast();

        console.log("\n=== Step 1 Complete ===");
        console.log("SAVE THESE ADDRESSES:");
        console.log("  USDC_DEMO:", address(usdc));
        console.log("  OP_DEMO:", address(op));
        console.log("  Oracle:", address(oracle));
        console.log("  Vault:", vault);
        console.log("\nWait 1 day, then run Step 2 with:");
        console.log("  VAULT_ADDRESS=%s", vault);
        console.log("  USDC_ADDRESS=%s", address(usdc));
        console.log("  OP_ADDRESS=%s", address(op));
    }
}

/// @title DeployMorphoMarketStep2
/// @notice Step 2 of 2 for real testnet deployment. Accepts cap and sets up yield.
///         Requires VAULT_ADDRESS, USDC_ADDRESS, OP_ADDRESS env vars from Step 1.
contract DeployMorphoMarketStep2 is Script {
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    uint256 constant LLTV = 945000000000000000;
    uint256 constant INITIAL_USDC_SUPPLY = 1_000_000e6;
    uint256 constant COLLATERAL_AMOUNT = 100_000_000e18;
    uint256 constant BORROW_AMOUNT = 990_000e6;

    function run() public {
        address vault = vm.envAddress("VAULT_ADDRESS");
        address usdcAddr = vm.envAddress("USDC_ADDRESS");
        address opAddr = vm.envAddress("OP_ADDRESS");
        address oracleAddr = vm.envAddress("ORACLE_ADDRESS");

        console.log("=== Morpho Demo Market - Step 2 of 2 ===");
        console.log("Vault:", vault);

        MarketParams memory marketParams =
            MarketParams({loanToken: usdcAddr, collateralToken: opAddr, oracle: oracleAddr, irm: IRM, lltv: LLTV});
        bytes32 marketId = keccak256(abi.encode(marketParams));

        vm.startBroadcast();

        // Accept the cap
        IMetaMorpho(vault).acceptCap(marketParams);
        console.log("Cap accepted");

        // Set supply queue
        bytes32[] memory supplyQueue = new bytes32[](1);
        supplyQueue[0] = marketId;
        IMetaMorpho(vault).setSupplyQueue(supplyQueue);
        console.log("Supply queue set");

        // Deposit and create yield
        DemoUSDC usdc = DemoUSDC(usdcAddr);
        DemoOP op = DemoOP(opAddr);

        usdc.mint(msg.sender, INITIAL_USDC_SUPPLY);
        usdc.approve(vault, INITIAL_USDC_SUPPLY);
        IMetaMorpho(vault).deposit(INITIAL_USDC_SUPPLY, msg.sender);
        console.log("Deposited 1M USDC_DEMO");

        op.mint(msg.sender, COLLATERAL_AMOUNT);
        op.approve(MORPHO, COLLATERAL_AMOUNT);
        IMorpho(MORPHO).supplyCollateral(marketParams, COLLATERAL_AMOUNT, msg.sender, "");
        console.log("Supplied collateral");

        IMorpho(MORPHO).borrow(marketParams, BORROW_AMOUNT, 0, msg.sender, msg.sender);
        console.log("Borrowed 990K USDC_DEMO (99% utilization)");

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("Vault is now active with yield generation!");
    }
}
