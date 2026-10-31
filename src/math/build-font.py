#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Extract SVG outlines and OpenType MATH records from the pinned font."""

from __future__ import annotations

import argparse
import base64
from decimal import Decimal
from fractions import Fraction
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import tempfile
import urllib.request
import zlib

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen, ControlBoundsPen
from fontTools.t1Lib import T1Font
from fontTools.ttLib import TTFont


SOURCE_ROOT = "https://mirror.apps.cam.ac.uk/pub/tex-archive/fonts/lm-math/"
SOURCE_URL = SOURCE_ROOT + "opentype/latinmodern-math.otf"
SOURCE_SHA256 = "6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f"
LICENSE_URL = SOURCE_ROOT + "doc/GUST-FONT-LICENSE.txt"
LICENSE_SHA256 = "2bd69affc3da00715116f713f57eab9707e96daf3562ad0215987b15b9c16f73"
LPPL_URL = "https://www.latex-project.org/lppl/lppl-1-3c.txt"
LPPL_SHA256 = "3d262cdf34dafa6955f703c634a8c238ec44109bc8dd6ef34fb7aa54809f7e66"
TEXT_URL = "https://raw.githubusercontent.com/jackskip22/rapier/326a7387a190b011543fae5f5f2c6144f6163b3d/src/shell/fonts/Geist.wght400-700.woff2"
TEXT_SHA256 = "6e3a140e3812161e292fbe42a1fc90533b2407b699c65abc7a098b0979df4e82"
MONO_URL = "https://ftp.riken.jp/CTAN/fonts/lm/fonts/opentype/public/lm/lmmono10-regular.otf"
MONO_SHA256 = "22deb6d3be3ffcb40b33f0e010afb256c677d97c2a2bdee1f5740cdc97751558"
HOOK_URL = "https://ftp.riken.jp/CTAN/fonts/lm/fonts/type1/public/lm/lmmi10.pfb"
HOOK_SHA256 = "c24662506b402f3e0033cc75eb746eb490a1b7477e6b3ef52053f5025ec0fc57"


def source_bytes(local: Path | None, remote: str, expected: str) -> bytes:
    data = local.read_bytes() if local else urllib.request.urlopen(remote, timeout=60).read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected:
        raise ValueError(f"Source mismatch for {remote}: expected SHA-256 {expected}, got {digest}")
    return data


def scalar(value):
    return getattr(value, "Value", value)


def number(value):
    if value == int(value):
        return str(int(value))
    return format(Decimal(value), "f").rstrip("0").rstrip(".")


def feature_alternates(font, tag):
    records = {}
    gsub = font["GSUB"].table
    for feature in gsub.FeatureList.FeatureRecord:
        if feature.FeatureTag != tag:
            continue
        for index in feature.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for table in lookup.SubTable:
                kind = lookup.LookupType
                if kind == 7:
                    kind, table = table.ExtensionLookupType, table.ExtSubTable
                if kind == 1:
                    records.update((base, [alternate]) for base, alternate in table.mapping.items())
                elif kind == 3:
                    records.update((base, alternates[:2]) for base, alternates in table.alternates.items())
                else:
                    raise ValueError(f"Unsupported {tag} substitution type {kind}")
    return records


def extract(font: TTFont):
    cmap = font.getBestCmap()
    table = font["MATH"].table
    variants = table.MathVariants
    scripts, dotless = (feature_alternates(font, tag) for tag in ("ssty", "dtls"))
    used = set(cmap.values())
    while True:
        previous = len(used)
        for feature in (scripts, dotless):
            for name, alternates in feature.items():
                if name in used:
                    used.update(alternates)
        for axis in ("Vert", "Horiz"):
            coverage = getattr(variants, axis + "GlyphCoverage")
            constructions = getattr(variants, axis + "GlyphConstruction")
            for name, construction in zip(coverage.glyphs if coverage else [], constructions):
                if name not in used:
                    continue
                used.update(record.VariantGlyph for record in construction.MathGlyphVariantRecord)
                if construction.GlyphAssembly:
                    used.update(record.glyph for record in construction.GlyphAssembly.PartRecords)
        if len(used) == previous:
            break
    names = sorted(used, key=font.getGlyphID)
    ids = {name: index for index, name in enumerate(names)}
    info = table.MathGlyphInfo
    corrections = info.MathItalicsCorrectionInfo
    italic = dict(zip(corrections.Coverage.glyphs, map(scalar, corrections.ItalicsCorrection))) if corrections else {}
    attachments = info.MathTopAccentAttachment
    accent = dict(zip(attachments.TopAccentCoverage.glyphs, map(scalar, attachments.TopAccentAttachment))) if attachments else {}
    glyph_set = font.getGlyphSet()
    glyphs = []
    for name in names:
        path = SVGPathPen(glyph_set, ntos=number)
        glyph_set[name].draw(path)
        advance = font["hmtx"].metrics[name][0]
        glyphs.append([advance, italic.get(name, 0), accent.get(name, advance / 2), path.getCommands()])
    data = {
        "units": font["head"].unitsPerEm,
        "xHeight": font["OS/2"].sxHeight,
        "glyphs": glyphs,
        "chars": {cp: ids[name] for cp, name in sorted(cmap.items())},
        "constants": {key: scalar(value) for key, value in vars(table.MathConstants).items() if not key.startswith("_") and key not in UNUSED_CONSTANTS},
        "vertical": {},
        "horizontal": {},
        "minConnectorOverlap": variants.MinConnectorOverlap,
        "scriptAlternates": {ids[name]: [ids[alternate] for alternate in alternates] for name, alternates in scripts.items() if name in ids},
        "dotless": {ids[name]: ids[alternates[0]] for name, alternates in dotless.items() if name in ids},
        "extendedShapes": {ids[name]: 1 for name in (info.ExtendedShapeCoverage.glyphs if info.ExtendedShapeCoverage else []) if name in ids},
    }
    for axis, key in (("Vert", "vertical"), ("Horiz", "horizontal")):
        coverage = getattr(variants, axis + "GlyphCoverage")
        constructions = getattr(variants, axis + "GlyphConstruction")
        for name, construction in zip(coverage.glyphs if coverage else [], constructions):
            if name not in ids:
                continue
            record = {"variants": [[ids[v.VariantGlyph], v.AdvanceMeasurement] for v in construction.MathGlyphVariantRecord]}
            assembly = construction.GlyphAssembly
            if assembly:
                record["assembly"] = {
                    "italic": scalar(assembly.ItalicsCorrection),
                    "parts": [[ids[p.glyph], p.StartConnectorLength, p.EndConnectorLength, p.FullAdvance, p.PartFlags & 1] for p in assembly.PartRecords],
                }
            data[key][ids[name]] = record
    # LuaTeX's CFF loader bounds curves by their control points. Keep those semantic vertical boxes separate
    # from the exact ink bounds the outline decoder computes; large operators use them when centering on the axis.
    vertical_ids = set(data["vertical"])
    for record in data["vertical"].values():
        vertical_ids.update(glyph for glyph, _ in record["variants"])
    data["verticalBounds"] = {}
    for glyph in sorted(vertical_ids):
        exact, control = BoundsPen(glyph_set), ControlBoundsPen(glyph_set)
        glyph_set[names[glyph]].draw(exact)
        glyph_set[names[glyph]].draw(control)
        if exact.bounds and control.bounds:
            ink = [math.floor(exact.bounds[1]), math.ceil(exact.bounds[3])]
            box = [round(control.bounds[1]), round(control.bounds[3])]
            if box != ink:
                data["verticalBounds"][glyph] = box
    return data


PAGE_BYTES = 16384
PAGE_STRIDE = 32768
PARENT_DEPTH = 4
# The pinned font has no MathKernInfo or flac records. These constants have no layout consumer.
UNUSED_CONSTANTS = {"DelimitedSubFormulaMinHeight", "FlattenedAccentBaseHeight", "StretchStackTopShiftUp",
                    "StretchStackBottomShiftDown", "StretchStackGapAboveMin", "StretchStackGapBelowMin",
                    "SkewedFractionHorizontalGap", "SkewedFractionVerticalGap"}
SCALAR_MAPS = ("chars", "dotless", "extendedShapes")


def unsigned(value, target):
    if value < 0 or value > 2**53 - 1 or value != int(value):
        raise ValueError("Font integer exceeds exact JavaScript arithmetic")
    value = int(value)
    while value >= 128:
        target.append((value & 127) | 128)
        value >>= 7
    target.append(value)


def signed(value, target):
    if value != int(value):
        raise ValueError("Font value is not an integer")
    value = int(value)
    value = value * 2 if value >= 0 else -value * 2 - 1
    if value > 2**53 - 1:
        raise ValueError("Font integer exceeds exact JavaScript arithmetic")
    if value < 240:
        target.append(value)
    elif value < 4080:
        value -= 240
        target.extend((240 + (value >> 8), value & 255))
    else:
        target.append(255)
        unsigned(value - 4080, target)


def text(data):
    """Raw DEFLATE in base64."""
    return base64.b64encode(zlib.compress(data, level=9, wbits=-15)).decode("ascii")


def pack_font(data):
    """Share translated contours and retain independently inflatable record pages."""
    glyphs = data["glyphs"]
    commands = "MLHVCZ"
    lengths = (2, 2, 1, 1, 6, 0)
    paths = [re.findall(r"[MLHVCZ]|-?\d+(?:\.\d+)?", glyph[3]) for glyph in glyphs]
    unit = 1
    for glyph, tokens in zip(glyphs, paths):
        if "".join(tokens) != re.sub(r"[ ,]", "", glyph[3]):
            raise ValueError("Font path has an unsupported coordinate or command")
        for token in tokens:
            if "." in token:
                unit = math.lcm(unit, Fraction(token).denominator)
    # Derived bounds divide by the unit; a power of two keeps every coordinate exact.
    if unit & (unit - 1):
        raise ValueError("Font coordinates need a power-of-two unit")
    metric_unit = math.lcm(2, *(Fraction(value).denominator for glyph in glyphs for value in glyph[:3]))
    metrics = [[int(value * metric_unit) for value in glyph[:3]] for glyph in glyphs]
    for values in metrics:
        values[2] -= values[0] // 2
    metric_bases = [sorted(values[column] for values in metrics)[len(metrics) // 2] for column in range(3)]
    contours, contour_ids, references = [], {}, []
    for tokens in paths:
        cursor, previous = 0, None
        structure, coordinates, refs = [], [], []
        first_x = first_y = x = y = 0
        closing = None

        def keep_contour():
            if not structure:
                return
            # A closing curve that ends at the start stores no end point; the decoder returns it to the start.
            closes = structure[-2:] == [4, 5] and closing == (first_x, first_y)
            key = bytes(structure), tuple(coordinates[:-2] if closes else coordinates), closes
            if key not in contour_ids:
                contour_ids[key] = len(contours)
                contours.append(key)
            refs.append((contour_ids[key], first_x, first_y))

        while cursor < len(tokens):
            if tokens[cursor] in commands:
                command = commands.index(tokens[cursor])
                cursor += 1
            elif previous is not None and previous != 5:
                command = 1 if previous == 0 else previous
            else:
                raise ValueError("Font path has an invalid repeated command")
            count = lengths[command]
            values = [int(Fraction(value) * unit) for value in tokens[cursor:cursor + count]]
            if len(values) != count:
                raise ValueError("Font path has an incomplete command")
            if any(abs(value) * 4 > 2**53 - 1 for value in values):
                raise ValueError("Font coordinates exceed exact JavaScript arithmetic")
            cursor += count
            if command == 0:
                keep_contour()
                structure, coordinates = [], []
                first_x, first_y = x, y = values
            else:
                if previous is None:
                    raise ValueError("Font contour does not begin with a move")
                structure.append(command)
                for index, value in enumerate(values):
                    if command == 3 or (command not in (2, 3) and index % 2):
                        coordinates.append(value - y)
                        y = value
                    else:
                        coordinates.append(value - x)
                        x = value
                if command == 5:
                    closing, x, y = (x, y), first_x, first_y
            previous = command
        keep_contour()
        references.append(refs)

    contour_records, shapes, depths = [], {}, []
    for contour_id, (structure, coordinates, closes) in enumerate(contours):
        record = bytearray()
        unsigned((len(structure) * 2 + closes) * 2, record)
        record.extend(structure)
        for value in coordinates:
            signed(value, record)
        # Small residuals compress better even when their first encoding costs another byte.
        best = (len(record) + sum(abs(value).bit_length() for value in coordinates), len(record))
        parent_depth = -1
        for parent, previous_coordinates in shapes.setdefault((structure, closes), []):
            if depths[parent] >= PARENT_DEPTH:
                continue
            shared = bytearray()
            unsigned(parent * 2 + 1, shared)
            residuals = [value - previous_value for value, previous_value in zip(coordinates, previous_coordinates)]
            for value in residuals:
                signed(value, shared)
            score = (len(shared) + sum(abs(value).bit_length() for value in residuals), len(shared))
            if score < best:
                best = score
                record, parent_depth = shared, depths[parent]
        depths.append(parent_depth + 1)
        shapes[(structure, closes)].append((contour_id, coordinates))
        contour_records.append(record)

    glyph_records = []
    for values, refs in zip(metrics, references):
        record = bytearray()
        for value, base in zip(values, metric_bases):
            signed(value - base, record)
        unsigned(len(refs), record)
        for contour_id, x, y in refs:
            unsigned(contour_id, record)
            signed(x, record)
            signed(y, record)
        glyph_records.append(record)

    pages, indices = [], bytearray()
    unsigned(unit, indices)
    unsigned(metric_unit, indices)
    for value in metric_bases:
        signed(value, indices)
    for name in SCALAR_MAPS:
        unsigned(len(data[name]), indices)
        previous_key = previous_value = 0
        for key, value in sorted(data[name].items()):
            unsigned(key - previous_key, indices)
            signed(value - previous_value, indices)
            previous_key, previous_value = key, value
    unsigned(len(data["scriptAlternates"]), indices)
    previous_key, previous_values = 0, [0, 0]
    for key, values in sorted(data["scriptAlternates"].items()):
        unsigned(key - previous_key, indices)
        previous_key = key
        unsigned(len(values), indices)
        for index, value in enumerate(values):
            signed(value - previous_values[index], indices)
            previous_values[index] = value
    for name in ("vertical", "horizontal"):
        unsigned(len(data[name]), indices)
        previous_key = 0
        for key, record in sorted(data[name].items()):
            unsigned(key - previous_key, indices)
            previous_key = key
            unsigned(len(record["variants"]), indices)
            for glyph, advance in record["variants"]:
                signed(glyph - key, indices)
                unsigned(advance, indices)
            assembly = record.get("assembly")
            unsigned(len(assembly["parts"]) + 1 if assembly else 0, indices)
            if assembly:
                signed(assembly["italic"], indices)
                for glyph, start, end, full, flags in assembly["parts"]:
                    signed(glyph - key, indices)
                    unsigned(start, indices)
                    unsigned(end, indices)
                    unsigned(full * 2 + flags, indices)
    for records in (glyph_records, contour_records):
        page, offsets = bytearray(), []
        for record in records:
            if len(record) > PAGE_BYTES:
                raise ValueError("Font record exceeds its independent page bound")
            if len(page) + len(record) > PAGE_BYTES:
                pages.append(bytes(page))
                page = bytearray()
            offsets.append(len(pages) * PAGE_STRIDE + len(page))
            page.extend(record)
        offsets.append(len(pages) * PAGE_STRIDE + len(page))
        pages.append(bytes(page))
        unsigned(len(offsets), indices)
        previous = 0
        for offset in offsets:
            unsigned(offset - previous, indices)
            previous = offset

    packed = [(len(page), text(page)) for page in pages]
    return packed, text(indices), len(indices), {
        "contours": len(contours), "contourReferences": sum(map(len, references)),
        "pages": len(pages), "pageBytes": PAGE_BYTES, "indexBytes": len(indices),
        "recordBytes": sum(map(len, pages)), "maxParentDepth": PARENT_DEPTH,
    }


PATH_DECODER = """{
// The font owns immutable pages and bounded hot records. No document data enters these caches.
const pages=__PAGES__,invalid=()=>{throw new Error('Invalid math font data');};
const inflate=(encoded,size)=>{
const source=atob(encoded),bytes=new Uint8Array(size);let position=0,held=0,available=0,written=0;
const fill=count=>{while(available<count&&position<source.length){held|=source.charCodeAt(position++)<<available;available+=8;}};
const bits=count=>{fill(count);if(available<count)invalid();const value=held&((1<<count)-1);held>>>=count;available-=count;return value;};
const tree=lengths=>{const width=Math.max(...lengths),counts=new Uint16Array(width+1),next=new Uint16Array(width+1),table=new Uint16Array(1<<width);
for(const length of lengths)if(length)counts[length]++;let code=0;
for(let length=1;length<=width;length++){code=(code+counts[length-1])*2;next[length]=code;}
if(code+counts[width]>table.length)invalid();
for(let symbol=0;symbol<lengths.length;symbol++){const length=lengths[symbol];if(!length)continue;let value=next[length]++,reversed=0;
for(let i=0;i<length;i++){reversed=reversed*2+(value&1);value>>>=1;}
for(let index=reversed;index<table.length;index+=1<<length)table[index]=(symbol<<4)|length;}
return {width,table};};
const symbol=code=>{fill(code.width);const entry=code.table[held&((1<<code.width)-1)],length=entry&15;if(!length||length>available)invalid();bits(length);return entry>>>4;};
let final=0;
while(!final){final=bits(1);const kind=bits(2);if(kind===3)invalid();
if(!kind){bits(available&7);const count=bits(16);if((count^bits(16))!==65535||written+count>bytes.length)invalid();for(let i=0;i<count;i++)bytes[written++]=bits(8);continue;}
let literal,distance;
if(kind===1){literal=tree(Array.from({length:288},(_,i)=>i<144?8:i<256?9:i<280?7:8));distance=tree(Array(32).fill(5));}
else{const literals=bits(5)+257,distances=bits(5)+1,count=bits(4)+4,order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],lengths=Array(19).fill(0);
for(let i=0;i<count;i++)lengths[order[i]]=bits(3);const code=tree(lengths),values=[];
while(values.length<literals+distances){const value=symbol(code);if(value<16){values.push(value);continue;}
if(value===16&&!values.length)invalid();const repeat=value===16?bits(2)+3:value===17?bits(3)+3:bits(7)+11;
if(values.length+repeat>literals+distances)invalid();const length=value===16?values[values.length-1]:0;for(let i=0;i<repeat;i++)values.push(length);}
if(!values[256])invalid();literal=tree(values.slice(0,literals));distance=tree(values.slice(literals));}
for(;;){const value=symbol(literal);if(value<256){if(written===bytes.length)invalid();bytes[written++]=value;continue;}if(value===256)break;if(value>285)invalid();
const code=value-257,extra=code<8?0:(code>>>2)-1,length=code===28?258:code<8?code+3:((code&3)+4)*2**extra+3+bits(extra);
const offset=symbol(distance);if(offset>29)invalid();const shift=offset<4?0:(offset>>>1)-1,back=offset<4?offset+1:((offset&1)+2)*2**shift+1+bits(shift);
if(back>written||written+length>bytes.length)invalid();for(let i=0;i<length;i++){bytes[written]=bytes[written-back];written++;}}
}
if(written!==bytes.length||position-Math.floor(available/8)!==source.length)invalid();return bytes;
};
const unsigned=r=>{let value=0,shift=0,byte;do{if(r[1]>=r[2]||shift>49)invalid();byte=r[0][r[1]++];value+=(byte&127)*2**shift;shift+=7;}while(byte&128);if(!Number.isSafeInteger(value))invalid();return value;};
const signed=r=>{if(r[1]>=r[2])invalid();let value=r[0][r[1]++];if(value>=240){if(value===255){value=4080+unsigned(r);if(!Number.isSafeInteger(value))invalid();}else{if(r[1]>=r[2])invalid();value=240+(value-240)*256+r[0][r[1]++];}}return value%2?-(value+1)/2:value/2;};
const complete=r=>{if(r[1]!==r[2])invalid();};
const [unit,metricUnit,metricBases,glyphs,contours]=(()=>{
const bytes=inflate(__INDEX__,__SIZE__),r=[bytes,0,bytes.length],unit=unsigned(r),metricUnit=unsigned(r);if(!unit||!metricUnit)invalid();const metricBases=Array.from({length:3},()=>signed(r));
for(const name of __MAP_FIELDS__){const count=unsigned(r),map=MATH_FONT[name]={};if(count>bytes.length)invalid();let key=0,value=0;
for(let i=0;i<count;i++){key+=unsigned(r);value+=signed(r);map[key]=value;}}
const scripts=MATH_FONT.scriptAlternates={},scriptCount=unsigned(r),previous=[0,0];let key=0;if(scriptCount>bytes.length)invalid();
for(let i=0;i<scriptCount;i++){key+=unsigned(r);const count=unsigned(r);if(count<1||count>2)invalid();const values=[];for(let j=0;j<count;j++){previous[j]+=signed(r);values.push(previous[j]);}scripts[key]=values;}
for(const name of ['vertical','horizontal']){const map=MATH_FONT[name]={},count=unsigned(r);key=0;if(count>bytes.length)invalid();
for(let i=0;i<count;i++){key+=unsigned(r);const variants=Array.from({length:unsigned(r)},()=>[key+signed(r),unsigned(r)]),parts=unsigned(r);if(variants.length>bytes.length||parts>bytes.length)invalid();
const record=map[key]={variants};if(parts)record.assembly={italic:signed(r),parts:Array.from({length:parts-1},()=>{const part=[key+signed(r),unsigned(r),unsigned(r)],full=unsigned(r);return [...part,Math.floor(full/2),full%2];})};}}
const tables=Array.from({length:2},()=>{const count=unsigned(r);if(count<1||count>bytes.length)invalid();const offsets=new Uint32Array(count);let previous=0;
for(let i=0;i<count;i++){previous+=unsigned(r);if(previous>=pages.length*32768)invalid();offsets[i]=previous;}return offsets;});complete(r);return [unit,metricUnit,metricBases,...tables];
})();
// Each page and glyph decodes once and stays: the font itself bounds every cache.
const pageCache=[],glyphCache=new Map();
const record=(offsets,id)=>{
if(!Number.isInteger(id)||id<0||id+1>=offsets.length)return;
const offset=offsets[id],page=offset>>>15,next=offsets[id+1];let bytes=pageCache[page];
if(!bytes){const source=pages[page];if(!source||source[0]>16384)invalid();bytes=pageCache[page]=inflate(source[1],source[0]);}
const begin=offset&32767,end=next>>>15===page?next&32767:bytes.length;if(begin>=end||end>bytes.length)invalid();return [bytes,begin,end];
};
const commandLengths=[2,2,1,1,6,0],commandNames='MLHVCZ';
const contour=(id,local,depth=0)=>{
if(local.has(id))return local.get(id);if(depth>4)invalid();const r=record(contours,id);if(!r)invalid();const header=unsigned(r);let commands,coordinates,closes;
if(header%2){const parentId=Math.floor(header/2);if(parentId>=id)invalid();const parent=contour(parentId,local,depth+1);[commands,,closes]=parent;coordinates=new Float64Array(parent[1].length);
for(let i=0;i<coordinates.length;i++)coordinates[i]=parent[1][i]+signed(r);}
else{const count=Math.floor(header/4);closes=header/2%2;if(r[1]+count>r[2])invalid();commands=r[0].subarray(r[1],r[1]+count);r[1]+=count;let values=0;
for(const command of commands){if(command<1||command>5)invalid();values+=commandLengths[command];}values-=2*closes;if(values<0||values>r[2]-r[1]||closes&&(commands[count-2]!==4||commands[count-1]!==5))invalid();coordinates=new Float64Array(values);
for(let i=0;i<values;i++)coordinates[i]=signed(r);}
complete(r);const value=[commands,coordinates,closes];local.set(id,value);return value;
};
// Bounds derive from the outline with fontTools' BoundsPen, operation for operation, so each value is the one
// the generator would have stored.
const quadratic=(a,b,c)=>{if(Math.abs(a)<1e-10)return Math.abs(b)<1e-10?[]:[-c/b];const d=b*b-4*a*c;if(d<0)return [];const root=Math.sqrt(d);return [(-b+root)/2/a,(-b-root)/2/a];};
const cubic=s=>{const cx=(s[2]-s[0])*3,cy=(s[3]-s[1])*3,bx=(s[4]-s[2])*3-cx,by=(s[5]-s[3])*3-cy;return [s[6]-s[0]-cx-bx,s[7]-s[1]-cy-by,bx,by,cx,cy,s[0],s[1]];};
const add=(box,x,y)=>box?[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)]:[x,y,x,y];
const inside=(box,x,y)=>box[0]<=x&&x<=box[2]&&box[1]<=y&&y<=box[3];
const curveBox=(box,s)=>{const [ax,ay,bx,by,cx,cy,dx,dy]=cubic(s),roots=[...quadratic(ax*3,bx*2,cx).filter(t=>0<=t&&t<1),...quadratic(ay*3,by*2,cy).filter(t=>0<=t&&t<1)];
let curve=add(add(null,s[0],s[1]),s[6],s[7]);for(const t of roots)curve=add(curve,ax*t*t*t+bx*t*t+cx*t+dx,ay*t*t*t+by*t*t+cy*t+dy);
return [Math.min(box[0],curve[0]),Math.min(box[1],curve[1]),Math.max(box[2],curve[2]),Math.max(box[3],curve[3])];};
const glyphRecord=id=>{
let cached=glyphCache.get(id);if(cached)return cached;const r=record(glyphs,id);if(!r)return;
const metrics=[];for(let i=0;i<3;i++)metrics.push(signed(r)+metricBases[i]);metrics[2]+=metrics[0]/2;
const count=unsigned(r),local=new Map();let path='',box=null;
if(count>r[2]-r[1])invalid();
for(let part=0;part<count;part++){const contourId=unsigned(r),firstX=signed(r),firstY=signed(r),[commands,coordinates,closes]=contour(contourId,local);let x=firstX,y=firstY,cursor=0;
path+='M'+x/unit+' '+y/unit;box=add(box,x/unit,y/unit);
for(let c=0;c<commands.length;c++){const command=commands[c],from=[x/unit,y/unit];path+=commandNames[command];
for(let index=0;index<commandLengths[command];index++){if(index)path+=' ';
const last=closes&&c===commands.length-2&&index>3;
if(command===3||(command!==2&&command!==3&&index%2)){y=last?firstY:y+coordinates[cursor++];path+=y/unit;from.push(x/unit,y/unit);}else{x=last?firstX:x+coordinates[cursor++];path+=x/unit;if(command===2)from.push(x/unit,y/unit);}}
if(command===5){x=firstX;y=firstY;continue;}
if(command===4){const end=add(box,from[6],from[7]);box=inside(end,from[2],from[3])&&inside(end,from[4],from[5])?end:curveBox(end,from);}else box=add(box,from[2],from[3]);}
}complete(r);box??=[0,0,0,0];
const glyph=[metrics[0]/metricUnit,Math.floor(box[0]),Math.floor(box[1]),Math.ceil(box[2]),Math.ceil(box[3]),metrics[1]/metricUnit,metrics[2]/metricUnit,path];
cached={glyph};glyphCache.set(id,cached);return cached;
};
MATH_FONT.glyph=id=>glyphRecord(id)?.glyph;
}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", type=Path, help="Optional pinned source font; otherwise fetch it")
    parser.add_argument("--license", type=Path, help="Optional pinned GUST Font License; otherwise fetch it")
    parser.add_argument("--lppl", type=Path, help="Optional pinned LPPL 1.3c; otherwise fetch it")
    parser.add_argument("--text-font", type=Path, help="Optional pinned Geist calibration font; otherwise use the editor copy or fetch it")
    parser.add_argument("--mono-font", type=Path, help="Optional pinned Latin Modern Mono font for text punctuation; otherwise fetch it")
    parser.add_argument("--hook-font", type=Path, help="Optional pinned Latin Modern Math Italic font for its arrow hook; otherwise fetch it")
    parser.add_argument("--out", type=Path, default=Path(__file__).with_name("font.js"))
    args = parser.parse_args()
    font_bytes = source_bytes(args.font, SOURCE_URL, SOURCE_SHA256)
    gust = source_bytes(args.license, LICENSE_URL, LICENSE_SHA256)
    lppl = source_bytes(args.lppl, LPPL_URL, LPPL_SHA256)
    local_text = Path(__file__).parents[1] / "shell/fonts/Geist.wght400-700.woff2"
    text_bytes = source_bytes(args.text_font or (local_text if local_text.exists() else None), TEXT_URL, TEXT_SHA256)
    font = TTFont(io.BytesIO(font_bytes))
    text_font = TTFont(io.BytesIO(text_bytes))
    mono = TTFont(io.BytesIO(source_bytes(args.mono_font, MONO_URL, MONO_SHA256)))
    data = extract(font)
    # The math font already carries the exact 62 Mono letters and digits. Text punctuation, visible space and
    # sharp s have no mathematical monospace code points; keep their original Mono outlines beside it.
    if mono["head"].unitsPerEm != data["units"]:
        raise ValueError("The monospace outline must share the math font's units")
    mono_glyphs = mono.getGlyphSet()
    data["styledGlyphs"] = {"monospace": {}}
    for cp in [0xDF, *(cp for cp in range(33, 127) if not chr(cp).isalnum()), 0x2423]:
        name = mono.getBestCmap()[cp]
        path = SVGPathPen(mono_glyphs, ntos=number)
        mono_glyphs[name].draw(path)
        advance = mono["hmtx"].metrics[name][0]
        data["styledGlyphs"]["monospace"][cp] = len(data["glyphs"])
        data["glyphs"].append([advance, 0, advance / 2, path.getCommands()])
    # amsmath's hooked arrow uses the small math-italic hook, not Unicode's taller hooked-arrow glyph.
    with tempfile.NamedTemporaryFile() as source:
        source.write(source_bytes(args.hook_font, HOOK_URL, HOOK_SHA256))
        source.flush()
        hook = T1Font(source.name, kind="PFB")
    hook_glyphs = hook.getGlyphSet()
    path = SVGPathPen(hook_glyphs, ntos=number)
    hook_glyphs["arrowhookleft"].draw(path)
    data["arrowHook"] = len(data["glyphs"])
    # This is an outline-only endpoint; the arrow composer supplies TeX's five-mu advance.
    data["glyphs"].append([0, 0, 0, path.getCommands()])
    data.update(textXHeight=text_font["OS/2"].sxHeight, textUnits=text_font["head"].unitsPerEm)
    heading = (font["name"].getDebugName(0) + "\n\n"
               + mono["name"].getDebugName(0) + "\n\n"
               + hook["FontInfo"]["Notice"] + "\n\n"
               "Rapier math font data, derived from Latin Modern Math 1.959,\n"
               "text outlines from Latin Modern Mono 2.004, and one arrow hook\n"
               "from Latin Modern Math Italic 10 Regular 2.003.\n"
               "Changes: SVG outline conversion, character and MATH data extraction,\n"
               "optical-form closure and lossless path packing.\n"
               "Original outlines are unchanged. Hinting and text shaping tables are omitted.\n"
               "The font authors do not maintain this conversion.\n"
               "Complete original work: https://mirrors.ctan.org/fonts/lm-math.zip\n"
               "Mono and hook original work: https://mirrors.ctan.org/fonts/lm.zip\n"
               "Conversion details: FONT-SOURCE.md.\n\n").encode("utf-8")
    notice = heading + gust + b"\n" + lppl
    # The data file carries its copyright and notice; the complete license (GUST Font License and LPPL 1.3c) is the
    # FONT-LICENSE.txt beside it, and the single-file renderer bundle carries that file whole.
    pointer = b"Complete license: FONT-LICENSE.txt (GUST Font License and LPPL 1.3c).\n"
    pages, index, size, packing = pack_font(data)
    glyph_count = len(data["glyphs"])
    character_count = len(data["chars"])
    for name in ("glyphs", "vertical", "horizontal", *SCALAR_MAPS, "scriptAlternates"):
        del data[name]
    output = (b"/*!\n" + heading + pointer + b"*/\nconst MATH_FONT=" + json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode("utf-8") + b";\n" + PATH_DECODER.replace("__PAGES__", json.dumps(pages, separators=(",", ":"))).replace("__INDEX__", json.dumps(index)).replace("__SIZE__", str(size)).replace("__MAP_FIELDS__", json.dumps(SCALAR_MAPS, separators=(",", ":"))).encode("utf-8") + b"\n\nexport {MATH_FONT};\n")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(output)
    args.out.with_name("FONT-LICENSE.txt").write_bytes(notice)
    print(json.dumps({"sourceSha256": hashlib.sha256(font_bytes).hexdigest(), "licenseSha256": hashlib.sha256(notice).hexdigest(), "glyphs": glyph_count, "characters": character_count, "packing": packing, "bytes": len(output), "gzipBytes": len(gzip.compress(output, compresslevel=9, mtime=0))}, indent=2))


if __name__ == "__main__":
    main()
