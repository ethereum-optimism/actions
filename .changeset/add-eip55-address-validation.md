---
"@eth-optimism/actions-sdk": patch
---

Add EIP-55 address validation for hardcoded contract addresses and developer-supplied config addresses. Invalid addresses now throw at module load time or SDK initialization with a descriptive error listing all failures.
