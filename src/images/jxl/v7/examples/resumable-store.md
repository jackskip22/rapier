# Durable checkpoints with the public resumable API

[resumable-store.mjs](./resumable-store.mjs) is a source example for a host that already has a linearizable compare-and-set store. Copy it into the host project alongside its declaration file and install rapier-jxl. This example is kept in the source repository; it is not an exported package API.

The imported operation is the ordinary public verb, such as capture from rapier-jxl/capture or encode from rapier-jxl/upload. The public resumable driver owns the operation's steps, source validation, immutable parts, result metadata and checkpoint format. The example saves the returned checkpoint unchanged and never reads its private fields.

## Run one host invocation

The host supplies a persistent store and an immutable original reader. This function can be recreated for each request or scheduled invocation:

~~~js
import {encode} from 'rapier-jxl/upload';
import {createDurableDriver} from './resumable-store.mjs';

export async function resumeImage({key, input, store, readSource, signal}) {
  const driver = createDurableDriver({operation: encode, store, readSource});
  const current = await driver.inspect(key);

  if (!current.value) {
    return driver.start(key, {
      input,
      options: {fidelity: 'exact', effort: 1},
      expectedVersion: current.version,
      signal,
    });
  }

  const command = {
    generation: current.value.input.generation,
    expectedVersion: current.version,
    signal,
  };
  if (current.value.canceled) return current;
  if (!current.value.done) {
    return driver.advance(key, {...command, budget: {ms: 30}});
  }

  return driver.finish(key, command);
}
~~~

When the outcome is 'finished', the ordinary result record is returned as result. Its encoded body is result.bytes. The variants operation returns its ordinary ordered list of result records. A stale outcome contains no result bytes.

The input is the public immutable descriptor: generation, SHA-256 and byteLength, plus width and height for straight RGBA pixels, or kind: 'file' for an encoded upload. The readSource callback receives that saved input, offset and length. It must resolve the named immutable generation, even if the media key now names another original.

Use a separate job key for a separate request. Calling start on an occupied key requires the observed version explicitly. A stale start does not imply that the existing job has the same options as the proposed one.

## Store contract

The store supplies the public immutable-part methods: read, optional readMany, and write or writeMany. Preserve exact bytes under each public hash/length reference. Writes are idempotent, finish persisting before resolving, and throw on failure. Parts must remain available while their job checkpoint is retained.

The same store supplies two host methods:

- getVersioned(key) returns a value and version. A never-created key is null/null.
- compareAndSet(key, expectedVersion, value) returns either {ok: true, version} with a fresh version, or {ok: false}. Comparing and saving are one atomic operation.

Versions must never repeat. Deletion keeps a new versioned tombstone so a delayed worker cannot recreate a deleted job using its old version.

The public start and advance calls await every new immutable write before this example attempts the checkpoint CAS. A failed write leaves the prior checkpoint authoritative. Concurrent workers can leave harmless unreferenced parts; only one checkpoint save wins.

## Cancellation, completion and delivery

cancel uses the same source-generation and store-version fence. If cancellation saves first, a worker cannot commit a later checkpoint. Once a completed checkpoint is saved, completion wins and cancel observes it. An AbortSignal stops one invocation; it does not undo an already committed host write.

finish assembles the ordinary result and then reads the authority again. It returns no result if the source generation or store version changed during assembly. Assembly may read the complete output and is outside the bounded advance call.

A lost CAS acknowledgement is reconciled using the exact saved host-write identity. If the acknowledgement is unusable and readback cannot establish its outcome, the error has commitOutcome: 'unknown'. Treat it as unresolved and inspect durable authority before making a delivery decision.

This example does not publish media or invent a second verification/publication protocol. A finished return is a snapshot: actual publication still needs the media host's generation guard. For EmDash, use [job-runner.mjs](./emdash/job-runner.mjs) with [media-storage.mjs](./emdash/media-storage.mjs), which own that publication path. Call rapier-jxl/verify explicitly when verification is required.

## Focused installed-package check

~~~sh
JXL_PACKAGE=/absolute/path/to/node_modules/rapier-jxl \
  node --test repo/images/jxl/v7/test/resumable-store.test.mjs
~~~

The test loader changes import locations only. Encoders, the resumable driver and decode come from the installed package. Host storage is modeled separately, including persistent JSON snapshots across fresh Node processes, conflicting CAS writes, cancellation and failed writes. Every finished JPEG XL is decoded and compared exactly.
