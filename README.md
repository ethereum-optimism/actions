# Verbs

Verbs SDK and demo applications for the Optimism ecosystem
.
## Structure

This monorepo contains the following packages:

### [`packages/sdk`](./packages/sdk)

The core Verbs TypeScript SDK - A library of bare-bones abstractions for building onchain.

### [`packages/demo/frontend`](./packages/demo/frontend)

A React+vite web application providing a user interface for interacting with Verbs functionality.

### [`packages/demo/backend`](./packages/demo/backend)

A hono service demonstrating the Verbs SDK in a backend environment.

## Development

This project uses [pnpm](https://pnpm.io/) workspaces for dependency management.

### Setup

```bash
pnpm install
```

### Building

Build all packages:

```bash
pnpm build
```

### Development

Start the backend service:

```bash
cd packages/demo/backend
pnpm dev
```

Start the frontend development server:

```bash
cd packages/demo/frontend
pnpm dev
```

### Linting

Lint all packages:

```bash
pnpm lint
```

Fix linting issues:

```bash
pnpm lint:fix
```

### Type Checking

Run TypeScript type checking on all packages:

```bash
pnpm typecheck
```

## License

MIT
