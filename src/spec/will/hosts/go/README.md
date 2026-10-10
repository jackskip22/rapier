# Go host

Go 1.22 or later. Standard library only.

Run all normative vectors from this directory:

```sh
go run ./cmd/will check ../../vectors.json
```

Read a document or process JSON requests:

```sh
go run ./cmd/will parse document.md
go run ./cmd/will --adapter < cases.ndjson
```

The `parse` command exits with status 1 when the document is faulted.

The adapter accepts the request format in the [standard](../../README.md).
It writes `{kind, result}` per input line and echoes an optional string `id`. An invalid request writes
`{"error":"invalid_request"}`;
processing continues, and the command exits with status 1 after EOF.

Import `github.com/jackskip22/will/hosts/go` as package `will`. `Parse([]byte)` returns a `Document`.
`Evaluate([]byte, []Splice, string)` returns a `Decision`; splice offsets address the unchanged source.
Use an empty splice slice for an empty act; a nil slice is invalid. A splice's nil `Insert` is empty byte data.
`RunCase(json.RawMessage)` validates adapter requests and exact numeric offsets, returning the normalized result.
The CLI adds the `kind` and optional `id` envelope.

Choose `working` or `authoring` from the host's established authority. A document does not choose its own path.
