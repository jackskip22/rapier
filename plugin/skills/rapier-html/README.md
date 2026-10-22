# rapier-html

Turn Markdown into one offline HTML file that contains the full Rapier editor. It opens in any browser, on a phone or
computer, with no account. People read, edit, draw and paint; agents hand over documents, show what changed and get
the edited copy back. Start with `npx rapier-html@1.2.32 notes.md`.

Use it for a plan to rearrange, a guide to annotate, a draft to keep writing, or a revision to review. The file works
without any hosted workspace.

- The page writes, saves Markdown, exports Word, PDF and a web page, and prints. It needs no account and fetches
  nothing to open, edit or save. It is the base editor (about 1.7 MB) with the plug-ins the document displays with
  (Math, Mermaid, and page layout for a template page); `--include draw` adds drawing and painting. Notes never travel.
- `--return` adds a one-use Send back address from the agent door.
- `--view draw` opens on Draw. `--compare original.md` opens the edit with its diff; `--by <name>` attributes it.
- `writePage(text, name)` makes the page in one call; `unwrap` gives the document back, exactly.

Needs Node 22 or newer.

```sh
npx -- rapier-html@1.2.32 notes.md                          # the editor, notes.md inside it, written beside the file
npx -- rapier-html@1.2.32 notes.md --view draw              # opens on Draw: sketch and paint, the document behind it
npx -- rapier-html@1.2.32 notes.md --include draw,math     # carries Draw and Math (default: what the document needs)
npx -- rapier-html@1.2.32 notes.md --drawing sketch.svg     # carries a drawing, opened on Draw over the document
npx -- rapier-html@1.2.32 revised.md --compare original.md # opens showing what changed
npx -- rapier-html@1.2.32 notes.md --return "$RETURN_URL" --return-expires-at "$RETURN_EXPIRES_AT" # Send back
npx -- rapier-html@1.2.32 notes.md out.html                 # a named output
npm install rapier-html@1.2.32                              # as a library: writePage, unwrap
```

The first `--` is for npm, so `--help` reaches the command. It never overwrites a file.

Will markers in the Markdown (`keep`, `append`, `edit`) control what agents may change.

## Choose a Rapier workflow

1. **Work together live.** Connect to `https://mcp.rapier.website/door/mcp`, then call `open` to share one document with the person.
2. **Hand over an offline editor.** Use this package.
3. **Embed the editor.** [rapier-embed](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-embed)
   mounts the editor or reader in your app.
4. **Keep portable Markdown.** [rapier-markdown-kit](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-markdown-kit)
   keeps pictures, drawings and layout in one `.md` file.

## Send an edited document back

1. Call `show {target:"return"}` on the Rapier agent door for the document's workspace.
2. Pass its `return_url` and `return_expires_at` as `--return "$RETURN_URL" --return-expires-at "$RETURN_EXPIRES_AT"`,
   or `wrap(..., {return: return_url, return_expires_at})`. Only `https://mcp.rapier.website/return/…` is accepted.
   Share then shows Send back; a page without an address doesn't.
3. The person edits offline and taps Send back. The source and filename go once; the page shows acceptance or
   refusal and never sends again.
4. `show {target:"ask",wait:"message"}` returns a `returned` receipt with the `return_id`, name and time, and
   `read {state:true}` lists receipts. Read the source with `read {return_id}`, then `cursor` alone until complete.

A return lasts up to one day and takes one document of up to 64 MiB of decoded source, within the workspace's
remaining storage. It grants no access to the workspace, and the returned copy stays separate from the workspace's
current document. After expiry or a refusal, Share offers Save instead; bring that file back for a fresh return.

## As a library

Save this as `example.mjs` in the folder you installed into, then run `node example.mjs`:

```js
import {writeFile} from 'node:fs/promises';
import {writePage, unwrap} from 'rapier-html';

const words = '# Hello\r\n\r\nA note about </script> and C:\\Users\\me.\n';
const page = await writePage(words, 'hello.md', {view: 'draw'});  // opens on Draw, the note behind it
console.log('words back exactly:', unwrap(page).text === words);
await writeFile('hello.rapier.html', page, {flag: 'wx'});        // 'wx': never over an existing file
```

- `writePage(text, name, {include, view, drawing, drawingName, base, baseName, by, at, return: returnURL, return_expires_at})`
  carries the editor with what the document displays with (`include` names the parts: `drawing`, `math`, `mermaid`).
- `wrap(rapierHtml, text, name, options)` does the same into a page you supply; `carry(rapierHtml, parts)` cuts one.
- `unwrap(pageHtml)` returns the same fields, plus the validated `comparisonBase` record, with `null` for anything the
  page doesn't carry.
- Also exported: `portableNeeds`, `encodeCarried`, `decodeCarried` and `main`. TypeScript declarations ship in `dist/page.d.mts`.

## How the page carries the document

- One `<script type="text/markdown" id="rapier-document">` block at the top of the body, never run, read once at
  start-up.
- A drawing goes in `id="rapier-drawing"` and the comparison original in `id="rapier-base"`. The document block's
  `data-view` names the opening view, `data-return` the return URL, and `data-return-expires-at` its expiry.
- The block holds no `<` before `/` or `!`, no carriage return and no NUL: `\\`, `\/`, `\!`, `\r` and `\0` stand for
  them, one reversible pass each way. A byte-order mark is kept and written back on Save.
- `comparisonBase` holds the original `text`, `sha256`, `revision`, `name`, `by` and `at`. Rewrapping keeps the
  original text, hash and revision; a baseline equal to the current text is left out. It is for display only, never a
  write grant or history. Save and Send back use the edited document.

## Safety

- It never overwrites: an existing output, including the document itself, is refused. So are unknown options, a
  `--view` other than `draw` or `notes`, `--drawing` or `--compare` without a file, a return without its expiry, an
  invalid expiry, an unsafe return URL and a third filename.
- The page opens and renders from what it carries; it can't fetch pictures, media, fonts or plugins. The editor
  includes verified math, Mermaid and lettering resources. Embed any document pictures.
- Send back connects only to the return origin it was given. Credentials, query strings and fragments in the return
  URL are refused.

## Optional edit history

`wrap(page, text, filename, {ledger, authorship})` accepts the kit's `rapier-ledger/2` and `rapier-authorship/1`
objects, and `unwrap(page)` returns the checked parts beside the text. Both are off by default.

- An authorship projection holds only who wrote the current characters; a full ledger also holds deleted text.
- A part that doesn't match the text, or is malformed, duplicated or inconsistent, throws instead of attaching false
  history.
- Markdown saved with the kit's `ledger/carried.writeDocument` is read automatically when wrapping. Rewrapping a page
  without parts drops the old parts.
- The published package carries its own MIT validator; no source checkout is needed.

## License

AGPL-3.0-only (`LICENSE`): the page is the Rapier editor, with the notices of the libraries it carries. For the
Markdown standard without the editor, use `rapier-markdown-kit` (MIT). Rapier is at https://rapier.website.
`BUILD.json` records the page's size, SHA-256, build time and Node version.
