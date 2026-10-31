# Rapier - Markdown Editor & Art

Rapier is a minimalistic writing app designed to be fast and beautiful on any device, but the Android app provides the best experience. It also has a Draw mode with an SVG editor, freehand brushes, watercolors and typographic art. Supports Mermaid diagrams and flowcharts.

Everything is plain Markdown. Pictures, drawings and paintings are embedded inside the file. Documents in Rapier are single files you can open in other Markdown apps or any browser, now or in 20 years.

- **On the web:** [rapier.website](https://rapier.website). Add it to your home screen to use it offline.
- **As a file:** [rapier.html](https://github.com/jackskip22/rapier/raw/main/rapier.html), or the read-only
  [rapier-reader.html](https://github.com/jackskip22/rapier/raw/main/rapier-reader.html). Open it in a browser.
- **On Android:** [Google Play](https://play.google.com/store/apps/details?id=app.rapier). The app has no Internet permission.
- **On Windows (beta):** [Rapier.exe](https://github.com/jackskip22/rapier/raw/main/Rapier.exe) (version 1.2.30), the whole app in one file. If SmartScreen warns, choose **More info**, then **Run anyway**.
- **On Linux (x86_64, beta):** [rapier-linux](https://github.com/jackskip22/rapier/raw/main/rapier-linux) (version 1.2.39). Run `chmod +x rapier-linux && ./rapier-linux --install` once; it opens as an app window in your Chromium-based browser. [Requirements](src/linux/README.md).
- **With an agent:** the Claude plugin, Grok Bot or another MCP client at `https://mcp.rapier.website/door/mcp`; ChatGPT at `https://mcp.rapier.website/openai/mcp`.

## What it does

- **Write.** Edit the page or the Markdown source; text you don't touch stays byte for byte. Tables, checklists,
  footnotes, LaTeX, Mermaid, comments, compare, read aloud and right-to-left.
- **Pictures.** Stored inside the `.md` file as JPEG XL from [Rapier's own encoder](https://github.com/jackskip22/rapier-jxl).
- **Draw.** Editable SVG: pen, brush, shapes, attached arrows and text.
- **Paint.** Oil, pencil, marker and MyPaint brushes. Watercolor mixes, flows and dries on textured paper.
- **Notes.** One Markdown file per note, with pins, checklists, voice recordings, history and search that reads text
  in pictures. Import from Google Keep, Apple Notes, Evernote, Notion, Obsidian and Joplin. Sync plain files to your
  own cloud storage.
- **Files.** Open Markdown, text, code, Word and PDF. Export Word, PDF or an offline HTML page. Rapier never
  overwrites a file that changed elsewhere.
- **Privacy.** Editing and Notes run on your device, with no analytics. Agent workspaces use hosted storage.

## For agents

1. **Work together live.** Connect to `https://mcp.rapier.website/door/mcp`, then call `open` to share one document with the person.
2. **Hand over an offline editor.** `npx rapier-html notes.md` writes the editor and the document as one HTML file.
3. **Embed the editor.** [rapier-embed](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-embed)
   mounts the editor or reader in your app; your app's agent uses it over WebMCP.
4. **Keep portable Markdown.** [rapier-markdown-kit](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-markdown-kit)
   reads, writes and renders the file without the editor. Respect [Will/1](docs/will.md) regions.
5. **Host the door yourself.** [rapier-server](https://github.com/jackskip22/rapier/tree/main/server) serves your own folder or S3-compatible bucket.

The person sees each change, taps it to see what was there and can undo it while keeping later edits. Their typing
comes first. Read the [agent guide](docs/agents.md), [llms.txt](site/llms.txt), [AGENT-TOOLS.json](site/AGENT-TOOLS.json)
and the [skills](plugin/skills/).

```sh
claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier
npx rapier-html revised.md --compare original.md   # the edit beside its original
```

Current MCP clients connect at `https://mcp.rapier.website/door/mcp` with no account; in ChatGPT, add the OpenAI connector at `https://mcp.rapier.website/openai/mcp` in developer mode
([OpenAI's guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)). Hosted workspaces expire after 30
idle days; `export` keeps a copy. [Privacy](https://rapier.website/privacy).

## In your own app

```js
import {Rapier} from 'rapier-embed';
const editor = Rapier.mount(document.querySelector('#editor'), {
  sessionId, documentId,
  load: {content, filename: 'notes.md', revision},
  save: ({requestId, content, baseRevision}) => store.writeOnce({documentId, requestId, content, baseRevision}),
});
```

Your app owns the document, storage and revisions. `save` returns `{revision}` once storage confirms the bytes, or
throws `Rapier.conflict(currentRevision)`. Use `build: 'reader'` for the read-only reader. See the
[embed skill](plugin/skills/embed-rapier/SKILL.md) and the [embed contract](docs/embed-contract.md).

## Markdown

CommonMark plus conventions other editors already read, with pictures inside the file:
[the standard](docs/markdown-standard.md), [what other readers show](docs/markdown-profile.md),
[adopting it](docs/standard-adoption.md) and [examples](examples/).

## Build

`src/` is the complete source of `rapier.html`.

- `(cd src && node tools/build.mjs)` rebuilds it byte for byte ([build.json](docs/build.json)).
- `(cd src && RAPIER_PROFILE=reader node tools/build.mjs)` builds the reader.
- `npx wrangler deploy` serves it with the included configuration.

## License

AGPL-3.0-only with the [stated terms](LICENSE). The reusable modules are [MIT](docs/LICENSE-MIT). A commercial license
is available ([`LICENSING.md`](docs/LICENSING.md)). Issues and pull requests are welcome: see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) and [`SECURITY.md`](.github/SECURITY.md).

Related: [rapier-jxl](https://github.com/jackskip22/rapier-jxl) and [will](https://github.com/jackskip22/will).
