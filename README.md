# Rapier - Markdown Editor & Art

Rapier is a minimalistic writing app designed to be fast and beautiful on any device, but the Android app provides the best experience. It also has a Draw mode with an SVG editor, freehand brushes, watercolors and typographic art. Supports Mermaid diagrams and flowcharts.

Everything is plain Markdown. Pictures, drawings and paintings are embedded inside the file. Documents in Rapier are single files you can open in other Markdown apps or any browser, now or in 20 years.

- **Write** Markdown, plain text and code, with tables, checklists, footnotes, LaTeX, Mermaid diagrams, comments,
  compare and read aloud. Switch to the Markdown source without losing your place.
- **Add pictures** that are saved inside the file as JPEG XL by [Rapier's own encoder](https://github.com/jackskip22/rapier-jxl),
  so files stay small and pictures stay sharp.
- **Draw** with a finger or a stylus. Boxes and arrows stay tidy, and drawings are SVGs you can edit later.
- **Paint** with watercolors that flow, mix and dry, or with oil, pencil and MyPaint brushes.
- **Keep notes** as cards with colors, pins, checklists, reminders and voice recordings. Import them from Google Keep,
  Apple Notes, Evernote, Notion, Obsidian and Joplin.
- **Open and export** Word and PDF, and export an HTML page that opens offline in any browser.

## Get Rapier

- **Android:** [Google Play](https://play.google.com/store/apps/details?id=app.rapier). About 3 MB, no internet permission,
  no ads or tracking.
- **Web:** [rapier.website](https://rapier.website). Add it to your home screen and it works offline.
- **One HTML file:** [rapier.html](https://github.com/jackskip22/rapier/raw/main/rapier.html) is the whole editor, and
  [rapier-reader.html](https://github.com/jackskip22/rapier/raw/main/rapier-reader.html) just reads. Open either in a browser.
- **Windows (beta):** [Rapier.exe](https://github.com/jackskip22/rapier/raw/main/Rapier.exe) (version 1.2.30). If SmartScreen warns,
  choose **More info**, then **Run anyway**.
- **Linux (beta, x86_64):** [rapier-linux](https://github.com/jackskip22/rapier/raw/main/rapier-linux) (version 1.2.39). Run
  `chmod +x rapier-linux && ./rapier-linux --install` once. [Requirements](src/linux/README.md).

## With AI agents

Claude, ChatGPT and any MCP client can work in a document with you. Connect to `https://mcp.rapier.website/mcp` and say
"open Rapier". You watch every change and can undo any of it. In ChatGPT, add it in developer mode.

```sh
claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier
npx rapier-html notes.md                          # the editor and the document in one offline HTML file
npx rapier-html revised.md --compare original.md  # an edit beside its original
```

- [rapier-embed](https://www.npmjs.com/package/rapier-embed) puts the editor in your own app.
- [rapier-markdown-kit](https://www.npmjs.com/package/rapier-markdown-kit) reads, writes and renders Rapier Markdown
  without the editor.
- [rapier-server](server/) hosts the connection yourself, from a folder or an S3-compatible bucket.

More in the [agent guide](docs/agents.md), [llms.txt](site/llms.txt), [AGENT-TOOLS.json](site/AGENT-TOOLS.json) and the
[skills](plugin/skills/).

## In your own app

```js
import {Rapier} from 'rapier-embed';
const editor = Rapier.mount(document.querySelector('#editor'), {
  sessionId, documentId,
  load: {content, filename: 'notes.md', revision},
  save: ({requestId, content, baseRevision}) => store.writeOnce({documentId, requestId, content, baseRevision}),
});
```

Your app keeps the document and its storage. `save` returns `{revision}` once it is stored, or throws
`Rapier.conflict(currentRevision)`. `build: 'reader'` mounts the reader. See the [embed skill](plugin/skills/embed-rapier/SKILL.md)
and the [embed contract](docs/embed-contract.md).

## Markdown

Rapier writes CommonMark that other Markdown apps read, with pictures inside the file:
[the standard](docs/markdown-standard.md), [how other apps show it](docs/markdown-profile.md),
[adopting it](docs/standard-adoption.md) and [examples](examples/).

## Build

- `(cd src && node tools/build.mjs)` builds `rapier.html` from `src/` ([build.json](docs/build.json)).
- `(cd src && RAPIER_PROFILE=reader node tools/build.mjs)` builds the reader.
- `npx wrangler deploy` serves it with the included configuration.

## License

AGPL-3.0-only with the [stated terms](LICENSE). The reusable modules are [MIT](docs/LICENSE-MIT). A commercial license is
available ([`LICENSING.md`](docs/LICENSING.md)). Contributions are welcome: see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) and [`SECURITY.md`](.github/SECURITY.md).

Related: [rapier-jxl](https://github.com/jackskip22/rapier-jxl) and [will](https://github.com/jackskip22/will).
