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

## Authentication

Authenticated routes require **two** Privy credentials on every request:

| Header           | Value                         | Purpose                       |
| ---------------- | ----------------------------- | ----------------------------- |
| `Authorization`  | `Bearer <privy access token>` | Authenticates the caller      |
| `privy-id-token` | `<privy identity token>`      | Resolves the wallet to act on |

Both are verified, and both must have been issued to the same Privy user. A pair
belonging to two different users is rejected with `401`, because the identity
token is what selects the wallet downstream.

Refresh the two together. They come from one login session, so refreshing only
the access token after a `401` leaves a stale identity token in place and every
retry keeps failing. All authentication failures return the same
`401 {"error": "Invalid or expired token"}` regardless of cause, so the body
cannot be used to tell an expired token from a mismatched pair.

## API Endpoints

| Method | Endpoint            | Description         |
| ------ | ------------------- | ------------------- |
| `POST` | `/wallet`           | Create a new wallet |
| `GET`  | `/wallet/:walletId` | Get wallet by ID    |
