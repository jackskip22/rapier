# Skills

Rapier is a free Markdown editor that a person and an agent edit together, live, with no account. The agent changes
exactly the passage or drawing object it read; the person keeps, drops or undoes each change, and undoing the
agent's change keeps their later edits. These four skills teach an agent when and how to use it.

Each folder is one skill in the Agent Skills shape: `SKILL.md` opens with its name and a one-line description,
then says what the skill does and when to use it. Copy a folder into your agent's skills directory, or point the
agent at it. The MCP door (`https://mcp.rapier.website/mcp`) serves the same snapshot through `skills/list` and
`skills/get`.

| Skill | Use it when |
|---|---|
| [`rapier-agent-door`](rapier-agent-door/SKILL.md) | A plan, guide, diagram, sketch or draft needs shared editing, continued revision or review of exact changes. Work in the existing document when one is open. |
| [`rapier-html`](rapier-html/SKILL.md) | A document or drawing needs an independent editable copy, or a revision needs offline review: `npx rapier-html@1.1.90` writes the complete editor around the document. |
| [`rapier-markdown`](rapier-markdown/SKILL.md) | A portable Markdown document needs embedded pictures, layout, colour or drawings in the same file. |
| [`embed-rapier`](embed-rapier/SKILL.md) | A site or app wants the read-only reader or the editor inside it, kept in its own codebase with its own storage (`npm install rapier-embed@1.1.90`). |

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
