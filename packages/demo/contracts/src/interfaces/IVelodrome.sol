// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPoolFactory {
    function createPool(address tokenA, address tokenB, bool stable) external returns (address pool);
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool);
}

interface IPool {
    function mint(address to) external returns (uint256 liquidity);
    function token0() external view returns (address);
    function token1() external view returns (address);
}
