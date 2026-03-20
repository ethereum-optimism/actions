// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPoolFactory, IPool} from "../src/interfaces/IVelodrome.sol";

/// @title DeployVelodromeMarket
/// @notice Creates a Velodrome/Aerodrome volatile pool for DemoUSDC/DemoOP with initial liquidity.
///         Adds liquidity directly via the pool (transfer + mint), bypassing the Router.
///         Reads token addresses from environment variables.
contract DeployVelodromeMarket is Script {
    // Base Sepolia — Velodrome testnet deployment
    address constant POOL_FACTORY = 0x7b9644D43900da734f5a83DD0489Af1197DF2CF0;

    // Liquidity amounts — ratio targets 1 OP = 0.18 USDC (~5.5 OP per USDC)
    // to match the Uniswap V4 pool pricing
    uint256 constant USDC_AMOUNT = 1_000_000e6; // 1M USDC
    uint256 constant OP_AMOUNT = 5_555_556e18; // ~5.5M OP

    function run() public {
        address usdcAddr = vm.envAddress("DEMO_USDC_ADDRESS");
        address opAddr = vm.envAddress("DEMO_OP_ADDRESS");

        vm.startBroadcast();

        // Create volatile pool (or reuse existing)
        address pool = IPoolFactory(POOL_FACTORY).getPool(usdcAddr, opAddr, false);
        if (pool == address(0)) {
            pool = IPoolFactory(POOL_FACTORY).createPool(usdcAddr, opAddr, false);
            console.log("Pool created:", pool);
        } else {
            console.log("Pool exists:", pool);
        }

        // Mint demo tokens for liquidity
        (bool s1,) = usdcAddr.call(abi.encodeWithSignature("mint(address,uint256)", msg.sender, USDC_AMOUNT));
        require(s1, "USDC mint failed");
        (bool s2,) = opAddr.call(abi.encodeWithSignature("mint(address,uint256)", msg.sender, OP_AMOUNT));
        require(s2, "OP mint failed");

        // Add liquidity directly to the pool (transfer + mint pattern)
        // This bypasses the Router, which on Base Sepolia is a Universal Router
        // with a different interface than the legacy v2 Router.
        IERC20(usdcAddr).transfer(pool, USDC_AMOUNT);
        IERC20(opAddr).transfer(pool, OP_AMOUNT);
        uint256 liquidity = IPool(pool).mint(msg.sender);

        console.log("Liquidity added:", liquidity);

        vm.stopBroadcast();
    }
}
