// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test, console2} from "forge-std/Test.sol";
import {GuardrailWallet} from "../src/GuardrailWallet.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockMorphoVault} from "../src/mocks/MockMorphoVault.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";

contract GuardrailGasTest is Test {
    GuardrailWallet public wallet;
    MockERC20 public usdc;
    MockMorphoVault public morphoVault;
    MockPriceOracle public oracle;
    
    address public owner = address(this);
    uint256 constant USDC_AMOUNT = 1000 * 1e6; // 1000 USDC (6 decimals)
    
    function setUp() public {
        // Deploy oracle
        oracle = new MockPriceOracle();
        
        // Deploy USDC
        usdc = new MockERC20("USD Coin", "USDC");
        oracle.setPrice(address(usdc), 1_00000000); // $1.00
        
        // Deploy Morpho vault
        morphoVault = new MockMorphoVault(address(usdc));
        
        // Deploy guardrail wallet
        wallet = new GuardrailWallet(address(oracle));
        
        // Fund wallet with USDC
        usdc.mint(address(wallet), USDC_AMOUNT);
        
        // Also fund test contract for baseline test
        usdc.mint(address(this), USDC_AMOUNT);
        
        console2.log("\n=== SETUP COMPLETE ===");
        console2.log("Wallet:", address(wallet));
        console2.log("USDC:", address(usdc));
        console2.log("Morpho Vault:", address(morphoVault));
        console2.log("Oracle:", address(oracle));
    }
    
    /// @notice Baseline: Direct approve + deposit (no guardrails)
    function test_Baseline_DirectDeposit() public {
        console2.log("\n=== BASELINE: Direct Deposit (No Guardrails) ===");
        
        // Measure approve gas
        uint256 gasBefore = gasleft();
        usdc.approve(address(morphoVault), USDC_AMOUNT);
        uint256 approveGas = gasBefore - gasleft();
        
        // Measure deposit gas
        gasBefore = gasleft();
        morphoVault.deposit(USDC_AMOUNT);
        uint256 depositGas = gasBefore - gasleft();
        
        console2.log("Approve gas:", approveGas);
        console2.log("Deposit gas:", depositGas);
        console2.log("Total gas:", approveGas + depositGas);
    }
    
    /// @notice Test 1: Allowlist check only (1 contract)
    function test_Guardrail_AllowlistOnly_Single() public {
        console2.log("\n=== TEST 1: Allowlist Check (1 contract) ===");
        
        // Add USDC and Morpho to allowlist
        bytes4[] memory selectors = new bytes4[](0);
        wallet.addToAllowlist(address(usdc), selectors);
        wallet.addToAllowlist(address(morphoVault), selectors);
        
        // Prepare approve calldata
        bytes memory approveData = abi.encodeWithSelector(
            usdc.approve.selector,
            address(morphoVault),
            USDC_AMOUNT
        );
        
        // Measure approve with guardrail
        uint256 gasBefore = gasleft();
        wallet.execute(address(usdc), 0, approveData);
        uint256 approveGas = gasBefore - gasleft();
        
        // Prepare deposit calldata
        bytes memory depositData = abi.encodeWithSelector(
            morphoVault.deposit.selector,
            USDC_AMOUNT
        );
        
        // Measure deposit with guardrail
        gasBefore = gasleft();
        wallet.execute(address(morphoVault), 0, depositData);
        uint256 depositGas = gasBefore - gasleft();
        
        console2.log("Approve gas (with allowlist):", approveGas);
        console2.log("Deposit gas (with allowlist):", depositGas);
        console2.log("Total gas:", approveGas + depositGas);
    }
    
    /// @notice Test 2: Allowlist check with 100 contracts allowlisted
    function test_Guardrail_AllowlistOnly_Large() public {
        console2.log("\n=== TEST 2: Allowlist Check (100 contracts allowlisted) ===");
        
        // Add 100 dummy contracts to allowlist
        address[] memory dummyContracts = new address[](98);
        for (uint256 i = 0; i < 98; i++) {
            dummyContracts[i] = address(uint160(i + 1000));
        }
        wallet.addBatchToAllowlist(dummyContracts);
        
        // Add USDC and Morpho vault
        bytes4[] memory selectors = new bytes4[](0);
        wallet.addToAllowlist(address(usdc), selectors);
        wallet.addToAllowlist(address(morphoVault), selectors);
        
        console2.log("Allowlist size:", wallet.allowlistSize());
        
        // Prepare approve calldata
        bytes memory approveData = abi.encodeWithSelector(
            usdc.approve.selector,
            address(morphoVault),
            USDC_AMOUNT
        );
        
        // Measure approve with guardrail
        uint256 gasBefore = gasleft();
        wallet.execute(address(usdc), 0, approveData);
        uint256 approveGas = gasBefore - gasleft();
        
        // Prepare deposit calldata
        bytes memory depositData = abi.encodeWithSelector(
            morphoVault.deposit.selector,
            USDC_AMOUNT
        );
        
        // Measure deposit with guardrail
        gasBefore = gasleft();
        wallet.execute(address(morphoVault), 0, depositData);
        uint256 depositGas = gasBefore - gasleft();
        
        console2.log("Approve gas (100 contracts):", approveGas);
        console2.log("Deposit gas (100 contracts):", depositGas);
        console2.log("Total gas:", approveGas + depositGas);
    }
    
    /// @notice Test 3: USD spending limit only
    function test_Guardrail_SpendingLimitOnly() public {
        console2.log("\n=== TEST 3: USD Spending Limit Only ===");
        
        // Add Morpho to allowlist (needed for execution)
        bytes4[] memory selectors = new bytes4[](0);
        wallet.addToAllowlist(address(usdc), selectors);
        wallet.addToAllowlist(address(morphoVault), selectors);
        
        // Prepare approve calldata
        bytes memory approveData = abi.encodeWithSelector(
            usdc.approve.selector,
            address(morphoVault),
            USDC_AMOUNT
        );
        
        // Measure approve with spending limit check
        uint256 gasBefore = gasleft();
        wallet.execute(address(usdc), 0, approveData);
        uint256 approveGas = gasBefore - gasleft();
        
        console2.log("Approve gas (with spending limit):", approveGas);
        
        // Check current spending
        (uint256 daily, uint256 weekly, uint256 monthly) = wallet.getCurrentSpending();
        console2.log("Daily spent:", daily / 1e18, "USD");
        console2.log("Weekly spent:", weekly / 1e18, "USD");
        console2.log("Monthly spent:", monthly / 1e18, "USD");
    }
    
    /// @notice Test 4: Combined (allowlist + spending limits)
    function test_Guardrail_Combined() public {
        console2.log("\n=== TEST 4: Combined (Allowlist + Spending Limits) ===");
        
        // Add Morpho to allowlist
        bytes4[] memory selectors = new bytes4[](0);
        wallet.addToAllowlist(address(usdc), selectors);
        wallet.addToAllowlist(address(morphoVault), selectors);
        
        // Prepare approve calldata
        bytes memory approveData = abi.encodeWithSelector(
            usdc.approve.selector,
            address(morphoVault),
            USDC_AMOUNT
        );
        
        // Measure approve with both guardrails
        uint256 gasBefore = gasleft();
        wallet.execute(address(usdc), 0, approveData);
        uint256 approveGas = gasBefore - gasleft();
        
        // Prepare deposit calldata
        bytes memory depositData = abi.encodeWithSelector(
            morphoVault.deposit.selector,
            USDC_AMOUNT
        );
        
        // Measure deposit with both guardrails
        gasBefore = gasleft();
        wallet.execute(address(morphoVault), 0, depositData);
        uint256 depositGas = gasBefore - gasleft();
        
        console2.log("Approve gas (combined):", approveGas);
        console2.log("Deposit gas (combined):", depositGas);
        console2.log("Total gas:", approveGas + depositGas);
        
        // Check spending
        (uint256 daily, uint256 weekly, uint256 monthly) = wallet.getCurrentSpending();
        console2.log("Daily spent:", daily / 1e18, "USD");
    }
    
    /// @notice Test 5: Cost to add contract to allowlist
    function test_Cost_AddToAllowlist() public {
        console2.log("\n=== TEST 5: Cost to Add Contract to Allowlist ===");
        
        address newContract = address(0x1234);
        bytes4[] memory selectors = new bytes4[](0);
        
        uint256 gasBefore = gasleft();
        wallet.addToAllowlist(newContract, selectors);
        uint256 gasUsed = gasBefore - gasleft();
        
        console2.log("Gas to add 1 contract:", gasUsed);
    }
    
    /// @notice Test 6: Cost to add contract with function selectors
    function test_Cost_AddToAllowlistWithSelectors() public {
        console2.log("\n=== TEST 6: Cost to Add Contract with Function Selectors ===");
        
        address newContract = address(0x1234);
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = bytes4(keccak256("deposit(uint256)"));
        selectors[1] = bytes4(keccak256("withdraw(uint256)"));
        selectors[2] = bytes4(keccak256("transfer(address,uint256)"));
        
        uint256 gasBefore = gasleft();
        wallet.addToAllowlist(newContract, selectors);
        uint256 gasUsed = gasBefore - gasleft();
        
        console2.log("Gas to add 1 contract + 3 selectors:", gasUsed);
    }
    
    /// @notice Test 7: Cost to update spending limits
    function test_Cost_UpdateLimits() public {
        console2.log("\n=== TEST 7: Cost to Update Spending Limits ===");
        
        uint256 gasBefore = gasleft();
        wallet.updateLimits(2000 * 1e18, 10000 * 1e18, 40000 * 1e18);
        uint256 gasUsed = gasBefore - gasleft();
        
        console2.log("Gas to update limits:", gasUsed);
    }
    
    /// @notice Test 8: Oracle read overhead
    function test_Cost_OracleRead() public view {
        console2.log("\n=== TEST 8: Oracle Read Overhead ===");
        
        uint256 gasBefore = gasleft();
        uint256 price = oracle.getPrice(address(usdc));
        uint256 gasUsed = gasBefore - gasleft();
        
        console2.log("Gas for oracle read:", gasUsed);
        console2.log("Price returned:", price);
    }
}
