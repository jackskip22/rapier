# Rapier Markdown profile

[The standard](markdown-standard.md) adds invisible comment conventions to CommonMark. This profile lists Rapier’s other syntax and its treatment. Anyone may read and write these conventions; none breaks another Markdown app.

Rapier parses and renders every syntax below. Exact round-trip means byte for byte through an unrelated edit.

**Status** is one of five kinds:

- **authored convention**: a convention this project specifies and writes.
- **established extension**: another Markdown app or dialect's own syntax, adopted as-is.
- **reappropriated extension**: an established syntax Rapier reads and writes with a meaning of its own.
- **read syntax**: read for compatibility and preserved; Rapier never introduces it.
- **export-only rewrite**: generated only into copied text, on request; the file is untouched.

| Syntax | Status | Authored via | Exact round-trip | Save emits | Degrades to |
| --- | --- | --- | --- | --- | --- |
| Task lists `- [ ]`/`- [x]` | established extension (GFM) | Checklist command, tap to toggle | yes | yes | literal `[ ]`/`[x]` text |
| Pipe tables | established extension (GFM) | Insert Table, cell editing | yes | yes | pipes/dashes as plain text |
| Strikethrough `~~x~~` | established extension (GFM) | Toolbar S | yes | yes | literal `~~` |
| Underline `++x++` | reappropriated extension (markdown-it-ins) | Toolbar U | yes | yes | shown as insertion by readers with the extension, literal `++` elsewhere |
| Footnotes `[^1]` | established extension (PHP Markdown Extra) | Insert Footnote | yes | yes | literal `[^1]`, list as plain text |
| Highlight `==x==`, `==🟢x==` | established extension (Bear) | Highlight picker (5 colours + default) | yes, byte for byte | yes | literal `==` and circle-emoji characters |
| Subscript `~x~`, superscript `^x^` | established extension (MultiMarkdown/Pandoc) | typed in source; no command writes them | yes | yes, when present | literal `~`/`^` around text |
| Raw `<sup>x</sup>` and `<sub>x</sub>` | established HTML | Superscript/Subscript commands; Ctrl/Cmd + period/comma | yes | ordinary HTML tags | raised/lowered text in readers that allow these HTML tags |
| Bear underline `~x~` | read syntax (Bear); collides with subscript `~x~` | never authored; Rapier's underline is `++x++`, and no command writes tilde-delimited subscript | yes; bytes kept, never rewritten to `++x++` | verbatim | Bear shows underline. Rapier feeds `~x~` to markdown-it-sub: unspaced `~deadline~` renders as `<sub>deadline</sub>`; spaced `~underlined phrase~` fails the plugin's no-whitespace rule and the tildes stay literal. |
| Emoji `:smile:` | established extension (GitHub/Slack) | Typed shortcode | yes (kept as a source token) | yes | literal `:smile:` |
| Abbreviations `*[HTML]: …` | established extension (PHP Markdown Extra) | Typed definition line | yes | yes | plain paragraph, no hover title |
| Definition lists | established extension (PHP Markdown Extra/MultiMarkdown) | Typed `Term` / `: definition` | yes | yes | `: …` reads as an ordinary paragraph |
| Math `$x$`, `$$x$$` | established extension (Pandoc/MultiMarkdown) | Typed delimiters | yes (source token) | yes | literal `$…$` |
| Callouts `> [!NOTE]` | established extension (GitHub Alerts/Obsidian) | Insert ▸ Note/Tip/Important/Warning/Caution | yes | yes | ordinary blockquote, `[!TYPE]` visible on its first line |
| Colour comments `<!--c green-->…<!--/c-->` | authored convention (`spec/md-marks.mjs`, [standard](markdown-standard.md)) | Text-colour picker | yes | yes | words shown plain; a run opening a paragraph can be swallowed as an HTML block, losing only that line's inline Markdown |
| Page break `<!--md-break:v1 page-->` | authored convention (`spec/md-marks.mjs`) | Insert ▸ Line ▸ Page break | yes | yes | invisible comment; two ordinary paragraphs |
| Table captions `Table: …` | established convention (Pandoc's caption line) | Typed as an ordinary paragraph after a table | yes; bytes never change | yes, unchanged | plain paragraph under the table |
| Will markers `<!-- will/1 … -->` | authored convention ([Will/1](will.md)) | Will menu (Intent / Add only / Lock) | yes, byte for byte enforced | yes | invisible comments; governed content reads as ordinary text |
| Layout comments `<!--md-layout:v1 …-->` | authored convention ([layout grammar](markdown-standard.md)) | Drag/resize/align, image tools | yes; insignificant zeros normalized only on an intentional edit | yes | invisible comment; natural flow and alignment |
| Obsidian width `![alt\|320](…)` | read syntax (Obsidian) | never introduced; a resize updates the pipe number in place | yes; a resize changes only the number | verbatim, with the number Rapier last set | Obsidian keeps showing its own width |
| Images as reference definitions with data URLs | CommonMark | Insert picture, paste, Draw | yes | yes | a CommonMark reader that allows `data:` picture sources shows the picture (GitHub's renderer drops them); JPEG XL needs a reader that decodes it |
| Pandoc/Quarto export forms | export-only rewrite | Copy sheet's "export for pandoc/quarto" toggle, off by default | n/a; the file is never touched | never; copy-only | not applicable; Pandoc and Quarto read their own forms natively |

Pandoc/Quarto export forms are write-only: Rapier never reads `[x]{style="color:…"}` back as colour.

## What a document's own HTML may do

A document's raw HTML renders as HTML and presses nothing of Rapier's. Every block goes through the sanitizer's `raw` profile (`sanitizeRapierHtml` in `editor/engine.js`, the render profile without `data-*`, applied by the `html_block` renderer rule) and every inline tag through the same law on CommonMark's own tag grammar (`html_inline`). Three things are refused:

- any `data-*` attribute (Rapier's handlers read `data-action`, `data-plugin`, `data-notes-act` and `data-rapier-remote-allow` as their own controls);
- `for` on a label;
- any `id` the shell's own markup owns.

Rapier's own rendering keeps its `data-*` (a picture's layout, a page break, the remote-picture placeholder with its "Load all remote content" button), and a document's `<a id="anchor">` keeps its anchor. Forms, `<style>`, `<dialog>`, `<template>` and `<iframe>` never render (`RAPIER_SANITIZE_FORBID_TAGS`). A remote `url()` in any style is dropped until the person loads remote content. A heading's own id yields to any id already in the page (`_rapierAssignHeadingSlugs`).

## What other renderers show (checked 13 September 2026)

Claims cite published statements or reproduced public reports. Re-check after relevant product changes.

| Product | Engine | `data:` picture (`![](data:image/png;base64,…)`) | JPEG XL picture |
| --- | --- | --- | --- |
| GitHub (README, issues, files) | its own HTML pipeline + Camo proxy | **Stripped.** The sanitizer allows `img src` only over http(s), rewrites every `src` through the Camo proxy and drops `data:` sources ([github/markup #270](https://github.com/github/markup/issues/270), [about anonymized URLs](https://docs.github.com/en/enterprise-cloud@latest/authentication/keeping-your-account-and-data-secure/about-anonymized-urls), [a public write-up of the failure](https://www.tutorialpedia.org/blog/insert-inline-images-in-readme-md/)). | Never shown as a `data:` picture; a `.jxl` file in the repository renders only if the reader's browser decodes it. |
| Obsidian | Electron (Chromium) | **Rendered.** Community plugins write `data:` pictures into notes because Obsidian renders them natively ([Image Inline](https://www.obsidianstats.com/plugins/image-inline), [obsidian-image-paste-base64](https://github.com/fheldtm/obsidian-image-paste-base64), [forum: converting base64 pictures back to files](https://forum.obsidian.md/t/does-anyone-know-how-to-convert-base64-encoded-images-in-markdown-files-to-local-images-files-in-vault/41434)). | **Not decoded** until Chromium enables it: Chrome 145 (February 2026) shipped the Rust `jxl-rs` decoder behind `enable-jxl-image-format`, still off by default at Chrome 151 (July 2026); Electron follows Chromium ([Phoronix, Chrome 145](https://www.phoronix.com/news/Chrome-145-Released), [The Register](https://www.theregister.com/2026/01/14/google_rekindles_relationship_with_jilted/), [status, 2026](https://jpegxlconvert.com/en/chrome-jpeg-xl-support/)). |
| Bear | WebKit | **Rendered.** Bear exports Markdown with base64 pictures and reopens them ([Bear community: base64 export newline bug, renders once fixed](https://community.bear.app/t/unexpected-newline-when-export-to-markdown-with-base64-encoding-image/18187), [Bear export FAQ](https://bear.app/faq/export-your-notes/)). | **Decoded** on iOS 17 / macOS Sonoma and later: WebKit decodes JPEG XL through the OS image framework since Safari 17 (September 2023), no animation, no progressive ([WebKit: Safari 17.0 features](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)). |
| Joplin | Electron (Chromium), markdown-it | **Rendered.** The renderer supports base64 inline pictures ([Joplin forum: import Markdown with inline images](https://discourse.joplinapp.org/t/import-markdown-with-inline-images/13568), [issue #3719](https://github.com/laurent22/joplin/issues/3719)). | Not decoded (Chromium, as Obsidian). |
| Typora | Electron (Chromium) | **Rendered.** Typora displays base64 pictures; it lacks a UI to create them ([typora-issues #1116](https://github.com/typora/typora-issues/issues/1116), [#6046](https://github.com/typora/typora-issues/issues/6046)). | Not decoded (Chromium). |
| Logseq | Electron (Chromium) | Not stated in the public record; Logseq renders standard `![](…)` images and inline `<img>` HTML ([Logseq docs, Markdown](https://github.com/logseq/docs/blob/master/pages/Markdown.md)), and a Chromium renderer shows a `data:` `img` unless the app strips it. **Unverified.** | Not decoded (Chromium). |
| iA Writer | WebKit preview | Not stated in the public record; the preview parses inline HTML ([Peer Reviewed: inline HTML in iA Writer](https://www.peerreviewed.io/blog/using-in-line-html-to-preview-images-in-ia-writer)). **Unverified.** | Decoded on Apple platforms (WebKit, as Bear). |
| Firefox (any web renderer in it) | Gecko | Rendered (a plain `img`). | **Firefox 157: opt-in, not on by default.** Mozilla moved default enablement to the 158 train; Nightly already enables it. The decoder is `jxl-rs` ([developer update, 3 September 2026](https://www.mail-archive.com/dev-platform@mozilla.org/msg01884.html), [158 migration](https://bugzilla.mozilla.org/show_bug.cgi?id=2074860); checked 4 October 2026). |

**Rapier acts as if JPEG XL is supported everywhere now.** There is no document-level "make every picture portable" command, only the per-picture format change. The table records `data:` and JPEG XL support; Google has not dated Chrome’s default enablement. GitHub reads URL pictures only.

## CommonMark oracle

The release run checks Rapier’s differences from CommonMark against this profile: small documents are parsed with Rapier (markdown-it, `applyMarkdownSpec` and math) and with vendored [micromark](https://github.com/micromark/micromark) 4.0.2 plus `micromark-extension-gfm` 3.0.0 (tables, task lists, strikethrough, autolink literals, footnotes, tagfilter), and compared by block fingerprint (normalized type and start line, not HTML). Every disagreement must be a profile row that is not core CommonMark. Blocks that overlap CommonMark must agree, and with GFM loaded the GFM rows (pipe tables, task lists, strikethrough, GitHub footnotes) agree; the remaining disagreements are Rapier's non-GFM extensions (definition lists). Rapier conventions that change block type (`<!--c …-->` against an HTML block, the page-break marker against `html_block`) are classified from the same table. micromark is a Node-only check tool, not bundled into `rapier.html`.

## DOCX export (`interchange/docx.mjs` `writeDocx`)

A JPEG XL picture arrives as the portable picture the export already made of it (PNG, or JPEG for an opaque photograph when smaller). WebP and SVG pictures and drawings are rasterised to PNG in the package. Drawings use PNG, not EMF. Math is TeX source with its `$`/`$$` delimiters: Word shows the source, and Rapier re-import recovers the math. Export `.docx` uses `writeDocx` through `_rapierConvertPortableHtmlToDocx`. No plug-in.

Headings 1–6, bold, italic, underline, strikethrough, links, coloured runs, highlights, nested ordered and bullet lists, task lists (`[ ]`/`[x]` prefixes), tables with `Table:` captions, page breaks (`w:br w:type="page"`) and math TeX source round-trip through `writeDocx` and `readDocx`. Exceptions:

| Syntax | Status | Authored via | Exact round-trip | Save emits | Degrades to |
| --- | --- | --- | --- | --- | --- |
| Callouts `> [!NOTE]` | established extension (GitHub Alerts/Obsidian) | Insert ▸ Note/Tip/Important/Warning/Caution | no, through DOCX | n/a; export | a labelled one-cell Word table with `[!TYPE]` in bold; re-import is a pipe table, not a GitHub alert |
| Drawings (SVG recipe) | CommonMark SVG image | Draw | no, through DOCX | n/a; export | PNG raster in `word/media` (`DOCX_EXPORT.drawingCodec = png`); re-import is a JPEG XL picture, not an editable drawing |
| JPEG XL picture bytes | CommonMark data URL | Insert picture | no, codec bytes | n/a; export | PNG, or JPEG for an opaque photograph when smaller; re-import re-encodes JPEG XL |
| Footnote labels `[^1]` | established extension (PHP Markdown Extra) | Insert Footnote | no, labels only | n/a; export | note text kept; import assigns `docx-fn-N` labels |
| Image `wrap`/`x`/`y` | authored convention (`spec/md-layout.mjs`) | Drag/resize | no, through DOCX | n/a; export | inline DrawingML with `wp:extent` from `width`; Rapier's silhouette wrap is not a Word wrap |

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
omissions. Body text and referenced footnotes are checked separately in XML order. The original Word file is retained
as an attachment on the Notes import path.

Outside this profile: Word's review and comment workflows, named styles, themes and font schemes, custom tab
stops, section and page geometry, conditional table styling, and anchored picture positioning and wrapping.
Markdown has no shared model for them. Tab characters survive without their stops; footnote labels may change
while content and paragraph boundaries stay intact.

Picture bytes are checked exact through the importer's callback and the writer, and converted bytes are checked
to reach ordinary HTML tables. That check does not prove the browser's codec conversion, Word's rendering or a
phone's display; the JPEG XL conversion policy is the codec-byte exception above.
