# Rapier, the Claude plugin

[Rapier](https://rapier.website) is a free Markdown editor that you and your assistant edit together, live. The
assistant changes exactly the passage or drawing it read; your typing comes first; you keep, drop or undo each
change. No Rapier account.

**A shared editor.** Through the MCP door (`https://mcp.rapier.website/mcp`, no account or key) the assistant opens a workspace with
`rapier.open`, reads a document by structure and changes only the passage or drawing object it inspected. Changes
apply at once or wait for your review, under FREE, CHECK or ASK; undoing the assistant's change keeps your later
edits. Diagrams are drawn from a recipe: the assistant names the boxes and arrows, Rapier places and routes them,
and you move them by hand. The assistant also paints with brushes and watercolour.

**An offline file.** `npx rapier-html@1.1.90 notes.md` writes one HTML file containing the editor and the
document. Open it in any browser to edit, draw, paint, review changes and save. An optional one-use Send back
address returns your edited copy to the assistant.

**Every format.** The door exports exact Markdown, the offline editor, plain text or a rendered web page; an open
editor also writes Word and PDF. Export links last 24 hours; hosted workspaces expire after 30 idle days. Download
the file to keep an independent copy. Notes tools use the store you configured.

Comment threads attach to passages, pictures and drawing objects and travel in the Markdown. An explicit Ask action
sends a request; ordinary comments remain document content. Visual inspection returns the current rendered region
when an editor is open. Exact source reads establish edit authority.

Self-contained Markdown extends CommonMark: pictures, layout, colour, page breaks and editable SVG drawings travel
inside one `.md` file every Markdown app can read.

## The four skills

| Skill | Use it when |
|---|---|
| `rapier-html` | the person wants a document they can keep editing, or a page with a diff to review |
| `rapier-agent-door` | an explanation, plan, creative sketch or revision benefits from working on the same editable page |
| `rapier-markdown` | a portable Markdown document needs pictures, layout or source-preserving delivery |
| `embed-rapier` | a site or app wants the reader or the editor inside it, with its own storage |

## Install

**Claude chat and Cowork:** add the plugin, open its **Connectors** tab, and add or connect **Rapier** at
`https://mcp.rapier.website/mcp`. No Rapier account or login is needed. Installing the skills alone does not connect the tools.

**Claude Code:** `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`

For a first document, ask: “Write a project plan in Rapier that I can edit in my browser and keep as one Markdown file.”
The assistant creates a workspace with `rapier.open` and checks `document.get_context` for editor presence.
If the host supplies no editor, it can deliver an offline editable file through an available file/code surface,
or the Markdown source in chat. A successful workspace call alone does not confirm that an editor opened.
If Rapier tools are unavailable, check the plugin's connector connection before retrying.

Each skill carries its own references and helpers. The `rapier-html` npm package supplies the editor for `npx`;
`SKILLS.json` records the staged package versions. Node 22 and npm depend on the host; an MCP connection does not
promise a shell.

## Snapshot

`SKILLS.json` names this skill snapshot, its file digest and the worker source digest it was staged with. The worker's
`serverInfo.version` is `<release>+worker.<id>` when Cloudflare supplies its version metadata, otherwise the release
alone; read it through MCP or `/health`. The source digest is build identity, not proof of a deployment. 

## What it sends

The skills are instructions and helpers for the host's file and tool environment. The declared package command
downloads its pinned package from npm when needed. The connector sends the document you share with the assistant to the door, which
keeps it, with the work on it, in a workspace that expires after thirty idle days. No account, no telemetry; the person ends the
assistant's access from the editor at any moment. In full: [PRIVACY.md](PRIVACY.md).
