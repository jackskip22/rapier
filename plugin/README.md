# Rapier, the Claude plugin

[Rapier](https://rapier.website) is a document editor in one offline page: writing, drawing, painting, pictures, Notes
and the diff of a change, with no account and nothing sent until the person chooses it. An assistant gets two things.

**A file to hand a person.** `npx rapier-html@1.1.24 notes.md` makes one HTML file that is the whole editor with the
document inside. They open it with one click, edit, draw and paint in it, review a proposed change as a diff, save it
and send it back exactly.

**An editor to work in beside them.** Through the MCP door (`https://mcp.rapier.website/mcp`, no account) an assistant reads a document
by structure and changes the passage or drawing object it inspected; the person sees each change land, keeps or drops
it, and can undo an agent's change without losing their own. Diagrams are drawn by recipe: name the boxes and arrows,
and Rapier places and routes them.

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

`claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`

Each skill carries its own references and helpers. The `rapier-html` npm package supplies the editor for `npx`;
`SKILLS.json` records the staged package versions. Node 22 and npm depend on the host; an MCP connection does not
promise a shell.

## Snapshot and submission

`SKILLS.json` names this skill snapshot, its file digest and the worker source digest it was staged with. The worker's
`serverInfo.version` is `<release>+worker.<id>` when Cloudflare supplies its version metadata, otherwise the release
alone; read it through MCP or `/health` and record it beside the submitted snapshot. The source digest is build
identity, not proof of a deployment. OpenAI imports skills as a submission-time snapshot: upload changed skills with a
new submission, or deploy and Scan Tools again when importing from MCP. Rules:
[portable package](https://developers.openai.com/plugins/build/plugins), [skills](https://developers.openai.com/plugins/build/skills),
[With MCP submission](https://developers.openai.com/plugins/guides/submit-claude-plugin).

## What it sends

The skills run in the host's file and tool environment and upload nothing; the declared package command downloads its
pinned package from npm when needed. The connector sends the document you share with the assistant to the door, which
keeps it for that workspace and drops it after thirty idle days. No account, no telemetry; the person ends the
assistant's access from the editor at any moment. In full: [PRIVACY.md](PRIVACY.md).
