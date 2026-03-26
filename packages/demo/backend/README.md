# Actions Service

A backend service for interacting with the Actions SDK.

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9+

### Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Set up environment variables**

   Create a `.env` file from the example:

   ```bash
   cp .env.example .env
   ```

3. **Get Privy API Keys**

   - Go to [privy.io](https://privy.io)
   - Create an account or log in
   - Copy your App ID and App Secret into `.env`

4. **Start the development server**
   ```bash
   pnpm dev
   ```

## Deploy Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm deploy:uniswap` | Deploy Uniswap V4 pool for demo tokens on Base Sepolia |
| `pnpm deploy:velodrome` | Deploy Velodrome volatile pool for demo tokens on Base Sepolia |

Both require `BASE_SEPOLIA_RPC_URL` and `DEMO_MARKET_SETUP_PRIVATE_KEY` in `.env`.

## API Endpoints

| Method | Endpoint            | Description         |
| ------ | ------------------- | ------------------- |
| `POST` | `/wallet`           | Create a new wallet |
| `GET`  | `/wallet/:walletId` | Get wallet by ID    |
