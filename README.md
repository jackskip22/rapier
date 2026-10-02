# Rapier

Write, draw, paint and keep notes in one offline HTML file. No account, no telemetry.

Open [rapier.website](https://rapier.website), install it from the browser, or download
[rapier.html](https://rapier.website/rapier.html) and open it from a folder. Let the first web load finish before
going offline.

Notes kept in a browser can be cleared by that browser. Back them up from **Notes settings → BACKUP** at the end of
a session, or sync with Cloudflare.

Licence: [AGPL-3.0-only with the stated additional terms](LICENSE); the reusable modules listed there are
[MIT](LICENSE-MIT).

## What it does

**Write.** On the page or in the Markdown; untouched source stays as it was. Headings, marks, colour and highlight,
lists and checklists, tables, callouts, collapsible sections, footnotes, reference links, a table of contents,
frontmatter. Find and replace, folding, document checks, read aloud, undo across every mode, a review of what
changed since you saved. Flowcharts draw offline; TeX maths and other Mermaid diagrams come through optional
plugins, downloaded on request. Right-to-left text, light and dark, text size, read-only. The Markdown is ordinary:
the [standard](docs/markdown-standard.md) and the [profile](docs/markdown-profile.md) say what Rapier adds and what
other readers show.

**Pictures.** Paste, drop or choose PNG, JPEG, WebP or SVG. New rasters are JPEG XL, encoded offline by
[Rapier's own encoder](https://github.com/jackskip22/rapier-jxl); PNG or JPEG by choice. Pictures live inside the
Markdown file, once each. Text wraps around a picture's real shape; move, resize, rotate, fade and place it by hand
or keyboard.

**Draw.** Editable SVG: a pressure brush and a pen, shapes and shape recognition, fills and line styles, connected
arrows that stay attached, wrapped text and imported fonts, groups, snapping, erasing, undo. Black ink stays black
in the file and shows light on dark paper.

**Work together.** Anchored comment threads travel in the Markdown. Discuss a passage, picture or drawing
object, reply and resolve it, or deliberately Ask an agent about it. Agents use the same source tools through
the browser, WebMCP and hosted plugins; visual inspection supplies a current rendered region when needed.
ChatGPT can open Markdown/text attachments in Rapier, save writable host files without overwriting a
concurrent edit, and keep a new library copy where the host supports upload.

**Paint.** MyPaint brushes (oil, bristle, scumble, marker, watercolour, pencil, pen), pressure and tilt, watercolour
that flows and dries, smudge, smear, blend and erase. A painting is a raster layer inside the drawing's SVG.

**Notes.** One Markdown file per note, pictures inside, recordings and attachments beside it. Sections, nine
colours, pins, checklists, reminders (Android), links and backlinks, history, a recycle bin, and search by words
and by the text in pictures (an optional on-device reader). Backup as one zip. Import from eighteen apps (Apple
Notes, Bear, Evernote, Google Keep, Joplin, Notion, Obsidian, OneNote, Samsung Notes, Simplenote, Standard Notes
and more), and Markdown, text, HTML, DOCX and ZIP files. Encrypted sync with your own Cloudflare R2, S3-compatible
storage, WebDAV, Google Drive, OneDrive or Dropbox.

**Files.** Open Markdown, text, code, DOCX (as a Markdown copy) and PDF (selectable text or page pictures, through
a downloaded reader). Save writes editable source and refuses to overwrite a file changed elsewhere. Export DOCX
with pictures, footnotes and page breaks; PDF through print; one offline HTML reading page with the source inside;
HTML body or plain text. Compare with another file. Copy as formatted text, Markdown or plain text.

**Privacy.** Everything runs on the device. Remote pictures load only when you say so, for that document. Active
content is stripped from Markdown, pasted HTML and diagrams; plugins are hash-checked. The document, its undo
history and your place are kept on the device as recovery, which is not a save. The source is in `src/`;
`node src/tools/build.mjs` rebuilds the page and [build.json](docs/build.json) records the build.

## For agents

The agent and the person share one editable page. Tools read by structure (the outline, a search, a passage, the
selection, the structure of code) and edit inspected text atomically; a stale target is refused and a person typing
comes first. An edit to a long document costs about 1.5 KB of context. The Will marks what an agent may edit, only
add to, or must leave alone ([Will/1](docs/will.md)). FREE, ASK and CHECK set how much the agent does before
review, and an agent's change can be undone without losing later work. Drawings are made by recipe.
[llms.txt](llms.txt), [AGENT-TOOLS.json](AGENT-TOOLS.json), the [agent guide](docs/agents.md) and the
[skills](plugin/skills/README.md) say the rest.

```sh
npm install rapier-markdown-kit                  # read, write and style the Markdown without the editor (MIT)
npx rapier-html notes.md                         # one offline page: the editor with the document inside
npx rapier-html notes.md --view draw             # opened on Draw (or --view notes)
npx rapier-html proposal.md --base original.md   # opened on the diff of a proposed change
npm install rapier-embed                         # the editor in your own app, saving to your storage (MIT)
```

**Claude and ChatGPT.** Rapier is a Claude plugin and a ChatGPT app with the same skills and tools; the hosted
editor shares a page with the agent. The MCP door is `https://mcp.rapier.website/mcp`.

```sh
claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier
```

In ChatGPT, add the door as a connector (Settings → Connectors → Create, no authentication). The document you
share goes to that worker, is held for the agent's workspace and is gone after thirty days idle; no account, no
telemetry; **Disconnect agents** in the editor revokes access. Nothing on your device is read. Data handling and
terms: [rapier.website/privacy](https://rapier.website/privacy).

## In your own app

Keep `rapier.html` beside your documents and open them with its file chooser, or frame `rapier.html?embed=1` and
connect: your app owns identity, storage and revisions, the frame binds to your origin, and the capabilities you
grant are its whole authority. `npm install rapier-embed` does the connecting (MIT, one module, no dependencies).
The [embed contract](docs/embed-contract.md) is the protocol. A coding agent can build the button from this:

```
Add an "Open in Rapier" button to this app.

1. Serve rapier.html from https://rapier.website/rapier.html: a copy in
   this project's static assets, or that URL.
2. On click, open rapier.html?embed=1 (nothing more) in an iframe or panel.
3. On the iframe's load event, open a MessageChannel and post
   { type: 'rapier-connect', sessionId, documentId, capabilities: ['open',
   'read'] } to the frame at its origin, transferring one port. The frame
   binds to this app's origin; the capabilities list is its whole authority.
4. On { type: 'connected' } from the port, post { type: 'load', sessionId,
   documentId, baseRevision: null, requestId, payload: { content, filename,
   revision, readOnly } } with the document's text.
5. On { type: 'save-request' }, write payload.content to this app's storage
   and answer { type: 'save-ack', sessionId, documentId, requestId: <the
   save-request's requestId>, baseRevision: <its baseRevision>, payload:
   { revision: <new number> } }. If this app's copy moved on first, answer
   type 'save-nack' with payload { code: 'conflict', currentRevision }.
   Answer a repeated requestId (Retry, a reconnect) with the first answer,
   writing nothing. The frame waits for every answer.

Rapier owns editing and Compare; this app owns storage and the save.
```

`rapier-markdown-kit` carries the layout grammar, the marks, image references, the Will and the line planner for
another renderer ([adoption](docs/standard-adoption.md)). `RAPIER_PROFILE=document node src/tools/build.mjs` builds a
smaller editor without Notes, Draw, Paint or the JPEG XL encoder.

## Where it runs

- **Browser, installed app or file.** After the first web load the editor works offline. Installed, it opens
  associated files and receives shared text and links.
- **Self-hosting.** Serve the page yourself, or `npx wrangler deploy` with the included configuration.
- **Android.** No Internet permission. Notes live in the app's own files, and system backup leaves them out, so keep
  your own. Native open, save, share and print; reminders and a home-screen widget; the lock-screen notes shortcut
  on Android 14 and later; maths, diagrams and the picture reader as one Play download. Full Compare, complete
  excerpts and DOCX and PDF export need Rapier Pro.
- **Windows.** Needs the WebView2 Runtime. Native dialogs, verified saves, recent files, printing and sharing. Run
  the .exe or install it for your user.

## The other repositories

- [rapier-plugins](https://github.com/jackskip22/rapier-plugins): the Claude plugin, the OpenAI package and the npm
  packages `rapier-html`, `rapier-markdown-kit` and `rapier-embed`.
- [rapier-jxl](https://github.com/jackskip22/rapier-jxl): the JPEG XL encoder, pure JavaScript, one file, MIT.
- [will](https://github.com/jackskip22/will): the Will standard, with its reference reader and vectors.
