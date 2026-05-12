#!/usr/bin/env bash
set -euo pipefail

# Orchestrator for deploying demo infrastructure:
#   1. Deploy tokens (DemoUSDC + DemoOP)
#   2. Deploy Morpho lend market + vault
#   3. Deploy Uniswap V4 pool with liquidity
#   4. Deploy Velodrome pool with liquidity
#   5. Deploy Morpho borrow market (dUSDC collateral / OP loan)
#
# Usage:
#   ./script/deploy-demo.sh --rpc-url <url> --private-key <key>
#
# State is tracked in state/deployments.json to avoid redeployment.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$CONTRACTS_DIR/state/deployments.json"
CHAIN_ID="84532" # Base Sepolia

# Mirror stdout/stderr to a log file so it can be inspected after the run.
# Override with `DEPLOY_DEMO_LOG=/some/path pnpm deploy:demo`. The default
# lives at the repo root (gitignored as *.log) so contributors don't need
# to write outside the worktree.
DEPLOY_DEMO_LOG="${DEPLOY_DEMO_LOG:-$CONTRACTS_DIR/../../../deploy-demo.log}"
exec > >(tee "$DEPLOY_DEMO_LOG") 2>&1

# Parse arguments (pass through to forge)
FORGE_ARGS=()
SKIP_VELODROME=0
while [[ $# -gt 0 ]]; do
    case $1 in
        --rpc-url) RPC_URL="$2"; FORGE_ARGS+=("$1" "$2"); shift 2 ;;
        --private-key) PRIVATE_KEY="$2"; FORGE_ARGS+=("$1" "$2"); shift 2 ;;
        --skip-velodrome) SKIP_VELODROME=1; shift ;;
        *) FORGE_ARGS+=("$1"); shift ;;
    esac
done

# Fall back to packages/demo/backend/.env when either flag is missing. Lets
# the user invoke `pnpm deploy:demo` with no args once their .env carries
# the deployer key plus a baseSepolia RPC.
#
# RPC precedence:
#   1. --rpc-url flag
#   2. BASE_SEPOLIA_RPC_URL env var (preferred — full JSON-RPC)
#   3. https://sepolia.base.org (public fallback; works for view calls and
#      light deploys, may rate-limit)
#
# We deliberately do NOT use BASE_SEPOLIA_BUNDLER_URL here — bundler
# endpoints (Pimlico, Alchemy AA, etc.) only serve userOp-related methods
# and return empty data for arbitrary eth_call, which makes forge
# scripts revert at the first contract read.
BACKEND_ENV="$CONTRACTS_DIR/../backend/.env"
if [[ -z "${RPC_URL:-}" || -z "${PRIVATE_KEY:-}" ]] && [[ -f "$BACKEND_ENV" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$BACKEND_ENV"; set +a
    if [[ -z "${RPC_URL:-}" ]]; then
        if [[ -n "${BASE_SEPOLIA_RPC_URL:-}" ]]; then
            RPC_URL="$BASE_SEPOLIA_RPC_URL"
        else
            RPC_URL="https://sepolia.base.org"
        fi
        FORGE_ARGS+=(--rpc-url "$RPC_URL")
    fi
    if [[ -z "${PRIVATE_KEY:-}" && -n "${DEMO_MARKET_SETUP_PRIVATE_KEY:-}" ]]; then
        PRIVATE_KEY="$DEMO_MARKET_SETUP_PRIVATE_KEY"
        FORGE_ARGS+=(--private-key "$PRIVATE_KEY")
    fi
fi

if [[ -z "${RPC_URL:-}" || -z "${PRIVATE_KEY:-}" ]]; then
    echo "Usage: $0 --rpc-url <url> --private-key <key>"
    echo "Or populate DEMO_MARKET_SETUP_PRIVATE_KEY (and optionally BASE_SEPOLIA_RPC_URL) in packages/demo/backend/.env"
    exit 1
fi

# Read a value from state file.
# Converts dotted keys (e.g. `velodrome.pool` or
# `morpho.borrow.marketParams.loanToken`) into a fully optional chain
# (`velodrome?.pool`, etc.) so a missing intermediate node returns the
# empty string instead of throwing `Cannot read properties of undefined`.
read_state() {
    local key="${1//./?.}"
    node -e "const s=require('$STATE_FILE'); console.log(s['$CHAIN_ID']?.${key} ?? '')"
}

# Write a value to state file
write_state() {
    local key="$1" value="$2"
    node -e "
        const fs = require('fs');
        const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
        const chain = s['$CHAIN_ID'] = s['$CHAIN_ID'] || {};
        const keys = '${key}'.split('.');
        let obj = chain;
        for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]] = obj[keys[i]] || {};
        }
        obj[keys[keys.length - 1]] = '${value}';
        fs.writeFileSync('$STATE_FILE', JSON.stringify(s, null, 2) + '\n');
    "
}

# Extract address from forge output: "  Label: 0xABC..."
parse_address() {
    local label="$1" output="$2"
    echo "$output" | grep "$label" | grep -oE '0x[0-9a-fA-F]{40}' | head -1
}

# Extract bytes32 from forge output
parse_bytes32() {
    local output="$1"
    echo "$output" | grep -oE '0x[0-9a-fA-F]{64}' | head -1
}

# Extract a decimal integer following a labeled line from forge output:
# "  BorrowMarketParamsLltv: 860000000000000000"
parse_uint() {
    local label="$1" output="$2"
    echo "$output" | grep "$label" | grep -oE '[0-9]+' | tail -1
}

echo "=== Demo Infrastructure Deployment ==="
echo "Chain: $CHAIN_ID (Base Sepolia)"
echo ""

# --- Step 1: Deploy Tokens ---
USDC_ADDR=$(read_state "tokens.USDC_DEMO")
OP_ADDR=$(read_state "tokens.OP_DEMO")

if [[ -z "$USDC_ADDR" || -z "$OP_ADDR" ]]; then
    echo ">>> Deploying tokens..."
    OUTPUT=$(forge script script/DeployDemoTokens.s.sol:DeployDemoTokens \
        "${FORGE_ARGS[@]}" --broadcast 2>&1)
    echo "$OUTPUT"

    USDC_ADDR=$(parse_address "DemoUSDC:" "$OUTPUT")
    OP_ADDR=$(parse_address "DemoOP:" "$OUTPUT")

    if [[ -z "$USDC_ADDR" || -z "$OP_ADDR" ]]; then
        echo "ERROR: Failed to parse token addresses from forge output"
        exit 1
    fi

    write_state "tokens.USDC_DEMO" "$USDC_ADDR"
    write_state "tokens.OP_DEMO" "$OP_ADDR"
    echo "Tokens deployed: USDC=$USDC_ADDR OP=$OP_ADDR"
else
    echo ">>> Tokens already deployed: USDC=$USDC_ADDR OP=$OP_ADDR"
fi
echo ""

# --- Step 2: Deploy Morpho Lend Market ---
VAULT_ADDR=$(read_state "morpho.vault")

if [[ -z "$VAULT_ADDR" ]]; then
    echo ">>> Deploying Morpho lend market..."
    OUTPUT=$(DEMO_USDC_ADDRESS="$USDC_ADDR" DEMO_OP_ADDRESS="$OP_ADDR" \
        forge script script/DeployMorphoLendMarket.s.sol:DeployMorphoLendMarket \
        "${FORGE_ARGS[@]}" --broadcast 2>&1)
    echo "$OUTPUT"

    VAULT_ADDR=$(parse_address "Vault:" "$OUTPUT")
    ORACLE_ADDR=$(parse_address "Oracle:" "$OUTPUT")

    if [[ -z "$VAULT_ADDR" ]]; then
        echo "ERROR: Failed to parse vault address from forge output"
        exit 1
    fi

    write_state "morpho.vault" "$VAULT_ADDR"
    [[ -n "$ORACLE_ADDR" ]] && write_state "morpho.oracle" "$ORACLE_ADDR"
    echo "Morpho deployed: Vault=$VAULT_ADDR"
else
    echo ">>> Morpho already deployed: Vault=$VAULT_ADDR"
fi
echo ""

# --- Step 3: Deploy Uniswap Pool ---
POOL_ID=$(read_state "uniswap.poolId")

if [[ -z "$POOL_ID" ]]; then
    echo ">>> Deploying Uniswap V4 pool..."
    OUTPUT=$(DEMO_USDC_ADDRESS="$USDC_ADDR" DEMO_OP_ADDRESS="$OP_ADDR" \
        forge script script/DeployUniswapMarket.s.sol:DeployUniswapMarket \
        "${FORGE_ARGS[@]}" --broadcast 2>&1)
    echo "$OUTPUT"

    POOL_ID=$(parse_bytes32 "$OUTPUT")

    if [[ -z "$POOL_ID" ]]; then
        echo "ERROR: Failed to parse pool ID from forge output"
        exit 1
    fi

    write_state "uniswap.poolId" "$POOL_ID"
    echo "Uniswap pool deployed: PoolID=$POOL_ID"
else
    echo ">>> Uniswap pool already deployed: PoolID=$POOL_ID"
fi

# --- Step 4: Deploy Velodrome Pool ---
VELO_POOL=$(read_state "velodrome.pool")

if [[ "$SKIP_VELODROME" == "1" ]]; then
    echo ">>> Skipping Velodrome pool (--skip-velodrome)"
elif [[ -z "$VELO_POOL" ]]; then
    echo ">>> Deploying Velodrome pool..."
    OUTPUT=$(DEMO_USDC_ADDRESS="$USDC_ADDR" DEMO_OP_ADDRESS="$OP_ADDR" \
        forge script script/DeployVelodromeMarket.s.sol:DeployVelodromeMarket \
        "${FORGE_ARGS[@]}" --broadcast 2>&1)
    echo "$OUTPUT"

    VELO_POOL=$(parse_address "Pool:" "$OUTPUT")

    if [[ -z "$VELO_POOL" ]]; then
        echo "ERROR: Failed to parse Velodrome pool address from forge output"
        exit 1
    fi

    write_state "velodrome.pool" "$VELO_POOL"
    echo "Velodrome pool deployed: Pool=$VELO_POOL"
else
    echo ">>> Velodrome pool already deployed: Pool=$VELO_POOL"
fi
echo ""

# --- Step 5: Deploy Morpho Borrow Market ---
# Idempotency: skip when morpho.borrow.marketId is already set. To recover from
# a stale state file (e.g., the on-chain market exists but the JSON was wiped,
# or vice versa), clear morpho.borrow.* keys and rerun. Morpho Blue reverts
# MARKET_ALREADY_CREATED on a duplicate createMarket; clearing only the marketId
# key triggers a re-deploy of the oracle and a fresh market.
BORROW_MARKET_ID=$(read_state "morpho.borrow.marketId")

if [[ -z "$BORROW_MARKET_ID" ]]; then
    # Pass any partial state through so the script reuses prior contracts
    # rather than orphaning them on rerun. address(0) sentinel (rather than
    # an unset env var) keeps vm.envOr's parse path simple.
    EXISTING_MOCK_FEED=$(read_state "morpho.borrow.mockFeed")
    EXISTING_ORACLE=$(read_state "morpho.borrow.oracle")
    [[ -z "$EXISTING_MOCK_FEED" ]] && EXISTING_MOCK_FEED="0x0000000000000000000000000000000000000000"
    [[ -z "$EXISTING_ORACLE" ]] && EXISTING_ORACLE="0x0000000000000000000000000000000000000000"

    echo ">>> Deploying Morpho borrow market..."
    if ! OUTPUT=$(DEMO_VAULT_ADDRESS="$VAULT_ADDR" DEMO_OP_ADDRESS="$OP_ADDR" DEMO_USDC_ADDRESS="$USDC_ADDR" \
        BORROW_MOCK_FEED_ADDRESS="$EXISTING_MOCK_FEED" \
        BORROW_ORACLE_ADDRESS="$EXISTING_ORACLE" \
        forge script script/DeployMorphoBorrowMarket.s.sol:DeployMorphoBorrowMarket \
        "${FORGE_ARGS[@]}" --broadcast 2>&1); then
        echo "$OUTPUT"
        echo "ERROR: forge script DeployMorphoBorrowMarket failed"
        exit 1
    fi
    echo "$OUTPUT"

    BORROW_MOCK_FEED=$(parse_address "BorrowMockFeed:" "$OUTPUT")
    BORROW_ORACLE=$(parse_address "BorrowOracle:" "$OUTPUT")
    # Anchor the bytes32 grep on the BorrowMarketId label so forge --broadcast
    # transaction hashes (also 64-hex) cannot be misread as the market id.
    # console.logBytes32 prints the value on the line after the label.
    BORROW_MARKET_ID=$(echo "$OUTPUT" | grep -A1 "BorrowMarketId:" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)

    # MarketParams fields, emitted by the deploy script so the SDK and demo
    # backend can encode write-side calldata without re-deriving constants.
    BORROW_PARAMS_LOAN_TOKEN=$(parse_address "BorrowMarketParamsLoanToken:" "$OUTPUT")
    BORROW_PARAMS_COLLATERAL_TOKEN=$(parse_address "BorrowMarketParamsCollateralToken:" "$OUTPUT")
    BORROW_PARAMS_ORACLE=$(parse_address "BorrowMarketParamsOracle:" "$OUTPUT")
    BORROW_PARAMS_IRM=$(parse_address "BorrowMarketParamsIrm:" "$OUTPUT")
    BORROW_PARAMS_LLTV=$(parse_uint "BorrowMarketParamsLltv:" "$OUTPUT")

    if [[ -z "$BORROW_MARKET_ID" || -z "$BORROW_ORACLE" || -z "$BORROW_MOCK_FEED" ]]; then
        echo "ERROR: Failed to parse borrow market addresses/id from forge output"
        exit 1
    fi
    if [[ -z "$BORROW_PARAMS_LOAN_TOKEN" || -z "$BORROW_PARAMS_COLLATERAL_TOKEN" \
        || -z "$BORROW_PARAMS_ORACLE" || -z "$BORROW_PARAMS_IRM" \
        || -z "$BORROW_PARAMS_LLTV" ]]; then
        echo "ERROR: Failed to parse borrow market params from forge output"
        exit 1
    fi

    # Write marketId first: it is the idempotency guard. If the script aborts
    # mid-write, a rerun must re-deploy from scratch (otherwise we orphan
    # contracts because the oracle address is part of the market id hash and
    # a fresh oracle produces a different id).
    write_state "morpho.borrow.marketId" "$BORROW_MARKET_ID"
    write_state "morpho.borrow.mockFeed" "$BORROW_MOCK_FEED"
    write_state "morpho.borrow.oracle" "$BORROW_ORACLE"
    write_state "morpho.borrow.marketParams.loanToken" "$BORROW_PARAMS_LOAN_TOKEN"
    write_state "morpho.borrow.marketParams.collateralToken" "$BORROW_PARAMS_COLLATERAL_TOKEN"
    write_state "morpho.borrow.marketParams.oracle" "$BORROW_PARAMS_ORACLE"
    write_state "morpho.borrow.marketParams.irm" "$BORROW_PARAMS_IRM"
    write_state "morpho.borrow.marketParams.lltv" "$BORROW_PARAMS_LLTV"
    echo "Morpho borrow market deployed: marketId=$BORROW_MARKET_ID"
else
    echo ">>> Morpho borrow market already deployed: marketId=$BORROW_MARKET_ID"
fi

echo ""
echo "=== Deployment Complete ==="
echo "State saved to: $STATE_FILE"
