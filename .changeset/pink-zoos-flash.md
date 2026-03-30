---
'@eth-optimism/actions-sdk': major
---

Align lend amount types with swap pattern. LendTransaction.amount and LendMarketPosition.balance/shares are now number instead of bigint. Raw values available as amountRaw, balanceRaw, sharesRaw. Removes balanceFormatted and sharesFormatted.
