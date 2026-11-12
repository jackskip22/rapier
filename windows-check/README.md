Rapier on a hosted Windows machine: the first start, the Store MSIX installed, a write-and-Undo journey and the Store
screenshots. Rapier.exe comes from where it is published (`run.json`); the MSIX, `BUILT.json` and the owner-ACL checks
are in `ci-inputs/` (`SHA256SUMS`). Run it from Actions (dispatch only); the run keeps the receipt (`started-*`),
`webview2.json`, `packaged.*` and `listing/` as one artifact.
