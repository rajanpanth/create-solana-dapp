---
'create-solana-dapp': patch
---

Recognise Windows paths when detecting a local template. `findTemplate` tested for a local path with `startsWith('/')`, `'./'` and `'../'` but resolved it with the platform-aware `isAbsolute`, so no local path worked on Windows: `C:\tpl` fell through to the named-template lookup, and `C:/tpl` was treated as an external template with `C:` read as a giget provider prefix
