// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Simplified Morpho-like vault for gas testing
contract MockMorphoVault {
    IERC20 public immutable asset;
    mapping(address => uint256) public balances;
    
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    
    constructor(address _asset) {
        asset = IERC20(_asset);
    }
    
    /// @notice Deposit assets into vault
    function deposit(uint256 amount) external {
        asset.transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }
    
    /// @notice Withdraw assets from vault
    function withdraw(uint256 amount) external {
        balances[msg.sender] -= amount;
        asset.transferFrom(address(this), msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }
}
