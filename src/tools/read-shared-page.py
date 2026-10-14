#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Exact Markdown from a shared page by string scanning (markdown-standard.md, "The document as a web page"). A reference definition resolves
# only when its label is also in data-image-definitions. A duplicate <img> id refuses the page. Verify data-sha256.
import hashlib, re, sys
from pathlib import Path
from urllib.parse import unquote

def fail(message):
    sys.stderr.write(message + "\n"); sys.exit(1)

# markdown-it's normalizeReference: trim, collapse internal whitespace, case-fold.
normalize_reference = lambda label: re.sub(r"\s+", " ", label.strip()).lower().upper()

if len(sys.argv) != 3:
    sys.stderr.write("usage: read-shared-page.py <page.html> <out.md>\n"); sys.exit(2)
html = Path(sys.argv[1]).read_text(encoding="utf-8")
m = re.search(r'<script type="text/markdown"([^>]*)>\n?(.*?)\n?</script>', html, re.S)
if not m: fail("no text/markdown carrier")
sha_m = re.search(r'\bdata-sha256="([0-9a-f]{64})"', m.group(1))
if not sha_m: fail("missing data-sha256")
ids_m = re.search(r'\bdata-images="([^"]*)"', m.group(1))
ids = [i for i in (ids_m.group(1).split() if ids_m else []) if i]
defs_m = re.search(r'\bdata-image-definitions="([^"]*)"', m.group(1))
def_tokens = [t for t in (defs_m.group(1).split() if defs_m else []) if t]
if any(not re.match(r"^(?:[A-Za-z0-9\-_.!~*'()]|%[0-9A-Fa-f]{2})+$", t) for t in def_tokens):
    fail("malformed data-image-definitions")
try: definitions = {unquote(t) for t in def_tokens}
except Exception: fail("malformed data-image-definitions")
decode = lambda text: text.replace("&#35;", "#").replace("&#13;", "\r").replace("&lt;", "<").replace("&amp;", "&")
md = m.group(2).replace("&#13;", "\r")
# A duplicate id records None so any resolution of it is caught.
imgs = {}
for tag in re.finditer(r"<img\b[^>]*>", html, re.I):
    ident = re.search(r'\bid="([^"]*)"', tag.group(0))
    if not ident: continue
    src = re.search(r'\bsrc="([^"]*)"', tag.group(0))
    imgs[ident.group(1)] = None if ident.group(1) in imgs else (src.group(1) if src else None)
if ids:
    broken = [False]
    alt = "(" + "|".join(re.escape(i) for i in ids) + ")"
    def src(value):
        found = imgs.get(value)
        if isinstance(found, str): return found
        broken[0] = True; return None
    def swap_inline(match):
        found = src(match.group(2))
        return match.group(1) + found if found is not None else match.group(0)
    def swap_definition(match):
        if normalize_reference(decode(match.group(2))) not in definitions: return match.group(0)
        found = src(match.group(3))
        return match.group(1) + found if found is not None else match.group(0)
    md = re.sub(r"(\]\([ \t\r\n]*(?:&lt;)?)#" + alt + r"(?=>?[ \t\r\n]*\)|>?[ \t\r\n]+[\"'(])", swap_inline, md)
    md = re.sub(r"((?:^|(?<=\r)) {0,3}\[((?:\\.|[^\]\\])+)\]:[ \t]*(?:(?:\r\n|\r|\n)[ \t]*)?(?:&lt;)?)#" + alt + r"(?=>?[ \t]*(?:$|\r)|>?[ \t]+[\"'(])", swap_definition, md, flags=re.M)
    if broken[0]: fail("ambiguous <img id> in this page (duplicate ids); cannot recover Markdown safely")
md = decode(md)
digest = hashlib.sha256(md.encode("utf-8")).hexdigest()
if digest != sha_m.group(1): fail("data-sha256 mismatch: declared %s got %s" % (sha_m.group(1), digest))
Path(sys.argv[2]).write_bytes(md.encode("utf-8"))
