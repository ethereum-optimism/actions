#!/usr/bin/env bash
set -euo pipefail

# Orchestrator for deploying demo infrastructure:
#   1. Deploy tokens (DemoUSDC + DemoOP)
#   2. Deploy Morpho market + vault
#   3. Deploy Uniswap V4 pool with liquidity
#
# Usage:
#   ./script/deploy-demo.sh --rpc-url <url> --private-key <key>
#
# State is tracked in state/deployments.json to avoid redeployment.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$CONTRACTS_DIR/state/deployments.json"
CHAIN_ID="84532" # Base Sepolia

# Parse arguments (pass through to forge)
FORGE_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --rpc-url) RPC_URL="$2"; FORGE_ARGS+=("$1" "$2"); shift 2 ;;
        --private-key) PRIVATE_KEY="$2"; FORGE_ARGS+=("$1" "$2"); shift 2 ;;
        *) FORGE_ARGS+=("$1"); shift ;;
    esac
done

if [[ -z "${RPC_URL:-}" || -z "${PRIVATE_KEY:-}" ]]; then
    echo "Usage: $0 --rpc-url <url> --private-key <key>"
    exit 1
fi

# Read a value from state file
read_state() {
    node -e "const s=require('$STATE_FILE'); console.log(s['$CHAIN_ID']?.${1} ?? '')"
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

# --- Step 2: Deploy Morpho Market ---
VAULT_ADDR=$(read_state "morpho.vault")

if [[ -z "$VAULT_ADDR" ]]; then
    echo ">>> Deploying Morpho market..."
    OUTPUT=$(DEMO_USDC_ADDRESS="$USDC_ADDR" DEMO_OP_ADDRESS="$OP_ADDR" \
        forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarket \
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

echo ""
echo "=== Deployment Complete ==="
echo "State saved to: $STATE_FILE"
