# Rapier for agents

Rapier is a free Markdown editor for notes, editable diagrams, drawing and watercolor painting, on the web, Android,
Windows and Linux. A person and an agent edit the same document; the person's typing wins.

## Connect

- MCP, Streamable HTTP, no account: `https://mcp.rapier.website/door/mcp`
- Server Card: https://rapier.website/.well-known/mcp.json
- Guide: https://rapier.website/agents

## First calls

1. `open {text, filename}` creates the document with its whole first text, drawings included. Share `editor_url`.
2. `read {document}` returns the exact text and its revision.
3. `edit {document, revision, changes: [{old, new}]}` applies one undoable act. Keep its `act`.
4. `undo {document, act}` takes back only that act.
5. `export {document, format: "html"}` gives one offline file with the editor and the document inside.
6. `convert` turns pictures into JPEG XL on the person's device. In a sandbox, `npx rapier-jxl <file|folder>` converts and prints each size.

## npm packages

- `rapier-html`: `npx rapier-html notes.md` writes one offline HTML file with the editor and the document.
- `rapier-embed`: `Rapier.mount(element, {load, save})` puts the editor or the reader in a web app.
- `rapier-markdown-kit`: reads, renders and writes Markdown that carries its pictures and drawings.
- `rapier-jxl`: JPEG XL encoder and decoder for browsers, Node and Cloudflare Workers.
