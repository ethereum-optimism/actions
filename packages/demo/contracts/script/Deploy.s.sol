// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";
import {Faucet} from "../src/Faucet.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

contract Deploy is Script {
    /// @notice Modifier that wraps a function in broadcasting.
    modifier broadcast() {
        vm.startBroadcast(msg.sender);
        _;
        vm.stopBroadcast();
    }

    function run() public {
        string memory rpcUrl = vm.envOr("RPC_URL", string("http://localhost:9545"));
        console.log("Deploying to RPC: ", rpcUrl);
        vm.createSelectFork(rpcUrl);
        deployFaucetContract();
    }

    function deployFaucetContract() public broadcast returns (address addr_) {
        // defaults to anvil[0] test account
        address admin = vm.envOr("FAUCET_ADMIN", address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266));
        bytes memory constructorArgs = abi.encode(admin);
        bytes memory initCode = abi.encodePacked(type(Faucet).creationCode, constructorArgs);
        address preComputedAddress = vm.computeCreate2Address(_implSalt(), keccak256(initCode));
        if (preComputedAddress.code.length > 0) {
            console.log("Faucet already deployed at %s", preComputedAddress);
            addr_ = preComputedAddress;
        } else {
            addr_ = address(new Faucet{salt: _implSalt()}(admin));
            console.log("Faucet deployed at %s", addr_);
        }

        fundContract(addr_);
    }

    function fundContract(address faucetAddress) public {
        uint256 ethAmount = 100 ether;

        (bool success,) = faucetAddress.call{value: ethAmount}("");
        require(success, "Failed to fund faucet");
        console.log("Funded faucet with %s ETH", ethAmount);
    }

    /// @notice The CREATE2 salt to be used when deploying a contract.
    function _implSalt() internal view returns (bytes32) {
        return keccak256(abi.encodePacked(vm.envOr("DEPLOY_SALT", string("ethers phoenix"))));
    }
}
