#!/bin/bash
set -e

# Update all TypeScript/JavaScript files in packages/sdk/src
# Replace "hosted" with "embedded" (case-sensitive patterns)

echo "Updating file contents..."

# Find all .ts, .tsx, .js, .jsx files
find packages/sdk/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -print0 | while IFS= read -r -d '' file; do
  # Skip if file doesn't contain "hosted" (case-insensitive check)
  if ! grep -qi "hosted" "$file"; then
    continue
  fi
  
  # Perform replacements
  sed -i \
    -e 's/HostedWalletProvider/EmbeddedWalletProvider/g' \
    -e 's/HostedProviderFactory/EmbeddedProviderFactory/g' \
    -e 's/HostedProviderDeps/EmbeddedProviderDeps/g' \
    -e 's/HostedWalletProviderRegistry/EmbeddedWalletProviderRegistry/g' \
    -e 's/hostedWalletProvider/embeddedWalletProvider/g' \
    -e 's/hostedWalletConfig/embeddedWalletConfig/g' \
    -e 's/hosted\//embedded\//g' \
    -e 's/\/hosted/\/embedded/g' \
    -e "s/'hosted'/'embedded'/g" \
    -e 's/"hosted"/"embedded"/g' \
    -e 's/Hosted wallet/Embedded wallet/g' \
    -e 's/hosted wallet/embedded wallet/g' \
    "$file"
  
  echo "  Updated: $file"
done

echo "Content updates complete!"
