# Rapier reference

Read `rapier://guide/draw` when the host supports MCP resources; otherwise use the
[agent guide](https://rapier.website/agents) and the connected six-tool schemas.
Read the current drawing block, then use `edit` with its revision to change exact
fenced text. Retain stable figure ids, unrelated fields and opaque raster markers.
The person's canvas and source share the same Draw owner and Undo history.
Inspect the small picture returned by a drawing edit, then adjust. For full detail,
use `read {as:"image",block:"id"}`; open Draw can return a wet or settled painting.
A stored picture without usable replay reports stored, meaning wetness is unknown.
Text reads retain editable figures and recipes in `text`; paintings add compact
stroke JSON lines in `painting`. Follow `next_cursor` and join each field separately.
Keep every material marker. `undo {act}` reverses a whole act; use a separate edit
for each stroke you may need to undo alone.

Native drawing blocks stay live in the document: the person drags a box and its
arrows follow, and taps a label to type new words; a phone taps the diagram once first. Mermaid remains an ordinary Markdown
fence. Other diagram families use Rapier's optional diagrams plug-in; once installed,
verified renderer bytes travel in saved offline editors. Unsupported syntax,
unavailable external icon packs and paired math labels keep the source with a
reason. The chat host supporting a diagram does not establish Rapier support.

Use a visible full editor for material painting; Water also needs WebGPU. Report
pending or unavailable rendering truthfully. A source receipt does not prove pixels.
