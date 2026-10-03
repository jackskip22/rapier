# rapier-html

Rapier, the offline Markdown editor, as one HTML page with your document inside it. No account, no
install, nothing fetched to open, edit or save. Node 22 or newer.

```sh
npx -- rapier-html@1.1.46 notes.md                          # the editor, notes.md inside it, written beside the file
npx -- rapier-html@1.1.46 notes.md --view draw              # opens on Draw: sketch and paint, the document behind it
npx -- rapier-html@1.1.46 notes.md --view notes             # opens on Notes: the document as cards
npx -- rapier-html@1.1.46 notes.md --drawing sketch.svg     # carries a drawing, opened on Draw over the document
npx -- rapier-html@1.1.46 proposal.md --base original.md    # opens on the diff of a proposed change
npx -- rapier-html@1.1.46 notes.md --return "$RETURN_URL" --return-expires-at "$RETURN_EXPIRES_AT" # Send back
npx -- rapier-html@1.1.46 notes.md out.html                 # a named output
npm install rapier-html@1.1.46                              # as a library: wrap, unwrap
```

The first `--` is for npm, so `--help` reaches the command. It never overwrites a file.

The page is the whole editor: write, draw and paint, the document as Notes cards, Find and replace, Undo, a
source view of the exact bytes; save to the device, share the page on, export Markdown or a web page, print; all
offline. Opened with `--base` it shows the diff of a proposal against the original, and the person keeps or drops
each change. Will markers in the Markdown say what an agent may change: `keep`, `append`, `edit`.

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
`document.get_context` lists receipts; `document.read_context({return_id, start: 0})` reads the source,
continuing at the returned `end` until `complete`. The returned copy stays separate from the workspace's
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

`wrap(rapierHtml, text, name, {view, drawing, drawingName, base, baseName, return: returnURL, return_expires_at})`
and `unwrap(pageHtml)`, which returns the same fields with `null` for what a page does not carry. Also exported:
`encodeCarried`, `decodeCarried`, `main`.

## How the page carries the document

One `<script type="text/markdown" id="rapier-document">` block at the top of the body, never executed,
read once at boot. A drawing rides in `id="rapier-drawing"`, the text a change was proposed against in
`id="rapier-base"`, the view to open on in the document block's `data-view`, the optional return URL
in `data-return` and its exact expiry in `data-return-expires-at`. The block holds no `<`
before `/` or `!`, no carriage return and no NUL: `\\`, `\/`, `\!`, `\r` and `\0` stand for them, one
reversible pass each way, so a note about HTML is as safe as any other. A byte-order mark is kept as a
fact of the file and written back on Save.

## Safety

- It never overwrites: an existing output, the document itself included, is refused, as are unknown options, a
  `--view` other than `draw` or `notes`, a `--drawing` or `--base` with no file, a return without its expiry, an
  invalid expiry, an unsafe return URL and a third filename.
- Nothing reports on the page's use. It reaches the network only when the document or the person asks: a linked
  picture or video, the maths, diagram and PDF-import helpers on first use, or Send back. A return URL names only
  the worker's exact origin and route; credentials, query strings and fragments are refused.

## Licence

AGPL-3.0-only (`LICENSE`): the page is the Rapier editor with the notices of the libraries it carries.
The Markdown standard without the editor is `rapier-markdown-kit` (MIT). Rapier is https://rapier.website.
`BUILD.json` records the page's size, SHA-256, build time and Node version.
