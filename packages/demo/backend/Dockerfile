FROM node:18-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY package.json ./
RUN npm install -g corepack@0.32.0
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

## provide a path for extra certs to be injected into the container
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/extra-ca-certificates.crt

########################################################
# STAGE 1: Monorepo Builder
########################################################

FROM base AS builder
WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prefer-offline

# Build the SDK first
RUN pnpm --filter @eth-optimism/verbs-sdk build

# Build the backend
RUN pnpm --filter @eth-optimism/verbs-service build

# Deploy backend with production dependencies
RUN pnpm deploy --filter @eth-optimism/verbs-service --prod /prod/verbs-backend

########################################################
# STAGE 2: Production Image
########################################################

FROM base AS production

WORKDIR /usr/src/app
COPY --from=builder /prod/verbs-backend ./

EXPOSE 3001

ENTRYPOINT ["pnpm"]
CMD ["start"]