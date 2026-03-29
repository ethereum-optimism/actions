#!/bin/bash
set -e

echo "Updating variable names and comments..."

find packages/sdk/src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 | while IFS= read -r -d '' file; do
  if ! grep -qi "hosted" "$file"; then
    continue
  fi
  
  sed -i \
    -e 's/hostedWallet/embeddedWallet/g' \
    -e 's/THostedProviderType/TEmbeddedProviderType/g' \
    -e 's/hosted providers/embedded providers/g' \
    -e 's/hosted provider/embedded provider/g' \
    -e 's/getSmartWalletWithHostedSigner/getSmartWalletWithEmbeddedSigner/g' \
    -e 's/hostedWalletToActionsWallet/embeddedWalletToActionsWallet/g' \
    "$file"
  
  echo "  Updated: $file"
done

echo "Variable/comment updates complete!"
