# Rapier 1.0.0 — source handoff

**State:** SIZE-2027-R9 SOURCE-QUALIFIED. The desktop, mobile and phone-preview suites **302/0/0** each and the WebMCP harness **250 checks** are executed against these exact bytes from the shipped extraction. Static release audit **125/125** after the receipt re-pin (the bound evidence snapshot this candidate shipped with predates that re-pin and shows 119/6; reproduce the current number directly: `node qualification/static-release-audit.js .`). Native WebMCP registration and four sample calls are observed on these exact bytes, in the development tree carried with the release zip, not the public repository (`docs/evidence/release/4e0353493130/real-chrome/`); the full real-browser harness **224/228** and the scripted evals **10/10** are supporting evidence from the older R4 bytes; a model-chosen, script-hosted route is supporting evidence from separate delegation bytes (58 of 60 runs, `docs/evidence/hilt-model/`, same development tree). The live origin, the K3 browser registry, and the manual-device gate remain human gates, NOT RUN on this candidate. **Origin surface not_run.**

`rapier.html` sha256: `f3de830b5a52aa3b9edbc16e640c7888b1c948bfb9c2d6591d59c07c1253f912`

Rapier 1.0.0 is the first public identity after the pre-public version history was collapsed. The application engine shares contract lineage with Speedracer's embedded Rapier; the two trees synchronize by deliberate mirror tranches, and byte-level synchronization is claimed only when a mirror receipt says so. No compatibility or migration layer was added: the version reset changes release identity, not document semantics.

The suite count fell 328 → 299 because ARMA-only contracts — monotonicity,
heading-grammar, treaty-mutation — were deleted with the machinery they
specified; it is deleted surface, not lost coverage. It later reached 302 —
a caret with no geometry must read as absent rather than as a position at
the top of the screen, or the reveal walks the document there — then held
at 300 under a 300-case ceiling once two source-mode geometry cases were cut
(`layers coincide`, `--source-line-h is whole px`) because three later
gutter/wrap cases guard the same alignment with named bug rationale, and
stands at 302 under a 302-case ceiling again since its two long-frozen
skips (`overlay .hljs-ln count = line count`, `porthole composed length
matches`) each staged its own precondition and now run for real rather than
skip. The census is exact in both directions; growth now displaces something weaker.
The kept-region reviewed exception (KEEP HELD / ALLOW THIS ONCE) is
retained deliberately as Rapier product behavior, outside the Will
standard: it lets an agent propose exact work without gaining standing
authority.

The previous development build's execution numbers do **not** qualify these bytes. Run the current package only after the architecture is locked:

```sh
export NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
# Serve with cache disabled and verify served bytes match disk before trusting a run.
node qualification/run-selftest2.js desktop
node qualification/run-selftest2.js mobile
node qualification/run-selftest-preview.js desktop
node qualification/webmcp-test.js
node qualification/webmcp-test.js --native-contract
node qualification/k3-browser-test.js
node qualification/static-release-audit.js .
```

The two selftest runners inject the suite from `run-selftest2.js` into the exact
served application bytes at qualification time. A production Rapier URL never
runs the harness and has no selftest query or runtime test bridge.

Then execute the real-agent and manual device route. Update `qualification/RECEIPT.json` only from observations of these exact bytes. Never copy a pre-public result forward because the code looks equivalent.

## Architecture frozen here

- One self-contained canonical `rapier.html`.
- One document model and one semantic operation kernel.
- Human controls, Speedracer operations, and WebMCP are projections of that same kernel, not parallel editors.
- WebMCP is optional browser-native reach; Rapier remains complete without it.
- Will (`WILL-1.md`) is the implemented document law. Its ARMA prototype is deleted wholesale; no mixed ARMA/Will compatibility layer exists in Rapier.

## KERNEL-3 boundary

One piece-backed `document.source` owns exact bytes. Every same-document mutation
enters one canonical splice owner, which appends one immutable ledger record. Undo
and Redo append inverse/reapplication commits; the interaction cursor never erases
chronology. Recovery installs history only after replay proves the exact source-root
chain; otherwise it restores source and reports `identity_unproven`.

WYSIWYG, highlighting, structure, facts, and Compare are bounded projections.
Projection refusal preserves source and carries a named reason; Worker failure never
repeats the full parse synchronously on the main thread. The permanent KERNEL-3 floor
is twelve predicates: five Chromium-free kernel probes in the static audit and seven
positive public-surface cases in `k3-browser-test.js`.

The artifact moved from 3,530,992 to 3,503,865 bytes: **−27,127 bytes**, below the
3,510,992-byte stretch ceiling. UI markup and styles were unchanged by KERNEL-3.

`webmcp-test.js --native-contract` installs no shim and has no expected Chrome
answer. It records callback argument count, schema reflection, input/output wire
types, duplicate registration, registration abort, and tool-change observations.
Use Chrome with the WebMCP and Blink testing features; do not use a missing API as a
product failure. The test double models the dated Chrome 152 shape but cannot qualify
the native substrate.
