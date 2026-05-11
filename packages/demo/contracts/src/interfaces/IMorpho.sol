// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @notice Market parameters for Morpho Blue
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

/// @notice Minimal interface for Morpho Blue
interface IMorpho {
    /// @notice Creates a new market with the given parameters
    function createMarket(MarketParams memory marketParams) external;

    /// @notice Supplies collateral to a market
    function supplyCollateral(MarketParams memory marketParams, uint256 assets, address onBehalf, bytes calldata data)
        external;

    /// @notice Borrows assets from a market
    function borrow(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    /// @notice Supplies assets as borrowable liquidity to a market
    function supply(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata data
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied);

    /// @notice Returns the market ID for given parameters
    function idToMarketParams(bytes32 id) external view returns (MarketParams memory);

    /// @notice Returns market state for a given market id
    function market(bytes32 id)
        external
        view
        returns (
            uint128 totalSupplyAssets,
            uint128 totalSupplyShares,
            uint128 totalBorrowAssets,
            uint128 totalBorrowShares,
            uint128 lastUpdate,
            uint128 fee
        );
}

/// @notice Minimal interface for MetaMorpho vault
interface IMetaMorpho {
    /// @notice Submits a new supply cap for a market (requires timelock)
    function submitCap(MarketParams memory marketParams, uint256 newSupplyCap) external;

    /// @notice Accepts a pending supply cap
    function acceptCap(MarketParams memory marketParams) external;

    /// @notice Sets the supply queue
    function setSupplyQueue(bytes32[] calldata newSupplyQueue) external;

    /// @notice Updates the withdraw queue
    function updateWithdrawQueue(uint256[] calldata indexes) external;

    /// @notice Deposits assets and mints shares
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /// @notice Returns pending cap info
    function pendingCap(bytes32 id) external view returns (uint192 value, uint64 validAt);

    /// @notice Returns the timelock duration
    function timelock() external view returns (uint256);
}

/// @notice Minimal interface for MetaMorpho factory
interface IMetaMorphoFactory {
    /// @notice Creates a new MetaMorpho vault
    function createMetaMorpho(
        address initialOwner,
        uint256 initialTimelock,
        address asset,
        string memory name,
        string memory symbol,
        bytes32 salt
    ) external returns (address metaMorpho);
}
