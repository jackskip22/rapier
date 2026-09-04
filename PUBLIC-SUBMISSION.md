# Rapier 1.0.0 public submission tree

This is the publication boundary for the OpenAI WebMCP Challenge. It is an
allowlist, not a description of the private development tree. A public release
must contain exactly the applicable files below plus ordinary repository metadata.

## Root

```text
.gitignore
_headers
_redirects
agents.md
demo.md
icon-192.png
icon-512.png
LICENSE
llms.txt
manifest.json
PUBLIC-SUBMISSION.md
rapier.html
README.md
sw.js
VECTORS.md
WEBMCP-CHALLENGE.md
WILL-1.md
wrangler.jsonc
```

## Qualification

```text
qualification/AGENT-EVALS.md
qualification/RAPIER-HANDOFF-1.0.0.md
qualification/RECEIPT.json
qualification/k3-browser-test.js
qualification/run-selftest-preview.js
qualification/run-selftest2.js
qualification/static-release-audit.js
qualification/webmcp-shim.js
qualification/webmcp-test.js
```

`qualification/RECEIPT.json` is the machine-readable record of this release's gates:
the release identity, the SHA-256 of the exact `rapier.html` beside it, the file count
of this tree, and one status per gate. The static audit reads it back, checks the hash
against the real file, and refuses a tree whose receipt and prose disagree — a release
cannot ship saying two different things about itself.

The allowlist above is exactly **27 files**: 18 at root and nine under
`qualification/`. `/agents` is an internal 200 proxy to the concrete
`agents.md` asset; it is a route, not a file.

## Never publish from the replacement tree

- `android/` or `windows/`
- any keystore, signing material, `*.p12`, `*.jks`, or secrets file
- full replacement or qualification ZIPs
- scratch output, recovery data, browser profiles, or test recordings containing
  user documents

The native wrappers are separate distribution work. They are not needed to build,
deploy, inspect, or judge the web submission.

## Bundled demo measurement

`demo.md` is the document the demo link opens — a short account of what a browser
agent can do in a Rapier document, carrying Rapier's own welcome guide verbatim
beneath it. Its exact source metrics:

| Metric | Value | Definition |
|---|---:|---|
| UTF-8 bytes | 6,494 | `Buffer.byteLength(source)` |
| Unicode code points | 6,447 | `[...source].length` |
| source tokens | 1,186 | non-whitespace runs, `/\S+/gu` |
| source headings | 15 | ATX headings outside fenced code blocks |

These are source measurements, not claims about natural-language words or the
number of headings emitted by a renderer. Reproduce them from the repository root:

```sh
node <<'NODE'
const fs = require('fs');
const source = fs.readFileSync('demo.md', 'utf8');
let fence = null;
let headings = 0;

for (const line of source.split(/\r?\n/)) {
  const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (marker) {
    const candidate = { character: marker[1][0], length: marker[1].length };
    if (!fence) fence = candidate;
    else if (
      candidate.character === fence.character &&
      candidate.length >= fence.length &&
      marker[2].trim() === ''
    ) fence = null;
    continue;
  }
  if (!fence && /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)) headings += 1;
}

console.log({
  bytes: Buffer.byteLength(source),
  codePoints: [...source].length,
  sourceTokens: (source.match(/\S+/gu) || []).length,
  sourceHeadings: headings
});
NODE
```

Expected output:

```text
{ bytes: 6494, codePoints: 6447, sourceTokens: 1186, sourceHeadings: 15 }
```

## Evidence boundary

**Rapier 1.0.0 is a SIZE-2027-R13 source-qualified candidate.** The desktop, mobile and phone-preview suites (**302/0/0** each) and the WebMCP harness (**260 checks**) are executed against these exact bytes from the shipped extraction. Static release audit **125 / 125** after the receipt re-pin; the bound evidence snapshot this candidate shipped with predates that re-pin and shows 119/6 — reproduce the current number directly: `node qualification/static-release-audit.js .`. Native WebMCP registration and four sample calls are observed on these exact bytes (`docs/evidence/release/<sha12>/real-chrome/`, in the development tree, outside the allowlist above); the full real-browser harness (**224/228**) and the scripted evals (**10/10**) are supporting evidence from the older R4 bytes; a model-chosen, script-hosted route is supporting evidence from separate delegation bytes (58 of 60 runs, `docs/evidence/hilt-model/`, same development tree). The live origin, the K3 browser registry, and the manual-device gate remain human gates, NOT RUN on this candidate. **Origin surface not_run.**

Rapier supports Chromium 123 or newer; its WebMCP tools currently require the challenge's Chrome 149+ test host. That is a source census, not a device gate: `docs/evidence/lane-z/chromium-census.mjs` (in the development tree, outside the allowlist above) reads `rapier.html` and `sw.js` — literal scripts, the inflated vendor spans, executable template substitutions and the jsdiff Blob-worker source — and reports the artifact parsing and booting at Chromium 80 and rendering at full authored fidelity at 123, binding each result to the exact bytes it read (`docs/evidence/lane-z/chromium-floor-master.json`). The mapped compatibility census places Rapier's functional floor at Chromium 108; WebMCP itself requires the supported trial browser. No browser below this container's Chromium was executed, and unresolved tokens the census could not classify are listed rather than assumed supported.

`qualification/RECEIPT.json` is intentionally machine-readable about that rung: it binds this release identity and exact `rapier.html` hash to the observed static result and the native WebMCP contract observed on these exact bytes, carries the real-browser harness and the scripted evals as supporting evidence from older bytes, and leaves the live origin, the K3 browser registry, the real-agent route, and the manual-device gate `not_run`. Those fields may change only after running against these exact bytes. Earlier results are not evidence for this candidate.
