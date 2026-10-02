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

**Write.** Edit the page or Markdown; untouched source stays exact. Headings, marks, colour and highlight,
lists and checklists, tables, callouts, collapsible sections, footnotes, reference links, a table of contents,
frontmatter. Find and replace, folding, document checks, read aloud, undo across every mode, a review of changes since your last save. Flowcharts draw offline; TeX maths and other Mermaid diagrams come through optional
plugins, downloaded on request. Right-to-left text, light and dark, text size, read-only. The [standard](docs/markdown-standard.md) and [profile](docs/markdown-profile.md) describe the Markdown and what
other readers show.

**Pictures.** Paste, drop or choose PNG, JPEG, WebP or SVG. New rasters are JPEG XL, encoded offline by
[Rapier's own encoder](https://github.com/jackskip22/rapier-jxl); PNG or JPEG by choice. Pictures live once each inside the Markdown file. Text wraps around a picture's real shape; move, resize, rotate, fade and place it by hand
or keyboard.

**Draw.** Editable SVG: a pressure brush and a pen, shapes and shape recognition, fills and line styles, connected
arrows that stay attached, wrapped text and imported fonts, groups, snapping, erasing, undo. Black ink stays black
in the file and shows light on dark paper.

**Work together.** Anchored comments travel in the Markdown. Discuss a passage, picture or drawing
object, reply, resolve or Ask an agent. Agents use the same source tools through
the browser, WebMCP and hosted plugins; visual inspection supplies a current rendered region.
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
content is stripped from Markdown, pasted HTML and diagrams; plugins are hash-checked. The document, undo history and your place stay on the device for recovery, which is not a save. The source is in `src/`;
`node src/tools/build.mjs` rebuilds the page and [build.json](docs/build.json) records the build.

## For agents

The agent and person share one editable page. Tools read structure (outline, search, passage,
selection, code) and edit inspected text atomically; stale targets are refused and the person’s typing
comes first. An edit to a long document costs about 1.5 KB of context. The Will marks what an agent may edit, only
add to, or must leave alone ([Will/1](docs/will.md)). FREE, ASK and CHECK set the review policy; undoing an agent’s change keeps later work. Drawings are made by recipe.
[llms.txt](llms.txt), [AGENT-TOOLS.json](AGENT-TOOLS.json), the [agent guide](docs/agents.md) and the
[skills](plugin/skills/README.md) say the rest.

```sh
npm install rapier-markdown-kit                  # read, write and style the Markdown without the editor (MIT)
npx rapier-html notes.md                         # one offline page: the editor with the document inside
npx rapier-html notes.md --view draw             # opened on Draw (or --view notes)
npx rapier-html proposal.md --base original.md   # opened on the diff of a proposed change
npm install rapier-embed                         # the editor in your own app, saving to your storage (MIT)
```

**Claude and ChatGPT.** The Claude plugin and ChatGPT app share skills, tools and the hosted editor. The MCP door is `https://mcp.rapier.website/mcp`.

```sh
claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier
```

In ChatGPT, add the door as a connector (Settings → Connectors → Create, no authentication). The shared document stays in that worker’s workspace until thirty days idle; **Disconnect agents** in the editor revokes access. Nothing on your device is read. Data handling and
terms: [rapier.website/privacy](https://rapier.website/privacy).

## In your own app

Serve the document editor as one file beside your app, or use
[`rapier.website/embed/rapier-document.html`](https://rapier.website/embed/rapier-document.html).
Permanent copies live at `https://rapier.website/embed/<version>/rapier-document.html` so you can pin the
version you tested. Your app owns the document, storage and revisions. `npm install rapier-embed` gives it
the host helper (MIT, one module, no dependencies):

```js
import {Rapier} from 'rapier-embed';
const editor = Rapier.mount(document.querySelector('#editor'), {
  src: '/assets/rapier-document.html', // your self-hosted copy; omit to use the published address
  sessionId, documentId,
  load: {content, filename: 'notes.md', revision},
  theme: 'system',
  save: ({requestId, content, baseRevision}) =>
    store.writeOnce({documentId, requestId, content, baseRevision}),
});
await editor.ready;
```

`store.writeOnce` is your durable, revision-checked write: return `{revision}` only after storage confirms
the bytes, or throw `Rapier.conflict(currentRevision)`. A late save stays pending; Retry repeats its answer
without another write. `editor.save()` captures the latest source, `editor.theme('dark')` changes the theme,
and `editor.disconnect()` ends the connection. The helper binds the listener before navigating the frame.

For a form, the helper provides `<rapier-editor>`: its `value` is Markdown, Save fires `change`, and submission
captures the editor before sending it. Use `multipart/form-data`; the named field is a Markdown file part so
line endings and embedded pictures arrive byte for byte. On a phone the preview opens the editor full-screen;
wide screens keep it inline. The [embed skill](plugin/skills/embed-rapier/SKILL.md) has the form and agent examples.
The [embed contract](docs/embed-contract.md) defines the grants and source-free Will review events.

Give a coding agent this: “Add an Open in Rapier button using `Rapier.mount` from `rapier-embed`. Load this app's
document, write each save durably against its base revision, and keep conflicts recoverable. Follow the embed skill.”

`rapier-markdown-kit` carries the layout grammar, the marks, image references, the Will and the line planner for
another renderer ([adoption](docs/standard-adoption.md)). `RAPIER_PROFILE=document node src/tools/build.mjs` builds a
smaller editor without Notes, Draw, Paint or the JPEG XL encoder.

## Where it runs

- **Browser, installed app or file.** Installed, it opens associated files and receives shared text and links.
- **Self-hosting.** Serve the page yourself, or `npx wrangler deploy` with the included configuration.
- **Android.** No Internet permission. Notes live in the app’s files, outside system backup; keep your own backups. Native open, save, share and print; reminders and a home-screen widget; the lock-screen notes shortcut
  on Android 14 and later; maths, diagrams and the picture reader as one Play download. Complete Excerpt is free
  for everyone. Full Compare, DOCX and PDF export, and Rapier Sync need Rapier Pro.
- **Windows.** Needs the WebView2 Runtime. Native dialogs, verified saves, recent files, printing and sharing. Run
  the .exe or install it for your user.

## The other repositories

- [rapier-plugins](https://github.com/jackskip22/rapier-plugins): the Claude plugin, the OpenAI package and the npm
  packages `rapier-html`, `rapier-markdown-kit` and `rapier-embed`.
- [rapier-jxl](https://github.com/jackskip22/rapier-jxl): the JPEG XL encoder, pure JavaScript, one file, MIT.
- [will](https://github.com/jackskip22/will): the Will standard, with its reference reader and vectors.
