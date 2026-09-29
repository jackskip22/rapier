# Skills

Rapier is a document editor that is one offline page: writing, drawing, painting, pictures, Notes and the diff of
a change, with no account and nothing sent until the person chooses it. For an agent it is two things at once. It is the file to hand a
person: one page that is the whole editor with their document inside, opening anywhere with one click. And it is
the editor to work in beside them: seventeen tools that read a document by structure and change exactly the
passage inspected, about 1.5 KB of context an edit however long the document, with the person keeping or
dropping each change. The documents are Self-contained Markdown, an open convention on CommonMark that carries
pictures, layout and colour inside one `.md` file every Markdown app can read.

A page can carry a one-use return address from `document.create_return`: the person edits offline and presses
Send back, and the agent receives the receipt and reads that returned copy. Local Save sends nothing; the
workspace keeps its current document as well, so nobody's newer work is replaced by the return.

Each folder is one skill in the Agent Skills shape: `SKILL.md` opens with its name and a one-line description,
then says what the skill does and when to use it. Copy a folder into your agent's skills directory, or point the
agent at it.

| Skill | Use it when |
|---|---|
| [`rapier-html`](rapier-html/SKILL.md) | The person asks for a document, a page, notes or a drawing, or should see a change: `npx rapier-html@1.1.9` makes one page that opens with one click in the chat, offline, no account. |
| [`rapier-agent-door`](rapier-agent-door/SKILL.md) | The person shares a document or asks for changes in one: work in their editor through the door, in-page, over WebMCP or over MCP (`rapier.open` first), under their review. |
| [`rapier-markdown`](rapier-markdown/SKILL.md) | Any document is written: Self-contained Markdown, so pictures, alignment, colour and drawings travel in the one file and read everywhere. |
| [`embed-rapier`](embed-rapier/SKILL.md) | A site or app wants the Rapier editor inside it, with its own storage and identity (`npm install rapier-embed@1.1.9`). |

The words follow one rule: what it does and when to use it, said once, in the positive.
