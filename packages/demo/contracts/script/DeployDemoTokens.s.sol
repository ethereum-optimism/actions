// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";
import {DemoOP} from "../src/DemoOP.sol";

/// @title DeployDemoTokens
/// @notice Deploys DemoUSDC and DemoOP tokens. Standalone script for use in orchestrated deployments.
contract DeployDemoTokens is Script {
    function run() public {
        vm.startBroadcast();

        DemoUSDC usdc = new DemoUSDC();
        console.log("DemoUSDC:", address(usdc));

        DemoOP op = new DemoOP();
        console.log("DemoOP:", address(op));

        vm.stopBroadcast();
    }
}
