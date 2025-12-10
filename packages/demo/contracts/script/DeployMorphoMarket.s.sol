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
        vm.startBroadcast();

        // Deploy tokens
        DemoUSDC usdc = new DemoUSDC();
        console.log("DemoUSDC deployed at:", address(usdc));

        DemoOP op = new DemoOP();
        console.log("DemoOP deployed at:", address(op));

        // Deploy oracle
        FixedPriceOracle oracle = new FixedPriceOracle();
        console.log("FixedPriceOracle deployed at:", address(oracle));

        // Create market
        MarketParams memory marketParams = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(op),
            oracle: address(oracle),
            irm: IRM,
            lltv: LLTV
        });
        IMorpho(MORPHO).createMarket(marketParams);

        // Deploy vault
        bytes32 salt = keccak256(abi.encodePacked("actions-demo-vault", block.timestamp));
        address vault = IMetaMorphoFactory(METAMORPHO_FACTORY).createMetaMorpho(
            msg.sender, MIN_TIMELOCK, address(usdc), "Actions Demo USDC Vault", "dUSDC", salt
        );
        console.log("MetaMorpho vault deployed at:", vault);

        // Submit cap
        IMetaMorpho(vault).submitCap(marketParams, type(uint184).max);

        vm.stopBroadcast();
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
        vm.startBroadcast();

        DemoUSDC usdc = new DemoUSDC();
        console.log("DemoUSDC:", address(usdc));

        DemoOP op = new DemoOP();
        console.log("DemoOP:", address(op));

        FixedPriceOracle oracle = new FixedPriceOracle();
        console.log("Oracle:", address(oracle));

        MarketParams memory marketParams = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(op),
            oracle: address(oracle),
            irm: IRM,
            lltv: LLTV
        });
        IMorpho(MORPHO).createMarket(marketParams);

        bytes32 salt = keccak256(abi.encodePacked("actions-demo-vault", block.timestamp));
        address vault = IMetaMorphoFactory(METAMORPHO_FACTORY).createMetaMorpho(
            msg.sender, MIN_TIMELOCK, address(usdc), "Actions Demo USDC Vault", "dUSDC", salt
        );
        console.log("Vault:", vault);

        IMetaMorpho(vault).submitCap(marketParams, type(uint184).max);

        vm.stopBroadcast();
    }
}

/// @title DeployMorphoMarketStep2
/// @notice Step 2 of 2 for real testnet deployment. Accepts cap and sets up yield.
///         Requires VAULT_ADDRESS, USDC_ADDRESS, OP_ADDRESS, ORACLE_ADDRESS env vars from Step 1.
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

        MarketParams memory marketParams =
            MarketParams({loanToken: usdcAddr, collateralToken: opAddr, oracle: oracleAddr, irm: IRM, lltv: LLTV});
        bytes32 marketId = keccak256(abi.encode(marketParams));

        vm.startBroadcast();

        IMetaMorpho(vault).acceptCap(marketParams);

        bytes32[] memory supplyQueue = new bytes32[](1);
        supplyQueue[0] = marketId;
        IMetaMorpho(vault).setSupplyQueue(supplyQueue);

        DemoUSDC usdc = DemoUSDC(usdcAddr);
        DemoOP op = DemoOP(opAddr);

        usdc.mint(msg.sender, INITIAL_USDC_SUPPLY);
        usdc.approve(vault, INITIAL_USDC_SUPPLY);
        IMetaMorpho(vault).deposit(INITIAL_USDC_SUPPLY, msg.sender);

        op.mint(msg.sender, COLLATERAL_AMOUNT);
        op.approve(MORPHO, COLLATERAL_AMOUNT);
        IMorpho(MORPHO).supplyCollateral(marketParams, COLLATERAL_AMOUNT, msg.sender, "");

        IMorpho(MORPHO).borrow(marketParams, BORROW_AMOUNT, 0, msg.sender, msg.sender);

        vm.stopBroadcast();

        console.log("Step2Complete");
    }
}
