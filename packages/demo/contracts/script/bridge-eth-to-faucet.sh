#!/usr/bin/env bash
set -euo pipefail

# Bridge ETH from Sepolia L1 to OP Sepolia, sending directly to the faucet contract.
# Uses the official OP L1StandardBridge.depositETHTo() to bridge and deliver in one tx.
#
# Usage:
#   pnpm bridge:faucet                          # bridge 0.1 ETH (default)
#   pnpm bridge:faucet -- --amount 0.5          # bridge 0.5 ETH
#   pnpm bridge:faucet -- --amount 0.2 --dry-run  # preview without sending
#
# Required env vars (loaded from packages/demo/backend/.env):
#   FAUCET_FUNDER_PRIVATE_KEY  - private key of the sender on Sepolia L1
#   OP_SEPOLIA_FAUCET_ADDRESS - faucet contract address on OP Sepolia

# OP Sepolia L1StandardBridge on Sepolia L1
# @see https://docs.optimism.io/chain/addresses
L1_STANDARD_BRIDGE="0xFBb0621E0B23b5A62104c2202E4522AF10Db1d20"
SEPOLIA_RPC="https://ethereum-sepolia-rpc.publicnode.com"
MIN_GAS_LIMIT=200000

# Defaults
AMOUNT="0.1"
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --amount) AMOUNT="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --) shift ;; # skip pnpm separator
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# Load env from backend .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../backend/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# Validate required env vars
if [[ -z "${FAUCET_FUNDER_PRIVATE_KEY:-}" ]]; then
    echo "ERROR: FAUCET_FUNDER_PRIVATE_KEY not set. Add it to packages/demo/backend/.env"
    exit 1
fi
if [[ -z "${OP_SEPOLIA_FAUCET_ADDRESS:-}" || "${OP_SEPOLIA_FAUCET_ADDRESS}" == "dummy" ]]; then
    echo "ERROR: OP_SEPOLIA_FAUCET_ADDRESS not set. Add it to packages/demo/backend/.env"
    exit 1
fi

AMOUNT_WEI=$(cast to-wei "$AMOUNT" ether)

echo "=== Bridge ETH to OP Sepolia Faucet ==="
echo "  From:      Sepolia L1"
echo "  To:        OP Sepolia"
echo "  Recipient: $OP_SEPOLIA_FAUCET_ADDRESS (faucet)"
echo "  Amount:    $AMOUNT ETH ($AMOUNT_WEI wei)"
echo "  Bridge:    $L1_STANDARD_BRIDGE"
echo ""

if $DRY_RUN; then
    echo "[DRY RUN] Would call:"
    echo "  cast send $L1_STANDARD_BRIDGE \\"
    echo "    'depositETHTo(address,uint32,bytes)' \\"
    echo "    $OP_SEPOLIA_FAUCET_ADDRESS $MIN_GAS_LIMIT 0x \\"
    echo "    --value ${AMOUNT}ether \\"
    echo "    --rpc-url $SEPOLIA_RPC"
    exit 0
fi

echo "Sending bridge transaction..."
cast send "$L1_STANDARD_BRIDGE" \
    "depositETHTo(address,uint32,bytes)" \
    "$OP_SEPOLIA_FAUCET_ADDRESS" "$MIN_GAS_LIMIT" "0x" \
    --value "${AMOUNT}ether" \
    --private-key "$FAUCET_FUNDER_PRIVATE_KEY" \
    --rpc-url "$SEPOLIA_RPC"

echo ""
echo "Bridge tx submitted. ETH will arrive on OP Sepolia in ~1-2 minutes."
echo "Check: https://sepolia-optimism.etherscan.io/address/$OP_SEPOLIA_FAUCET_ADDRESS"
