# rapier-embed

The Rapier editor inside your site. One call frames `rapier.html?embed=1`, connects at the frame's
load, loads your document and answers its saves from your own storage. Your app keeps the document,
its identity and its revisions; the frame never stores it.

MIT. No dependencies. The contract it speaks is `docs/embed-contract.md` in the Rapier repository;
the skill a coding agent reads is `skills/embed-rapier/SKILL.md` there.

## Use it

```html
<iframe id="rapier" src="https://editor.example.com/rapier.html?embed=1"></iframe>
```

```js
import {connectRapier, memoryStore} from 'rapier-embed';

const store = memoryStore({revision: 1, content: '# Notes\n'});   // or your own: write(requestId, content, baseRevision)
const rapier = connectRapier(document.querySelector('#rapier'), {
  sessionId: 'session-1', documentId: 'doc-42',
  capabilities: ['open', 'read'],            // add 'changes', 'compare', 'close', 'agent' as you use them
  theme: 'dark',                             // 'light' | 'dark' | 'system'; the frame follows your app
  store,
  onConnected: () => rapier.load(store.content, {filename: 'notes.md', revision: store.revision}),
});
```

That is the whole integration. The frame asks to save when the person presses Save; the helper
calls `store.write(requestId, content, baseRevision)` once per request and answers the frame with
the revision your store returns, or a conflict when your copy moved on. A repeated request (the
person's Retry, a reconnect) gets the same answer and is never written twice.

Your `store.write` returns `{revision}` after the bytes are durable, or `{conflict: true,
currentRevision}` when `baseRevision` is not your current revision. Return only after the write is
durable: the frame tells the person "saved to your.site" on your word.

## The handle

| Call | Needs | Does |
|---|---|---|
| `load(content, {filename, revision, readOnly, title})` | `open` | Opens your text in the frame at that revision. |
| `save()` | `read` | Asks the frame to save now; the answer comes through `store.write`. |
| `compare(content, {filename})` | `compare` | Opens your alternative text in the frame's Compare for the person to keep or drop. |
| `close()` | `close` | Asks the frame to close; resolves with the frame's close-ready. |
| `theme('light' \| 'dark' \| 'system')` | nothing | Changes the frame's theme live. |
| `disconnect()` | nothing | Ends this connection and stops listening. |
| `on(type, fn)` | | `connected`, `state` (with `changes`), `close-request`, `closed`, `error`. |

`onState(state)` receives `{loaded, dirty, saving, closing, readOnly, filename, docKind}` whenever it
changes, with `changes` granted. `onClose({dirty})` returns `'save'`, `'discard'` or `'cancel'` when the
frame asks; without it a dirty document is saved and a clean one closes.

## What the frame checks, and what you check

The frame takes the connect only from its parent window, from an HTTPS origin (HTTP on localhost),
and binds to that origin for the session. The helper checks every message it takes against the
frame's window and origin. Without `read` the frame refuses to send the person's words anywhere;
without `close` its Close control names the missing grant and sends you nothing. Grants are frozen
for the connection: reload the frame to change them.

Serve the frame from its own origin (`editor.example.com`), allow it in your `frame-src`, and let it
keep a real origin if you sandbox it (`allow-scripts allow-same-origin`).
