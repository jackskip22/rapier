# Rapier

Current release: **1.0.0**

Rapier is a Markdown, text and code editor for long documents on a phone. It
is one HTML file. It runs on your device, on your files, with no account and
no server, at any length. Your browser's agent can work in the same document
beside you, and your hand always wins. A document can carry its own word for
what an agent may touch, and that word travels with it into Word and PDF.
Compare shows exactly what changed. Drop the file next to your own Markdown,
or embed it in your app, and you have all of that for free.

## Get it

- **Open it** at [rapier.website](https://rapier.website) — nothing to install.
- **Install it as an app.** Android: Chrome's ⋮ menu → Add to Home screen.
  Desktop: the install icon in the address bar.
- **The Android app**, free.
- **The Windows app** — one `.exe`, no installer.
- **Or save `rapier.html`** anywhere — a disk, a USB stick, an email
  attachment — and open it. No host needed at all.

No account, no server, no telemetry.

## What it does

- Long documents stay fast — nothing freezes while you scroll or type.
- Markdown, plain text, and code, all in one editor.
- Compare: see exactly what changed between two files.
- A recovery draft protects you if the tab closes; Save writes the real file
  and reads it back to confirm.
- Export to PDF, DOCX, HTML, or plain text; a DOCX copy keeps the document's
  will as hidden text.
- Works offline, including as an installed app.
- Open a JavaScript file and the same tools gain a structural sense: an outline
  of declarations, search by syntax, and a receipt for every edit.

## Your agent, in this document

If your browser has an agent — WebMCP — it can work in this document beside
you, not somewhere else. It sees the document's shape first, and reads only
the parts it asks for. Your hand always wins: an agent cannot overwrite what
you are actively editing. A document can also carry its own word for what an
agent may touch — `keep`, `append`, or `edit` — and every change an agent
makes is yours to undo.

Try it: open [`?demo=1`](https://rapier.website/?demo=1) and read `demo.md`.
Sample prompts live there and in `qualification/AGENT-EVALS.md`. For agents:
`agents.md`. For the challenge record: `WEBMCP-CHALLENGE.md` and
`PUBLIC-SUBMISSION.md`.

## How the tools are registered

Each tool is registered individually with the browser's own agent API, so a
document only ever offers what it currently allows:

```js
await entry.modelContext.registerTool({
  name: entry.name,                       // e.g. "document.apply_edits"
  title: tool.title,
  description: tool.description,          // ≤ 500 characters, measured by the harness
  inputSchema: tool.inputSchema,
  annotations: _rapierWebMcpAnnotations(tool),   // readOnlyHint / untrustedContentHint
  execute: (input, options) => _rapierWebMcpExecute(entry, input, options && options.signal),
}, registrationOptions);                  // { signal } — one AbortController per tool
```

A held or read-only document withdraws a tool by aborting its own
registration, not by refusing the calls that reach it.

## Editions

The web app, the installed app, the embedded editor, and the Windows app are
fully featured and free. Android is also a complete, free editor on its own.
A one-time **US$5 Rapier Pro** purchase unlocks full Compare, Excerpt, PDF
export, and DOCX export on Android. No trial, no subscription, no ads —
ever.

## Launch surfaces

- Launch surfaces on the canonical URL: `?new=1`, `?welcome=1`, `?demo=1`,
  `?share-url=`, `?share-target=`, `?preview=phone`, `?embed=1&parentOrigin=`,
  and `?embed=local`. No other query parameter is read by the production artifact.

## Files and recovery

A recovery draft protects your current session — it is not a saved file.
Save writes the real file, and where the platform supports it, reads the
bytes back to confirm they match what Rapier wrote. Nothing leaves your
device unless you export it, share it, or the document itself asks to load
something remote.

## Self-hosting

The public repository is a release mirror of 27 files: the artifact and its
qualification evidence, nothing else. Connect it to Cloudflare Workers
Builds and deploy with `npx wrangler deploy`. The service worker installs an
atomic, verified shell, so every visit gets one complete build, never a mix
of two.

## Evidence

**Evidence status: SIZE-2027-R7 SOURCE-QUALIFIED.** The desktop, mobile, and phone-preview suites (**302/0/0** each) and the WebMCP harness (**246 checks**) run against these exact bytes, reproduced with `qualification/run-selftest2.js`, `run-selftest-preview.js`, and `webmcp-test.js`.
Static release audit: **125/125** — reproduce it yourself with `node qualification/static-release-audit.js .`.
The live origin, the K3 browser registry, and the manual-device gate are human gates, marked `not_run` on this candidate.
**Origin surface not_run.**
`demo.md` is 9,293 UTF-8 bytes with 15 source headings.
`WILL-1.md` and `VECTORS.md` are vendored from the canonical Will repository; Rapier itself remains AGPL-3.0, and its copies point home rather than claiming to be the executable suite of this tree.

## Licence

Copyright (C) 2026 Jack Skipworth.

Rapier is licensed under the **GNU AGPL-3.0-only** (`LICENSE` is the full
text) with three additional terms under its section 7: interactive
interfaces keep the attribution `Rapier V[upstream version] by Jack
Skipworth`; modified versions are marked as modified and not presented as
official Rapier; the Rapier name is not licensed beyond describing the
work's origin. A separate commercial licence is available for proprietary
use.
