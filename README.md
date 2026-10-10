# Rapier

Fast Markdown editor for notes, diagrams, drawing and watercolor painting in one HTML file. Runs on Android, Web
and Windows. Phone-first, offline, with no account. Collaborate with AI agents over MCP and WebMCP. Add encrypted
sync through your own Cloudflare account, embed the editor, or use the lightweight reader, about 190 kB gzipped.

- **On the web:** [rapier.website](https://rapier.website). Add it to your home screen; let the first load finish
  before going offline.
- **As a file:** [download rapier.html](https://github.com/jackskip22/rapier/raw/main/rapier.html) and open it in any
  browser. Two smaller builds sit beside it: [rapier-document.html](https://github.com/jackskip22/rapier/raw/main/rapier-document.html),
  the editor without Draw, Paint, Notes and the JPEG XL encoder, and
  [rapier-reader.html](https://github.com/jackskip22/rapier/raw/main/rapier-reader.html), a read-only reader.
- **On Android:** the Rapier app on Google Play. It has no Internet permission.
- **With an agent:** the Claude plugin, ChatGPT or another MCP client at `https://mcp.rapier.website/mcp`; Muse at `https://mcp.rapier.website/muse`.

## What it does

- **Write.** Edit the page or the Markdown source; source you did not touch stays byte for byte. Tables,
  checklists, callouts, footnotes, a table of contents, find and replace, compare, read aloud, right-to-left, light
  and dark.
- **Pictures.** Stored inside the `.md` file; new rasters as JPEG XL from
  [Rapier's own encoder](https://github.com/jackskip22/rapier-jxl). Text wraps around a picture's shape.
- **Draw.** Editable SVG: pen, pressure brush, shapes, arrows that stay attached, text, backgrounds.
- **Paint and Water.** MyPaint brushes, smudge and blend; Water, watercolour whose pigments mix, flow and dry on textured paper.
- **Notes.** One Markdown file per note: colours, pins, checklists, reminders, links, history, and search that reads
  text in pictures. Imports from twenty notes apps. Backup as a zip; encrypted sync to your own Cloudflare
  R2 bucket with an existing storage key.
- **Files.** Opens Markdown, text, code, Word and PDF. Saves Markdown and never overwrites a file changed
  elsewhere. Exports Word, PDF, an offline web page with the source inside, HTML and text.
- **Privacy.** Editing and local Notes run on your device without analytics. Connected agent workspaces use
  hosted storage. Remote pictures load only when you allow them. Back up browser-stored notes from **Notes settings → BACKUP**.

## For agents

1. **Work together live.** Connect to `https://mcp.rapier.website/mcp`, then call `rapier.open` to share one document with the person.
2. **Deliver an offline editor.** Run `npx rapier-html notes.md` to put the document and editor in one HTML file ([rapier-html](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-html)).
3. **Embed in your app.** Install [rapier-embed](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-embed); mount the editor or reader, with your app's agent over WebMCP in the editor.
4. **Keep portable Markdown.** Use [rapier-markdown-kit](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-markdown-kit) for pictures, editable SVG drawings and layout in one `.md` file. Respect [Will/1](https://github.com/jackskip22/will) `keep`, `append` and `edit` regions.
5. **Encode JPEG XL.** Install [rapier-jxl](https://github.com/jackskip22/rapier-jxl) to encode pixels, photographs and existing JPEGs in JavaScript.
6. **Host the door.** Run [rapier-server](https://github.com/jackskip22/rapier/tree/main/server) over your own folder or S3-compatible bucket.

The agent edits live, beside the person or while they are away. Rapier shows the agent's presence and its changes.
Tap a change to see what was there before; undo anything while keeping later edits. The agent can deliberately
show a diff with `comparison.present`.

The agent reads the passages it needs and changes exactly what it read. The person's typing comes first. Agents
draw editable SVG diagrams and paint with the same brushes the person uses. The Will marks what an agent may edit,
only add to, or must leave alone ([Will/1](docs/will.md)).
[llms.txt](site/llms.txt), [AGENT-TOOLS.json](site/AGENT-TOOLS.json), the [agent guide](docs/agents.md) and the
[skills](plugin/skills/README.md) describe the tools and workflows.

Start with `rapier.open`, then `document.observe`. Read exact source, native drawings or imported SVG with an
explicit `document.read` target. Use inspected edits, native drawing transactions or `svg.edit` for the relevant
content. Comparison presentation leaves source unchanged; device controls use `editor.*`. Notes use opaque
references from `notes.find`, with explicit opening and direct writes. Save and export receipts name what was kept.

```sh
claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier
npx rapier-html notes.md                            # one offline page: the editor with the document inside
npx rapier-html revised.md --compare original.md   # the edited document, opened with its before for comparison
npm install rapier-markdown-kit                     # read, write and render the Markdown without the editor (MIT)
```

Any MCP client connects at `https://mcp.rapier.website/mcp` with no account; in ChatGPT, add it in developer mode
([OpenAI's guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)). `document.export` keeps exact
Markdown, the offline editor, text, a web page, Word or PDF, independent of the hosted workspace, which expires
after 30 idle days. Data handling: [rapier.website/privacy](https://rapier.website/privacy).

## In your own app

`npm install rapier-embed` mounts the document editor, or with `build: 'reader'` the read-only reader, in your page.
Your app owns the document, the storage and the revisions. Keep the page and its plug-ins in your own codebase
(`npx rapier-embed plugins ./public/rapier` fetches and verifies the reader's plug-ins); restyle the reader with
`--rapier-*` CSS properties and your own fonts.

```js
import {Rapier} from 'rapier-embed';
const editor = Rapier.mount(document.querySelector('#editor'), {
  sessionId, documentId,
  load: {content, filename: 'notes.md', revision},
  save: ({requestId, content, baseRevision}) => store.writeOnce({documentId, requestId, content, baseRevision}),
});
```

`save` returns `{revision}` once storage confirms the bytes, or throws `Rapier.conflict(currentRevision)`. Pin a
version at `https://rapier.website/embed/<version>/rapier-document.html` or `.../rapier-reader.html`. The
[embed skill](plugin/skills/embed-rapier/SKILL.md) documents the API, self-hosting and plug-ins; the
[embed contract](docs/embed-contract.md) is the wire protocol.

## Markdown

Rapier writes CommonMark plus conventions other editors already read, with pictures inside the file:
[the standard](docs/markdown-standard.md), [what other readers show](docs/markdown-profile.md),
[adopting it](docs/standard-adoption.md).

## Source and self-hosting

`src/` is the complete source of `rapier.html`; `(cd src && node tools/build.mjs)` rebuilds it byte for byte
([build.json](docs/build.json)). `npx wrangler deploy` serves it with the included configuration.
`(cd src && RAPIER_PROFILE=document node tools/build.mjs)` builds the smaller document editor without Notes, Draw and Paint;
`RAPIER_PROFILE=reader` builds the read-only reader.

Run `node --test src/tools/test-public.mjs` with Node 22 to check concurrent source edits and Undo, authored HTML
control boundaries, and hostile SVG filtering with drawing-data preservation. The tests need no browser, account,
package install or network connection. The same checks run on every push and pull request in GitHub Actions.

## Licence and contributing

AGPL-3.0-only with the [stated terms](LICENSE); the reusable modules are [MIT](docs/LICENSE-MIT); a commercial licence is
available ([`LICENSING.md`](docs/LICENSING.md)). Issues and pull requests are welcome: [`CONTRIBUTING.md`](.github/CONTRIBUTING.md), [`SECURITY.md`](.github/SECURITY.md).

Related: [rapier-plugins](https://github.com/jackskip22/rapier-plugins) (the plugins and npm packages),
[rapier-jxl](https://github.com/jackskip22/rapier-jxl) (the JPEG XL encoder), [will](https://github.com/jackskip22/will)
(the Will standard).
