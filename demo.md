# Your agent, in this document

Rapier is a Markdown editor that runs entirely on your device. If your browser has
an AI agent, that agent can work in **this page, beside you** — and everything on
this page works whether it does or not.

**Ask your agent to try these, right now, in this document:**

- *What's in this document?* — it reads the **shape** first: headings only, no body
  text. There is no tool that hands over the whole file.
- *Find where it talks about saving.* — bounded snippets with a handle for each,
  not a dump.
- *Tighten the paragraph my cursor is in.* — it can see what you are pointing at,
  so you never have to describe it.
- *Add a line to the Notes section below.* — allowed. That section may grow and
  nothing already in it can be touched.
- *Rewrite the Statement section below.* — **refused.** That section is held by the
  document's own will. Rapier shows you the exact proposal and you decide.
- *Tighten the paragraph just below this list.* — tap the circle and choose `ASK`:
  the change is **held** and shown to you first, and you allow it once or keep it
  held; choose `CHECK` and it lands, but the next waits until this one has held your view.
- *Tell me in one line what you changed, without editing the document.* — it shows
  beside the circle as your **note**; tap it to open the panel and
  jump to the change — never approval.
- *Make a new file `demo.js` with one small function and a call to it, then map it and
  find every call.* — it hands the editor a JavaScript file of its own (Rapier asks you
  first if this one is unsaved). The circle wears an **acorn** while the file's structure
  is live, and the same tools now search syntax, not text.

---

# rapier

A fast editor for Markdown, text and code. One file, on your phone or your laptop, offline, no account. It's free, and it's yours.

> [!TIP]
> **Tap any paragraph to edit it.** Select text for the formatting bar. **Drag the circle** at the right edge to fly through a long document, or **tap it** for the headings.

## Start here

1. **Tap this line.** It opens for editing in place; everything around it stays as it is.
   1. Select a few words and the formatting bar appears.
   2. Or type Markdown straight in, if that's faster.
   3. Tap away when you're done.
2. **Fly.** Drag the circle at the right edge through the document.
   - tap it for the outline of headings;
   - in a text or code file it goes to a line instead.
3. **Nest.** Put your cursor in a list item and tap **Nest**; **Resume** brings it back.
   - lists stay tidy however deep they go;
     - the numbers renumber themselves;
       - and the connectors follow.
4. **Tick things off.**
   - [x] open Rapier
   - [ ] edit this line
   - [ ] tick this box

## Writing

**Bold**, *italic*, ~~gone~~, ++added++, `code`, ==highlighted==, ==🟢green==, ==🔴red==, ==🔵blue==, H~2~O and 1^st^ — all plain Markdown in the file.

> A quote, for something worth keeping.

> [!NOTE]
> Callouts come from ordinary blockquotes: `[!NOTE]`, `[!TIP]`, `[!WARNING]`. Other editors show them as quotes and lose nothing.

Every heading is a stop in the outline the circle opens.[^1] Drop in a picture — PNG, JPEG or WebP — and it's sized for a phone and kept inside the Markdown; nothing is uploaded anywhere.

<details>
<summary>Why "rapier"?</summary>

Thin, fast, exact. Carry the useful edge and leave the weight behind.

</details>

## Tables

| what | where |
|---|---|
| find and replace | the magnifier |
| every command | `Ctrl` `K` |
| Settings | the three dots |

Tap a cell to edit it. Paste a block of spreadsheet cells and the table grows to fit.

## Code

```js
export function twice(x) {
  return x + x; // highlighted offline, nothing fetched
}
```

Text and code files open straight into the source editor. The eye/code switch in Settings shows the exact Markdown behind this page.

## Saving

**Recovery** is automatic: as you type, Rapier keeps a draft on this device, so an interrupted tab comes back. **Save** is deliberate: it writes the real file, and reads it back to be sure.

> [!WARNING]
> A draft is not a saved file. Save or export anything you'd hate to write again.

**Copy**, **Share** and **Export** (text, HTML, PDF, DOCX) live under the three dots.

## Compare

Open a second file with **Compare** and see exactly what changed, unchanged stretches folded away:

```diff
- take the rewrite on trust
+ read exactly what the rewrite changed
```

It's read-only. Closing it touches nothing.

## Two hands

In a browser with WebMCP, the AI agent you already talk to can work in this document beside you. It sees the outline first and reads only the part it needs. Your hand wins: it can't overwrite what you're editing, its change can be undone on its own, and the circle shows when it's here.

## Will

A will is your note on a section for any agent that edits this document: what may change, what may only grow, what must never move. Tap the icon above a section to change it, or the **W** in the formatting bar to add one. The next two sections carry real ones:

<!-- will/1 keep: keep this exactly as I wrote it -->

### Statement

You edit everything, always. An agent working here obeys the will.

<!-- /will -->

<!-- will/1 append: add new notes at the bottom, one line each -->

### Notes

An agent may add lines here and cannot touch the ones already written. Ask one to rewrite the statement above: Rapier shows you its proposal and you decide.

<!-- /will -->

## Where it runs

As this page; installed from the browser (**⋮ → Add to Home screen** on Android, the install icon on desktop); as the Android and Windows apps; from a USB stick; inside your own app; or as a Speedracer app in your own Cloudflare account. The same file everywhere: `rapier.html`, about 3 MB.

## Keyboard

Hold **Ctrl** (**Cmd** on a Mac), then:

| key | action |
|---|---|
| `K` | every command |
| `F` | find and replace |
| `S` · `Shift S` | save · save as |
| `Z` · `Shift Z` | undo · redo |
| `B` · `I` · `U` | bold · italic · underline |
| `,` | Settings |

`Tab` and `Shift Tab` nest a list item, indent code, or step through a table. `Esc` closes whatever is open.

## Free

Rapier is free software under the AGPL, and the file you're reading this in is the whole program. Keep the name and the licence, and it's yours to carry anywhere.

[^1]: Footnotes work too. Tap the number, then tap it again to come back.

***

*rapier. thin, fast, exact.*