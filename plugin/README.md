# Rapier, the Claude plugin

[Rapier](https://rapier.website) is a document editor that is one offline page: writing, drawing, painting, pictures,
Notes and the diff of a change, with no account and nothing sent until the person chooses it. It gives an assistant two things.

**The file to hand a person.** `npx rapier-html@1.1.10 notes.md` makes one HTML file that is the whole editor with the
document inside. They open it anywhere with one click, read it, edit it, draw and paint in it, review a proposed
change as a diff (keep or drop each part), save it and send it back exactly. Paint keeps transparent edges;
drawings stay editable and readable on light or dark paper.

**The editor to work in beside them.** Through the MCP door (`https://mcp.rapier.website/mcp`, no account) an assistant
reads a document by structure and changes exactly the passage or drawing object it inspected, while the person sees every change land, keeps or drops each one, undoes an identified agent change without
losing their own, draws diagrams by recipe and works with the notes they supply. Name diagram boxes and arrows;
Rapier places the boxes and routes the connectors around them, with labels and arrowheads kept with their paths.

The documents are **Self-contained Markdown**, an open convention on CommonMark: pictures, alignment, size and
placement, text colour, page breaks and editable SVG drawings travel inside one `.md` file that every Markdown app
can read.

Start with a useful result, then explore it together: rearrange an idea, annotate a plan, revise a paragraph,
or type a question beside a diagram and send it with Ask about this. Ordinary edits stay document content;
only an explicit send asks the assistant to respond. The host controls when it supplies context and runs a turn.

## The four skills

| Skill | Use it when |
|---|---|
| `rapier-html` | the person wants a document they can keep editing, or a page with a diff to review |
| `rapier-agent-door` | an explanation, plan, creative sketch or revision benefits from working on the same editable page |
| `rapier-markdown` | a portable Markdown document needs pictures, layout or source-preserving delivery |
| `embed-rapier` | a site or app wants the editor inside it, with its own storage |

## Install

`claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`

Each skill includes its own references and helpers. The page helper takes editor HTML explicitly; the
`rapier-html` npm package supplies the full editor for `npx`. The packages repository stages these declared
command/library dependencies under `npm/`; SKILLS.json records their versions. Node 22+ and npm execution depend on the host; an MCP
connection does not promise a shell. Use the available editor or provide the file through the host's file tools.

## Snapshot and submission

`SKILLS.json` names this imported skill snapshot, its full file digest, and the worker source digest used
to stage it. The worker's `serverInfo.version` is `<release>+worker.<id>` when Cloudflare supplies its
version metadata, otherwise the release alone. Read it through MCP or `/health` and record the deployed id
beside the submitted snapshot.
The source digest is build identity, not proof of a running deployment. No registration id is invented here.
Each skill's `SNAPSHOT.json` keeps its text identity when the folder is uploaded separately.

OpenAI imports skills as a submission-time snapshot. Upload changed skills with a new plugin submission;
if importing from MCP instead, deploy and Scan Tools again first. The host does not fetch skill updates at runtime.
Check the installed snapshot's identity when diagnosing a mismatch with a deployed server.

Package and import rules: [portable package](https://developers.openai.com/plugins/build/plugins),
[skills](https://developers.openai.com/plugins/build/skills),
[With MCP submission](https://developers.openai.com/plugins/guides/submit-claude-plugin).

## What it sends

The skills run in the host's file and tool environment. Their local helpers do not upload documents; the declared
package command downloads its pinned package from npm when needed. The connector sends the document you share with
the assistant to the door, which keeps it for that workspace and drops it after thirty idle days. No account, no telemetry; the person
ends the assistant's access from the editor at any moment. The words in full: [PRIVACY.md](PRIVACY.md).
