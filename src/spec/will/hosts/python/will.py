#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Will/1 Markdown reader and evaluator. Python 3.11+, standard library only."""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import math
import re
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator


_LAW_SPACE = frozenset("\t\n\v\f\r \u00a0\u1680\u2028\u2029\u202f\u205f\u3000\ufeff") | frozenset(
    chr(value) for value in range(0x2000, 0x200B)
)


def _utf8_fault(data: bytes) -> list[int] | None:
    offset = 0
    while offset < len(data):
        lead = data[offset]
        if lead < 0x80:
            offset += 1
            continue
        if lead & 0xE0 == 0xC0:
            width, scalar, minimum = 2, lead & 0x1F, 0x80
        elif lead & 0xF0 == 0xE0:
            width, scalar, minimum = 3, lead & 0x0F, 0x800
        elif lead & 0xF8 == 0xF0:
            width, scalar, minimum = 4, lead & 0x07, 0x10000
        else:
            return [offset, offset + 1]
        if offset + width > len(data):
            return [offset, len(data)]
        for byte in data[offset + 1 : offset + width]:
            if byte & 0xC0 != 0x80:
                return [offset, offset + 1]
            scalar = (scalar << 6) | (byte & 0x3F)
        if scalar < minimum or scalar > 0x10FFFF or 0xD800 <= scalar <= 0xDFFF:
            return [offset, offset + width]
        offset += width
    return None


def _lines(data: bytes) -> Iterator[tuple[int, int, int, bytes]]:
    start = 0
    number = 0
    for terminator in re.finditer(rb"\r\n|\r|\n", data):
        end = terminator.end()
        yield number, start, end, data[start : terminator.start()]
        start = end
        number += 1
    if start < len(data):
        yield number, start, len(data), data[start:]


def _fault(mode: str, line: int | None, span: list[int]) -> dict[str, Any]:
    return {"mode": mode, "line": line, "byteSpan": span}


def _marker(line: bytes) -> tuple[str, str | None, str | None]:
    """Return kind, law/fault, and intent for a line without its terminator."""
    if line.startswith((b"<!--will/", b"<!--/will")):
        return "fault", "malformed_marker", None
    if line.startswith(b"<!-- /will"):
        return ("close", None, None) if line == b"<!-- /will -->" else (
            "fault", "malformed_marker", None
        )
    if not line.startswith(b"<!-- will/"):
        return "content", None, None
    version = line[len(b"<!-- will/") :].split(b" ", 1)[0]
    if version != b"1":
        return "fault", "unknown_version", None
    if not line.endswith(b" -->"):
        return "fault", "malformed_marker", None
    body = line[len(b"<!-- will/1 ") : -len(b" -->")].decode("utf-8")
    boundary = 0
    while boundary < len(body) and body[boundary] != ":" and body[boundary] not in _LAW_SPACE:
        boundary += 1
    law, suffix = body[:boundary], body[boundary:]
    if not law or (suffix and not suffix.startswith(": ")):
        return "fault", "malformed_marker", None
    if law not in ("edit", "append", "keep"):
        return "fault", "unknown_law", None
    intent = suffix[2:] if suffix else None
    if intent is not None:
        if not intent or "--" in intent:
            return "fault", "malformed_marker", None
        if len(intent) > 512:
            return "fault", "intent_over_bound", None
    return "open", law, intent


def parse(data: bytes) -> dict[str, Any]:
    """Read strict UTF-8 bytes and return the normalized Will/1 parse result."""
    if not isinstance(data, bytes):
        raise TypeError("document must be bytes")
    invalid = _utf8_fault(data)
    if invalid is not None:
        return {"faulted": True, "faults": [_fault("invalid_utf8", None, invalid)], "regions": []}
    faults: list[dict[str, Any]] = []
    regions: list[dict[str, Any]] = []
    pending: tuple[dict[str, Any], str, str | None] | None = None
    for number, start, end, line in _lines(data):
        kind, value, intent = _marker(line)
        position = {"line": number, "byteSpan": [start, end]}
        if kind == "fault":
            faults.append(_fault(value, number, [start, end]))
        elif kind == "open":
            if pending is not None:
                faults.append(_fault("unpaired_marker", number, [start, end]))
            else:
                pending = position, value, intent
        elif kind == "close":
            if pending is None:
                faults.append(_fault("unpaired_marker", number, [start, end]))
            else:
                opener, law, region_intent = pending
                regions.append({
                    "index": len(regions),
                    "law": law,
                    "intent": region_intent,
                    "opener": opener,
                    "closer": position,
                    "governedSpan": [opener["byteSpan"][1], start],
                })
                pending = None
    if pending is not None:
        opener = pending[0]
        faults.append(_fault("unpaired_marker", opener["line"], opener["byteSpan"]))
    faults.sort(key=lambda item: item["byteSpan"][0])
    return {"faulted": bool(faults), "faults": faults, "regions": regions}


def _invalid(rule: str) -> dict[str, str]:
    return {"outcome": "invalid", "reason": "precondition", "rule": rule}


def _refused(rule: str, region: dict[str, Any] | None = None,
             faults: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"outcome": "refused", "reason": "document_law", "rule": rule}
    if region is not None:
        result.update(region=region["index"], law=region["law"])
    if faults is not None:
        result["faults"] = faults
    return result


def _touches(splice: dict[str, Any], span: list[int]) -> bool:
    start, end = splice["start"], splice["end"]
    left, right = span
    return left < start < right if start == end else start < right and left < end


def _apply(data: bytes, splices: list[dict[str, Any]]) -> bytes:
    chunks: list[bytes] = []
    cursor = 0
    for splice in splices:
        chunks.extend((data[cursor : splice["start"]], splice["insert"]))
        cursor = splice["end"]
    chunks.append(data[cursor:])
    return b"".join(chunks)


def _markers_survive(before: bytes, original: list[dict[str, Any]], after: bytes,
                     result: list[dict[str, Any]], splices: list[dict[str, Any]]) -> bool:
    old_positions = [region[name]["byteSpan"] for region in original for name in ("opener", "closer")]
    new_positions = [region[name]["byteSpan"] for region in result for name in ("opener", "closer")]
    if len(old_positions) != len(new_positions):
        return False
    cursor = delta = 0
    for (start, end), position in zip(old_positions, new_positions):
        while cursor < len(splices) and splices[cursor]["end"] <= start:
            splice = splices[cursor]
            delta += len(splice["insert"]) - (splice["end"] - splice["start"])
            cursor += 1
        if position != [start + delta, end + delta]:
            return False
        if before[start:end] != after[position[0] : position[1]]:
            return False
    return True


def _append_content(data: bytes) -> bytes:
    if data.endswith(b"\r\n"):
        return data[:-2]
    if data.endswith((b"\n", b"\r")):
        return data[:-1]
    return data


def _evaluate_valid(before: bytes, splices: list[dict[str, Any]], path: str) -> dict[str, Any]:
    if not splices or path == "authoring":
        return {"outcome": "applied"}
    original = parse(before)
    if original["faulted"]:
        return _refused("before_faulted", faults=original["faults"])
    for region in original["regions"]:
        for name in ("opener", "closer"):
            if any(_touches(splice, region[name]["byteSpan"]) for splice in splices):
                return _refused("marker_span_touched", region)
    after = _apply(before, splices)
    result = parse(after)
    if result["faulted"]:
        return _refused("result_faulted", faults=result["faults"])
    if not _markers_survive(before, original["regions"], after, result["regions"], splices):
        return _refused("marker_sequence_mismatch")
    for old, new in zip(original["regions"], result["regions"]):
        old_span, new_span = old["governedSpan"], new["governedSpan"]
        old_bytes = before[old_span[0] : old_span[1]]
        new_bytes = after[new_span[0] : new_span[1]]
        if old["law"] == "keep" and old_bytes != new_bytes:
            return _refused("law_violated", old)
        if old["law"] == "append" and not _append_content(new_bytes).startswith(_append_content(old_bytes)):
            return _refused("law_violated", old)
    return {"outcome": "applied"}


class _JSONNumber:
    __slots__ = ("source",)

    def __init__(self, source: str):
        self.source = source


class _Offset:
    __slots__ = ("digits", "zeros")

    def __init__(self, digits: str, zeros: int):
        self.digits, self.zeros = digits, zeros

    def __lt__(self, other: _Offset) -> bool:
        length, other_length = len(self.digits) + self.zeros, len(other.digits) + other.zeros
        if length != other_length:
            return length < other_length
        width = max(len(self.digits), len(other.digits))
        return self.digits.ljust(width, "0") < other.digits.ljust(width, "0")

    def bounded_int(self) -> int:
        # The caller has already bounded this value by the document byte length.
        return int(self.digits + "0" * self.zeros)


def _exponent(source: str) -> int:
    negative = source.startswith("-")
    digits = source.lstrip("+-")
    value = 0
    for start in range(0, len(digits), 18):
        chunk = digits[start : start + 18]
        value = value * (10 ** len(chunk)) + int(chunk)
    return -value if negative else value


def _offset(value: Any) -> _Offset | None:
    if isinstance(value, _JSONNumber):
        coefficient, separator, exponent = value.source.lower().partition("e")
        negative = coefficient.startswith("-")
        coefficient = coefficient.lstrip("-")
        whole, point, fraction = coefficient.partition(".")
        digits = whole + fraction
        zeros = (_exponent(exponent) if separator else 0) - len(fraction)
    else:
        if isinstance(value, bool):
            return None
        if isinstance(value, float):
            if not math.isfinite(value) or not value.is_integer():
                return None
            value = int(value)
        if isinstance(value, int):
            value = Decimal(value)
        if not isinstance(value, Decimal) or not value.is_finite():
            return None
        negative, values, zeros = value.as_tuple()
        digits = "".join(map(str, values))
    digits = digits.lstrip("0")
    if not digits:
        return _Offset("0", 0)
    if negative:
        return None
    coefficient = digits.rstrip("0")
    zeros += len(digits) - len(coefficient)
    return _Offset(coefficient, zeros) if zeros >= 0 else None


def evaluate(before: bytes, splices: Any, path: Any) -> dict[str, Any]:
    """Judge one transaction against original bytes. This function does not write."""
    if path not in ("working", "authoring"):
        return _invalid("unknown_path")
    if not isinstance(before, bytes):
        raise TypeError("document must be bytes")
    if not isinstance(splices, list):
        return _invalid("malformed_splice")
    ordered: list[dict[str, Any]] = []
    limit = _offset(len(before))
    for splice in splices:
        if not isinstance(splice, dict):
            return _invalid("malformed_splice")
        start, end = _offset(splice.get("start")), _offset(splice.get("end"))
        insert = splice.get("insert")
        if start is None or end is None or end < start or not isinstance(insert, bytes):
            return _invalid("malformed_splice")
        if limit < end:
            return _invalid("out_of_range_splice")
        ordered.append({"start": start.bounded_int(), "end": end.bounded_int(), "insert": insert})
    ordered.sort(key=lambda splice: (splice["start"], splice["end"]))
    for previous, current in zip(ordered, ordered[1:]):
        if current["start"] == previous["start"] or current["start"] < previous["end"]:
            return _invalid("overlapping_splices")
    return _evaluate_valid(before, ordered, path)


def _bytes_field(record: dict[str, Any], field: str) -> bytes:
    encoded = field + "Base64"
    if (field in record) == (encoded in record):
        raise ValueError(f"supply exactly one of {field} and {encoded}")
    if field in record:
        value = record[field]
        if not isinstance(value, str):
            raise ValueError(f"{field} must be a string")
        return value.encode("utf-8", errors="strict")
    value = record[encoded]
    if not isinstance(value, str):
        raise ValueError(f"{encoded} must be a string")
    result = base64.b64decode(value, validate=True)
    if base64.b64encode(result).decode("ascii") != value:
        raise ValueError(f"{encoded} must be canonical standard Base64")
    return result


def _request(request: Any) -> dict[str, Any]:
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    if "id" in request and not isinstance(request["id"], str):
        raise ValueError("id must be a string")
    if "id" in request:
        request["id"].encode("utf-8", errors="strict")
    if request.get("kind") == "parse":
        return parse(_bytes_field(request, "doc"))
    if request.get("kind") != "evaluate":
        raise ValueError("kind must be parse or evaluate")
    before = _bytes_field(request, "before")
    if "path" not in request:
        raise ValueError("path is required")
    splices = request.get("splices")
    if isinstance(splices, list):
        decoded = []
        for splice in splices:
            if not isinstance(splice, dict):
                decoded.append(splice)
                continue
            try:
                insert = _bytes_field(splice, "insert")
            except (ValueError, UnicodeError, binascii.Error):
                insert = None
            decoded.append({"start": splice.get("start"), "end": splice.get("end"), "insert": insert})
        splices = decoded
    return evaluate(before, splices, request["path"])


def _reject_constant(value: str) -> None:
    raise ValueError(f"invalid JSON number: {value}")


def _load_json(text: str) -> Any:
    return json.loads(text, parse_float=_JSONNumber,
                      parse_int=lambda value: int(value) if len(value) <= 18 else _JSONNumber(value),
                      parse_constant=_reject_constant)


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def _check(filename: Path) -> int:
    suite = _load_json(filename.read_text(encoding="utf-8"))
    vectors = suite["vectors"]
    if not isinstance(vectors, list) or not vectors:
        raise ValueError("vectors must be a nonempty list")
    passed = 0
    for vector in vectors:
        actual = _request(vector)
        if _json(actual) == _json(vector["expect"]):
            passed += 1
        else:
            print(f"FAIL {vector['id']}", file=sys.stderr)
            print("expected " + _json(vector["expect"]), file=sys.stderr)
            print("actual   " + _json(actual), file=sys.stderr)
    print(f"{passed}/{len(vectors)} vectors passed")
    return 0 if passed == len(vectors) else 1


def _adapter() -> int:
    failed = False
    for line in sys.stdin.buffer:
        try:
            request = _load_json(line.decode("utf-8", errors="strict"))
            normalized = _request(request)
            result = {"kind": request["kind"], "result": normalized}
            if "id" in request:
                result["id"] = request["id"]
        except (ValueError, UnicodeError, binascii.Error, RecursionError):
            failed = True
            result = {"error": "invalid_request"}
        print(_json(result), flush=True)
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter", action="store_true", help="read vector-shaped NDJSON requests")
    parser.add_argument("command", choices=("check", "parse"), nargs="?")
    parser.add_argument("file", nargs="?")
    args = parser.parse_args(argv)
    if args.adapter:
        if args.command or args.file:
            parser.error("--adapter takes no command or file")
        return _adapter()
    if args.command == "check":
        return _check(Path(args.file) if args.file else Path(__file__).resolve().parents[2] / "vectors.json")
    if args.command == "parse" and args.file:
        result = parse(Path(args.file).read_bytes())
        print(_json(result))
        return 1 if result["faulted"] else 0
    parser.error("use check [vectors.json], parse document.md, or --adapter")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, UnicodeError, binascii.Error) as error:
        print(f"will: {error}", file=sys.stderr)
        sys.exit(2)
