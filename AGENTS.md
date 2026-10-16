# Rapier

Fast Markdown editor for notes, diagrams, drawing and watercolor painting in one HTML file. Runs on Android, Web
and Windows, phone-first and offline. A person and an agent work in the same document over MCP or WebMCP.

## Choose a task

1. **Work together live.** Connect to `https://mcp.rapier.website/door/mcp`, then call `open`. Keep the returned
   `document` private and pass it on later calls. Read `read` before editing. Use the returned
   `editor_url`; when the editor is absent, deliver `export` with `format: "html"`.
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

The public door has six tools: `open`, `read`, `edit`, `undo`, `show`, `export`.
Read exact text and its revision before applying literal changes. Scope by heading or block when text repeats.
A batch is atomic. A moved numeric revision can apply while its exact matches remain untouched and retained
history reaches that revision; conflicts return current context or candidate lines. Keep act as its id string. Preserve human typing and Will regions.
Diagrams, paintings and comments are fenced text blocks. Read `rapier://guide` and its `/draw`, `/water` and `/blocks`
resources for details. `show` presents comparisons; `undo` reverses an act or turn while retaining later work.
The editor uses a separate private transport that is never listed to models.

## Build and edit the source

`rapier.html` and `rapier-reader.html` sit at the public repository root. The complete source
is in `src/`. The reader is about 190 kB gzipped, with optional fonts and plug-ins.

Use Node 22.23.3. In `src/`, run these commands in order:

```sh
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

## Owner approval for interface changes

Do not add, remove, move or redesign any main-app control, icon, label, panel or layout without the owner's explicit approval of that specific change. Settings is locked to exact owner requests. A broad feature brief, an agent or lead proposal, and passing checks are not approval. Before integration or release, identify every UI difference and its owner approval; hold unapproved differences. Use Feather icons, with Tabler only when Feather cannot supply the icon. Preserve existing authored data and formatting capabilities when correcting an unauthorized control. Read current intent and handoff for the approved details.
