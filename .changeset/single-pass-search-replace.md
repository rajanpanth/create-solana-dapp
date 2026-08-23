---
'create-solana-dapp': patch
---

Apply search and replace in a single pass so a later rename pair cannot rewrite an earlier one's output. Renaming the `counter` template to `my-counter` produced `my-mycounter` in generated files and paths.
