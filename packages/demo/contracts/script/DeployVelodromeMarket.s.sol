// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPoolFactory, IRouter} from "../src/interfaces/IVelodrome.sol";

/// @title DeployVelodromeMarket
/// @notice Creates a Velodrome/Aerodrome volatile pool for DemoUSDC/DemoOP with initial liquidity.
///         Requires an existing Velodrome protocol deployment on the target chain.
///         Reads token and protocol addresses from environment variables.
contract DeployVelodromeMarket is Script {
    // TODO: Replace with actual Base Sepolia deployment addresses
    address constant ROUTER = address(0);
    address constant POOL_FACTORY = address(0);

    // Liquidity amounts
    uint256 constant USDC_AMOUNT = 1_000_000e6; // 1M USDC
    uint256 constant OP_AMOUNT = 1_000_000e18; // 1M OP

    function run() public {
        require(ROUTER != address(0), "ROUTER address not set - waiting for Velodrome Base Sepolia deployment");
        require(
            POOL_FACTORY != address(0), "POOL_FACTORY address not set - waiting for Velodrome Base Sepolia deployment"
        );

        address usdcAddr = vm.envAddress("DEMO_USDC_ADDRESS");
        address opAddr = vm.envAddress("DEMO_OP_ADDRESS");

        vm.startBroadcast();

        // Create volatile pool
        address pool = IPoolFactory(POOL_FACTORY).createPool(usdcAddr, opAddr, false);
        console.log("Pool:", pool);

        // Mint demo tokens for liquidity
        (bool s1,) = usdcAddr.call(abi.encodeWithSignature("mint(address,uint256)", msg.sender, USDC_AMOUNT));
        require(s1, "USDC mint failed");
        (bool s2,) = opAddr.call(abi.encodeWithSignature("mint(address,uint256)", msg.sender, OP_AMOUNT));
        require(s2, "OP mint failed");

        // Approve tokens to Router
        IERC20(usdcAddr).approve(ROUTER, type(uint256).max);
        IERC20(opAddr).approve(ROUTER, type(uint256).max);

        // Add liquidity
        (uint256 amountA, uint256 amountB, uint256 liquidity) = IRouter(ROUTER).addLiquidity(
            usdcAddr,
            opAddr,
            false, // volatile pool
            USDC_AMOUNT,
            OP_AMOUNT,
            0, // no minimum (testnet)
            0, // no minimum (testnet)
            msg.sender,
            block.timestamp + 60
        );

        console.log("Liquidity added:", liquidity);
        console.log("Amount USDC:", amountA);
        console.log("Amount OP:", amountB);

        vm.stopBroadcast();
    }
}
