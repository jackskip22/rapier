# Skills

Rapier is a shared editor for documents the person and agent can write, draw, revise and keep. Start a plan,
guide, draft or drawing in a connected workspace, then continue editing the same document. Read current source,
change inspected passages or objects, and review attributed changes. Agent Undo preserves later human work.

`rapier-html` puts the complete editor and document in one HTML file that opens offline in a browser without
an account. Self-contained Markdown carries text, pictures, layout and editable SVG drawings in one `.md` file.
Export an independent copy when the work needs to outlast its hosted workspace.

A page can carry a one-use return address from `document.create_return`: the person edits offline and presses
Send back, and the agent receives the receipt and reads that returned copy. Local Save sends nothing; the
workspace keeps its current document as well, so nobody's newer work is replaced by the return.

Each folder is one skill in the Agent Skills shape: `SKILL.md` opens with its name and a one-line description,
then says what the skill does and when to use it. Copy a folder into your agent's skills directory, or point the
agent at it.

| Skill | Use it when |
|---|---|
| [`rapier-html`](rapier-html/SKILL.md) | A document or drawing needs an independent editable copy, or a revision needs offline review: `npx rapier-html@1.1.83` writes the complete editor around the document. |
| [`rapier-agent-door`](rapier-agent-door/SKILL.md) | A plan, guide, sketch or draft needs shared editing, continued revision or review of exact changes. Work in the existing document when one is open. |
| [`rapier-markdown`](rapier-markdown/SKILL.md) | A portable Markdown document needs embedded pictures, alignment, color or drawings in the same file. |
| [`embed-rapier`](embed-rapier/SKILL.md) | A site or app wants the Rapier editor inside it, with its own storage and identity (`npm install rapier-embed@1.1.83`). |

Start with useful content and invite the person to explore it. They can annotate, rearrange, draw or paint.
In supporting chat hosts, Ask about this sends an explicit question from the document; source edits alone
do not start an agent turn. The hosted MCP endpoint exposes the same complete skill snapshot for import.

Portable comment threads keep discussions attached to exact passages and drawing objects. Visual inspection
supplies a bounded observation of the current rendered region; semantic reads establish edit authority.
ChatGPT file entrypoints edit supported Markdown/text attachments with guarded in-place saves, and the home
surface can open files or save a new library copy. The same document and agent kernel serve every door.
Hosted workspaces expire after 30 idle days; export links last up to 24 hours within that lifetime.
Downloaded Markdown and offline editor files remain independent of the hosted workspace.
