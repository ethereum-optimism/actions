// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Faucet} from "../src/Faucet.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

contract MockERC20 is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}

contract FaucetTest is Test {
    Faucet public faucet;
    MockERC20 public token;
    address public admin = address(0x1);
    address public user = address(0x2);

    function setUp() public {
        vm.prank(admin);
        faucet = new Faucet(admin);
        token = new MockERC20();

        // Fund the faucet with ETH and tokens
        vm.deal(address(faucet), 10 ether);
        token.mint(address(faucet), 1000e18);
    }

    function testConstructor() public view {
        assertEq(faucet.ADMIN(), admin);
    }

    function testDripETH() public {
        uint256 amount = 1 ether;
        uint256 initialBalance = user.balance;

        vm.prank(admin);
        faucet.dripETH(user, amount);

        assertEq(user.balance, initialBalance + amount);
    }

    function testDripERC20() public {
        uint256 amount = 100e18;
        uint256 initialBalance = token.balanceOf(user);

        vm.prank(admin);
        faucet.dripERC20(user, amount, address(token));

        assertEq(token.balanceOf(user), initialBalance + amount);
    }

    function testWithdraw() public {
        uint256 amount = 1 ether;
        uint256 initialBalance = admin.balance;

        vm.prank(admin);
        faucet.withdraw(payable(admin), amount);

        assertEq(admin.balance, initialBalance + amount);
    }

    function testUpdateAdmin() public {
        address newAdmin = address(0x3);

        vm.prank(admin);
        faucet.updateAdmin(newAdmin);

        assertEq(faucet.ADMIN(), newAdmin);
    }

    function testOnlyAdminCanDrip() public {
        vm.prank(user);
        vm.expectRevert("Faucet: function can only be called by admin");
        faucet.dripETH(user, 1 ether);
    }

    function testReceiveETH() public {
        uint256 amount = 1 ether;
        uint256 initialBalance = address(faucet).balance;

        vm.deal(user, amount);
        vm.prank(user);
        (bool success,) = address(faucet).call{value: amount}("");

        assertTrue(success);
        assertEq(address(faucet).balance, initialBalance + amount);
    }

    function testWithdrawERC20() public {
        uint256 amount = 100e18;
        uint256 initialBalance = token.balanceOf(admin);

        vm.prank(admin);
        faucet.withdrawERC20(admin, amount, address(token));

        assertEq(token.balanceOf(admin), initialBalance + amount);
    }

    function testOnlyAdminCanWithdrawERC20() public {
        vm.prank(user);
        vm.expectRevert("Faucet: function can only be called by admin");
        faucet.withdrawERC20(user, 100e18, address(token));
    }
}
