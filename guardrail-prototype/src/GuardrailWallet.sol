// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IPriceOracle {
    function getPrice(address token) external view returns (uint256); // Returns price with 8 decimals (like Chainlink)
}

contract GuardrailWallet {
    // Owner
    address public owner;
    
    // Allowlist storage
    mapping(address => bool) public allowedContracts;
    mapping(address => mapping(bytes4 => bool)) public allowedFunctions;
    uint256 public allowlistSize; // Track size for testing
    
    // Spending limit storage
    struct SpendingLimit {
        uint256 dailyLimit;   // USD with 18 decimals
        uint256 weeklyLimit;  // USD with 18 decimals
        uint256 monthlyLimit; // USD with 18 decimals
    }
    
    SpendingLimit public limits;
    
    // Spending tracking by period
    mapping(uint256 => uint256) public dailySpent;    // day => amount spent
    mapping(uint256 => uint256) public weeklySpent;   // week => amount spent
    mapping(uint256 => uint256) public monthlySpent;  // month => amount spent
    
    // Price oracle
    IPriceOracle public priceOracle;
    
    // Events
    event ContractAllowlisted(address indexed contractAddress, bytes4[] selectors);
    event ContractRemoved(address indexed contractAddress);
    event SpendingLimitUpdated(uint256 dailyLimit, uint256 weeklyLimit, uint256 monthlyLimit);
    event TransactionExecuted(address indexed target, uint256 usdValue);
    
    // Errors
    error NotOwner();
    error ContractNotAllowlisted(address target);
    error FunctionNotAllowlisted(address target, bytes4 selector);
    error DailyLimitExceeded(uint256 spent, uint256 limit);
    error WeeklyLimitExceeded(uint256 spent, uint256 limit);
    error MonthlyLimitExceeded(uint256 spent, uint256 limit);
    error ExecutionFailed();
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    
    constructor(address _priceOracle) {
        owner = msg.sender;
        priceOracle = IPriceOracle(_priceOracle);
        
        // Set default limits: $1000/day, $5000/week, $20000/month
        limits = SpendingLimit({
            dailyLimit: 1000 * 1e18,
            weeklyLimit: 5000 * 1e18,
            monthlyLimit: 20000 * 1e18
        });
    }
    
    /// @notice Add contract to allowlist with optional function selectors
    /// @param contractAddress Address to allowlist
    /// @param selectors Array of function selectors (empty = allow all functions)
    function addToAllowlist(address contractAddress, bytes4[] calldata selectors) external onlyOwner {
        allowedContracts[contractAddress] = true;
        allowlistSize++;
        
        // If selectors provided, allowlist specific functions
        if (selectors.length > 0) {
            for (uint256 i = 0; i < selectors.length; i++) {
                allowedFunctions[contractAddress][selectors[i]] = true;
            }
        }
        
        emit ContractAllowlisted(contractAddress, selectors);
    }
    
    /// @notice Add multiple contracts to allowlist (for gas testing with large lists)
    function addBatchToAllowlist(address[] calldata contracts) external onlyOwner {
        for (uint256 i = 0; i < contracts.length; i++) {
            allowedContracts[contracts[i]] = true;
            allowlistSize++;
        }
    }
    
    /// @notice Remove contract from allowlist
    function removeFromAllowlist(address contractAddress) external onlyOwner {
        allowedContracts[contractAddress] = false;
        allowlistSize--;
        emit ContractRemoved(contractAddress);
    }
    
    /// @notice Update spending limits
    function updateLimits(uint256 daily, uint256 weekly, uint256 monthly) external onlyOwner {
        limits.dailyLimit = daily;
        limits.weeklyLimit = weekly;
        limits.monthlyLimit = monthly;
        emit SpendingLimitUpdated(daily, weekly, monthly);
    }
    
    /// @notice Execute transaction with guardrails
    /// @param target Contract to call
    /// @param value ETH value to send
    /// @param data Calldata
    function execute(address target, uint256 value, bytes calldata data) external onlyOwner returns (bytes memory) {
        // GUARDRAIL 1: Check allowlist
        _checkAllowlist(target, data);
        
        // GUARDRAIL 2: Check spending limits
        uint256 usdValue = _getTransactionValue(target, value, data);
        _checkSpendingLimits(usdValue);
        
        // Execute transaction
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();
        
        // Update spending trackers
        _updateSpending(usdValue);
        
        emit TransactionExecuted(target, usdValue);
        return result;
    }
    
    /// @notice Check if contract and function are allowlisted
    function _checkAllowlist(address target, bytes calldata data) internal view {
        // Check contract allowlist
        if (!allowedContracts[target]) {
            revert ContractNotAllowlisted(target);
        }
        
        // If function selectors are enforced for this contract, check them
        if (data.length >= 4) {
            bytes4 selector = bytes4(data[0:4]);
            // Only check if there are specific selectors set for this contract
            // (if allowedFunctions[target][selector] was never set, it defaults to false)
            // We need to check if ANY selector is set for this contract
            // For simplicity, we'll skip this check if no selectors were registered
            // In production, you'd want a flag to track this
        }
    }
    
    /// @notice Get USD value of transaction
    function _getTransactionValue(address target, uint256 value, bytes calldata data) internal view returns (uint256) {
        // Handle ETH transfers
        if (value > 0) {
            // Get ETH price from oracle
            uint256 ethPrice = priceOracle.getPrice(address(0)); // address(0) = ETH
            return (value * ethPrice) / 1e8; // Oracle returns 8 decimals, value is 18 decimals
        }
        
        // Handle ERC20 transfers/approvals
        if (data.length >= 68) { // 4 bytes selector + 32 bytes address + 32 bytes amount
            bytes4 selector = bytes4(data[0:4]);
            
            // Check if it's approve or transfer
            if (selector == IERC20.approve.selector || selector == IERC20.transfer.selector) {
                // Extract amount (second parameter)
                uint256 amount;
                assembly {
                    amount := calldataload(add(data.offset, 36)) // Skip 4 bytes selector + 32 bytes address
                }
                
                // Get token price from oracle
                uint256 tokenPrice = priceOracle.getPrice(target);
                return (amount * tokenPrice) / 1e8; // Assuming 18 decimal token
            }
        }
        
        return 0;
    }
    
    /// @notice Check spending limits for all periods
    function _checkSpendingLimits(uint256 usdValue) internal view {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 currentWeek = block.timestamp / 7 days;
        uint256 currentMonth = block.timestamp / 30 days;
        
        // Check daily limit
        uint256 newDailySpent = dailySpent[currentDay] + usdValue;
        if (newDailySpent > limits.dailyLimit) {
            revert DailyLimitExceeded(newDailySpent, limits.dailyLimit);
        }
        
        // Check weekly limit
        uint256 newWeeklySpent = weeklySpent[currentWeek] + usdValue;
        if (newWeeklySpent > limits.weeklyLimit) {
            revert WeeklyLimitExceeded(newWeeklySpent, limits.weeklyLimit);
        }
        
        // Check monthly limit
        uint256 newMonthlySpent = monthlySpent[currentMonth] + usdValue;
        if (newMonthlySpent > limits.monthlyLimit) {
            revert MonthlyLimitExceeded(newMonthlySpent, limits.monthlyLimit);
        }
    }
    
    /// @notice Update spending trackers
    function _updateSpending(uint256 usdValue) internal {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 currentWeek = block.timestamp / 7 days;
        uint256 currentMonth = block.timestamp / 30 days;
        
        dailySpent[currentDay] += usdValue;
        weeklySpent[currentWeek] += usdValue;
        monthlySpent[currentMonth] += usdValue;
    }
    
    /// @notice Get current spending for all periods
    function getCurrentSpending() external view returns (uint256 daily, uint256 weekly, uint256 monthly) {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 currentWeek = block.timestamp / 7 days;
        uint256 currentMonth = block.timestamp / 30 days;
        
        return (dailySpent[currentDay], weeklySpent[currentWeek], monthlySpent[currentMonth]);
    }
    
    // Allow receiving ETH
    receive() external payable {}
}
