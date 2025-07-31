// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

// before running this script, run:
// cast rpc anvil_impersonateAccount <WHALE_ADDRESS> --rpc-url <rpc-url>
// where <WHALE_ADDRESS> is the address of the account you want to impersonate
// and <rpc-url> is the RPC URL of the network you want to impersonate
// for example:
// cast rpc anvil_impersonateAccount 0x5752e57DcfA070e3822d69498185B706c293C792 --rpc-url http://localhost:9545
// this will allow you to transfer USDC from the whale account to the recipient account
// you can then run this script to transfer the USDC to the recipient account
// forge script script/Fund.s.sol:Fund \
//   --rpc-url http://localhost:9545 \
//   --broadcast \
//   --unlocked 0x5752e57DcfA070e3822d69498185B706c293C792 \
//   --sender 0x5752e57DcfA070e3822d69498185B706c293C792
contract Fund is Script {
    function run() public {
        // 0x078D782b760474a361dDA0AF3839290b0EF57AD6 is the USDC address on unichain.
        address usdc = vm.envOr("USDC_ADDRESS", address(0x078D782b760474a361dDA0AF3839290b0EF57AD6));
        // 0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8 is the address of the faucet contract.
        address recipient = vm.envOr("RECIPIENT_ADDRESS", address(0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8));
        uint256 amount = vm.envOr("AMOUNT", uint256(1000e6));
        vm.startBroadcast();
        IERC20(usdc).transfer(recipient, amount);
        vm.stopBroadcast();
    }
}
