#!/usr/bin/env bash
set -euo pipefail

# Bridge ETH from Sepolia L1 to OP Sepolia, sending directly to the faucet contract.
# Uses the OP Sepolia OptimismPortal.depositTransaction() to bridge and deliver in one tx.
#
# Usage:
#   pnpm bridge:faucet                          # bridge 0.1 ETH (default)
#   pnpm bridge:faucet -- --amount 0.5          # bridge 0.5 ETH
#   pnpm bridge:faucet -- --amount 0.2 --dry-run  # preview without sending
#
# Required env vars (loaded from packages/demo/backend/.env):
#   FAUCET_FUNDER_PRIVATE_KEY  - private key of the sender on Sepolia L1
#   OP_SEPOLIA_FAUCET_ADDRESS  - faucet contract address on OP Sepolia

# OP Sepolia OptimismPortal on Sepolia L1
# @see https://docs.optimism.io/chain/addresses
OPTIMISM_PORTAL="0x16Fc5058F25648194471939df75CF27A2fdC48BC"
SEPOLIA_RPC="https://ethereum-sepolia-rpc.publicnode.com"
GAS_LIMIT=100000

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
echo "  Portal:    $OPTIMISM_PORTAL"
echo ""

# depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data)
# _to: recipient on L2, _value: ETH to send on L2, _gasLimit: L2 gas, _isCreation: false, _data: empty
if $DRY_RUN; then
    echo "[DRY RUN] Would call:"
    echo "  cast send $OPTIMISM_PORTAL \\"
    echo "    'depositTransaction(address,uint256,uint64,bool,bytes)' \\"
    echo "    $OP_SEPOLIA_FAUCET_ADDRESS $AMOUNT_WEI $GAS_LIMIT false 0x \\"
    echo "    --value ${AMOUNT}ether \\"
    echo "    --rpc-url $SEPOLIA_RPC"
    exit 0
fi

echo "Sending bridge transaction..."
cast send "$OPTIMISM_PORTAL" \
    "depositTransaction(address,uint256,uint64,bool,bytes)" \
    "$OP_SEPOLIA_FAUCET_ADDRESS" "$AMOUNT_WEI" "$GAS_LIMIT" false "0x" \
    --value "${AMOUNT}ether" \
    --private-key "$FAUCET_FUNDER_PRIVATE_KEY" \
    --rpc-url "$SEPOLIA_RPC"

echo ""
echo "Bridge tx submitted. ETH will arrive on OP Sepolia in ~1-2 minutes."
echo "Check: https://sepolia-optimism.etherscan.io/address/$OP_SEPOLIA_FAUCET_ADDRESS"
