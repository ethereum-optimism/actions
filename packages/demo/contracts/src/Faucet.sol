// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title  Faucet
/// @notice Faucet contract that drips ETH or ERC20 tokens to users.
contract Faucet {
    /// @notice Emitted on each drip of ETH.
    /// @param amount     The amount of funds sent.
    /// @param recipient  The recipient of the drip.
    event DripETH(uint256 amount, address indexed recipient);

    /// @notice Emitted on each drip of ERC20 tokens.
    /// @param amount     The amount of funds sent.
    /// @param recipient  The recipient of the drip.
    /// @param token      The address of the ERC20 token.
    event DripERC20(uint256 amount, address indexed recipient, address indexed token);

    /// @notice Admin address that can configure the faucet.
    address public ADMIN;

    /// @notice Modifier that makes a function admin privileged.
    modifier privileged() {
        require(msg.sender == ADMIN, "Faucet: function can only be called by admin");
        _;
    }

    /// @param _admin Admin address that can configure the faucet.
    constructor(address _admin) {
        ADMIN = _admin;
    }

    /// @notice Allows users to donate ETH to this contract.
    receive() external payable {
        // Thank you!
    }

    /// @notice updates the ADMIN address.
    /// @param _admin New admin address.
    function updateAdmin(address _admin) public privileged {
        ADMIN = _admin;
    }

    /// @notice Allows the admin to withdraw funds.
    /// @param _recipient Address to receive the funds.
    /// @param _amount    Amount of ETH in wei to withdraw.
    function withdraw(address payable _recipient, uint256 _amount) public privileged {
        (bool success,) = _recipient.call{value: _amount}("");
        require(success, "Faucet: Failed to execute ETH transfer during withdrawal");
    }

    /// @notice Drips ETH to a recipient account.
    /// @param _recipient Address to receive the funds.
    /// @param _amount    Amount of ETH in wei to drip.
    function dripETH(address _recipient, uint256 _amount) public privileged {
        // Execute transfer of ETH to the recipient account without gas limit
        (bool success,) = _recipient.call{value: _amount}("");
        require(success, "Faucet: Failed to execute ETH transfer during drip to recipient");

        emit DripETH(_amount, _recipient);
    }

    /// @notice Drips ERC20 tokens to a recipient account.
    /// @param _recipient Address to receive the funds.
    /// @param _amount    Amount of ERC20 tokens to drip.
    /// @param _token     Address of the ERC20 token.
    function dripERC20(address _recipient, uint256 _amount, address _token) public privileged {
        // Execute transfer of ERC20 tokens to the recipient account
        bool success = IERC20(_token).transfer(_recipient, _amount);
        require(success, "Faucet: Failed to execute ERC20 transfer during drip to recipient");

        emit DripERC20(_amount, _recipient, _token);
    }
}
