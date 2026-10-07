# Rapier

A fast Markdown editor for writing, drawing, painting and notes. One HTML file that runs offline on any device, with
no account.

- **On the web:** [rapier.website](https://rapier.website). Add it to your home screen; let the first load finish
  before going offline.
- **As a file:** [download rapier.html](https://github.com/jackskip22/rapier/raw/main/rapier.html) and open it in any
  browser.
- **On Android:** the Rapier app on Google Play. It has no Internet permission.
- **On Windows:** [download Rapier.exe](https://github.com/jackskip22/rapier/raw/main/Rapier.exe), the same editor as a desktop app.
- **With an agent:** the Claude plugin, the ChatGPT app, or any MCP client at `https://mcp.rapier.website/mcp`.

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
  storage, Google Drive, OneDrive or Dropbox.
- **Files.** Opens Markdown, text, code, Word and PDF. Saves Markdown and never overwrites a file changed
  elsewhere. Exports Word, PDF, an offline web page with the source inside, HTML and text.
- **Privacy.** Everything runs on the device. No analytics, no cookies. Remote pictures load only when you allow
  them. Browsers can clear stored notes: back up from **Notes settings → BACKUP**.

## For agents

The agent and the person share one page. The agent reads only the passages it needs and changes exactly what it
read; the person's typing comes first, and an agent's change undoes on its own. The Will marks what an agent may
edit, only add to, or must leave alone ([Will/1](docs/will.md)). [llms.txt](site/llms.txt),
[AGENT-TOOLS.json](site/AGENT-TOOLS.json), the [agent guide](docs/agents.md) and the [skills](plugin/skills/README.md) say the
rest.

```sh
claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier
npx rapier-html notes.md                         # one offline page: the editor with the document inside
npx rapier-html proposal.md --base original.md   # opened on the diff of a proposed change
npm install rapier-markdown-kit                  # read, write and style the Markdown without the editor (MIT)
```

In ChatGPT, add the MCP address in developer mode
([OpenAI's guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)). A hosted workspace expires after
about thirty idle days. Data handling: [rapier.website/privacy](https://rapier.website/privacy).

## In your own app

`npm install rapier-embed` mounts the document editor in your page. Your app owns the document, the storage and the
revisions.

```js
import {Rapier} from 'rapier-embed';
const editor = Rapier.mount(document.querySelector('#editor'), {
  sessionId, documentId,
  load: {content, filename: 'notes.md', revision},
  save: ({requestId, content, baseRevision}) => store.writeOnce({documentId, requestId, content, baseRevision}),
});
```

`save` returns `{revision}` once storage confirms the bytes, or throws `Rapier.conflict(currentRevision)`. Pin a
version at `https://rapier.website/embed/<version>/rapier-document.html`. The
[embed contract](docs/embed-contract.md) and the [embed skill](plugin/skills/embed-rapier/SKILL.md) have the rest.

## Markdown

Rapier writes CommonMark plus conventions other editors already read, with pictures inside the file:
[the standard](docs/markdown-standard.md), [what other readers show](docs/markdown-profile.md),
[adopting it](docs/standard-adoption.md).

## Source and self-hosting

`src/` is the complete source of `rapier.html`; `(cd src && node tools/build.mjs)` rebuilds it byte for byte
([build.json](docs/build.json)). `npx wrangler deploy` serves it with the included configuration.
`(cd src && RAPIER_PROFILE=document node tools/build.mjs)` builds the smaller document editor without Notes, Draw and Paint.

Run `node --test src/tools/test-public.mjs` with Node 22 to check concurrent source edits and Undo, authored HTML
control boundaries, and hostile SVG filtering with drawing-data preservation. The tests need no browser, account,
package install or network connection. The same checks run on every push and pull request in GitHub Actions.

## Licence and contributing

AGPL-3.0-only with the [stated terms](LICENSE); the reusable modules are [MIT](docs/LICENSE-MIT); a commercial licence is
available ([`LICENSING.md`](docs/LICENSING.md)). Issues and pull requests are welcome: [`CONTRIBUTING.md`](.github/CONTRIBUTING.md), [`SECURITY.md`](.github/SECURITY.md).

Related: [rapier-plugins](https://github.com/jackskip22/rapier-plugins) (the plugins and npm packages),
[rapier-jxl](https://github.com/jackskip22/rapier-jxl) (the JPEG XL encoder), [will](https://github.com/jackskip22/will)
(the Will standard).
