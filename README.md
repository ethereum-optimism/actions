# Actions

Actions SDK and demo applications for the Optimism ecosystem

## Structure

This monorepo contains the following packages:

- [`packages/sdk`](./packages/sdk) - The core Actions TypeScript SDK - A library of bare-bones abstractions for building onchain.

- [`packages/demo/frontend`](./packages/demo/frontend) - A React+vite web application providing a user interface for interacting with Actions functionality.

- [`packages/demo/backend`](./packages/demo/backend) - A hono service demonstrating the Actions SDK in a backend environment.

- [`packages/demo/contracts`](./packages/demo/contracts) - Demo smart contracts including a Faucet contract with deployment and funding scripts for local development.

## Setup

```bash
pnpm install
```

## Demo

### Setup

1. **Init env vars**

   Copy all example environment files to create local configuration:

   ```bash
   cp packages/demo/backend/.env.example packages/demo/backend/.env
   cp packages/demo/frontend/.env.example packages/demo/frontend/.env
   cp packages/sdk/.env.test.local.example packages/sdk/.env.test.local
   ```

2. **Configure Providers**

   Create a Privy account at [privy.io](https://privy.io) and update the environment files:

   ```bash
   # Edit packages/demo/backend/.env
   PRIVY_APP_ID=your_privy_app_id_here
   PRIVY_APP_SECRET=your_privy_app_secret_here

   # Optionally, for SDK tests: Edit packages/sdk/.env.test.local
   PRIVY_APP_ID=your_privy_app_id_here
   PRIVY_APP_SECRET=your_privy_app_secret_here
   ```

   The remaining environment variables are pre-configured for local development.

### Quick Start (Recommended)

While each component of the repo can be run independently, start the complete demo environment in one command:

```bash
pnpm dev
```

This uses `mprocs` to orchestrate multiple processes:

- **Supersim**: Starts a local Ethereum L2 development environment
- **Contract Deployment**: Deploys and funds the demo faucet contract
- **Backend**: Starts the Actions SDK backend service
- **Frontend**: Starts the React web application

The demo will be available at `http://localhost:5173` once all services are running.

## License

MIT
