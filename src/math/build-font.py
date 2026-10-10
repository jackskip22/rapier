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


def pack_paths(glyphs, profiles):
    """Store exact coordinate deltas, sharing matching outline structures."""
    output = bytearray()

    def unsigned(value, target):
        while value >= 128:
            target.append((value & 127) | 128)
            value >>= 7
        target.append(value)

    def signed(value, target):
        unsigned(value * 2 if value >= 0 else -value * 2 - 1, target)

    commands = "MLHVCZ"
    lengths = (2, 2, 1, 1, 6, 0)
    paths = [re.findall(r"[MLHVCZ]|-?\d+(?:\.\d+)?", glyph[7]) for glyph in glyphs]
    unit = 1
    for glyph, tokens in zip(glyphs, paths):
        if "".join(tokens) != re.sub(r"[ ,]", "", glyph[7]):
            raise ValueError("Font path has an unsupported coordinate or command")
        for token in tokens:
            if "." in token:
                unit = math.lcm(unit, Fraction(token).denominator)
    unsigned(unit, output)
    unsigned(len(glyphs), output)
    metric_unit = math.lcm(*(Fraction(value).denominator for glyph in glyphs for value in glyph[:7]))
    unsigned(metric_unit, output)
    previous_metrics = [0] * 7
    for glyph in glyphs:
        for index, value in enumerate(glyph[:7]):
            value = int(value * metric_unit)
            signed(value - previous_metrics[index], output)
            previous_metrics[index] = value
    structures = {}
    for glyph_index, (glyph, tokens) in enumerate(zip(glyphs, paths)):
        cursor = 0
        segments = []
        previous = None
        while cursor < len(tokens):
            if tokens[cursor] in commands:
                command = commands.index(tokens[cursor])
                cursor += 1
            elif previous is not None and previous != 5:
                command = 1 if previous == 0 else previous
            else:
                raise ValueError("Font path has an invalid repeated command")
            length = lengths[command]
            values = [int(Fraction(value) * unit) if "." in value else int(value) * unit for value in tokens[cursor:cursor + length]]
            if len(values) != length:
                raise ValueError("Font path has an incomplete command")
            if any(abs(value) * 4 > 2**53 - 1 for value in values):
                raise ValueError("Font coordinates exceed exact JavaScript integer arithmetic")
            cursor += length
            segments.append((command, values))
            previous = command
        record = bytearray()
        unsigned(len(segments) * 2, record)
        x = y = first_x = first_y = 0
        for command, values in segments:
            record.append(command)
            for index, value in enumerate(values):
                if command == 3 or (command not in (2, 3) and index % 2):
                    signed(value - y, record)
                    y = value
                else:
                    signed(value - x, record)
                    x = value
            if command == 0:
                first_x, first_y = x, y
            elif command == 5:
                x, y = first_x, first_y
        structure = bytes(command for command, _ in segments)
        coordinates = tuple(value for _, values in segments for value in values)
        candidates = structures.setdefault(structure, [])
        for parent, previous_coordinates in candidates:
            shared = bytearray()
            unsigned(parent * 2 + 1, shared)
            for value, previous in zip(coordinates, previous_coordinates):
                signed(value - previous, shared)
                if len(shared) >= len(record):
                    break
            if len(shared) < len(record):
                record = shared
        candidates.append((glyph_index, coordinates))
        output.extend(record)
        glyph[7] = ""
    unsigned(len(profiles), output)
    previous_id = -1
    profile_shapes = {}
    for glyph_id, profile in sorted(profiles.items()):
        unsigned(glyph_id - previous_id - 1, output)
        previous_id = glyph_id
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
        for parent_id, parent in profile_shapes.setdefault(shape, []):
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
                record = shared
        profile_shapes[shape].append((glyph_id, profile))
        output.extend(record)
    packed = zlib.compress(output, level=9, wbits=-15)
    return base64.b64encode(packed).decode("ascii"), len(output)


PATH_DECODER = """{
const source=Uint8Array.from(atob(__PATHS__),value=>value.charCodeAt(0)),bytes=new Uint8Array(__SIZE__);
let position=0,held=0,available=0,written=0,cursor=0;
const invalid=()=>{throw new Error('Invalid math font data');};
const fill=count=>{while(available<count&&position<source.length){held|=source[position++]<<available;available+=8;}};
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
if(written!==bytes.length)invalid();
const unsigned=()=>{let value=0,shift=0,byte;do{if(cursor>=bytes.length||shift>49)invalid();byte=bytes[cursor++];value+=(byte&127)*2**shift;shift+=7;}while(byte&128);return value;};
const unit=unsigned();if(!unit)invalid();
const signed=()=>{const value=unsigned();return value&1?-(value+1)/2:value/2;};
const glyphCount=unsigned(),metricUnit=unsigned(),metrics=Array(7).fill(0);if(!metricUnit)invalid();
for(let i=0;i<glyphCount;i++){const glyph=[];for(let j=0;j<7;j++){metrics[j]+=signed();glyph.push(metrics[j]/metricUnit);}glyph.push('');MATH_FONT.glyphs.push(glyph);}
const commands='MLHVCZ',lengths=[2,2,1,1,6,0];
for(const glyph of MATH_FONT.glyphs){const header=unsigned();
if(header&1){glyph[7]=MATH_FONT.glyphs[header>>>1][7].replace(/-?\\d+(?:\\.\\d+)?/g,value=>(Math.round(Number(value)*unit)+signed())/unit);continue;}
let x=0,y=0,firstX=0,firstY=0,path='';const count=header>>>1;
for(let segment=0;segment<count;segment++){const command=bytes[cursor++];if(command>5)invalid();path+=commands[command];
for(let index=0;index<lengths[command];index++){if(index)path+=' ';if(command===3||(command!==2&&command!==3&&index%2)){y+=signed();path+=y/unit;}else{x+=signed();path+=x/unit;}}
if(command===0){firstX=x;firstY=y;}else if(command===5){x=firstX;y=firstY;}}
glyph[7]=path;}
const profileCount=unsigned();let id=-1;
for(let i=0;i<profileCount;i++){id+=unsigned()+1;const header=unsigned();let profile,left=0,right=0;
if(header&1){const parent=MATH_FONT.edgeProfiles[header>>>1];if(!parent)invalid();profile=[parent[0]];
for(const strip of parent.slice(1)){if(!strip){profile.push(null);continue;}left+=signed();right+=signed();profile.push([strip[0]+left,strip[1]+right]);}}
else{profile=[signed()];for(let j=0;j<header>>>1;j++){const token=unsigned();if(!token){profile.push(null);continue;}const value=token-1;left+=value&1?-(value+1)/2:value/2;right+=signed();profile.push([left,right]);}}
MATH_FONT.edgeProfiles[id]=profile;}
if(cursor!==bytes.length)invalid();
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
    paths, size = pack_paths(data["glyphs"], data["edgeProfiles"])
    glyph_count = len(data["glyphs"])
    profile_count = len(data["edgeProfiles"])
    data["glyphs"] = []
    data["edgeProfiles"] = {}
    output = (b"/*!\n" + notice + b"\n*/\nconst MATH_FONT=" + json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode("utf-8") + b";\n" + PATH_DECODER.replace("__PATHS__", json.dumps(paths)).replace("__SIZE__", str(size)).encode("utf-8"))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(output)
    args.out.with_name("FONT-LICENSE.txt").write_bytes(notice)
    print(json.dumps({"sourceSha256": hashlib.sha256(font_bytes).hexdigest(), "licenseSha256": hashlib.sha256(notice).hexdigest(), "glyphs": glyph_count, "characters": len(data["chars"]), "edgeProfiles": profile_count, "bytes": len(output), "gzipBytes": len(gzip.compress(output, compresslevel=9, mtime=0))}, indent=2))


if __name__ == "__main__":
    main()
