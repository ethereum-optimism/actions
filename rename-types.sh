#!/bin/bash
set -e

echo "Updating remaining type names..."

# Additional patterns that need updating
find packages/sdk/src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 | while IFS= read -r -d '' file; do
  if ! grep -q "Hosted" "$file"; then
    continue
  fi
  
  sed -i \
    -e 's/DynamicHostedWalletToActionsWalletOptions/DynamicEmbeddedWalletToActionsWalletOptions/g' \
    -e 's/PrivyHostedWalletToActionsWalletOptions/PrivyEmbeddedWalletToActionsWalletOptions/g' \
    -e 's/TurnkeyHostedWalletToActionsWalletOptions/TurnkeyEmbeddedWalletToActionsWalletOptions/g' \
    -e 's/ReactHostedProviderInstanceMap/ReactEmbeddedProviderInstanceMap/g' \
    -e 's/NodeHostedProviderInstanceMap/NodeEmbeddedProviderInstanceMap/g' \
    "$file"
  
  echo "  Updated: $file"
done

echo "Type name updates complete!"
