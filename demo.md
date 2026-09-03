# Your agent, in this document

Rapier is a Markdown editor that runs entirely on your device. If your browser has
an AI agent, that agent can work in **this page, beside you** — and everything on
this page works whether it does or not.

That connection is **WebMCP**. The page tells the agent what it may do here; the
agent does it here, in your document, instead of somewhere else. There is nothing
to install, no account, and Rapier sends no document text anywhere on its own.

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
  beside the circle as `your agent` plus your **note**; tap it to open the panel and
  jump to the change — never approval.

Your hand always wins: Rapier refuses any agent edit over your live caret or
selection. Every agent change lands as one attributed transaction, so it sits in
ordinary Undo and Compare opens over it.

The rest of this document is Rapier's own guide. Scroll on, or drag the marker at
the right edge to fly through it.

---

# rapier

> [!TIP]
> **Tap any paragraph to edit it.** Select text for the formatting bar. **Drag the marker at the right edge** to fly through a long document, or **tap it** for the heading outline.

A Markdown, text and code editor that runs entirely on your device, made for long documents on a phone. No account, no server, no telemetry, nothing to install.

This whole application is one HTML file. About 3 MB, opened from a disk, a USB stick, or a file someone emailed you — working the same in all three.

## Long documents

Most editors slow down as a document gets long. Rapier doesn't: it draws only what's on screen, and a huge text or code file stays smooth past 4,000 lines. Blocks you never touched are saved back exactly as they arrived, down to the line endings.

**Run it properly.** It works as a plain web page, but it's better installed.

- On a phone, the Android app is the best experience — real files, sharing, speech, recents.
- Everywhere else, install it as a web app: the install icon in Chrome or Edge's address bar, or **⋮ → Add to Home screen** on Android Chrome.
- Installed, it launches from the home screen, keeps its own storage, and runs offline.

## Two hands

In a browser with WebMCP, the agent you already talk to can work in this document beside you. It doesn't get the whole document — it sees the shape first, then reads only the exact part it needs. Your hand always wins: it can't touch what your cursor is in. Every change it makes is one plain edit, sitting in your ordinary undo history, that Compare can open. Rapier has no chat, model picker or API key — the conversation stays where you already have it; the file stays yours.

## Will

A document can carry its own will: what may change, what may only grow, what must never move — plus a note in your own words to whoever reads it next. Three laws, `edit`, `append`, `keep`, held in a pair of invisible markers around each section.

**Will — the document's word to the next agent.** The markers travel with the file: an editor that's never heard of them loses nothing, and any model reading the file understands them with no help at all. A proposal to touch something held pauses in Compare, showing exactly what's there and what's proposed, for you to `KEEP HELD` or `ALLOW THIS ONCE` — never a standing permission. To set one yourself, hold a heading's fold chevron, choose `open`, `add-only`, or `locked`, and say why.

The next two sections wear real ones:

<!-- will/1 keep: this is the exact statement; it stays as written -->

### Statement

You edit everything, always. Rapier's registered agent hand obeys the will.

<!-- /will -->

<!-- will/1 append: one line per note, newest last -->

### Notes

An agent may add lines to this section and cannot touch the ones already here. If you have an agent connected, ask it to rewrite the kept statement above: Rapier opens the exact proposal for your decision while keeping the law intact.

<!-- /will -->

## Yours

Rapier has no account, no backend, no telemetry — it sends nothing on its own. If you let an agent inspect a region, only those exact bytes go to it, under its own terms. The source is AGPL-3.0, and it's the file you're reading this in: **Save Page As**, and you're holding a fork.

## Writing

Tap a block to edit it; everything around it stays rendered. Select text for the toolbar, or type the Markdown yourself: **bold**, *italic*, ~~struck out~~, ++underlined++, `code`, ==highlighted== in five colours, H~2~O, 1^st^.

The text-style button turns a block into a paragraph or a heading, H1 to H6 — every heading becomes a stop in the outline. Put your cursor in a list item and tap **Nest** to indent it, **Resume** to pull it back out; Tab and Shift+Tab do the same. Numbered lists renumber themselves as you move things around.

Tap a table cell and type; paste a block of spreadsheet cells to fill and grow it. Tasks are real checkboxes:

- [x] open Rapier
- [ ] tap a paragraph and edit it

`[!NOTE]`, `[!TIP]`, `[!WARNING]` and the rest turn a quote into a callout, and stay ordinary blockquotes in the file. Drop in a picture — PNG, JPEG, WebP — and it's checked, sized sensibly, and embedded right in the Markdown; nothing is uploaded. Maths needs one small download the first time, verified once and kept offline after.

<details>
<summary>Why call it rapier?</summary>

Slender, fast, exact. Carry the useful edge and leave the weight behind.

</details>

## Source, text and code

Switch to the exact Markdown behind the page with the eye/code toggle in Settings. Plain text and code files skip straight to that view, with syntax highlighting built in — nothing fetched. Tab and Shift+Tab indent a line or a selection, matching whatever the file already uses. Find searches the whole document, and replace-all is one field away.

## Compare

Open Settings → compare and pick a second file. Rapier shows exactly what changed against the one you have open — additions and deletions in place, unchanged stretches collapsed, a step control between changes.

```diff
- take the rewrite on trust
+ read exactly what the rewrite changed
```

It's read-only and temporary: closing it touches nothing — not the document, its undo history, or its recovery draft.

## Copy, share, export

**Copy** gives you formatted rich text, the exact Markdown, or plain text, whichever the destination needs. **Export** writes a file: `.txt`, publishing HTML for a CMS, a standalone web page, `.pdf`, or `.docx`. **Share**, where the platform allows it, sends the source, a web page, or a DOCX.

## Saving

Two different things protect your work. **Recovery** is automatic — Rapier saves your session to local storage as you type, so an interrupted tab can come back, though browser storage can still be cleared or refused. **Save** is deliberate: where the platform allows it, Rapier writes the file, reads it back, and checks the bytes before calling it saved.

> [!WARNING]
> A recovery draft is not a saved file. Save or export anything you'd hate to write again.

Read-only mode, in Settings, blocks editing but leaves everything else — navigating, copying, Compare, export, read-aloud — working.

## Editions

The portable `rapier.html`, the hosted page, the installed web app, the Windows app, and authorised embeds are complete and free. So is the Android app — one optional US$5 Rapier Pro purchase there unlocks Compare past the first change, Complete Excerpt, PDF and DOCX export, and eight launcher colours. Paid once if you want it; no subscription, no account, and every other edition is already unlocked.

Android and Windows wrap the same bytes in a native shell; the Windows edition is one executable, no installer.

## Keyboard

Hold **Ctrl** on Windows and Linux, **Cmd** on macOS, then:

| key | action |
|---|---|
| `K` | search every command |
| `F` | find, and replace all |
| `S` · `Shift S` | save · save as |
| `O` · `N` | open · new |
| `Z` · `Shift Z` | undo · redo |
| `B` · `I` · `U` | bold · italic · underline |
| `Shift M` | highlight in the last colour |
| `,` | Settings |

On their own, `Tab` and `Shift + Tab` nest a list item, resume its parent, indent source, or step to the next table cell. `Esc` closes whatever is open.

***

*rapier. thin, fast, exact.*
