# Rapier

Fast Markdown editor for notes, diagrams, drawing and watercolor painting in one HTML file. Runs on Android, Web
and Windows, phone-first and offline. A person and an agent work in the same document over MCP or WebMCP.

## Choose a task

1. **Work together live.** Connect to `https://mcp.rapier.website/mcp`, then call `rapier.open`. Keep the returned
   `document` private and pass it on later calls. Read `document.observe` before editing. Use the returned
   `editor_url`; when the editor is absent, deliver `document.export` with `format: "html"`.
2. **Deliver one offline file.** Run `npx rapier-html notes.md`. The document and editor travel together in
   `notes.rapier.html`. [rapier-html](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-html)
3. **Embed in an app.** Install `rapier-embed` and call `Rapier.mount` with the app's document and confirmed-save
   callback. Enable `agent: true` in the editor for the app's own agent over WebMCP. The read-only reader has no
   agent tools. [Embedding](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-embed)
4. **Keep portable Markdown.** Use `rapier-markdown-kit` for pictures, editable drawings and layout in one `.md`
   file. Preserve [Will/1](https://github.com/jackskip22/will) `keep` regions; only add at the end of `append`
   regions. [Markdown kit](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-markdown-kit)
5. **Encode JPEG XL.** Use [rapier-jxl](https://github.com/jackskip22/rapier-jxl) for pixels, photographs and JPEG
   transcoding wherever JavaScript runs, offline.
6. **Host the door.** Run [rapier-server](https://github.com/jackskip22/rapier/tree/main/server) over your own folder
   or S3-compatible bucket.

## Work with the person

Use the [agent guide](https://rapier.website/agents) and the connected server's `tools/list`.
`rapier.guide` returns the guide through MCP. An open document is the place to do the requested work.

- Edit live, beside the person or while they are away. Rapier shows your presence and changes; the person can tap
  a change to see what was there before and undo anything. Use `comparison.present` to deliberately show a diff.
- Locate passages with `document.outline` or `document.find`, then use `document.read` to read exact source.
  `document.edit` applies inspected edits in one transaction. Reacquire a stale handle.
- Preserve the person's current typing and Will regions. Each source change returns its act;
  `document.undo` reverses an identified act or turn while preserving later edits.
- Use `document.draw` for editable SVG diagrams, brush strokes and watercolor. Read a drawing before patching it.
  A Mermaid diagram stays Markdown source.
- Export the requested format and deliver the returned file. Pair a new browser through the documented consent
  flow; a created workspace alone does not mean the person can see it.

## Build and edit the source

`rapier.html`, `rapier-document.html` and `rapier-reader.html` sit at the public repository root. The complete source
is in `src/`. The reader is about 190 kB gzipped, with optional fonts and plug-ins.

Use Node 22.23.3. In `src/`, run these commands in order:

```sh
RAPIER_PROFILE=document node tools/build.mjs
RAPIER_PROFILE=reader node tools/build.mjs
node tools/build.mjs
node --test tools/test-public.mjs
```

Keep one owner for source, transaction history, viewport, Markdown grammar, layout and agent admission. Respect the
ordered source manifests. Preserve exact source, verified saves, Undo, recovery, portable formats and offline use.
Change the behaviour at its owner. Do not add compatibility aliases, duplicate state or speculative frameworks.
The welcome text and interface wording are authored content; change them only when explicitly requested.

Keep verification focused on document bytes, authority and shipped packages. Do not add tests of appearance,
interface wording or incidental implementation details. Read the [contribution guide](https://github.com/jackskip22/rapier/blob/main/.github/CONTRIBUTING.md)
and [format specification](https://rapier.website/markdown-standard) before changing their contracts.
