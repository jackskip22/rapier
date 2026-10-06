# The token saving, measured

How much context an agent spends editing a long document through Rapier's agent door, and the number. The
bench drives Rapier's real agent kernel in Node, exactly as its own tests do, and checks that every way ends with
the same text.

## The measurement

An agent changes one clause in a long document, thirty times, in one of three ways:

- **whole:** read the whole text, send the whole edited text back (a document the agent can only read and write
  as a unit: a form field, a chat's attached file, a plain file tool without a patch);
- **patch:** read the whole text once into the context, then send each edit as old text to new text (a coding
  agent's Edit tool; the fairest baseline);
- **the door:** Rapier's agent tools: `document.get_outline` once, then per edit `document.find`,
  `document.read_context` on the one passage, `document.apply_edits` with its handle.

Counted: every byte that crosses the agent's context window in both directions, the tool inputs the agent writes
and the results it reads. Tokens are estimated at four bytes a token and are said as an estimate.

| Document | Edits | whole | patch | the door | door vs whole | door vs patch |
|---|---:|---:|---:|---:|---:|---:|
| 60 sections, 84,728 B (about 21,000 tokens, 30 pages) | 30 | 5,088,621 B | 87,439 B | 48,163 B | 105.7x, 99.1% less | 1.8x, 44.9% less |
| 200 sections, 283,098 B (about 71,000 tokens, 100 pages) | 30 | 16,990,821 B | 285,841 B | 48,317 B | 351.7x, 99.7% less | 5.9x, 83.1% less |
| 200 sections, 283,098 B | 5 | 2,831,105 B | 283,544 B | 11,052 B | 256.2x, 99.6% less | 25.7x, 96.1% less |

Per edit, in bytes: whole costs the document twice (169,621 at 30 pages, 566,361 at 100); patch costs about 90
plus the whole document once per session; the door costs about 1,480 plus an outline of 3,664–3,666 once, whatever
the size of the document.

## The fact, in one sentence

**Through Rapier's agent door, an edit to a long document costs an agent about 1.5 KB of context (some 370
tokens) whatever the document's length; against reading the document into context first, that is 45% less at
30 pages and 83% less at 100 pages over thirty edits, and 96% less over five; against rewriting the whole
document it is two orders of magnitude.** The door also checks the Will and the person's own typing at every
edit and returns a receipt with the revision, which the other two ways cannot do at all.

## What this does not claim

The estimate is bytes over four; a tokenizer counts differently by language and by markup. The document is
generated prose with a regular shape; a document full of pictures (bytes inside the Markdown) makes the whole
and patch ways worse still, not the door. No claim is made about model quality or about how many edits an
agent needs to reach a goal. The bench is rerun and this table refreshed whenever the door's result shapes
change.
