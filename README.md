# Rapier

Current release: **1.0.0**

Rapier is a Markdown, text and code editor for long documents on a phone. It
is one HTML file. It runs on your device, on your files, with no account and
no server, for long documents. Your browser's agent can work in the same document
beside you, and your hand always wins. A document can carry its own word for
what an agent may touch, and that word travels with it into Word.
Compare shows exactly what changed. Drop the file next to your own Markdown,
or embed it in your app, and you have all of that for free.

## Get it

- **Open it** at [rapier.website](https://rapier.website) — nothing to install.
- **Install it as an app.** Android: Chrome's ⋮ menu → Add to Home screen.
  Desktop: the install icon in the address bar.
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

**Where it runs.** Wherever a modern browser runs: the web app
at the canonical URL, the installed app on a phone or a desktop, the free Windows
app and the free Android app, a copy of `rapier.html` opened straight from a
folder or a USB stick, an iframe inside your own app (below), and as a native
Speedracer app running in your own Cloudflare account. One file, the same editor
in each.

## Use Rapier in your own app

**Drop-in.** Copy `rapier.html` into your repository, next to your Markdown or
code, and open it. It is a full viewer, editor, and Compare for every file
beside it — offline, no build, no server, no account needed. This works for
any app or website's own files, not only Rapier's.

**Embed.** Frame `rapier.html` with `?embed=1&parentOrigin=<your origin>` and
your app owns the document: identity, storage, and the save decision. Rapier
owns editing, dirty state, and Compare. The two sides trade one `MessagePort`,
opened once your app answers the frame's `rapier-ready` message with
`rapier-connect`. Four message types carry the whole exchange: `load` (you
send the document, and can set `readOnly` — a floor Rapier's own reader
preference can only make stricter, never loosen), `save-request` (Rapier
sends you the edited bytes), `save-ack` (you confirm, with the new revision),
and `save-nack` with `code: 'conflict'` (you refuse, because your copy moved
on). A same-origin site that just wants the plain local editor can frame
`?embed=local` instead and skip the protocol entirely.

```js
const frame = document.querySelector('#rapier').contentWindow;
window.addEventListener('message', e => {
  if (e.source !== frame || e.origin !== iframeOrigin
      || e.data.type !== 'rapier-ready') return;
  const { port1, port2 } = new MessageChannel();
  frame.postMessage({ type: 'rapier-connect', expectedOrigin: location.origin,
    sessionId, documentId }, iframeOrigin, [port2]);
  port1.onmessage = ({ data }) => {
    if (data.type === 'connected') {
      port1.postMessage({ sessionId, documentId, baseRevision: null,
        requestId: 'r1', type: 'load',
        payload: { content, filename, revision: 1, readOnly: false } });
    }
    if (data.type === 'save-request') {
      // write data.payload.content to your storage, then confirm:
      port1.postMessage({ sessionId, documentId, baseRevision: data.baseRevision,
        requestId: data.requestId, type: 'save-ack',
        payload: { revision: data.baseRevision + 1 } });
      // or refuse a stale write: type: 'save-nack',
      // payload: { code: 'conflict', currentRevision }
    }
  };
});
```

**"Open in Rapier."** Paste this to your own coding agent:

```
Add an "Open in Rapier" button to this app.

1. Copy rapier.html from https://rapier.website/rapier.html into this
   project's static assets (or point the iframe at that URL directly).
2. On click, open it in an iframe or panel with
   rapier.html?embed=1&parentOrigin=<this app's own origin>.
3. Wait for the frame's window message { type: 'rapier-ready' }, then open a
   MessageChannel and post { type: 'rapier-connect', expectedOrigin,
   sessionId, documentId } to the frame with one port transferred.
4. On { type: 'connected' } from that port, post { type: 'load', sessionId,
   documentId, baseRevision: null, requestId, payload: { content, filename,
   revision, readOnly } } with the current document's text.
5. Handle { type: 'save-request' }: write payload.content to this app's own
   storage, then answer { type: 'save-ack', payload: { revision: <new
   number> } }, or { type: 'save-nack', payload: { code: 'conflict',
   currentRevision } } if this app's own copy moved on first.

Rapier owns editing and Compare; this app owns storage and the save
decision. No account, no server call Rapier makes on its own.
```

Free for apps and websites, including commercial ones, under the AGPL-3.0-only
licence below; a separate commercial licence exists only for proprietary or
white-label use.

## Your agent, in this document

If your browser has an agent — WebMCP — it can work in this document beside
you, not somewhere else. It sees the document's shape first, and reads only
the parts it asks for. Your hand always wins: an agent cannot overwrite what
you are actively editing. A document can also carry its own word for what an
agent may touch — `keep`, `append`, or `edit` — and every change an agent
makes is yours to undo. No tool can land a write the document holds on its
own: it waits behind Compare until you decide.

Try it: open [`?demo=1&preview=phone`](https://rapier.website/?demo=1&preview=phone) — the demo document inside Rapier's real phone layout — and read `demo.md`.
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
  annotations: _rapierWebMcpAnnotations(tool),   // readOnlyHint / untrustedContentHint / consequentialHint
  execute: (input, options) => _rapierWebMcpExecute(entry, input, options && options.signal),
}, registrationOptions);                  // { signal } — one AbortController per tool
```

A held or read-only document withdraws a tool by aborting its own
registration, not by refusing the calls that reach it.

## Editions

The web app, the installed app, the embedded editor, the Windows app, the
Android app and the Speedracer app are free. No account, no subscription, no ads.
This repository does not itself distribute the native Android or Windows builds.

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

**Evidence status: SIZE-2027-R13 SOURCE-QUALIFIED.** The desktop, mobile, and phone-preview suites (**302/0/0** each) and the WebMCP harness (**260 checks**) run against these exact bytes, reproduced with `qualification/run-selftest2.js`, `run-selftest-preview.js`, and `webmcp-test.js`.
Static release audit: **125/125** — reproduce it yourself with `node qualification/static-release-audit.js .`.
The sealed receipt those numbers are pinned in is `qualification/RECEIPT.json`.
The live origin, the K3 browser registry, and the manual-device gate are human gates, marked `not_run` on this candidate.
**Origin surface not_run.**
`demo.md` is 6,494 UTF-8 bytes with 15 source headings.
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
