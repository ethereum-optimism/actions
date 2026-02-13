// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {IPermit2} from "../src/interfaces/IUniswapV4.sol";

/// @title DeployUniswapMarket
/// @notice Deploys a Uniswap V4 pool for DemoUSDC/DemoOP with initial liquidity.
///         Reads token addresses from environment variables.
contract DeployUniswapMarket is Script {
    // Base Sepolia Uniswap V4 deployments
    address constant POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address constant POSITION_MANAGER = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Pool parameters
    uint24 constant FEE = 100; // 0.01%
    int24 constant TICK_SPACING = 2;

    // Liquidity amounts
    uint256 constant USDC_AMOUNT = 1_000_000e6; // 1M USDC
    uint256 constant OP_AMOUNT = 1_000_000e18; // 1M OP

    function run() public {
        address usdcAddr = vm.envAddress("DEMO_USDC_ADDRESS");
        address opAddr = vm.envAddress("DEMO_OP_ADDRESS");

        // Sort tokens: V4 requires currency0 < currency1
        (address token0, address token1) = usdcAddr < opAddr ? (usdcAddr, opAddr) : (opAddr, usdcAddr);
        (uint256 amount0, uint256 amount1) = usdcAddr < opAddr ? (USDC_AMOUNT, OP_AMOUNT) : (OP_AMOUNT, USDC_AMOUNT);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });

        // Calculate sqrtPriceX96 for 1 OP = 0.18 USDC
        // sqrtPriceX96 = sqrt(price_in_raw_units) * 2^96
        uint160 sqrtPriceX96 = _computeSqrtPriceX96(usdcAddr, opAddr, token0);

        vm.startBroadcast();

        // Initialize pool
        IPoolManager(POOL_MANAGER).initialize(poolKey, sqrtPriceX96);
        console.log("Pool initialized");

        // Mint tokens for liquidity
        // Use low-level call since DemoUSDC/DemoOP have mint(address,uint256)
        (bool s1,) = usdcAddr.call(abi.encodeWithSignature("mint(address,uint256)", msg.sender, USDC_AMOUNT));
        require(s1, "USDC mint failed");
        (bool s2,) = opAddr.call(abi.encodeWithSignature("mint(address,uint256)", msg.sender, OP_AMOUNT));
        require(s2, "OP mint failed");

        // Approve tokens → Permit2
        IERC20(token0).approve(PERMIT2, type(uint256).max);
        IERC20(token1).approve(PERMIT2, type(uint256).max);

        // Approve Permit2 → PositionManager
        IPermit2(PERMIT2).approve(token0, POSITION_MANAGER, type(uint160).max, type(uint48).max);
        IPermit2(PERMIT2).approve(token1, POSITION_MANAGER, type(uint160).max, type(uint48).max);

        // Calculate full-range tick bounds
        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        int24 tickUpper = TickMath.maxUsableTick(TICK_SPACING);

        // Calculate liquidity from token amounts
        uint160 sqrtPriceAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtPriceBX96 = TickMath.getSqrtPriceAtTick(tickUpper);
        uint128 liquidity =
            LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, amount0, amount1);

        // Encode MINT_POSITION + SETTLE_PAIR actions
        bytes memory actions = new bytes(2);
        actions[0] = bytes1(uint8(Actions.MINT_POSITION));
        actions[1] = bytes1(uint8(Actions.SETTLE_PAIR));

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            poolKey,
            tickLower,
            tickUpper,
            liquidity,
            type(uint128).max, // amount0Max (no slippage check)
            type(uint128).max, // amount1Max (no slippage check)
            msg.sender, // recipient
            bytes("") // hookData
        );
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);

        bytes memory unlockData = abi.encode(actions, params);
        IPositionManager(POSITION_MANAGER).modifyLiquidities(unlockData, block.timestamp + 60);

        // Log pool ID
        bytes32 poolId = keccak256(abi.encode(poolKey));
        console.log("Pool ID:");
        console.logBytes32(poolId);

        vm.stopBroadcast();
    }

    /// @dev Compute sqrtPriceX96 for 1 OP = 0.18 USDC accounting for decimal difference
    function _computeSqrtPriceX96(address usdc, address, address token0) internal pure returns (uint160) {
        // 1 OP (18 dec) = 0.18 USDC (6 dec)
        // V4 price = amount of token1 per token0 in raw units
        if (token0 == usdc) {
            // 1 USDC = 5.5556 OP → raw price = 5.5556e12
            // sqrtPriceX96 = sqrt(5.5556e12) * 2^96
            return 186742601293858871787747742452809728;
        } else {
            // token0 = OP, token1 = USDC
            // 1 OP = 0.18 USDC → raw price = 1.8e-13
            // sqrtPriceX96 = sqrt(1.8e-13) * 2^96
            return 33613662584877347604918;
        }
    }
}
