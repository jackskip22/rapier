# Python host

Run every conformance vector from the Will repository root:

```sh
python3 hosts/python/will.py check vectors.json
```

Requires Python 3.11 or later. Uses the standard library only.

Read a document or process newline-delimited JSON requests:

```sh
python3 hosts/python/will.py parse document.md
python3 hosts/python/will.py --adapter < cases.ndjson
```

Import `parse(document_bytes)` and `evaluate(before_bytes, splices, path)` from `will.py`.
Each splice contains `start`, `end`, and `insert` bytes. Offsets address the original document.
Both functions return dictionaries; evaluation never writes a file. The host supplies `working`
or `authoring` from its own authorization boundary.

The adapter accepts one vector-shaped request per line and emits `{kind, result}`, echoing `id` when supplied.
An optional `id` must be a string. `result` holds the normalized parse or evaluation response.
Use exactly one plain UTF-8 string or canonical standard Base64 field for each document or insertion.
Evaluation requires `path`. Blank lines, bad JSON, unknown kinds, missing paths, or invalid document fields
emit `{"error":"invalid_request"}`; processing continues and the process exits 1 after EOF. A present
unknown path returns `unknown_path`. Invalid insertion fields return `malformed_splice`. Unpaired
surrogates are rejected, never replaced.
