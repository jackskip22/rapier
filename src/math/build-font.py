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
import unicodedata
import urllib.request
import zlib

from fontTools.misc.bezierTools import calcCubicParameters, solveQuadratic
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
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
EDGE_STEP = 32


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
    scripts, flattened, dotless = (feature_alternates(font, tag) for tag in ("ssty", "flac", "dtls"))
    used = set(cmap.values())
    while True:
        previous = len(used)
        for feature in (scripts, flattened, dotless):
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
        glyph = glyph_set[name]
        bounds = BoundsPen(glyph_set)
        glyph.draw(bounds)
        rect = bounds.bounds or (0, 0, 0, 0)
        bounds_values = [math.floor(rect[0]), math.floor(rect[1]), math.ceil(rect[2]), math.ceil(rect[3])]
        path = SVGPathPen(glyph_set, ntos=number)
        glyph.draw(path)
        advance = font["hmtx"].metrics[name][0]
        glyphs.append([advance, *bounds_values, italic.get(name, 0), accent.get(name, advance / 2), path.getCommands()])
    data = {
        "units": font["head"].unitsPerEm,
        "xHeight": font["OS/2"].sxHeight,
        "glyphs": glyphs,
        "chars": {cp: ids[name] for cp, name in sorted(cmap.items())},
        "constants": {key: scalar(value) for key, value in vars(table.MathConstants).items() if not key.startswith("_")},
        "vertical": {},
        "horizontal": {},
        "minConnectorOverlap": variants.MinConnectorOverlap,
        "kern": {},
        "scriptAlternates": {ids[name]: [ids[alternate] for alternate in alternates] for name, alternates in scripts.items() if name in ids},
        "flatAccents": {ids[name]: ids[alternates[0]] for name, alternates in flattened.items() if name in ids},
        "dotless": {ids[name]: ids[alternates[0]] for name, alternates in dotless.items() if name in ids},
        "extendedShapes": {ids[name]: 1 for name in (info.ExtendedShapeCoverage.glyphs if info.ExtendedShapeCoverage else []) if name in ids},
        "edgeStep": EDGE_STEP,
        "edgeProfiles": {},
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
    kern_info = info.MathKernInfo
    if kern_info:
        for name, record in zip(kern_info.MathKernCoverage.glyphs, kern_info.MathKernInfoRecords):
            if name in ids:
                corners = []
                for key in ("TopRightMathKern", "TopLeftMathKern", "BottomRightMathKern", "BottomLeftMathKern"):
                    corner = getattr(record, key)
                    corners.append([list(map(scalar, corner.CorrectionHeight)), list(map(scalar, corner.KernValue))] if corner else None)
                data["kern"][ids[name]] = corners
    profiled = {
        name for cp, name in cmap.items()
        if (cp < 128 and chr(cp).isalnum())
        or any(style in unicodedata.name(chr(cp), "") for style in ("ITALIC", "SCRIPT"))
    }
    for name in list(profiled):
        profiled.update(scripts.get(name, ()))
        profiled.update(dotless.get(name, ()))
    for name in sorted(profiled, key=font.getGlyphID):
        profile = edge_profile(glyph_set, name)
        if profile:
            data["edgeProfiles"][ids[name]] = profile
    return data


class OutlinePen(BasePen):
    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.segments = []
        self.start = None

    def _moveTo(self, point):
        self.start = point

    def _lineTo(self, point):
        self.segments.append((self._getCurrentPoint(), point))

    def _curveToOne(self, first, second, end):
        self.segments.append((self._getCurrentPoint(), first, second, end))

    def _closePath(self):
        if self._getCurrentPoint() != self.start:
            self.segments.append((self._getCurrentPoint(), self.start))

    def _endPath(self):
        pass


def edge_profile(glyph_set, name):
    """Bound the original outline inside each horizontal strip."""
    pen = OutlinePen(glyph_set)
    glyph_set[name].draw(pen)
    bounds = BoundsPen(glyph_set)
    glyph_set[name].draw(bounds)
    if not bounds.bounds:
        return None
    first = math.floor(bounds.bounds[1] / EDGE_STEP) * EDGE_STEP
    count = max(1, math.ceil((bounds.bounds[3] - first) / EDGE_STEP))
    strips = [[] for _ in range(count)]
    for segment in pen.segments:
        if len(segment) == 2:
            (x, y), (end_x, end_y) = segment
            for index, strip in enumerate(strips):
                lower, upper = first + index * EDGE_STEP, first + (index + 1) * EDGE_STEP
                values = [0, 1]
                if end_y != y:
                    values.extend(((lower - y) / (end_y - y), (upper - y) / (end_y - y)))
                strip.extend(x + t * (end_x - x) for t in values if 0 <= t <= 1 and lower - 1e-7 <= y + t * (end_y - y) <= upper + 1e-7)
            continue
        a, b, c, d = calcCubicParameters(*segment)
        extrema = [0, 1, *solveQuadratic(3 * a[0], 2 * b[0], c[0])]
        critical = sorted([0, 1, *(t for t in solveQuadratic(3 * a[1], 2 * b[1], c[1]) if 0 < t < 1)])
        intersections = {}

        def vertical(t):
            return ((a[1] * t + b[1]) * t + c[1]) * t + d[1]

        def crossing(height):
            if height not in intersections:
                roots = []
                for low, high in zip(critical, critical[1:]):
                    y_low, y_high = vertical(low), vertical(high)
                    if not min(y_low, y_high) <= height <= max(y_low, y_high):
                        continue
                    for _ in range(45):
                        middle = (low + high) / 2
                        if (vertical(middle) < height) == (y_low < y_high):
                            low = middle
                        else:
                            high = middle
                    roots.append((low + high) / 2)
                intersections[height] = roots
            return intersections[height]

        y_min, y_max = min(point[1] for point in segment), max(point[1] for point in segment)
        for index, strip in enumerate(strips):
            lower, upper = first + index * EDGE_STEP, first + (index + 1) * EDGE_STEP
            if lower > y_max or upper < y_min:
                continue
            values = [*extrema, *crossing(lower), *crossing(upper)]
            for t in values:
                if 0 <= t <= 1:
                    y = ((a[1] * t + b[1]) * t + c[1]) * t + d[1]
                    if lower - 1e-7 <= y <= upper + 1e-7:
                        strip.append(((a[0] * t + b[0]) * t + c[0]) * t + d[0])
    return [first, *([math.floor(min(strip) - 1e-7), math.ceil(max(strip) + 1e-7)] if strip else None for strip in strips)]


PAGE_BYTES = 16384
PAGE_STRIDE = 32768
PARENT_DEPTH = 4
SCALAR_MAPS = ("chars", "dotless", "flatAccents", "extendedShapes")


def pack_font(data):
    """Share translated contours and retain independently inflatable record pages."""
    glyphs, profiles = data["glyphs"], data["edgeProfiles"]
    commands = "MLHVCZ"
    lengths = (2, 2, 1, 1, 6, 0)

    def unsigned(value, target):
        if value < 0 or value > 2**53 - 1:
            raise ValueError("Font integer exceeds exact JavaScript arithmetic")
        while value >= 128:
            target.append((value & 127) | 128)
            value >>= 7
        target.append(value)

    def signed(value, target):
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

    paths = [re.findall(r"[MLHVCZ]|-?\d+(?:\.\d+)?", glyph[7]) for glyph in glyphs]
    unit = 1
    for glyph, tokens in zip(glyphs, paths):
        if "".join(tokens) != re.sub(r"[ ,]", "", glyph[7]):
            raise ValueError("Font path has an unsupported coordinate or command")
        for token in tokens:
            if "." in token:
                unit = math.lcm(unit, Fraction(token).denominator)
    metric_unit = math.lcm(2, *(Fraction(value).denominator for glyph in glyphs for value in glyph[:7]))
    metrics = [[int(value * metric_unit) for value in glyph[:7]] for glyph in glyphs]
    for values in metrics:
        values[3] -= values[0] - values[1]
        values[6] -= values[0] // 2
    metric_bases = [sorted(values[column] for values in metrics)[len(metrics) // 2] for column in range(7)]
    contours, contour_ids, references = [], {}, []
    for tokens in paths:
        cursor, previous = 0, None
        structure, coordinates, refs = [], [], []
        first_x = first_y = x = y = 0

        def keep_contour():
            if not structure:
                return
            key = bytes(structure), tuple(coordinates)
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
                    x, y = first_x, first_y
            previous = command
        keep_contour()
        references.append(refs)

    contour_records, shapes, depths = [], {}, []
    for contour_id, (structure, coordinates) in enumerate(contours):
        record = bytearray()
        unsigned(len(structure) * 2, record)
        record.extend(structure)
        for value in coordinates:
            signed(value, record)
        # Small residuals compress better even when their first encoding costs another byte.
        best = (len(record) + sum(abs(value).bit_length() for value in coordinates), len(record))
        parent_depth = -1
        for parent, previous_coordinates in shapes.setdefault(structure, []):
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
        shapes[structure].append((contour_id, coordinates))
        contour_records.append(record)

    profile_records, profile_ids, profile_shapes, profile_depths = [], {}, {}, []
    profile_values = {}
    for glyph_id, profile in sorted(profiles.items()):
        key = profile[0], tuple(None if strip is None else tuple(strip) for strip in profile[1:])
        if key in profile_values:
            profile_ids[glyph_id] = profile_values[key]
            continue
        profile_id = len(profile_records)
        profile_ids[glyph_id] = profile_id
        profile_values[key] = profile_id
        record = bytearray()
        unsigned((len(profile) - 1) * 2, record)
        signed(profile[0], record)
        left = right = 0
        for strip in profile[1:]:
            if strip is None:
                unsigned(0, record)
                continue
            delta = strip[0] - left
            unsigned((delta * 2 if delta >= 0 else -delta * 2 - 1) + 1, record)
            signed(strip[1] - right, record)
            left, right = strip
        shape = profile[0], tuple(strip is not None for strip in profile[1:])
        parent_depth = -1
        for parent_id, parent in profile_shapes.setdefault(shape, []):
            if profile_depths[parent_id] >= PARENT_DEPTH:
                continue
            shared = bytearray()
            unsigned(parent_id * 2 + 1, shared)
            left = right = 0
            for strip, previous_strip in zip(profile[1:], parent[1:]):
                if strip is None:
                    continue
                next_left, next_right = strip[0] - previous_strip[0], strip[1] - previous_strip[1]
                signed(next_left - left, shared)
                signed(next_right - right, shared)
                left, right = next_left, next_right
                if len(shared) >= len(record):
                    break
            if len(shared) < len(record):
                record, parent_depth = shared, profile_depths[parent_id]
        profile_depths.append(parent_depth + 1)
        profile_shapes[shape].append((profile_id, profile))
        profile_records.append(record)

    glyph_records = []
    for glyph_id, (values, refs) in enumerate(zip(metrics, references)):
        record = bytearray()
        for value, base in zip(values, metric_bases):
            signed(value - base, record)
        unsigned(profile_ids.get(glyph_id, -1) + 1, record)
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
    for records in (glyph_records, contour_records, profile_records):
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

    def compressed(data):
        return base64.b64encode(zlib.compress(data, level=9, wbits=-15)).decode("ascii")

    packed = [(len(page), compressed(page)) for page in pages]
    return packed, compressed(indices), len(indices), {
        "contours": len(contours), "contourReferences": sum(map(len, references)), "profileRecords": len(profile_records),
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
const [unit,metricUnit,metricBases,glyphs,contours,profiles]=(()=>{
const bytes=inflate(__INDEX__,__SIZE__),r=[bytes,0,bytes.length],unit=unsigned(r),metricUnit=unsigned(r);if(!unit||!metricUnit)invalid();const metricBases=Array.from({length:7},()=>signed(r));
for(const name of __MAP_FIELDS__){const count=unsigned(r),map=MATH_FONT[name]={};if(count>bytes.length)invalid();let key=0,value=0;
for(let i=0;i<count;i++){key+=unsigned(r);value+=signed(r);map[key]=value;}}
const scripts=MATH_FONT.scriptAlternates={},scriptCount=unsigned(r),previous=[0,0];let key=0;if(scriptCount>bytes.length)invalid();
for(let i=0;i<scriptCount;i++){key+=unsigned(r);const count=unsigned(r);if(count<1||count>2)invalid();const values=[];for(let j=0;j<count;j++){previous[j]+=signed(r);values.push(previous[j]);}scripts[key]=values;}
const tables=Array.from({length:3},()=>{const count=unsigned(r);if(count<1||count>bytes.length)invalid();const offsets=new Uint32Array(count);let previous=0;
for(let i=0;i<count;i++){previous+=unsigned(r);if(previous>=pages.length*32768)invalid();offsets[i]=previous;}return offsets;});complete(r);return [unit,metricUnit,metricBases,...tables];
})();
const pageCache=new Map(),glyphCache=new Map(),profileCache=new Map();
const remember=(cache,id,value,limit)=>{if(cache.size>=limit)cache.delete(cache.keys().next().value);cache.set(id,value);return value;};
const touch=(cache,id)=>{const value=cache.get(id);if(value!==undefined){cache.delete(id);cache.set(id,value);}return value;};
const record=(offsets,id)=>{
if(!Number.isInteger(id)||id<0||id+1>=offsets.length)return;
const offset=offsets[id],page=offset>>>15,next=offsets[id+1];let bytes=touch(pageCache,page);
if(!bytes){const source=pages[page];if(!source||source[0]>16384)invalid();bytes=remember(pageCache,page,inflate(source[1],source[0]),8);}
const begin=offset&32767,end=next>>>15===page?next&32767:bytes.length;if(begin>=end||end>bytes.length)invalid();return [bytes,begin,end];
};
const commandLengths=[2,2,1,1,6,0],commandNames='MLHVCZ';
const contour=(id,local,depth=0)=>{
if(local.has(id))return local.get(id);if(depth>4)invalid();const r=record(contours,id);if(!r)invalid();const header=unsigned(r);let commands,coordinates;
if(header%2){const parentId=Math.floor(header/2);if(parentId>=id)invalid();const parent=contour(parentId,local,depth+1);commands=parent[0];coordinates=new Float64Array(parent[1].length);
for(let i=0;i<coordinates.length;i++)coordinates[i]=parent[1][i]+signed(r);}
else{const count=header/2;if(r[1]+count>r[2])invalid();commands=r[0].subarray(r[1],r[1]+count);r[1]+=count;let values=0;
for(const command of commands){if(command<1||command>5)invalid();values+=commandLengths[command];}if(values>r[2]-r[1])invalid();coordinates=new Float64Array(values);
for(let i=0;i<values;i++)coordinates[i]=signed(r);}
complete(r);const value=[commands,coordinates];local.set(id,value);return value;
};
const glyphRecord=id=>{
let cached=touch(glyphCache,id);if(cached)return cached;const r=record(glyphs,id);if(!r)return;
const glyph=[];for(let i=0;i<7;i++)glyph.push(signed(r)+metricBases[i]);glyph[3]+=glyph[0]-glyph[1];glyph[6]+=glyph[0]/2;for(let i=0;i<7;i++)glyph[i]/=metricUnit;const profile=unsigned(r)-1,count=unsigned(r),local=new Map();let path='';
if(profile>=profiles.length-1||count>r[2]-r[1])invalid();
for(let part=0;part<count;part++){const id=unsigned(r),firstX=signed(r),firstY=signed(r),[commands,coordinates]=contour(id,local);let x=firstX,y=firstY,cursor=0;
path+='M'+x/unit+' '+y/unit;
for(const command of commands){path+=commandNames[command];for(let index=0;index<commandLengths[command];index++){if(index)path+=' ';
if(command===3||(command!==2&&command!==3&&index%2)){y+=coordinates[cursor++];path+=y/unit;}else{x+=coordinates[cursor++];path+=x/unit;}}
if(command===5){x=firstX;y=firstY;}}
}complete(r);glyph.push(path);cached={glyph,profile};return remember(glyphCache,id,cached,256);
};
const profileRecord=(id,depth=0)=>{
const cached=touch(profileCache,id);if(cached)return cached;if(depth>4)invalid();const r=record(profiles,id);if(!r)invalid();const header=unsigned(r);let profile,left=0,right=0;
if(header%2){const parentId=Math.floor(header/2);if(parentId>=id)invalid();const parent=profileRecord(parentId,depth+1);profile=[parent[0]];
for(let i=1;i<parent.length;i++){const strip=parent[i];if(!strip){profile.push(null);continue;}left+=signed(r);right+=signed(r);profile.push([strip[0]+left,strip[1]+right]);}}
else{profile=[signed(r)];const count=header/2;if(count>r[2]-r[1])invalid();for(let i=0;i<count;i++){const token=unsigned(r);if(!token){profile.push(null);continue;}const value=token-1;left+=value%2?-(value+1)/2:value/2;right+=signed(r);profile.push([left,right]);}}
complete(r);return remember(profileCache,id,profile,128);
};
MATH_FONT.glyph=id=>glyphRecord(id)?.glyph;
MATH_FONT.profile=id=>{const glyph=glyphRecord(id);return glyph&&glyph.profile>=0?profileRecord(glyph.profile):undefined;};
}
"""



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", type=Path, help="Optional pinned source font; otherwise fetch it")
    parser.add_argument("--license", type=Path, help="Optional pinned GUST Font License; otherwise fetch it")
    parser.add_argument("--lppl", type=Path, help="Optional pinned LPPL 1.3c; otherwise fetch it")
    parser.add_argument("--text-font", type=Path, help="Optional pinned Geist calibration font; otherwise use the editor copy or fetch it")
    parser.add_argument("--out", type=Path, default=Path(__file__).with_name("font.js"))
    args = parser.parse_args()
    font_bytes = source_bytes(args.font, SOURCE_URL, SOURCE_SHA256)
    gust = source_bytes(args.license, LICENSE_URL, LICENSE_SHA256)
    lppl = source_bytes(args.lppl, LPPL_URL, LPPL_SHA256)
    local_text = Path(__file__).parents[1] / "shell/fonts/Geist.wght400-700.woff2"
    text_bytes = source_bytes(args.text_font or (local_text if local_text.exists() else None), TEXT_URL, TEXT_SHA256)
    font = TTFont(io.BytesIO(font_bytes))
    text_font = TTFont(io.BytesIO(text_bytes))
    data = extract(font)
    data.update(textXHeight=text_font["OS/2"].sxHeight, textUnits=text_font["head"].unitsPerEm)
    notice = (font["name"].getDebugName(0) + "\n\n"
              "Rapier math font data, derived from Latin Modern Math 1.959.\n"
              "Changes: SVG outline conversion, character and MATH data extraction,\n"
              "optical-form closure, derived contour profiles and lossless path packing.\n"
              "Original outlines are unchanged. Hinting and text shaping tables are omitted.\n"
              "The font authors do not maintain this conversion.\n"
              "Complete original work: https://mirrors.ctan.org/fonts/lm-math.zip\n"
              "Conversion details: FONT-SOURCE.md.\n\n").encode("utf-8") + gust + b"\n" + lppl
    pages, index, size, packing = pack_font(data)
    glyph_count = len(data["glyphs"])
    profile_count = len(data["edgeProfiles"])
    character_count = len(data["chars"])
    del data["glyphs"], data["edgeProfiles"]
    for name in (*SCALAR_MAPS, "scriptAlternates"):
        del data[name]
    output = (b"/*!\n" + notice + b"\n*/\nconst MATH_FONT=" + json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode("utf-8") + b";\n" + PATH_DECODER.replace("__PAGES__", json.dumps(pages, separators=(",", ":"))).replace("__INDEX__", json.dumps(index)).replace("__SIZE__", str(size)).replace("__MAP_FIELDS__", json.dumps(SCALAR_MAPS, separators=(",", ":"))).encode("utf-8"))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(output)
    args.out.with_name("FONT-LICENSE.txt").write_bytes(notice)
    print(json.dumps({"sourceSha256": hashlib.sha256(font_bytes).hexdigest(), "licenseSha256": hashlib.sha256(notice).hexdigest(), "glyphs": glyph_count, "characters": character_count, "edgeProfiles": profile_count, "packing": packing, "bytes": len(output), "gzipBytes": len(gzip.compress(output, compresslevel=9, mtime=0))}, indent=2))


if __name__ == "__main__":
    main()
