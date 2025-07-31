# Verbs

Verbs SDK and demo applications for the Optimism ecosystem

## Structure

This monorepo contains the following packages:

- [`packages/sdk`](./packages/sdk) - The core Verbs TypeScript SDK - A library of bare-bones abstractions for building onchain.

- [`packages/demo/frontend`](./packages/demo/frontend) - A React+vite web application providing a user interface for interacting with Verbs functionality.

- [`packages/demo/backend`](./packages/demo/backend) - A hono service demonstrating the Verbs SDK in a backend environment.

## Setup

```bash
pnpm install
```

## Demo

1. Start a local blockchain (Unichain fork recommended):

```bash
anvil --fork-url https://sepolia.unichain.org
```

2. In a new terminal, deploy and fund the faucet contract:

```bash
cd packages/demo/contracts
pnpm deploy:fund:faucet
```

3. Run the backend [setup steps](./packages/demo/backend/README.md).

4. Run the backend:

```bash
cd packages/demo/backend
pnpm install && pnpm dev
```

5. Open another terminal and run the frontend:

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
