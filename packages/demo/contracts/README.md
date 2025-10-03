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


