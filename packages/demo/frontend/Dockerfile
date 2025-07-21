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

# Build the frontend
RUN pnpm --filter verbs-ui build

########################################################
# STAGE 2: Nginx Production Image
########################################################

FROM nginx:alpine AS production

# Copy built assets from builder stage
COPY --from=builder /usr/src/app/packages/demo/frontend/dist /usr/share/nginx/html

# Copy custom nginx config if needed
# COPY packages/demo/frontend/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]