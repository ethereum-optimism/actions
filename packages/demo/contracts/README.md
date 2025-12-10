## Contracts

This project contains demo contracts that support the Actions demo application in the `packages/demo` directory. These contracts are **not intended for production use** and are designed specifically to facilitate funding wallets used in the demo environment.

The system includes a Faucet contract with deployment and funding scripts:

### Faucet.sol
The main faucet contract that allows privileged users to distribute ETH and ERC20 tokens.

**Features:**
- **Admin-controlled**: Only the admin can drip tokens and manage the contract
- **ETH dripping**: Send ETH to recipients via `dripETH()`
- **ERC20 dripping**: Send any ERC20 token to recipients via `dripERC20()`
- **Fund management**: Admin can withdraw funds and update admin address
- **Donations**: Anyone can send ETH to the contract via the `receive()` function

**Key Functions:**
- `dripETH(recipient, amount)` - Send ETH to a recipient
- `dripERC20(recipient, amount, tokenAddress)` - Send ERC20 tokens to a recipient
- `withdraw(recipient, amount)` - Admin withdraw ETH
- `updateAdmin(newAdmin)` - Update the admin address

### Deploy.s.sol
Forge deployment script that deploys the Faucet contract using CREATE2 for deterministic addresses.

**Features:**
- Uses CREATE2 for consistent contract addresses across networks
- Optional funding with ETH and ERC20 tokens via environment variables
- Configurable admin address via `FAUCET_ADMIN` environment variable
- Configurable salt via `DEPLOY_SALT` environment variable

**Usage:**
```bash
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:9545 --broadcast --private-key <your_private_key>
```

### ImpersonateFund.s.sol
Forge script to fund the faucet with USDC tokens from an impersonated whale account.

This script is meant for funding the faucet contract using an impersonated account with Anvil.

**Prerequisites:**
1. Impersonate a whale account that has USDC:
```bash
cast rpc anvil_impersonateAccount <WHALE_ADDRESS> --rpc-url <rpc-url>
```

Where `<WHALE_ADDRESS>` is the address of the account you want to impersonate and `<rpc-url>` is the RPC URL of the network you want to impersonate (**Note**: make sure this is an anvil node).

**Example:**
```bash
cast rpc anvil_impersonateAccount 0x5752e57DcfA070e3822d69498185B706c293C792 --rpc-url http://127.0.0.1:9545
```

This will allow you to transfer USDC from the whale account to the recipient account.

**Usage:**
After impersonating the whale account, run this script to transfer the USDC to the faucet contract:
```bash
forge script script/ImpersonateFund.s.sol \
  --rpc-url http://127.0.0.1:9545 \
  --broadcast \
  --unlocked 0x5752e57DcfA070e3822d69498185B706c293C792 \
  --sender 0x5752e57DcfA070e3822d69498185B706c293C792
```



### DeployMorphoMarket.s.sol

Forge deployment script that creates a complete Morpho lending market for demo purposes. This script deploys tokens, creates a market, deploys a vault, and sets up yield generation - all in one transaction.

**What it creates:**
- `DemoUSDC` - Mintable ERC20 loan token (6 decimals)
- `DemoOP` - Mintable ERC20 collateral token (18 decimals)
- `FixedPriceOracle` - Returns 1:1 price (1 USDC per 1 OP)
- Morpho Blue market with 94.5% LLTV
- MetaMorpho vault ("Actions Demo USDC Vault" / "dUSDC") with unlimited deposit cap
- Yield-generating borrow position (99% utilization for high APY)

**Prerequisites:**
1. Create a new wallet and save the private key as `DEMO_MARKET_SETUP_PRIVATE_KEY` in your `.env` file
2. Fund the wallet with at least **0.1 ETH** on Base Sepolia (covers deployment + buffer for retries)
   - Use a faucet like https://www.alchemy.com/faucets/base-sepolia
3. Set `BASE_SEPOLIA_RPC_URL` in your `.env` file

**Environment Variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `DEMO_MARKET_SETUP_PRIVATE_KEY` | Private key for deployment wallet (owns all contracts) | Yes |
| `BASE_SEPOLIA_RPC_URL` | RPC URL for Base Sepolia (e.g., `https://sepolia.base.org`) | Yes |

**Usage:**
```bash
cd packages/demo/contracts

# Deploy the complete Morpho market setup
forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarket \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --private-key $DEMO_MARKET_SETUP_PRIVATE_KEY
```

**Estimated Gas Cost:** ~5-6M gas (~0.01 ETH at current Base Sepolia prices)

**Output:**
The script outputs all deployed contract addresses. Save these to update the SDK and demo app configs:
- Loan Token (USDC_DEMO)
- Collateral Token (OP_DEMO)
- Oracle
- Vault

**Post-Deployment:**
After running the script, update these config files with the new addresses:
- `packages/sdk/src/supported/tokens.ts` - Add USDC_DEMO and OP_DEMO token addresses
- `packages/demo/backend/src/config/assets.ts` - Add asset configurations
- `packages/demo/backend/src/config/markets.ts` - Add new vault address
- `packages/demo/frontend/src/constants/markets.ts` - Update frontend market config

**How Yield Works:**
The script creates a borrow position with 99% utilization, causing high interest rates. This interest accrues to vault depositors in real-time. Users see their balances grow when querying the vault - no ongoing maintenance required.

---

## Quick Start Scripts

For convenience, the following npm scripts are available:

### `pnpm deploy:faucet:supersim`
Deploys the Faucet contract to Supersim using the default Anvil test account. This uses CREATE2 for deterministic addresses.

```bash
pnpm deploy:faucet:supersim
```

### `pnpm impersonate:whale`
Impersonates a USDC whale account on Unichain (`0x5752e57DcfA070e3822d69498185B706c293C792`) that contains sufficient USDC balance for testing.

```bash
pnpm impersonate:whale
```

### `pnpm impersonate:fund:faucet` 
Funds the deployed faucet with USDC tokens. **This script is specifically designed for Unichain and uses a known USDC whale account.** It first impersonates the whale account, then transfers USDC to the faucet contract.

```bash
pnpm impersonate:fund:faucet
```

### `pnpm deploy:impersonate:fund:faucet`
Complete setup script that deploys the faucet to Supersim and funds it with USDC in one command. Perfect for setting up the entire demo environment.

```bash
pnpm deploy:impersonate:fund:faucet
```

**Note:** The funding scripts are specifically configured for **USDC on Unichain** and use a whale account with a known USDC balance. Ensure you're running against a Unichain fork for the funding to work correctly.

## Environment Variables

The following environment variables can be used to configure the deployment and funding scripts:

### Deploy.s.sol Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `FAUCET_ADMIN` | Admin address for the faucet contract | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Anvil test account) |
| `DEPLOY_SALT` | Salt for CREATE2 deployment | `"ethers phoenix"` |
| `FUND_FAUCET_ETH` | Whether to fund the faucet with ETH after deployment | `false` |
| `FUND_FAUCET_ERC20` | Whether to fund the faucet with ERC20 tokens after deployment | `false` |
| `FUND_FAUCET_ETH_AMOUNT` | Amount of ETH to fund the faucet with (in wei) | `1000000000000000000` (1 ETH) |
| `ETH_FUNDER_PRIVATE_KEY` | Private key for ETH funding transactions | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (Anvil test account) |
| `ERC20_ADDRESS` | Address of the ERC20 token to fund with | `0x078D782b760474a361dDA0AF3839290b0EF57AD6` (USDC on Unichain) |
| `ERC20_AMOUNT` | Amount of ERC20 tokens to fund with | `1000000000` (1000 USDC with 6 decimals) |
| `ERC20_FUNDER_PRIVATE_KEY` | Private key for ERC20 funding transactions | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (Anvil test account) |

### ImpersonateFund.s.sol Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `ERC20_ADDRESS` | Address of the ERC20 token to transfer | `0x078D782b760474a361dDA0AF3839290b0EF57AD6` (USDC on Unichain) |
| `FAUCET_ADDRESS` | Target faucet contract address | Reads from `latest-faucet-deployment.json`, fallback: `0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8` |
| `AMOUNT` | Amount of tokens to transfer | `1000000000` (1000 USDC with 6 decimals) |


