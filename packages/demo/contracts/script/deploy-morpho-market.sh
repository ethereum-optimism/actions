#!/bin/bash
set -e

# Morpho Market Deployment Script
# Usage: ./deploy-morpho-market.sh [local|testnet]

MODE="${1:-local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$CONTRACTS_DIR/.morpho-market-deployment.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_step() { echo -e "${GREEN}[STEP]${NC} $1"; }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# Validate mode
if [[ "$MODE" != "local" && "$MODE" != "testnet" ]]; then
    log_error "Invalid mode: $MODE. Use 'local' or 'testnet'"
fi

# Configuration
if [[ "$MODE" == "local" ]]; then
    RPC_URL="http://127.0.0.1:8545"
    PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    log_info "Mode: LOCAL (anvil fork)"
else
    BACKEND_ENV="$SCRIPT_DIR/../../backend/.env"
    if [[ -f "$BACKEND_ENV" ]]; then
        source "$BACKEND_ENV"
    fi
    RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
    if [[ -z "$DEMO_MARKET_SETUP_PRIVATE_KEY" ]]; then
        log_error "DEMO_MARKET_SETUP_PRIVATE_KEY not set. Add it to packages/demo/backend/.env"
    fi
    PRIVATE_KEY="$DEMO_MARKET_SETUP_PRIVATE_KEY"
    log_info "Mode: TESTNET (Base Sepolia)"
fi

# State helpers
read_state() { [[ -f "$STATE_FILE" ]] && cat "$STATE_FILE" || echo "{}"; }
get_state_value() { read_state | grep -o "\"$1\":\"[^\"]*\"" | cut -d'"' -f4; }
write_state() { echo "$1" > "$STATE_FILE"; }

# Strip scientific notation from cast output
strip_cast_notation() { echo "$1" | sed 's/\[.*\]//' | tr -d ' '; }

# Query and display vault status
show_vault_status() {
    local vault="$1"
    local usdc="$2"
    local op="$3"
    local oracle="$4"

    local MORPHO="0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"
    local IRM="0x46415998764C29aB2a25CbeA6254146D50D22687"
    local LLTV="945000000000000000"

    local total_assets=$(strip_cast_notation "$(cast call "$vault" 'totalAssets()(uint256)' --rpc-url "$RPC_URL")")
    local initial_deposit=1000000000000
    local interest_earned=$((total_assets - initial_deposit))

    local assets_formatted=$(echo "scale=6; $total_assets / 1000000" | bc)
    local interest_formatted=$(echo "scale=6; $interest_earned / 1000000" | bc)

    local market_id=$(cast keccak "$(cast abi-encode 'f(address,address,address,address,uint256)' "$usdc" "$op" "$oracle" "$IRM" "$LLTV")")

    # Get market state from Morpho
    local supply_assets=$(strip_cast_notation "$(cast call "$MORPHO" "market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)" "$market_id" --rpc-url "$RPC_URL" | head -1)")
    local supply_shares=$(strip_cast_notation "$(cast call "$MORPHO" "market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)" "$market_id" --rpc-url "$RPC_URL" | sed -n '2p')")
    local borrow_assets=$(strip_cast_notation "$(cast call "$MORPHO" "market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)" "$market_id" --rpc-url "$RPC_URL" | sed -n '3p')")
    local borrow_shares=$(strip_cast_notation "$(cast call "$MORPHO" "market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)" "$market_id" --rpc-url "$RPC_URL" | sed -n '4p')")
    local last_update=$(strip_cast_notation "$(cast call "$MORPHO" "market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)" "$market_id" --rpc-url "$RPC_URL" | sed -n '5p')")
    local fee=$(strip_cast_notation "$(cast call "$MORPHO" "market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)" "$market_id" --rpc-url "$RPC_URL" | sed -n '6p')")

    local borrow_rate=$(strip_cast_notation "$(cast call "$IRM" \
        "borrowRateView((address,address,address,address,uint256),(uint128,uint128,uint128,uint128,uint128,uint128))(uint256)" \
        "($usdc,$op,$oracle,$IRM,$LLTV)" \
        "($supply_assets,$supply_shares,$borrow_assets,$borrow_shares,$last_update,$fee)" \
        --rpc-url "$RPC_URL" 2>/dev/null)" || echo "0")

    local utilization="0.0"
    local supply_apy="0.00"
    if [[ -n "$supply_assets" && "$supply_assets" != "0" && -n "$borrow_rate" && "$borrow_rate" != "0" ]]; then
        read utilization supply_apy < <(python3 -c "
supply = int('$supply_assets')
borrow = int('$borrow_assets')
rate = int('$borrow_rate') / 1e18
util = borrow / supply if supply > 0 else 0
borrow_apy = rate * 31536000 * 100
supply_apy = borrow_apy * util
print(f'{util * 100:.1f} {supply_apy:.2f}')
" 2>/dev/null || echo "0.0 0.00")
    fi

    echo ""
    echo "Vault Status:"
    echo "  Total Assets:    ${assets_formatted} USDC"
    echo "  Interest Earned: +${interest_formatted} USDC"
    echo "  Utilization:     ${utilization}%"
    echo "  Supply APY:      ${supply_apy}%"
}

# Deploy market
deploy() {
    cd "$CONTRACTS_DIR"

    # Check for existing deployment
    VAULT_ADDRESS=$(get_state_value "vault")
    USDC_ADDRESS=$(get_state_value "usdc")
    OP_ADDRESS=$(get_state_value "op")
    ORACLE_ADDRESS=$(get_state_value "oracle")

    if [[ -n "$VAULT_ADDRESS" ]]; then
        # Verify vault exists and is configured
        SUPPLY_QUEUE_LENGTH=$(cast call "$VAULT_ADDRESS" "supplyQueueLength()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null) || SUPPLY_QUEUE_LENGTH="0"

        if [[ "$SUPPLY_QUEUE_LENGTH" != "0" ]]; then
            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}   MARKET ALREADY DEPLOYED${NC}"
            echo -e "${GREEN}========================================${NC}"
            echo ""
            echo "Deployed Addresses:"
            echo "  USDC_DEMO:  $USDC_ADDRESS"
            echo "  OP_DEMO:    $OP_ADDRESS"
            echo "  Oracle:     $ORACLE_ADDRESS"
            echo "  Vault:      $VAULT_ADDRESS"

            show_vault_status "$VAULT_ADDRESS" "$USDC_ADDRESS" "$OP_ADDRESS" "$ORACLE_ADDRESS"

            if [[ "$MODE" == "testnet" ]]; then
                echo ""
                echo "Verify on Base Sepolia Explorer:"
                echo "  https://sepolia.basescan.org/address/$VAULT_ADDRESS"
            fi
            echo ""
            exit 0
        fi
    fi

    # Fresh deployment
    log_step "Deploying Morpho market..."

    OUTPUT=$(forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarket \
        --rpc-url "$RPC_URL" \
        --broadcast \
        --private-key "$PRIVATE_KEY" 2>&1) || log_error "Deployment failed: $OUTPUT"

    # Extract addresses
    VAULT_ADDRESS=$(echo "$OUTPUT" | grep "Vault:" | grep -o "0x[a-fA-F0-9]\{40\}")
    USDC_ADDRESS=$(echo "$OUTPUT" | grep "DemoUSDC:" | grep -o "0x[a-fA-F0-9]\{40\}")
    OP_ADDRESS=$(echo "$OUTPUT" | grep "DemoOP:" | grep -o "0x[a-fA-F0-9]\{40\}")
    ORACLE_ADDRESS=$(echo "$OUTPUT" | grep "Oracle:" | grep -o "0x[a-fA-F0-9]\{40\}")

    if [[ -z "$VAULT_ADDRESS" ]]; then
        log_error "Failed to extract vault address from output"
    fi

    # Save state
    write_state "{\"vault\":\"$VAULT_ADDRESS\",\"usdc\":\"$USDC_ADDRESS\",\"op\":\"$OP_ADDRESS\",\"oracle\":\"$ORACLE_ADDRESS\"}"

    log_success "Deployment complete"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   DEPLOYMENT COMPLETE${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Deployed Addresses:"
    echo "  USDC_DEMO:  $USDC_ADDRESS"
    echo "  OP_DEMO:    $OP_ADDRESS"
    echo "  Oracle:     $ORACLE_ADDRESS"
    echo "  Vault:      $VAULT_ADDRESS"

    show_vault_status "$VAULT_ADDRESS" "$USDC_ADDRESS" "$OP_ADDRESS" "$ORACLE_ADDRESS"

    if [[ "$MODE" == "testnet" ]]; then
        echo ""
        echo "Verify on Base Sepolia Explorer:"
        echo "  https://sepolia.basescan.org/address/$VAULT_ADDRESS"
    fi
    echo ""
}

# LOCAL MODE: Start anvil fork first
deploy_local() {
    log_step "Starting anvil fork of Base Sepolia..."

    pkill -f "anvil.*8545" 2>/dev/null || true
    sleep 1

    anvil --fork-url https://sepolia.base.org --port 8545 --silent &
    ANVIL_PID=$!
    sleep 3

    if ! cast block-number --rpc-url "$RPC_URL" &>/dev/null; then
        log_error "Failed to start anvil fork"
    fi
    log_success "Anvil fork started (PID: $ANVIL_PID)"

    trap "kill $ANVIL_PID 2>/dev/null" EXIT

    # Clear any existing state for local mode
    rm -f "$STATE_FILE"

    deploy

    kill $ANVIL_PID 2>/dev/null
    trap - EXIT
}

# Main
echo ""
echo "=== Morpho Demo Market Deployment ==="
echo ""

if [[ "$MODE" == "local" ]]; then
    deploy_local
else
    deploy
fi
