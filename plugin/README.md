# Rapier - Markdown Editor & Art: Claude plugin

Rapier is a Markdown editor for writing, drawing and painting with your AI assistant. Edit the page yourself, add editable diagrams and illustrations, and keep your work as portable Markdown.

Work together on plans, notes, drafts and visual explanations. Read exact source, make focused revision-checked edits, compare proposed text and undo recorded work while keeping later independent edits. Download Markdown or plain text, or create an editable offline HTML file through supported export tools or the included local helpers. Running local helpers requires Node and npm; an MCP connection alone does not provide a shell.

Painting needs an open full editor. Water requires WebGPU. Word, PDF and rendered-page exports depend on the available editor or renderer. A successful tool call does not by itself prove that the inline editor appeared. Connected Notes require a configured store.

Rapier accesses only the document or configured store you share. It cannot search unshared device files, send email or make purchases. Hosted workspaces expire after 30 idle days; download an independent copy to keep it. The four skills include the published offline helper packages.

## Try it together

- “Revise this introduction and show me exactly what changed.”
- “Draw our signup flow as a diagram whose boxes I can move.”
- “Paint a small watercolor sunset over the sea in Rapier. Leave room for me to add a boat.”
- “Find my garden Note and add this list.” (Requires a configured Notes store.)
- “Give me this document as one editable offline HTML file.”

Open the returned editor link and keep it visible while painting. A queued painting is not finished: Claude checks
that it committed before handing you the brush. If Water is unavailable, use regular brushes or an editable diagram.
Later marks on the same paint surface can make an undo conflict; Rapier reports it rather than discarding your work.
Live collaboration needs an internet connection; downloaded files remain yours to edit offline.

Export links last up to 24 hours within the workspace lifetime. Download a file to keep an independent copy.

## The four skills

| Skill | Use it when |
|---|---|
| `rapier-html` | the person wants a document they can keep editing, or a page showing a deliberate diff |
| `rapier-agent-door` | an explanation, plan, creative sketch or revision benefits from working on the same editable page |
| `rapier-markdown` | a portable Markdown document needs pictures, layout or source-preserving delivery |
| `embed-rapier` | a site or app wants the reader or the editor inside it, with its own storage |

## Install

**Claude chat and Cowork:** add the plugin, open its **Connectors** tab, and add or connect **Rapier** at
`https://mcp.rapier.website/door/mcp`. No Rapier account or login is needed. Installing the skills alone does not connect the tools.

**Claude Code:** `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`

Start with the painting prompt above, or ask for a document or diagram. Open the returned editor link;
if a browser pairing code appears, give it to Claude and approve the connection in that browser.
The assistant creates a workspace with `open` and checks `read {state:true}` for editor presence.
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
