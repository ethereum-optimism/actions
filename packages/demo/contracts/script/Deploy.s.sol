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
        address faucetAddress = deployFaucetContract();

        if (vm.envOr("FUND_FAUCET_ETH", false)) {
            fundFaucetWithETH(faucetAddress);
        }

        if (vm.envOr("FUND_FAUCET_ERC20", false)) {
            fundFaucetWithERC20(faucetAddress);
        }
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

        string memory json = string.concat('{"faucetAddress":"', vm.toString(addr_), '"}');
        vm.writeFile("../../../latest-faucet-deployment.json", json);
    }

    function fundFaucetWithETH(address faucetAddress) public {
        uint256 amount = vm.envOr("FUND_FAUCET_ETH_AMOUNT", uint256(1 ether));
        // default to anvil[0] test account
        uint256 funderPrivateKey = vm.envOr(
            "ETH_FUNDER_PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        vm.startBroadcast(funderPrivateKey);

        (bool success,) = faucetAddress.call{value: amount}("");
        require(success, "Failed to fund faucet");
        console.log("Funded faucet with %s ETH", amount);

        vm.stopBroadcast();
    }

    function fundFaucetWithERC20(address faucetAddress) public {
        // 0x078D782b760474a361dDA0AF3839290b0EF57AD6 is the USDC address on unichain.
        address usdc = vm.envOr("ERC20_ADDRESS", address(0x078D782b760474a361dDA0AF3839290b0EF57AD6));
        uint256 amount = vm.envOr("ERC20_AMOUNT", uint256(1000e6));
        // default to anvil[0] test account
        uint256 funderPrivateKey = vm.envOr(
            "ERC20_FUNDER_PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        vm.startBroadcast(funderPrivateKey);

        IERC20(usdc).transfer(faucetAddress, amount);
        console.log("Funded faucet with %s tokens", amount);

        vm.stopBroadcast();
    }

    /// @notice The CREATE2 salt to be used when deploying a contract.
    function _implSalt() internal view returns (bytes32) {
        return keccak256(abi.encodePacked(vm.envOr("DEPLOY_SALT", string("ethers phoenix"))));
    }
}
