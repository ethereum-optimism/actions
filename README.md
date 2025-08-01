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

### Quick Start (Recommended)

Start the complete demo environment in one command:

```bash
pnpm dev
```

This uses `mprocs` to orchestrate multiple processes:
- **Supersim**: Starts a local Ethereum L2 development environment
- **Contract Deployment**: Deploys and funds the demo faucet contract
- **Backend**: Starts the Verbs SDK backend service
- **Frontend**: Starts the React web application

The demo will be available at `http://localhost:5173` once all services are running.

### Manual Setup (Alternative)

If you prefer to run services individually:

1. Run the backend [setup steps](./packages/demo/backend/README.md).
2. Run the backend:

```bash
cd packages/demo/backend
pnpm install && pnpm dev
```

3. Open another terminal and run the frontend:

```bash
cd packages/demo/frontend
pnpm install && pnpm dev
```

## Development

```bash
pnpm build        # Build all packages (includes type checking)
pnpm lint         # Lint all packages
```

## License

MIT
