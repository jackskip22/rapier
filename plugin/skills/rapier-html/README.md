# rapier-html

Turn Markdown into one offline HTML file with the full Rapier editor. It opens in any browser on a phone or
computer, with no account. People read, edit, draw and paint watercolor. Agents deliver documents, show what
changed and receive the person's edited copy through the door. Start with `npx rapier-html@1.1.94 notes.md`.

Use it for a plan to rearrange, an illustrated guide to annotate, a draft to continue writing, or a revision
to review. Text and drawings stay editable, and the file remains usable independently of a hosted workspace.

- The page writes, draws and paints, saves Markdown, exports Word, PDF and a web page, and prints, with no account
  and nothing fetched to open, edit or save.
- `--return` adds a one-use Send back address from the agent door: the person edits offline, presses Send back,
  and the agent reads the returned copy.
- `--view draw` opens on Draw; `--compare original.md` opens the edited document showing what changed;
  `--by <name>` attributes the comparison with the time the page was made.
- `wrap` and `unwrap` carry a document into a page and out again, exactly, for programs.

Node 22 or newer.

```sh
npx -- rapier-html@1.1.94 notes.md                          # the editor, notes.md inside it, written beside the file
npx -- rapier-html@1.1.94 notes.md --view draw              # opens on Draw: sketch and paint, the document behind it
npx -- rapier-html@1.1.94 notes.md --view notes             # opens the Notes library
npx -- rapier-html@1.1.94 notes.md --drawing sketch.svg     # carries a drawing, opened on Draw over the document
npx -- rapier-html@1.1.94 revised.md --compare original.md # opens showing what changed
npx -- rapier-html@1.1.94 notes.md --return "$RETURN_URL" --return-expires-at "$RETURN_EXPIRES_AT" # Send back
npx -- rapier-html@1.1.94 notes.md out.html                 # a named output
npm install rapier-html@1.1.94                              # as a library: wrap, unwrap
```

The first `--` is for npm, so `--help` reaches the command. It never overwrites a file.

For live shared editing, open the document through Rapier's MCP tools. The agent edits beside the person or
while they are away. Rapier shows its presence and change marks; the person taps a change to see the before
and undoes anything. Use `comparison.present` to show a diff deliberately. Export Markdown or an offline
editor when the result needs an independent copy. Send back returns the edited copy alongside the hosted
document, preserving both.

Will markers in the Markdown control agent edits: `keep`, `append`, `edit`.

## Choose a Rapier workflow

Rapier is a phone-first Markdown editor for notes, diagrams, drawing and watercolor painting. It runs offline
as one HTML file on Android, Web and Windows.
Collaborate over MCP and WebMCP, use optional encrypted sync to your own Cloudflare account, or embed the
editor and lightweight reader (about 190 kB gzipped). The agent edits live; the person sees its presence and
changes, taps a change to see the before and undoes anything. Use `comparison.present` to show a diff deliberately.

1. **Work together live.** Connect to `https://mcp.rapier.website/mcp`, then call `rapier.open` to share one document with the person.
2. **Deliver an offline editor.** Run `npx rapier-html@1.1.94 notes.md` to put the document and editor in one HTML file ([rapier-html](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-html)).
3. **Embed in your app.** Install [rapier-embed](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-embed); mount the editor or reader, with your app's agent over WebMCP in the editor.
4. **Keep portable Markdown.** Use [rapier-markdown-kit](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-markdown-kit) for pictures, editable SVG drawings and layout in one `.md` file. Respect [Will/1](https://github.com/jackskip22/will) `keep`, `append` and `edit` regions.
5. **Encode JPEG XL.** Install [rapier-jxl](https://github.com/jackskip22/rapier-jxl) to encode pixels, photographs and existing JPEGs in JavaScript.
6. **Host the door.** Run [rapier-server](https://github.com/jackskip22/rapier/tree/main/server) over your own folder or S3-compatible bucket.

## Send an edited document back

Call `document.create_return` on the Rapier agent door for the document's workspace and pass its `return_url`
and `return_expires_at` as `--return "$RETURN_URL" --return-expires-at "$RETURN_EXPIRES_AT"`, or
`wrap(..., {return: return_url, return_expires_at})`. Only the worker's HTTPS return route at
`https://mcp.rapier.website/return/…` is accepted. The page then shows Send back in Share; a page without an
address has no such action.

The person edits offline and presses Send back: the current source and filename go once, the page shows the
acceptance or the worker's refusal, and it sends nothing again. The return lasts up to one day, takes one
document up to 25 MiB and grants no access to the agent's workspace. After the expiry, or a refusal, Share offers
Save instead; bring that file back to the assistant for a fresh return.

The agent's `document.wait_for_user` returns a `returned` receipt with the `return_id`, name and time;
`document.observe` with the `returns` facet lists receipts. Use
`document.read({target: {kind: "return", return_id, start: 0}})` to read the source, then `cursor` alone
to continue until complete. The returned copy stays separate from the workspace's
current document.

## As a library

Save this as `example.mjs` in the folder you installed into and run `node example.mjs`:

```js
import {readFile, writeFile} from 'node:fs/promises';
import {wrap, unwrap} from 'rapier-html';

const rapier = await readFile(new URL('./rapier.html', import.meta.resolve('rapier-html')), 'utf8');
const words = '# Hello\r\n\r\nA note about </script> and C:\\Users\\me.\n';
const page = wrap(rapier, words, 'hello.md', {view: 'draw'});   // opens on Draw, the note behind it
console.log('words back exactly:', unwrap(page).text === words);
await writeFile('hello.rapier.html', page, {flag: 'wx'});        // 'wx': never over an existing file
```

`wrap(rapierHtml, text, name, {view, drawing, drawingName, base, baseName, by, at, return: returnURL, return_expires_at})`
and `unwrap(pageHtml)`, which returns the same fields plus the validated `comparisonBase` record, with `null`
for what a page does not carry. Also exported:
`encodeCarried`, `decodeCarried`, `main`.

## How the page carries the document

One `<script type="text/markdown" id="rapier-document">` block at the top of the body, never executed,
read once at boot. A drawing rides in `id="rapier-drawing"`, the original text for comparison in
`id="rapier-base"`, the view to open on in the document block's `data-view`, the optional return URL
in `data-return` and its exact expiry in `data-return-expires-at`. The block holds no `<`
before `/` or `!`, no carriage return and no NUL: `\\`, `\/`, `\!`, `\r` and `\0` stand for them, one
reversible pass each way, so a note about HTML is as safe as any other. A byte-order mark is kept as a
fact of the file and written back on Save.

`comparisonBase` contains the original `text`, `sha256`, `revision`, `name`, `by` and `at`. Rewrapping retains
its original text, hash and revision; a baseline equal to the current text is omitted. It is a display
reference, never a write grant or a history record. The edited document remains the source used by Save and
Send back.

## Safety

- It never overwrites: an existing output, the document itself included, is refused, as are unknown options, a
  `--view` other than `draw` or `notes`, a `--drawing` or `--compare` with no file, a return without its expiry, an
  invalid expiry, an unsafe return URL and a third filename.
- Nothing reports on the page's use. It reaches the network only when the document or the person asks: a linked
  picture or video, a plug-in on first use (maths, diagrams, PDF import, text in pictures, a letter set), or
  Send back. A return URL names only the worker's exact origin and route; credentials, query strings and fragments
  are refused.

## Optional edit history

`wrap(page, text, filename, {ledger, authorship})` accepts the public kit's
`rapier-ledger/1` and `rapier-authorship/1` objects. `unwrap(page)` returns the
checked parts beside its text. Neither is on by default. An authorship projection
contains only attribution of current characters; a full ledger contains deleted
text too. A wrong-text, malformed, duplicate or inconsistent part throws instead
of attaching false history. Saved Markdown written with the kit's
`ledger/carried.writeDocument` is read automatically when wrapping. Rewrapping a
page without parts drops its previous document's parts. Published npm files carry
their own staged MIT validator closure; no source checkout is needed.

## Licence

AGPL-3.0-only (`LICENSE`): the page is the Rapier editor with the notices of the libraries it carries.
The Markdown standard without the editor is `rapier-markdown-kit` (MIT). Rapier is https://rapier.website.
`BUILD.json` records the page's size, SHA-256, build time and Node version.
