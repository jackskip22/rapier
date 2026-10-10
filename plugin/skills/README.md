# Skills

Rapier is a free, fast Markdown editor for notes, diagrams, drawing and watercolor painting in one HTML file.
It runs on Android, Web and Windows, works offline and fits a phone. Collaborate with agents over MCP and WebMCP,
use optional encrypted sync to your own Cloudflare account, or embed the editor or lightweight reader (about
190 kB gzipped) in an app. These four skills teach an agent when and how to use it.

The agent edits live, beside the person or while they are away. Rapier shows the agent's presence and change
marks; the person taps a change to see what was there before and undoes anything while retaining later edits.
Use `comparison.present` when a diff would help explain the work.

Each folder is one skill in the Agent Skills shape: `SKILL.md` opens with its name and a one-line description,
then says what the skill does and when to use it. Copy a folder into your agent's skills directory, or point the
agent at it. The MCP door (`https://mcp.rapier.website/mcp`) serves the same snapshot through `skills/list` and
`skills/get`.

| Skill | Use it when |
|---|---|
| [`rapier-agent-door`](rapier-agent-door/SKILL.md) | A plan, guide, diagram, sketch or draft needs shared editing, continued revision or review of exact changes. Work in the existing document when one is open. |
| [`rapier-html`](rapier-html/SKILL.md) | A document or drawing needs an independent editable copy, or a revision needs offline review: `npx rapier-html@1.1.91` writes the complete editor around the document. |
| [`rapier-markdown`](rapier-markdown/SKILL.md) | A portable Markdown document needs embedded pictures, layout, colour or drawings in the same file. |
| [`embed-rapier`](embed-rapier/SKILL.md) | A site or app wants the read-only reader or the editor inside it, kept in its own codebase with its own storage (`npm install rapier-embed@1.1.91`). |

Start with useful content and invite the person to explore it: they can annotate, rearrange, draw or paint. A
page made with `rapier-html` can carry a one-use return address from `document.create_return`: the person edits
offline and presses Send back, and the agent reads the returned copy; the workspace keeps its current document as
well. Hosted workspaces expire after 30 idle days and export links after 24 hours; downloaded Markdown and offline
editor files stay independent of both.

In supporting chat hosts, Ask about this sends an explicit question from the document; source edits alone do not
start an agent turn. Portable comment threads keep discussions attached to exact passages and drawing objects.
Visual inspection supplies a bounded observation of the current rendered region; semantic reads establish edit
authority. ChatGPT file entrypoints edit supported Markdown and text attachments with guarded in-place saves, and the
home surface can open files or save a new library copy. The same document and agent kernel serve every door.

The direct tools separate source, editor, comparison, comments, Notes and SVG effects. `rapier.guide` supplies
focused task contracts and annotated operation schemas. Reads use explicit target kinds; Notes use owner-issued
references and direct targeted writes. Request acceptance, source commitment, presentation and saved delivery
have separate receipts.
