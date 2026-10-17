# Rapier - Markdown Editor & Art

Markdown editor for writing, notes, editable diagrams, drawing and painting with your AI assistant.
Use it on the web, Android or Windows. Keep text and pictures in one Markdown file, or share an editable offline HTML file.
Free and offline, with no ads, tracking or Rapier account.

- **On the web:** open [rapier.website](https://rapier.website). To use it offline, add it to your home screen and
  let the first load finish.
- **As a file:** download [rapier.html](https://github.com/jackskip22/rapier/raw/main/rapier.html) and open it in a
  browser. The read-only page is
  [rapier-reader.html](https://github.com/jackskip22/rapier/raw/main/rapier-reader.html).
- **On Android:** get Rapier on [Google Play](https://play.google.com/store/apps/details?id=app.rapier). The app
  has no Internet permission. Optional Google Play asset packs download on first use, then work offline.
- **On Windows:** download [Rapier.exe](https://github.com/jackskip22/rapier/raw/main/Rapier.exe). It is not code-signed yet, so Windows SmartScreen may warn the first time: choose **More info**, then **Run anyway**.
- **With an agent:** the Claude plugin or another MCP client at `https://mcp.rapier.website/door/mcp`; the OpenAI plugin at `https://mcp.rapier.website/mcp`; Muse at `https://mcp.rapier.website/muse`.

## What it does

- **Write.** Edit the page or the Markdown source; text you don't touch stays byte for byte. Tables, checklists,
  footnotes, LaTeX, Mermaid, find and replace, compare, read aloud, right-to-left, comments and suggested edits.
- **Pictures.** Stored inside the `.md` file. New pictures use JPEG XL from
  [Rapier's own encoder](https://github.com/jackskip22/rapier-jxl). Text can wrap around a picture's shape.
- **Draw.** Editable SVG: pen, pressure brush, shapes, arrows that stay attached, and text.
- **Paint.** MyPaint brushes, smudge and blend. Water is watercolor that mixes, flows and dries on textured paper.
- **Notes.** One Markdown file per note, with colors, pins, checklists, voice recordings, links, history, and
  search that reads text in pictures. Import from Evernote, Notion, Joplin, Simplenote and other note apps. Back up
  as a ZIP file, or sync encrypted copies to your own Cloudflare R2 bucket. Android adds reminders and a home-screen
  widget.
- **Files.** Open Markdown, text, code, Word and PDF. Save Markdown; Rapier never overwrites a file that changed
  elsewhere. Export Word, PDF, text or an offline HTML page. A `.rapier.html` file holds the editor and the
  document together, so someone can edit, comment or suggest changes offline and send it back.
- **Privacy.** Editing and Notes run on your device, with no analytics. Agent workspaces use hosted storage. Remote
  pictures load only when you allow them.

## For agents

1. **Work together live.** Connect to `https://mcp.rapier.website/door/mcp`, then call `open` to share one document with the person.
2. **Hand over an offline editor.** Run `npx rapier-html notes.md` to put the editor and document in one HTML file
   ([rapier-html](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-html)).
3. **Embed the editor.** Use [rapier-embed](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-embed)
   to mount the editor or reader in your app. Your app's agent can use the editor over WebMCP.
4. **Keep portable Markdown.** Use [rapier-markdown-kit](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-markdown-kit)
   for pictures, editable drawings and layout in one `.md` file. Respect [Will/1](https://github.com/jackskip22/will)
   `keep`, `append` and `edit` regions.
5. **Encode JPEG XL.** Use [rapier-jxl](https://github.com/jackskip22/rapier-jxl) for pixels, photos and existing
   JPEGs, in JavaScript.
6. **Host the door yourself.** Run [rapier-server](https://github.com/jackskip22/rapier/tree/main/server) over your
   own folder or S3-compatible bucket.

The agent edits live, beside the person or while they're away. The person sees its changes, can tap one to see what
was there before, and can undo it while keeping later edits. Their typing comes first, and [Will/1](docs/will.md)
marks what an agent may edit, only add to, or must leave alone. Read the [agent guide](docs/agents.md),
[llms.txt](site/llms.txt), [AGENT-TOOLS.json](site/AGENT-TOOLS.json) and the [skills](plugin/skills/README.md).

```sh
claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier
npx rapier-html notes.md                            # the editor with the document inside, offline
npx rapier-html revised.md --compare original.md   # opens the edit beside its original
npm install rapier-markdown-kit                     # read, write and render the Markdown without the editor (MIT)
```

Current MCP clients connect at `https://mcp.rapier.website/door/mcp` with no account; in ChatGPT, add the OpenAI connector at `https://mcp.rapier.website/mcp` in developer mode
([OpenAI's guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)). Hosted workspaces expire after 30
idle days; use `export` to keep a copy. Data handling: [rapier.website/privacy](https://rapier.website/privacy).

## In your own app

`npm install rapier-embed` mounts the document editor in your page, or the read-only reader with `build: 'reader'`.
Your app owns the document, storage and revisions.

```js
import {Rapier} from 'rapier-embed';
const editor = Rapier.mount(document.querySelector('#editor'), {
  sessionId, documentId,
  load: {content, filename: 'notes.md', revision},
  save: ({requestId, content, baseRevision}) => store.writeOnce({documentId, requestId, content, baseRevision}),
});
```

`save` returns `{revision}` once storage confirms the bytes, or throws `Rapier.conflict(currentRevision)`. See the
[embed skill](plugin/skills/embed-rapier/SKILL.md) for self-hosting, plugins, styling and version pinning, and the
[embed contract](docs/embed-contract.md) for the protocol.

## Markdown

Rapier writes CommonMark plus conventions other editors already read, with pictures inside the file. See
[the standard](docs/markdown-standard.md), [what other readers show](docs/markdown-profile.md) and
[adopting it](docs/standard-adoption.md).

## Source and self-hosting

`src/` is the complete source of `rapier.html`.

- `(cd src && node tools/build.mjs)` rebuilds it byte for byte ([build.json](docs/build.json)).
- `(cd src && RAPIER_PROFILE=reader node tools/build.mjs)` builds the reader.
- `npx wrangler deploy` serves it with the included configuration.

`node --test src/tools/test-public.mjs` (Node 22) checks concurrent edits and Undo, HTML control boundaries, and
hostile SVG filtering. It needs no browser, account, install or network. GitHub Actions runs it on every push and
pull request.

## License and contributing

AGPL-3.0-only with the [stated terms](LICENSE). The reusable modules are [MIT](docs/LICENSE-MIT). A commercial license
is available ([`LICENSING.md`](docs/LICENSING.md)). Issues and pull requests are welcome: see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) and [`SECURITY.md`](.github/SECURITY.md).

Related: [rapier-plugins](https://github.com/jackskip22/rapier-plugins) (plugins and npm packages),
[rapier-jxl](https://github.com/jackskip22/rapier-jxl) (JPEG XL encoder) and [will](https://github.com/jackskip22/will)
(the Will standard).
