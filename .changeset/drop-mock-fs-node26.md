---
'create-solana-dapp': patch
---

Drop `mock-fs` from the test suite so it runs on Node 26. `mock-fs` throws at import time there (tschaub/mock-fs#447), which took down `search-and-replace.test.ts` as a whole and failed the `Test & Lint on Node current` job on every pull request. It was used in one test, to make a single `readFile` fail, so that call is stubbed instead
