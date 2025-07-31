## Contracts

This project contains demo contracts that support the Verbs demo application in the `packages/demo` directory. These contracts are **not intended for production use** and are designed specifically to facilitate funding wallets used in the demo environment.

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
- Automatically funds the deployed faucet with 100 ETH
- Configurable admin address via `FAUCET_ADMIN` environment variable
- Configurable salt via `DEPLOY_SALT` environment variable

**Usage:**
```bash
forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:9545 --broadcast --private-key <your_private_key>
```

### Fund.s.sol
Forge script to fund the faucet with USDC tokens from a whale account.

**Prerequisites:**
1. Impersonate a whale account that has USDC:
```bash
cast rpc anvil_impersonateAccount 0x5752e57DcfA070e3822d69498185B706c293C792 --rpc-url http://localhost:9545
```

**Usage:**
```bash
forge script script/Fund.s.sol:Fund \
  --rpc-url http://localhost:9545 \
  --broadcast \
  --unlocked 0x5752e57DcfA070e3822d69498185B706c293C792 \
  --sender 0x5752e57DcfA070e3822d69498185B706c293C792
```

**Environment Variables:**
- `USDC_ADDRESS` - USDC token contract address (default: Unichain USDC)
- `RECIPIENT_ADDRESS` - Faucet contract address to fund
- `AMOUNT` - Amount of USDC to transfer (default: 1000 USDC)

## Quick Start Scripts

For convenience, the following npm scripts are available:

### `pnpm deploy:faucet`
Deploys the Faucet contract using the default Anvil test account. This uses CREATE2 for deterministic addresses and automatically funds the contract with 100 ETH.

```bash
pnpm deploy:faucet
```

### `pnpm impersonate:whale`
Impersonates a USDC whale account on Unichain (`0x5752e57DcfA070e3822d69498185B706c293C792`) that contains sufficient USDC balance for testing.

```bash
pnpm impersonate:whale
```

### `pnpm fund:faucet` 
Funds the deployed faucet with USDC tokens. **This script is specifically designed for Unichain and uses a known USDC whale account.** It first impersonates the whale account, then transfers USDC to the faucet contract.

```bash
pnpm fund:faucet
```

### `pnpm deploy:fund:faucet`
Complete setup script that deploys the faucet and funds it with USDC in one command. Perfect for setting up the entire demo environment.

```bash
pnpm deploy:fund:faucet
```

**Note:** The funding scripts are specifically configured for **USDC on Unichain** and use a whale account with a known USDC balance. Ensure you're running against a Unichain fork for the funding to work correctly.


