// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPoolFactory {
    function createPool(address tokenA, address tokenB, bool stable) external returns (address pool);
}

interface IRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}
