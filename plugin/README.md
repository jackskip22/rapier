# Rapier, the Claude plugin

[Rapier](https://rapier.website) is a Markdown editor for writing, drawing, painting, Notes and reviewing changes.
The offline editor runs on your device; the connector keeps shared work in a hosted workspace.
Neither requires a Rapier account.

**An offline file.** `npx rapier-html@1.1.85 notes.md` creates one HTML file containing the editor and
document. Open it in a browser to edit, draw, paint, review changes and save.
An optional one-use Send back address returns the edited copy to the assistant.

**A shared editor.** Through the MCP endpoint (`https://mcp.rapier.website/mcp`, no account) an assistant reads a document
by structure and changes the passage or drawing object it inspected. Changes apply directly or wait for review
under the person's controls. Agent Undo preserves later human work. Diagrams are drawn by recipe: name the boxes and arrows,
and Rapier places and routes them.

The hosted tools export exact Markdown, an offline editor, plain text or a rendered web page. An open editor
also supplies Word and PDF. Export links last up to 24 hours; hosted workspaces expire after 30 idle days.
Download the file to keep an independent copy. Notes access uses the configured local store or enrolled endpoint.

Portable comment threads attach to passages, pictures and drawing objects. An explicit Ask action sends a
request; ordinary comments remain document content. Visual inspection returns the current rendered region
when an editor is present. Exact source reads establish edit authority.



Self-contained Markdown extends CommonMark: pictures, layout, colour, page breaks and
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
