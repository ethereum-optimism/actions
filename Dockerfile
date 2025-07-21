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

COPY ../pnpm-lock.yaml ./
RUN pnpm fetch

COPY . ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prefer-offline

# provide the ability to build a single projects
ARG DOCKER_TARGET

RUN pnpm nx build @eth-optimism/verbs-service
RUN pnpm deploy --filter @eth-optimism/verbs-service --prod /prod/verbs-service

########################################################
# STAGE 2: Image
########################################################

FROM base AS verbs-service

WORKDIR /usr/src/app
COPY --from=builder /prod/verbs-service ./

EXPOSE 3000

ENTRYPOINT ["pnpm"]
CMD ["start"]