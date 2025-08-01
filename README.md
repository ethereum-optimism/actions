# Verbs

Verbs SDK and demo applications for the Optimism ecosystem

## Structure

This monorepo contains the following packages:

- [`packages/sdk`](./packages/sdk) - The core Verbs TypeScript SDK - A library of bare-bones abstractions for building onchain.

- [`packages/demo/frontend`](./packages/demo/frontend) - A React+vite web application providing a user interface for interacting with Verbs functionality.

- [`packages/demo/backend`](./packages/demo/backend) - A hono service demonstrating the Verbs SDK in a backend environment.

- [`packages/demo/contracts`](./packages/demo/contracts) - Demo smart contracts including a Faucet contract with deployment and funding scripts for local development.

## Setup

```bash
pnpm install
```

## Demo

### Setup

// TODO: add step to copy .env.example files, fetch, and set Privy keys

### Quick Start (Recommended)

While each component of the repo can be run independently, start the complete demo environment in one command:

```bash
pnpm dev
```

This uses `mprocs` to orchestrate multiple processes:

- **Supersim**: Starts a local Ethereum L2 development environment
- **Contract Deployment**: Deploys and funds the demo faucet contract
- **Backend**: Starts the Verbs SDK backend service
- **Frontend**: Starts the React web application

The demo will be available at `http://localhost:5173` once all services are running.

## License

MIT
