# Rapier Markdown profile

[The public standard](markdown-standard.md) is CommonMark plus a handful of invisible comment
conventions and stays small on purpose. Rapier's parser admits more than that document names.
This page is the complete map of everything else: every non-core syntax the parser recognizes,
what kind of thing it is, and what happens to it. Nothing here is private to Rapier: every
convention is documented for anyone to read and write, and none of it breaks another Markdown app.

Every syntax below is parsed and rendered by Rapier. What varies is whether a person can author it
through the interface, whether it round-trips byte for byte through an unrelated edit, what Save
writes, and how a reader that has never heard of it degrades.

**Status** is one of five kinds:

- **authored convention** — a convention this project specifies and writes; documented for everyone.
- **established extension** — another Markdown app or dialect's own syntax, adopted as-is.
- **reappropriated extension** — an established syntax Rapier reads and writes with a meaning of its own, chosen because it works everywhere.
- **read syntax** — read for compatibility and preserved; Rapier never introduces it.
- **export-only rewrite** — generated only into copied text, on request; the file is untouched.

| Syntax | Status | Authored via | Exact round-trip | Save emits | Degrades to |
| --- | --- | --- | --- | --- | --- |
| Task lists `- [ ]`/`- [x]` | established extension (GFM) | Checklist command, tap to toggle | yes | yes | literal `[ ]`/`[x]` text |
| Pipe tables | established extension (GFM) | Insert Table, cell editing | yes | yes | pipes/dashes as plain text |
| Strikethrough `~~x~~` | established extension (GFM) | Toolbar S | yes | yes | literal `~~` |
| Underline `++x++` | reappropriated extension (markdown-it-ins) | Toolbar U | yes | yes | shown as insertion by readers with the extension, literal `++` elsewhere; chosen because the syntax is accepted everywhere |
| Footnotes `[^1]` | established extension (PHP Markdown Extra) | Insert Footnote | yes | yes | literal `[^1]`, list as plain text |
| Highlight `==x==`, `==🟢x==` | established extension (Bear) | Highlight picker (5 colours + default) | yes, byte for byte | yes | literal `==` and circle-emoji characters — Bear's own trade-off, kept exactly for Bear compatibility |
| Subscript `~x~`, superscript `^x^` | established extension (MultiMarkdown/Pandoc) | typed in source; no command writes them, because a single-tilde `~x~` means other things in other apps (Bear's underline) | yes | yes, when present | literal `~`/`^` around text |
| Bear underline `~x~` | read syntax (Bear); collides with subscript `~x~` | never authored — Rapier's underline is `++x++`, and no command writes subscript | yes — bytes kept, never rewritten to `++x++` | verbatim | Bear shows underline. Rapier feeds `~x~` to markdown-it-sub: unspaced `~deadline~` renders as `<sub>deadline</sub>`; spaced `~underlined phrase~` fails the plugin's no-whitespace rule and the tildes stay literal. The reason no command writes subscript. Corpus: `compat-corpus` (retired; unwitnessed). |
| Emoji `:smile:` | established extension (GitHub/Slack) | Typed shortcode | yes (kept as a source token) | yes | literal `:smile:` |
| Abbreviations `*[HTML]: …` | established extension (PHP Markdown Extra) | Typed definition line | yes | yes | plain paragraph, no hover title |
| Definition lists | established extension (PHP Markdown Extra/MultiMarkdown) | Typed `Term` / `: definition` | yes | yes | `: …` reads as an ordinary paragraph |
| Math `$x$`, `$$x$$` | established extension (Pandoc/MultiMarkdown) | Typed delimiters | yes (source token) | yes | literal `$…$` |
| Callouts `> [!NOTE]` | established extension (GitHub Alerts/Obsidian) | Insert ▸ Note/Tip/Important/Warning/Caution | yes | yes | ordinary blockquote, `[!TYPE]` visible on its first line |
| Colour comments `<!--c green-->…<!--/c-->` | authored convention (`spec/md-marks.mjs`, [standard](markdown-standard.md)) | Text-colour picker | yes | yes | words shown plain; a run opening a paragraph can be swallowed as an HTML block, losing only that line's inline Markdown |
| Page break `<!--md-break:v1 page-->` | authored convention (`spec/md-marks.mjs`) | Insert ▸ Line ▸ Page break | yes | yes | invisible comment; two ordinary paragraphs |
| Table captions `Table: …` | established convention (Pandoc's caption line) | Typed as an ordinary paragraph after a table | yes — bytes never change | yes, unchanged | plain paragraph under the table |
| Will markers `<!-- will/1 … -->` | authored convention ([Will/1](will.md)) | Will menu (Intent / Add only / Lock) | yes, byte for byte enforced | yes | invisible comments; governed content reads as ordinary text |
| Layout comments `<!--md-layout:v1 …-->` | authored convention ([layout grammar](markdown-standard.md)) | Drag/resize/align, image tools | yes; insignificant zeros normalized only on an intentional edit | yes | invisible comment; natural flow and alignment |
| Obsidian width `![alt\|320](…)` | read syntax (Obsidian) | never introduced; a resize updates the pipe number in place | yes; a resize changes only the number | verbatim, with the number Rapier last set | Obsidian keeps showing its own width |
| Images as reference definitions with data URLs | CommonMark | Insert picture, paste, Draw | yes | yes | a CommonMark reader that allows `data:` picture sources shows the picture (GitHub's renderer drops them); JPEG XL needs a reader that decodes it |
| Pandoc/Quarto export forms | export-only rewrite | Copy sheet's "export for pandoc/quarto" toggle, off by default | n/a — the file is never touched | never — copy-only | not applicable; Pandoc and Quarto read their own forms natively |

Two rows do not parse in the direction their name suggests: Pandoc/Quarto export forms are
write-only (Rapier never reads `[x]{style="color:…"}` back as colour), and Obsidian's pipe width
is never introduced by Rapier (it is read, kept, and only its number is updated). Every other row
is read, rendered, and — where a UI path exists — written the same way.

## What a document's own HTML may do (26 September 2026)

A document's raw HTML renders as HTML, and it presses nothing of Rapier's. Every block of it goes through the
sanitizer's `raw` profile (`editor/engine.js`, `sanitizeRapierHtml`, the render profile without `data-*`, from the `html_block` renderer rule)
and every inline tag through the same law on CommonMark's own tag grammar (`html_inline`): no `data-*` attribute,
because Rapier's delegated handlers read `data-action`, `data-plugin`, `data-notes-act` and `data-rapier-remote-allow`
as their own controls; no `for` on a label, because it would press whatever control of Rapier's carries that id; no
`id` the shell's own markup owns, because the chrome's `getElementById` would find the document's element first.
Rapier's own rendering keeps its `data-*` (a picture's layout, a page break, the remote-picture placeholder with its
"Load all remote content" button and Rapier's words), and a document's `<a id="anchor">` keeps its anchor. Forms,
`<style>`, `<dialog>`, `<template>` and `<iframe>` never render (`RAPIER_SANITIZE_FORBID_TAGS`); a remote `url()` in
any style is dropped until the person loads remote content; a heading's own id yields to any id already in the page
(`_rapierAssignHeadingSlugs`). The cell is in `security-xss-wrap`: each hook tapped where its words are, nothing of
Rapier's answers.

## What other renderers show today (from the public record, 13 September 2026)

The founder's ruling, 13 September: no per-product live check of `data:` pictures and JPEG XL --
these are apps with millions of users and their behaviour is public. Read from the public record,
each claim with its source; "verified" here means a published statement or a reproduced public
report, never a guess from memory. Re-check when a product ships a relevant change.

| Product | Engine | `data:` picture (`![](data:image/png;base64,…)`) | JPEG XL picture |
| --- | --- | --- | --- |
| GitHub (README, issues, files) | its own HTML pipeline + Camo proxy | **Stripped.** GitHub's sanitizer allows `img src` only over http(s) and rewrites every `src` through the Camo proxy; `data:` sources are dropped as a security measure ([github/markup #270](https://github.com/github/markup/issues/270), [about anonymized URLs](https://docs.github.com/en/enterprise-cloud@latest/authentication/keeping-your-account-and-data-secure/about-anonymized-urls), [a public write-up of the failure](https://www.tutorialpedia.org/blog/insert-inline-images-in-readme-md/)). | Never shown as a `data:` picture (stripped first); a `.jxl` file in the repository renders only if the reader's browser decodes it. |
| Obsidian | Electron (Chromium) | **Rendered.** Community plugins exist whose whole purpose is to write `data:` pictures into notes because Obsidian renders them natively ([Image Inline](https://www.obsidianstats.com/plugins/image-inline), [obsidian-image-paste-base64](https://github.com/fheldtm/obsidian-image-paste-base64), [forum: converting base64 pictures back to files](https://forum.obsidian.md/t/does-anyone-know-how-to-convert-base64-encoded-images-in-markdown-files-to-local-images-files-in-vault/41434)). | **Not decoded** until Chromium enables it: Chrome 145 (February 2026) shipped the Rust `jxl-rs` decoder behind `enable-jxl-image-format`, still off by default at Chrome 151 (July 2026); Electron follows Chromium ([Phoronix, Chrome 145](https://www.phoronix.com/news/Chrome-145-Released), [The Register](https://www.theregister.com/2026/01/14/google_rekindles_relationship_with_jilted/), [status, 2026](https://jpegxlconvert.com/en/chrome-jpeg-xl-support/)). |
| Bear | WebKit | **Rendered.** Bear itself exports Markdown with base64 pictures and reopens them ([Bear community: base64 export newline bug, renders once fixed](https://community.bear.app/t/unexpected-newline-when-export-to-markdown-with-base64-encoding-image/18187), [Bear export FAQ](https://bear.app/faq/export-your-notes/)). | **Decoded** on iOS 17 / macOS Sonoma and later: WebKit decodes JPEG XL through the OS image framework since Safari 17 (September 2023), no animation, no progressive ([WebKit: Safari 17.0 features](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)). |
| Joplin | Electron (Chromium), markdown-it | **Rendered.** The renderer supports base64 inline pictures; the community asks for more of it, not for it to work ([Joplin forum: import Markdown with inline images](https://discourse.joplinapp.org/t/import-markdown-with-inline-images/13568), [issue #3719](https://github.com/laurent22/joplin/issues/3719)). | Not decoded (Chromium, as Obsidian). |
| Typora | Electron (Chromium) | **Rendered.** Typora displays base64 pictures; it lacks a UI to create them ([typora-issues #1116](https://github.com/typora/typora-issues/issues/1116), [#6046](https://github.com/typora/typora-issues/issues/6046)). | Not decoded (Chromium). |
| Logseq | Electron (Chromium) | Not found stated either way in the public record; Logseq renders standard `![](…)` images and inline `<img>` HTML ([Logseq docs, Markdown](https://github.com/logseq/docs/blob/master/pages/Markdown.md)); a Chromium renderer shows a `data:` `img` unless the app strips it -- **unverified**. | Not decoded (Chromium). |
| iA Writer | WebKit preview | Not found stated in the public record; the preview parses inline HTML ([Peer Reviewed: inline HTML in iA Writer](https://www.peerreviewed.io/blog/using-in-line-html-to-preview-images-in-ia-writer)) -- **unverified**. | Decoded on Apple platforms (WebKit, as Bear). |
| Firefox (any web renderer in it) | Gecko | Rendered (a plain `img`). | **Decoded by default from Firefox 157** (end of September 2026; Nightly already), via `jxl-rs` ([Phoronix: Mozilla's plan](https://www.phoronix.com/news/Firefox-JPEG-XL-2026-Plans), [Slashdot](https://tech.slashdot.org/story/26/08/26/0633229/firefox-157-will-include-jpeg-xl-by-default-on-all-platforms)). |

**The ruling (the founder, 13 September 2026):** with WebKit decoding since 2023, Firefox 157 by default at the end of this month and Chrome's decoder shipped and expected to flip within the season, JPEG XL is supported everywhere for every purpose Rapier has; Rapier acts as if it is supported everywhere now and is not weighed down by the lag (the picture law). The table stays as the dated record. What it means in detail: a Rapier document's pictures show today in Bear,
Obsidian, Joplin and Typora when they are PNG or JPEG `data:` pictures, and nowhere on GitHub in any
format; JPEG XL pictures show today in Bear and iA Writer (WebKit) and in Firefox 157, and not in the
Chromium-based editors until Chrome flips its flag, which Google has not dated. The founder's ruling: Rapier
acts as if JPEG XL is supported everywhere now; there is no document-level "make every picture
portable" command, only the per-picture format change. GitHub is a URL-pictures reader either way. Nothing here changes
the law; it dates the "everyone catches up" clause: WebKit has, Firefox has a date, Chromium has a
flag.

## CommonMark oracle

A check in Rapier's own release run is what says Rapier's parser and CommonMark only
disagree on the rows above. It parses each file of a corpus of small real documents
with Rapier (markdown-it + `applyMarkdownSpec` + math) and with vendored
[micromark](https://github.com/micromark/micromark) 4.0.2 plus
`micromark-extension-gfm` 3.0.0 (tables, task lists, strikethrough, autolink
literals, footnotes, tagfilter). The comparison is a stable block fingerprint:
normalized type + start line, not HTML. micromark is a Node-only check-time tool; the assembly build does not reach it and it is
not bundled into `rapier.html` or listed in the shipped licenses UI.

The check prints a readable report, and it is a gate: every disagreement must be a profile row that is
not core CommonMark (authored convention, established extension, reappropriated,
or read syntax). CommonMark-overlapping blocks in the corpus must agree. With
GFM loaded, GFM rows (pipe tables, task lists, strikethrough, GitHub footnotes)
agree; remaining corpus disagreements are Rapier's non-GFM extensions
(definition lists today). Rapier-authored conventions that change block type
(`<!--c …-->` vs an HTML block, the page-break marker vs `html_block`) are
classified from the same table when they appear.

## DOCX export (`interchange/docx.mjs` `writeDocx`)

The writer and importer preserve the supported data described below. A JPEG XL picture arrives as the portable picture the
export already made of it (PNG, or JPEG for an opaque photograph when smaller); WebP and SVG pictures
and drawings are rasterised to PNG in the package (picture format law: exports convert on their own). Drawings use PNG, not EMF:
phone-first Word on Android, iOS and the web opens PNG; EMF is Windows-centric and heavier to
write. Math is TeX source with its `$`/`$$` delimiters — Word shows the source, Rapier re-import
recovers the math. Live Export `.docx` uses `interchange/docx.mjs` `writeDocx` through
`_rapierConvertPortableHtmlToDocx`. No plug-in.

The supported Markdown data round-trips through DOCX with these representation changes (same table
shape as above). This is not a claim that arbitrary Word documents or their layout round-trip:

| Syntax | Status | Authored via | Exact round-trip | Save emits | Degrades to |
| --- | --- | --- | --- | --- | --- |
| Callouts `> [!NOTE]` | established extension (GitHub Alerts/Obsidian) | Insert ▸ Note/Tip/Important/Warning/Caution | no, through DOCX | n/a — export | a labelled one-cell Word table with `[!TYPE]` in bold; re-import is an ordinary HTML table, not a GitHub alert |
| Drawings (SVG recipe) | CommonMark SVG image | Draw | no, through DOCX | n/a — export | PNG raster in `word/media` (`DOCX_EXPORT.drawingCodec = png`); re-import is a JPEG XL picture, not an editable drawing |
| JPEG XL picture bytes | CommonMark data URL | Insert picture | no, codec bytes | n/a — export | PNG, or JPEG for an opaque photograph when smaller (picture format law); re-import re-encodes JPEG XL |
| Footnote labels `[^1]` | established extension (PHP Markdown Extra) | Insert Footnote | no, labels only | n/a — export | note blocks, links and pictures kept; import assigns `docx-fn-N` labels |
| Image `wrap`/`x`/`y` | authored convention (`spec/md-layout.mjs`) | Drag/resize | no, through DOCX | n/a — export | inline DrawingML with `wp:extent` from `width`; Rapier's silhouette wrap is not a Word wrap |

Headings 1–6, bold/italic/underline/strikethrough, links, coloured runs, highlights, nested
ordered and bullet lists, task lists (`[ ]`/`[x]` prefixes), tables with `Table:` captions, page
breaks (`w:br w:type="page"`), and math TeX source do round-trip through this writer and
`readDocx`.


The `docx-corpus` retained row also covers non-breaking and narrow non-breaking spaces, interior
BOM characters and native tabs; repeated header rows, horizontal and vertical spans, multiple
paragraphs and nested tables; rich footnote blocks and their own image/link relationships. Simple
headed tables use GFM. Tables that need spans, multiple blocks or no header use ordinary HTML,
with inline embedded picture URLs. Temporary import source tokens are verified and removed before
that HTML is saved. All sixteen Word highlight names survive as the five existing highlight
conventions or ordinary `<mark style="background-color:…">` HTML. Theme run colours are resolved to
explicit RGB, including tint/shade luminance adjustments; theme identity itself is not retained.

Word's current text is a defined projection: inserted and moved-to text is retained; deleted and
moved-from text, change authors/dates and comments are not imported. The warnings disclose those
omissions. Body text and referenced footnotes are checked separately in XML order; this does not
claim preservation of the omitted review history or comment text. The original Word file is retained
as an attachment on the Notes import path.

Outside this profile: Word's review and comment workflows, named styles, themes and font schemes, custom tab
stops, section and page geometry, conditional table styling, and anchored picture positioning and wrapping.
Markdown has no shared model for them. A tab character is kept even when its tab stops are not; footnote labels
can change while their content and paragraph boundaries stay intact.

Picture bytes are checked exact through the importer's callback and the writer, and converted bytes are checked
to reach ordinary HTML tables. That check does not prove the browser's codec conversion, Word's rendering or a
phone's display; the JPEG XL conversion policy is the codec-byte exception above.
