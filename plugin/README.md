# Rapier, the Claude plugin

[Rapier](https://rapier.website) is a very fast Markdown editor in one offline HTML file: writing, drawing, painting,
pictures, Notes and the diff of a change, on a phone or any browser. The offline editor runs on your device; the
connector keeps shared work in a hosted workspace. Neither requires a Rapier account. Long documents open and scroll
fast. An assistant gets two things.

**A file to hand a person.** `npx rapier-html@1.1.75 notes.md` makes one HTML file that is the whole editor with the
document inside. They open it with one click, edit, draw and paint in it, review a proposed change as a diff, save it
and send it back exactly.

**An editor to work in beside them.** Through the MCP door (`https://mcp.rapier.website/mcp`, no account) an assistant reads a document
by structure and changes the passage or drawing object it inspected; the person sees each change land, keeps or drops
it, and can undo an agent's change without losing their own. Diagrams are drawn by recipe: name the boxes and arrows,
and Rapier places and routes them.

The hosted tools export Markdown or an offline HTML page through download links that expire after 24 hours. Word and
PDF export, and device Notes, are available in the full editor. The hosted tools cannot access device Notes.

Portable comment threads attach to passages, pictures and drawing objects. An explicit Ask action sends a
request; ordinary comments remain document content. Visual inspection returns the current rendered region
when an editor is present, while exact source reads establish edit authority. Use those together to move
between a codebase, its diagram, a human-edited sketch and screenshot annotations.



The documents are Self-contained Markdown, an open convention on CommonMark: pictures, layout, colour, page breaks and
editable SVG drawings travel inside one `.md` file every Markdown app can read.

## The four skills

| Skill | Use it when |
|---|---|
| `rapier-html` | the person wants a document they can keep editing, or a page with a diff to review |
| `rapier-agent-door` | an explanation, plan, creative sketch or revision benefits from working on the same editable page |
| `rapier-markdown` | a portable Markdown document needs pictures, layout or source-preserving delivery |
| `embed-rapier` | a site or app wants the editor inside it, with its own storage |

## Install

**Claude chat and Cowork:** add the plugin, open its **Connectors** tab, and add or connect **Rapier** at
`https://mcp.rapier.website/mcp`. No Rapier account or login is needed. Installing the skills alone does not connect the tools.

**Claude Code:** `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`

For a first document, ask: “Create an editable garden plan in Rapier with beds for tomatoes, herbs and flowers.”
The assistant creates a workspace with `rapier.open` and checks `document.get_context` for editor presence.
If the host supplies no editor, it can deliver an offline editable file through an available file/code surface,
or the Markdown source in chat. A successful workspace call alone does not confirm that an editor opened.
If Rapier tools are unavailable, check the plugin's connector connection before retrying.

Each skill carries its own references and helpers. The `rapier-html` npm package supplies the editor for `npx`;
`SKILLS.json` records the staged package versions. Node 22 and npm depend on the host; an MCP connection does not
promise a shell.

## Snapshot and submission

`SKILLS.json` names this skill snapshot, its file digest and the worker source digest it was staged with. The worker's
`serverInfo.version` is `<release>+worker.<id>` when Cloudflare supplies its version metadata, otherwise the release
alone; read it through MCP or `/health` and record it beside the submitted snapshot. The source digest is build
identity, not proof of a deployment. For Claude, submit the remote server as an **MCP connector** and this folder as a **Plugin bundle** from
`jackskip22/rapier-plugins`, plugin path `claude`. Use the same endpoint for both submissions so they share
one connection. Validate the exact candidate commit in the developer portal; revalidate after any change.
The repository must be public before the plugin listing goes live. See the Claude directory's
[plugin submission guide](https://claude.com/docs/plugins/submit),
[plugin checklist](https://claude.com/docs/plugins/pre-submission-checklist) and
[connector submission guide](https://claude.com/docs/connectors/building/submission).

## What it sends

The skills are instructions and helpers for the host's file and tool environment. The declared package command
downloads its pinned package from npm when needed. The connector sends the document you share with the assistant to the door, which
keeps it, with the work on it, in a workspace that expires after thirty idle days. No account, no telemetry; the person ends the
assistant's access from the editor at any moment. In full: [PRIVACY.md](PRIVACY.md).
