// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";
import {DemoOP} from "../src/DemoOP.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";
import {IMorpho, IMetaMorpho, IMetaMorphoFactory, MarketParams} from "../src/interfaces/IMorpho.sol";

/// @title DeployMorphoMarket
/// @notice Deploys a complete Morpho lending market with yield generation in a single transaction.
///         Uses MetaMorpho V1.1 factory which allows 0 timelock for instant cap acceptance.
contract DeployMorphoMarket is Script {
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant METAMORPHO_FACTORY_V1_1 = 0x2c3FE6D71F8d54B063411Abb446B49f13725F784;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    uint256 constant LLTV = 945000000000000000;
    uint256 constant INITIAL_USDC_SUPPLY = 1_000_000e6;
    uint256 constant COLLATERAL_AMOUNT = 100_000_000e18;
    uint256 constant BORROW_AMOUNT = 999_000e6;

    function run() public {
        vm.startBroadcast();

        // Deploy tokens
        DemoUSDC usdc = new DemoUSDC();
        console.log("DemoUSDC:", address(usdc));

        DemoOP op = new DemoOP();
        console.log("DemoOP:", address(op));

        // Deploy oracle
        FixedPriceOracle oracle = new FixedPriceOracle();
        console.log("Oracle:", address(oracle));

        // Create market params
        MarketParams memory marketParams = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(op),
            oracle: address(oracle),
            irm: IRM,
            lltv: LLTV
        });

        // Create Morpho market
        IMorpho(MORPHO).createMarket(marketParams);

        // Create MetaMorpho vault with 0 timelock (V1.1)
        bytes32 salt = keccak256(abi.encodePacked("actions-demo-vault", block.timestamp));
        address vault = IMetaMorphoFactory(METAMORPHO_FACTORY_V1_1).createMetaMorpho(
            msg.sender, 0, address(usdc), "Actions Demo USDC Vault", "dUSDC", salt
        );
        console.log("Vault:", vault);

        // Submit and immediately accept cap (0 timelock)
        IMetaMorpho(vault).submitCap(marketParams, type(uint184).max);
        IMetaMorpho(vault).acceptCap(marketParams);

        // Set supply queue
        bytes32 marketId = keccak256(abi.encode(marketParams));
        bytes32[] memory supplyQueue = new bytes32[](1);
        supplyQueue[0] = marketId;
        IMetaMorpho(vault).setSupplyQueue(supplyQueue);

        // Mint and deposit USDC to vault
        usdc.mint(msg.sender, INITIAL_USDC_SUPPLY);
        usdc.approve(vault, INITIAL_USDC_SUPPLY);
        IMetaMorpho(vault).deposit(INITIAL_USDC_SUPPLY, msg.sender);

        // Mint OP and supply as collateral
        op.mint(msg.sender, COLLATERAL_AMOUNT);
        op.approve(MORPHO, COLLATERAL_AMOUNT);
        IMorpho(MORPHO).supplyCollateral(marketParams, COLLATERAL_AMOUNT, msg.sender, "");

        // Borrow USDC to generate yield (99.9% utilization)
        IMorpho(MORPHO).borrow(marketParams, BORROW_AMOUNT, 0, msg.sender, msg.sender);

        vm.stopBroadcast();
    }
}
