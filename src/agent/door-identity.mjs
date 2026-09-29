// Facts every door establishes before the kernel (docs/kernel.md, "The rule"). Pure: no DOM, network or clock; replayed by tools/replay-adapters.mjs.
// SPDX-License-Identifier: AGPL-3.0-only.

// FNV-1a + Fletcher, as kernel.mjs digest(): deterministic, no crypto, so replay stays pure.
function stableDigest(text) {
  let fnv = 0x811c9dc5, a = 1, b = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 16777619); a = (a + code) % 65521; b = (b + a) % 65521;
  }
  return (fnv >>> 0).toString(36) + '_' + (((b << 16) | a) >>> 0).toString(36) + '_' + text.length.toString(36);
}

// Invocation identity (docs/kernel.md, "Two identities"): principal, session and the operation's own name, never the JSON-RPC id
// (it restarts at 1). `session` is the door's fact, never the wire's. Transport is excluded.
export function deriveInvocationKey({ requestId, principal, session } = {}) {
  // JSON type is part of the id: 1 and "1" differ.
  const fields = [principal, session ?? principal, JSON.stringify(requestId ?? '')].map(value => String(value ?? ''));
  // Length-prefixed fields: a separator lets different triples collide.
  return 'key_' + stableDigest(fields.map(value => value.length + ':' + value).join(''));
}

// Built from the wire, never the document. invocationKey is always derived; invocationKeyRejected refuses a wire-supplied one.
export function resolveCaller({ actor, principal, transport, requestId, invocationKey, session } = {}, defaults = {}) {
  const kind = ['human', 'agent', 'system'].includes(actor) ? actor : (defaults.actor || 'agent');
  const resolvedPrincipal = String(principal || defaults.principal || 'platform');
  const resolvedTransport = String(transport || defaults.transport || 'platform');
  const wireRequestId = requestId ?? defaults.requestId ?? '';
  const resolvedRequestId = String(wireRequestId);
  return {
    actor: kind,
    principal: resolvedPrincipal,
    transport: resolvedTransport,
    requestId: resolvedRequestId,
    invocationKey: deriveInvocationKey({ requestId: wireRequestId, principal: resolvedPrincipal,
      session: session ?? defaults.session }),
    invocationKeyRejected: invocationKey != null,
  };
}

// Trusted input within a window plus focus; the caller supplies every fact.
export function browserPresence({ lastInputAt, now, windowMs = 900, visible, focused } = {}) {
  if (!visible) return null;
  const active = Number.isFinite(lastInputAt) && Number.isFinite(now) && (now - lastInputAt) < windowMs;
  return { active, editing: active && focused === true };
}

// Unknown is not absent: a headless worker cannot attest presence either way.
export const WORKER_PRESENCE = 'unknown';

// Exact allowlist match. No Origin passes; the literal 'null' is refused. Shared by HTTP and postMessage.
export function validateOrigin(origin, allowed) {
  if (origin == null) return true;
  if (origin === 'null') return false;
  const set = allowed instanceof Set ? allowed : new Set(allowed || []);
  return set.has(origin);
}

// 'host' alone may hand the editor a writable file binding (docs/architecture.md).
export function frameAuthority(framed, mode, sameOriginParent) {
  if (!framed) return 'top';
  if (mode === '1') return 'host';
  if (sameOriginParent === true) return 'local';
  return 'refused';
}

// The wire codec the editor seal below and the host's editor key (mcp/editor-keys.mjs) share.
export const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromBase64url = text => Uint8Array.from(atob(String(text).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(text).length / 4) * 4, '=')), char => char.charCodeAt(0));

// AES-GCM under SHA-256 of the editor key: the host (and model) cannot read the rotated capability. base64url(iv || ciphertext).
async function sealingKey(editorKey, usage) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rapier-seal\n' + String(editorKey)));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]);
}
export async function sealForEditor(editorKey, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealingKey(editorKey, 'encrypt'), new TextEncoder().encode(String(text))));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return base64url(out);
}
export async function unsealForEditor(editorKey, sealed) {
  try {
    const bytes = fromBase64url(sealed);
    if (bytes.length <= 12) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await sealingKey(editorKey, 'decrypt'), bytes.slice(12));
    return new TextDecoder().decode(plain);
  } catch (_) { return null; }
}
