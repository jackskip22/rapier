# Rapier, the Claude plugin

Paint with Claude, then pick up the brush yourself.

[Rapier](https://rapier.website) is a fast Markdown editor for notes, diagrams, drawing and painting.
You and Claude work on the same page. Keep writing by hand, move a diagram's boxes, or continue a painting
with your own brush. Review exact changes and undo recorded work while keeping later independent edits.

## Paint your first page

Ask Claude:

> Paint a small watercolour sunset over the sea in Rapier. Leave room for me to add a boat, then show me where to pick up the brush.

Open the editor link Claude returns and keep it visible while the paint is made. Water is marked **Testing**
and requires a WebGPU-capable browser. A queued painting is not finished: Claude checks that it committed
before handing you the brush. If Water is unavailable, Claude can offer regular brushes or a movable diagram.
Live collaboration needs an internet connection; downloaded files remain yours to edit offline.

Try a revision before adding your boat: “Add a small sun, then undo that change.”
Claude checks the result, leaving the painting ready for your own brush. Later marks on the same paint
surface can make an undo conflict; Rapier reports the conflict rather than discarding your work.

## Write, draw and keep it

- “Turn this signup process into a diagram whose boxes I can move: enter email, verify email, create profile, welcome.”
- “In my Rapier draft, fix only the typos in section 2 and show me exactly what changed.”
- “Give me this document as one offline HTML file I can keep editing.”

Mermaid flowcharts stay in Markdown. SVG drawings remain editable. Pictures, drawings and paintings travel
with the source in one `.md` file. Tables, footnotes, code and LaTeX can sit beside them.

The connector exports Markdown, plain text and an offline HTML editor. Word, PDF and rendered-page exports
need an open editor; Claude checks the actual delivery receipt. A rendered
page export is a file. Notes and note history use your configured store; connecting the hosted editor alone
does not connect your Notes.

The `rapier-html` skill can also package a document with its editor when the host has Node and npm.
You can edit, save and, with an optional one-use return address, send your copy back to Claude. Export links
last up to 24 hours within the workspace lifetime; shared workspaces expire after 30 idle days.
Download a file to keep an independent copy.

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
