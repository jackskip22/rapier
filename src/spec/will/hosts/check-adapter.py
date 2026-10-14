#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Check an actual host process against the vector and NDJSON byte contracts."""

import json
import subprocess
import sys
from pathlib import Path


def exact(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def check(command, cases, status):
    source = b"".join(case["request"].encode("utf-8") + b"\n" for case in cases)
    process = subprocess.run(command + ["--adapter"], input=source, capture_output=True, check=False)
    lines = process.stdout.split(b"\n")
    if lines[-1] == b"":
        lines.pop()
    if process.returncode != status or len(lines) != len(cases):
        raise ValueError(f"exit {process.returncode}, {len(lines)} responses; expected {status}, {len(cases)}")
    for case, line in zip(cases, lines):
        if exact(json.loads(line)) != exact(case["expect"]):
            raise ValueError(f"{case['id']}: unexpected response {line.decode('utf-8')}")
    return len(cases)


def main():
    if len(sys.argv) < 2:
        raise ValueError("usage: check-adapter.py <host command...>")
    root = Path(__file__).resolve().parent
    vectors = json.loads((root.parent / "vectors.json").read_text(encoding="utf-8"))["vectors"]
    cases = [{"id": v["id"], "request": exact({k: value for k, value in v.items() if k != "expect"}),
              "expect": {"id": v["id"], "kind": v["kind"], "result": v["expect"]}} for v in vectors]
    ordinary = check(sys.argv[1:], cases, 0)
    transport = check(sys.argv[1:], json.loads((root / "adapter-vectors.json").read_text(encoding="utf-8")), 1)
    print(f"{ordinary} conformance responses and {transport} adapter boundary responses exact")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(f"adapter: {error}", file=sys.stderr)
        sys.exit(1)
