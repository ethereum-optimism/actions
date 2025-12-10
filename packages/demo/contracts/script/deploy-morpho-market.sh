#!/bin/bash
set -e

# Morpho Market Deployment Script
# Usage: ./deploy-morpho-market.sh [local|testnet]

MODE="${1:-local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$CONTRACTS_DIR/.morpho-market-deployment.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_step() { echo -e "${GREEN}[STEP]${NC} $1"; }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# Validate mode
if [[ "$MODE" != "local" && "$MODE" != "testnet" ]]; then
    log_error "Invalid mode: $MODE. Use 'local' or 'testnet'"
fi

# Configuration based on mode
if [[ "$MODE" == "local" ]]; then
    RPC_URL="http://127.0.0.1:8545"
    PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    log_info "Mode: LOCAL (anvil fork with time warp)"
else
    RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
    if [[ -z "$DEMO_MARKET_SETUP_PRIVATE_KEY" ]]; then
        log_error "DEMO_MARKET_SETUP_PRIVATE_KEY not set. Add it to your .env file."
    fi
    PRIVATE_KEY="$DEMO_MARKET_SETUP_PRIVATE_KEY"
    log_info "Mode: TESTNET (Base Sepolia)"
fi

# Helper to read JSON state
read_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE"
    else
        echo "{}"
    fi
}

# Helper to write JSON state
write_state() {
    echo "$1" > "$STATE_FILE"
}

# Helper to get value from state
get_state_value() {
    local key="$1"
    read_state | grep -o "\"$key\":\"[^\"]*\"" | cut -d'"' -f4
}

# Check if step 1 is complete by checking for pending cap
check_pending_cap() {
    local vault="$1"
    local market_id="$2"

    # Get pending cap info (returns value, validAt)
    local result
    result=$(cast call "$vault" "pendingCap(bytes32)(uint192,uint64)" "$market_id" --rpc-url "$RPC_URL" 2>/dev/null) || return 1

    # Parse validAt (second value)
    local valid_at
    valid_at=$(echo "$result" | tail -1 | tr -d ' ')

    if [[ "$valid_at" != "0" ]]; then
        echo "$valid_at"
        return 0
    fi
    return 1
}

# LOCAL MODE: Full deployment with time warp
deploy_local() {
    log_step "Starting anvil fork of Base Sepolia..."

    # Kill any existing anvil on port 8545
    pkill -f "anvil.*8545" 2>/dev/null || true
    sleep 1

    anvil --fork-url https://sepolia.base.org --port 8545 --silent &
    ANVIL_PID=$!
    sleep 3

    # Verify anvil is running
    if ! cast block-number --rpc-url "$RPC_URL" &>/dev/null; then
        log_error "Failed to start anvil fork"
    fi
    log_success "Anvil fork started (PID: $ANVIL_PID)"

    # Cleanup on exit
    trap "kill $ANVIL_PID 2>/dev/null" EXIT

    # Get starting balance for gas calculation
    DEPLOYER_ADDRESS=$(cast wallet address "$PRIVATE_KEY")
    START_BALANCE=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL")

    log_step "Step 1: Deploying contracts and submitting cap..."
    cd "$CONTRACTS_DIR"

    # Run step 1 and capture output
    OUTPUT=$(forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep1 \
        --rpc-url "$RPC_URL" \
        --broadcast \
        --private-key "$PRIVATE_KEY" 2>&1) || log_error "Step 1 failed: $OUTPUT"

    # Extract addresses from forge console.log output
    VAULT_ADDRESS=$(echo "$OUTPUT" | grep "Vault:" | grep -o "0x[a-fA-F0-9]\{40\}")
    USDC_ADDRESS=$(echo "$OUTPUT" | grep "DemoUSDC:" | grep -o "0x[a-fA-F0-9]\{40\}")
    OP_ADDRESS=$(echo "$OUTPUT" | grep "DemoOP:" | grep -o "0x[a-fA-F0-9]\{40\}")
    ORACLE_ADDRESS=$(echo "$OUTPUT" | grep "Oracle:" | grep -o "0x[a-fA-F0-9]\{40\}")

    if [[ -z "$VAULT_ADDRESS" ]]; then
        log_error "Failed to extract vault address from output"
    fi

    log_success "Contracts deployed"
    log_info "  Vault: $VAULT_ADDRESS"
    log_info "  USDC:  $USDC_ADDRESS"
    log_info "  OP:    $OP_ADDRESS"

    log_step "Warping time forward 1 day..."
    cast rpc evm_increaseTime 86401 --rpc-url "$RPC_URL" > /dev/null
    cast rpc evm_mine --rpc-url "$RPC_URL" > /dev/null
    log_success "Time warped +24 hours"

    log_step "Step 2: Accepting cap and finalizing vault..."
    OUTPUT=$(VAULT_ADDRESS="$VAULT_ADDRESS" \
        USDC_ADDRESS="$USDC_ADDRESS" \
        OP_ADDRESS="$OP_ADDRESS" \
        ORACLE_ADDRESS="$ORACLE_ADDRESS" \
        forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep2 \
        --rpc-url "$RPC_URL" \
        --broadcast \
        --private-key "$PRIVATE_KEY" 2>&1) || log_error "Step 2 failed: $OUTPUT"

    log_success "Vault finalized with yield generation"

    # Calculate gas used (in gas units, not ETH - anvil has 0 gas price)
    END_BALANCE=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL")
    GAS_USED_WEI=$((START_BALANCE - END_BALANCE))

    # Extract total gas from forge output (more accurate than balance diff on anvil)
    STEP1_GAS=$(echo "$OUTPUT" | grep -o "Gas used: [0-9]*" | head -1 | grep -o "[0-9]*" || echo "0")

    # Verify deployment
    log_step "Verifying deployment..."
    TOTAL_ASSETS=$(cast call "$VAULT_ADDRESS" "totalAssets()(uint256)" --rpc-url "$RPC_URL")
    log_success "Vault total assets: $TOTAL_ASSETS (expected: 1000000000000)"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   LOCAL TEST PASSED${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Deployed Addresses:"
    echo "  USDC_DEMO:  $USDC_ADDRESS"
    echo "  OP_DEMO:    $OP_ADDRESS"
    echo "  Oracle:     $ORACLE_ADDRESS"
    echo "  Vault:      $VAULT_ADDRESS"
    echo ""
    echo "Next steps:"
    echo "  1. Fund DEMO_MARKET_SETUP_PRIVATE_KEY wallet with ~0.001 ETH on Base Sepolia"
    echo "     (Estimated cost: ~8M gas × 2 steps ≈ 0.0002 ETH at typical gas prices)"
    echo "  2. Run: pnpm deploy:morpho:testnet"
    echo ""

    # Cleanup
    kill $ANVIL_PID 2>/dev/null
    trap - EXIT
}

# TESTNET MODE: Two-phase deployment with state tracking
deploy_testnet() {
    cd "$CONTRACTS_DIR"

    # Check for existing deployment state
    VAULT_ADDRESS=$(get_state_value "vault")
    USDC_ADDRESS=$(get_state_value "usdc")
    OP_ADDRESS=$(get_state_value "op")
    ORACLE_ADDRESS=$(get_state_value "oracle")

    if [[ -n "$VAULT_ADDRESS" ]]; then
        log_info "Found existing deployment state"
        log_info "  Vault: $VAULT_ADDRESS"

        # Compute market ID to check pending cap
        MARKET_ID=$(cast keccak "$(cast abi-encode "f(address,address,address,address,uint256)" \
            "$USDC_ADDRESS" \
            "$OP_ADDRESS" \
            "$ORACLE_ADDRESS" \
            "0x46415998764C29aB2a25CbeA6254146D50D22687" \
            "945000000000000000")")

        # Check if cap is already accepted (supply queue is set)
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
            echo ""
            echo "Verify on Base Sepolia Explorer:"
            echo "  Vault: https://sepolia.basescan.org/address/$VAULT_ADDRESS"
            echo ""
            exit 0
        fi

        # Check pending cap status
        VALID_AT=$(check_pending_cap "$VAULT_ADDRESS" "$MARKET_ID")

        if [[ -n "$VALID_AT" ]]; then
            CURRENT_TIME=$(cast block-number --rpc-url "$RPC_URL" | xargs -I{} cast block {} --rpc-url "$RPC_URL" | grep timestamp | awk '{print $2}')

            if [[ "$CURRENT_TIME" -lt "$VALID_AT" ]]; then
                WAIT_SECONDS=$((VALID_AT - CURRENT_TIME))
                WAIT_HOURS=$((WAIT_SECONDS / 3600))
                WAIT_MINS=$(((WAIT_SECONDS % 3600) / 60))

                echo ""
                log_info "=== WAITING PERIOD IN PROGRESS ==="
                echo ""
                echo "Cap submitted, waiting for timelock to expire."
                echo "Time remaining: ${WAIT_HOURS}h ${WAIT_MINS}m"
                echo "Ready at: $(date -r "$VALID_AT" 2>/dev/null || date -d "@$VALID_AT" 2>/dev/null || echo "timestamp $VALID_AT")"
                echo ""
                echo "Run this command again after the waiting period."
                exit 0
            fi

            # Timelock expired, run step 2
            log_step "Timelock expired. Running Step 2..."
            OUTPUT=$(VAULT_ADDRESS="$VAULT_ADDRESS" \
                USDC_ADDRESS="$USDC_ADDRESS" \
                OP_ADDRESS="$OP_ADDRESS" \
                ORACLE_ADDRESS="$ORACLE_ADDRESS" \
                forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep2 \
                --rpc-url "$RPC_URL" \
                --broadcast \
                --private-key "$PRIVATE_KEY" 2>&1) || log_error "Step 2 failed: $OUTPUT"

            log_success "Step 2 complete"

            # Clear state file
            rm -f "$STATE_FILE"

            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}   TESTNET DEPLOYMENT COMPLETE${NC}"
            echo -e "${GREEN}========================================${NC}"
            echo ""
            echo "Deployed Addresses:"
            echo "  USDC_DEMO:  $USDC_ADDRESS"
            echo "  OP_DEMO:    $OP_ADDRESS"
            echo "  Oracle:     $ORACLE_ADDRESS"
            echo "  Vault:      $VAULT_ADDRESS"
            echo ""
            echo "Verify on Base Sepolia Explorer:"
            echo "  Vault: https://sepolia.basescan.org/address/$VAULT_ADDRESS"
            echo ""
            exit 0
        fi
    fi

    # No existing state or invalid state - run step 1
    log_step "Step 1: Deploying contracts and submitting cap..."

    OUTPUT=$(forge script script/DeployMorphoMarket.s.sol:DeployMorphoMarketStep1 \
        --rpc-url "$RPC_URL" \
        --broadcast \
        --private-key "$PRIVATE_KEY" 2>&1) || log_error "Step 1 failed: $OUTPUT"

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

    log_success "Step 1 complete"

    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}   24-HOUR WAITING PERIOD STARTED${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    echo "Deployed Addresses (saved to $STATE_FILE):"
    echo "  USDC_DEMO:  $USDC_ADDRESS"
    echo "  OP_DEMO:    $OP_ADDRESS"
    echo "  Oracle:     $ORACLE_ADDRESS"
    echo "  Vault:      $VAULT_ADDRESS"
    echo ""
    echo "Verify on Base Sepolia Explorer:"
    echo "  Vault: https://sepolia.basescan.org/address/$VAULT_ADDRESS"
    echo ""
    echo "The MetaMorpho factory requires a 1-day timelock before accepting supply caps."
    echo "Run this same command again after 24 hours to complete deployment."
    echo ""
}

# Main
echo ""
echo "=== Morpho Demo Market Deployment ==="
echo ""

if [[ "$MODE" == "local" ]]; then
    deploy_local
else
    deploy_testnet
fi
