# rapier-html

Rapier, the offline Markdown editor, as one HTML page with your document inside it. No account, no
install, nothing fetched to open, edit or save. Node 22 or newer.

```sh
npx -- rapier-html@1.1.10 notes.md                          # the editor, notes.md inside it, written beside the file
npx -- rapier-html@1.1.10 notes.md --view draw              # opens on Draw: sketch and paint, the document behind it
npx -- rapier-html@1.1.10 notes.md --view notes             # opens on Notes: the document as cards
npx -- rapier-html@1.1.10 notes.md --drawing sketch.svg     # carries a drawing, opened on Draw over the document
npx -- rapier-html@1.1.10 proposal.md --base original.md    # opens on the diff of a proposed change
npx -- rapier-html@1.1.10 notes.md --return "$RETURN_URL" --return-expires-at "$RETURN_EXPIRES_AT" # Send back
npx -- rapier-html@1.1.10 notes.md out.html                 # a named output
npm install rapier-html@1.1.10                              # as a library: wrap, unwrap
```

The first `--` is for npm, so `--help` reaches the command. It never overwrites a file.

## What the page can do

**Write**
- Markdown the way it reads: headings, lists, checklists, tables, code, quotes, footnotes, pictures placed
  around text.
- Find and replace, Undo, a source view of the exact bytes.
- Supported Mermaid flowchart fences draw offline in Rapier's look, so an agent can write a fence or use figures; other diagrams and math use optional plugins.

**Draw and paint**
- Shapes, lines, arrows, text on a canvas that goes into the document as a picture.
- Paint with real brushes: pencil, pen, ink, watercolour that runs and dries, oil that mixes, a smudge
  finger; dip the brush for more paint or more water.
- Your own brush files, a dropper, paint laid over the drawing as a layer of its own.

**Notes**
- The document as cards: sections, drag to reorder, search across every note.
- Voice recordings, reminders, a recycle bin that keeps seven days.
- Import from Keep, Notion, Evernote, Joplin, Bear, Simplenote, OneNote, Obsidian and more.

**Review a change**
- Open on the diff of a proposal against the original; keep or drop each change; nothing applies until
  the person says so.
- Will markers in the Markdown say what an agent may change: `keep`, `append`, `edit`.

**Keep it**
- Save to the device, share the page on, open it again anywhere a browser is; offline throughout.
- Export the document as Markdown or as a web page; print it.

**For agents**
- Hand a person a document, a sketch or a change as one file that opens with one click.
- What they save comes back byte for byte through `unwrap`.
- Add the return URL from `document.create_return`: the person edits the page and presses Send back;
  `document.wait_for_user` wakes the agent, which reads the exact returned Markdown and continues.

## Send an edited document back

Call `document.create_return` on the Rapier agent door for the document's workspace. Pass its
`return_url` and `return_expires_at` as `--return "$RETURN_URL" --return-expires-at "$RETURN_EXPIRES_AT"`
or `wrap(..., {return: return_url, return_expires_at})`. Both values come from the same mint. Only the worker's
HTTPS return route at `https://mcp.rapier.website/return/…` is accepted. The page shows Send back
in Share; a page without an address has no such action.

The person reads and edits offline, then presses Send back when ready. That press sends the current
source and filename once, and shows acceptance or the worker's refusal. After acceptance, that page
sends nothing again. Save to the device stays local. The return URL lasts up to one day, accepts one
document up to 25 MiB, and grants no read or edit access to the agent's workspace.

Once the carried expiry passes, Share offers Save in place of Send back: the work is safe on the page.
A used or expired return refused by the worker offers the same Save. Saving keeps the current words,
filename, byte-order mark and line endings through the normal local save path. Bring that file back to the
assistant, which compares it against the workspace's current work and creates a fresh return for the next
handoff; the old capability stays spent.

The agent's `document.wait_for_user` returns a `returned` receipt with the `return_id`, name and time.
`document.get_context` lists receipts even when no agent was waiting. Read the source with
`document.read_context({return_id, start: 0})`, continuing at the returned `end` until `complete`.
The returned copy stays separate from the workspace's current document, so newer work survives too.

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

`wrap(rapierHtml, text, name, {view, drawing, drawingName, base, baseName, return: returnURL, return_expires_at})` and `unwrap(pageHtml)`,
which returns `{html, text, name, view, drawing, drawingName, base, baseName, return: returnURL, return_expires_at}` with `null` for what a
page does not carry. Also exported: `encodeCarried`, `decodeCarried`, `main`.

## How the page carries the document

One `<script type="text/markdown" id="rapier-document">` block at the top of the body, never executed,
read once at boot. A drawing rides in `id="rapier-drawing"`, the text a change was proposed against in
`id="rapier-base"`, the view to open on in the document block's `data-view`, the optional return URL
in `data-return` and its exact expiry in `data-return-expires-at`. The block holds no `<`
before `/` or `!`, no carriage return and no NUL: `\\`, `\/`, `\!`, `\r` and `\0` stand for them, one
reversible pass each way, so a note about HTML is as safe as any other. A byte-order mark is kept as a
fact of the file and written back on Save.

## Safety

- It never overwrites: an output that exists, the document itself included, is refused. Unknown options,
  a `--view` that is not `draw` or `notes`, a `--drawing` or `--base` with no file, a missing or repeated
  `--return` or `--return-expires-at`, a return without its expiry, an invalid expiry, an unsafe return URL and a third filename are refused too.
- Nothing reports on the page's use. It reaches the network only when the document or the person asks:
  a picture or video the document links to, the math, diagram and PDF-import helpers on first use,
  or the person's Send back press. A return URL names only the worker's exact origin and return route;
  credentials, query strings and fragments are refused by both the writer and carried-page boot.

## Licence

AGPL-3.0-only (`LICENSE`): the page is the Rapier editor with the notices of the libraries it carries.
The Markdown standard without the editor is `rapier-markdown-kit` (MIT). Rapier is https://rapier.website.
`BUILD.json` records the page's size, SHA-256, build time and Node version.
