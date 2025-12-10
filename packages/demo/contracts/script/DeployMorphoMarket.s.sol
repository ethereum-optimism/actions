// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";
import {DemoOP} from "../src/DemoOP.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";
import {IMorpho, IMetaMorpho, IMetaMorphoFactory, MarketParams} from "../src/interfaces/IMorpho.sol";

/// @title DeployMorphoMarketStep1
/// @notice Step 1 of 2: Deploys tokens, oracle, market, vault, and submits supply cap.
///         The MetaMorpho V1.0 factory requires a 1-day timelock before accepting caps.
///         On anvil, use evm_increaseTime to skip the wait. On testnet, wait 24 hours.
/// @dev Usage:
///      forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep1 \
///          --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
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
