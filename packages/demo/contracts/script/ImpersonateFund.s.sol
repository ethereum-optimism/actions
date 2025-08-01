// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

// This script is meant for funding the faucet contract using an impersonated account with anvil.
//
// Before running this script, run:
// cast rpc anvil_impersonateAccount <WHALE_ADDRESS> --rpc-url <rpc-url>
// where <WHALE_ADDRESS> is the address of the account you want to impersonate
// and <rpc-url> is the RPC URL of the network you want to impersonate
// for example:
// cast rpc anvil_impersonateAccount 0x5752e57DcfA070e3822d69498185B706c293C792 --rpc-url http://127.0.0.1:9545
// this will allow you to transfer USDC from the whale account to the recipient account
// you can then run this script to transfer the USDC to the recipient account
// forge script script/ImpersonateFund.s.sol \
//   --rpc-url http://127.0.0.1:9545 \
//   --broadcast \
//   --unlocked 0x5752e57DcfA070e3822d69498185B706c293C792 \
//   --sender 0x5752e57DcfA070e3822d69498185B706c293C792
contract ImpersonateFund is Script {
    function run() public {
        fundFaucetWithErc20();
    }

    function fundFaucetWithErc20() public {
        // 0x078D782b760474a361dDA0AF3839290b0EF57AD6 is the USDC address on unichain.
        address usdc = vm.envOr("ERC20_ADDRESS", address(0x078D782b760474a361dDA0AF3839290b0EF57AD6));
        // Read faucet address from env var or deployment file, fallback to default
        address faucetAddress = readFaucetAddress();
        uint256 amount = vm.envOr("AMOUNT", uint256(1000e6));
        vm.startBroadcast(msg.sender);
        IERC20(usdc).transfer(faucetAddress, amount);
        console.log("Funded faucet with %s tokens", amount);
        vm.stopBroadcast();
    }

    function readFaucetAddress() private view returns (address) {
        if (vm.envOr("FAUCET_ADDRESS", address(0)) != address(0)) {
            address faucetAddress = vm.envAddress("FAUCET_ADDRESS");
            console.log("Faucet address read from env var: %s", faucetAddress);
            return faucetAddress;
        }

        try vm.readFile("../../../latest-faucet-deployment.json") returns (string memory data) {
            bytes memory json = vm.parseJson(data, ".faucetAddress");
            address faucetAddress = abi.decode(json, (address));
            console.log("Faucet address read from deployment file: %s", faucetAddress);
            return faucetAddress;
        } catch {
            // Fallback to default address if deployment file doesn't exist
            console.log("Faucet address not found in deployment file, using default address");
            return address(0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8);
        }
    }
}
