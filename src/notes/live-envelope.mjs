// SPDX-License-Identifier: AGPL-3.0-only
// Ciphertext transport authenticates a separately enrolled actor. Grant policy and kernel admission stay with their owners.
import {seal, open, SEAL_VERSION, NONCE_BYTES, TAG_BYTES, VDK_BYTES} from './vault.mjs';

export const LIVE_ENVELOPE_MAX_BYTES = 256 * 1024;
const HEADER_MAX_BYTES = 2048, SIGNATURE_BYTES = 64, SEAL_OVERHEAD = 1 + NONCE_BYTES + TAG_BYTES;
const FIELDS = ['workspaceId', 'documentId', 'keyEpoch', 'actorIndex', 'operationId', 'baseSequence', 'messageKind'];
export const KINDS = new Set(['edit', 'proposal', 'decision', 'comment', 'presence', 'checkpoint', 'rotate', 'notes-call', 'notes-result']);
const DOMAIN = 'rapier-owned-live-v1\0', te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const SIGNATURE_DOMAIN = te.encode('rapier-owned-live-signature-v1\0');
const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const fail = code => { throw Object.assign(new Error(code), {code}); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer = (value, min) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min;
const tuple = header => [1, ...FIELDS.map(field => header[field])];
const aad = header => DOMAIN + JSON.stringify(tuple(header));
function bytes(value, max, size) {
	if (!(value instanceof Uint8Array) || value.byteLength > max || size !== undefined && value.byteLength !== size) fail('live_envelope_bytes');
	return new Uint8Array(value);
}
function headerOf(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== FIELDS.length ||
		!FIELDS.every(field => Object.hasOwn(value, field))) fail('live_envelope_header');
	const header = Object.fromEntries(FIELDS.map(field => [field, value[field]]));
	if (!identifier(header.workspaceId) || !identifier(header.documentId) || !identifier(header.operationId) ||
		!integer(header.keyEpoch, 1) || !integer(header.actorIndex, 0) || !integer(header.baseSequence, 0) || !KINDS.has(header.messageKind)) fail('live_envelope_header');
	return Object.freeze(header);
}
function signingKey(key, usage) {
	if (!key || key.type !== (usage === 'sign' ? 'private' : 'public') || key.algorithm?.name !== 'ECDSA' ||
		key.algorithm.namedCurve !== 'P-256' || !key.usages?.includes(usage)) fail('live_envelope_key');
	return key;
}
function scopeOf(value) {
	if (!value || typeof value !== 'object') fail('live_envelope_scope');
	const {workspaceId, documentId, keyEpoch, actorIndex, verificationKey} = value;
	if (!identifier(workspaceId) || !identifier(documentId) || !integer(keyEpoch, 1) || !integer(actorIndex, 0)) fail('live_envelope_scope');
	return {workspaceId, documentId, keyEpoch, actorIndex, verificationKey: signingKey(verificationKey, 'verify')};
}
function signatureInput(body) {
	const out = new Uint8Array(SIGNATURE_DOMAIN.length + body.length);
	out.set(SIGNATURE_DOMAIN); out.set(body, SIGNATURE_DOMAIN.length); return out;
}
function scalar(bytes) {
	let value = 0n;
	for (const byte of bytes) value = (value << 8n) | BigInt(byte);
	return value;
}
// Low-S removes the s versus n-s ambiguity: a relay cannot use it to alter an operation's retained signature.
function canonicalSignature(signature, normalize = false) {
	if (signature.length !== SIGNATURE_BYTES) fail('live_envelope_signature');
	const r = scalar(signature.subarray(0, 32)); let s = scalar(signature.subarray(32));
	if (!r || r >= P256_ORDER || !s || s >= P256_ORDER) fail('live_envelope_signature');
	if (s > P256_ORDER / 2n) {
		if (!normalize) fail('live_envelope_signature');
		s = P256_ORDER - s;
		for (let index = 63; index >= 32; index--) { signature[index] = Number(s & 255n); s >>= 8n; }
	}
	return signature;
}
function parse(value) {
	const wire = bytes(value, LIVE_ENVELOPE_MAX_BYTES);
	if (wire.length < 2 + 2 + SEAL_OVERHEAD + SIGNATURE_BYTES) fail('live_envelope_frame');
	const size = new DataView(wire.buffer, wire.byteOffset, 2).getUint16(0);
	if (size < 2 || size > HEADER_MAX_BYTES || 2 + size + SEAL_OVERHEAD + SIGNATURE_BYTES > wire.length) fail('live_envelope_frame');
	let encoded, values;
	try { encoded = td.decode(wire.subarray(2, 2 + size)); values = JSON.parse(encoded); }
	catch (_) { fail('live_envelope_header'); }
	if (!Array.isArray(values) || values.length !== FIELDS.length + 1 || values[0] !== 1) fail('live_envelope_header');
	const header = headerOf(Object.fromEntries(FIELDS.map((field, index) => [field, values[index + 1]])));
	if (JSON.stringify(tuple(header)) !== encoded) fail('live_envelope_header');
	const body = wire.subarray(0, wire.length - SIGNATURE_BYTES), sealed = body.subarray(2 + size);
	if (sealed[0] !== SEAL_VERSION) fail('live_envelope_frame');
	const signature = canonicalSignature(wire.subarray(body.length));
	return {wire, header, body, sealed, signature};
}
async function authenticate(parsed, scope) {
	if (['workspaceId', 'documentId', 'keyEpoch', 'actorIndex'].some(field => parsed.header[field] !== scope[field])) fail('live_envelope_scope');
	let valid;
	try { valid = await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, scope.verificationKey, parsed.signature, signatureInput(parsed.body)); }
	catch (_) { fail('live_envelope_signature'); }
	if (!valid) fail('live_envelope_signature');
}

// The key is document-scoped, never the library VDK. Retrying sends the returned bytes unchanged.
export async function sealLiveEnvelope(value, payload, documentKey, privateKey) {
	const header = headerOf(value), encoded = te.encode(JSON.stringify(tuple(header)));
	const plain = bytes(payload, LIVE_ENVELOPE_MAX_BYTES - 2 - encoded.length - SEAL_OVERHEAD - SIGNATURE_BYTES);
	const key = bytes(documentKey, VDK_BYTES, VDK_BYTES), signer = signingKey(privateKey, 'sign');
	let sealed;
	try { sealed = await seal(key, aad(header), plain); }
	finally { key.fill(0); }
	const body = new Uint8Array(2 + encoded.length + sealed.length);
	new DataView(body.buffer).setUint16(0, encoded.length);
	body.set(encoded, 2); body.set(sealed, 2 + encoded.length);
	let signature;
	try { signature = canonicalSignature(new Uint8Array(await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, signer, signatureInput(body))), true); }
	catch (_) { fail('live_envelope_signature'); }
	const wire = new Uint8Array(body.length + signature.length); wire.set(body); wire.set(signature, body.length);
	return wire;
}

// scope comes from an authenticated, pinned grant; no key or human role is trusted from the wire.
// Persist the returned byte copy, not the caller's mutable input. This is authentication, not merge or durable custody.
export async function verifyLiveEnvelope(wire, trustedScope) {
	const parsed = parse(wire), scope = scopeOf(trustedScope);
	await authenticate(parsed, scope);
	return Object.freeze({header: parsed.header, bytes: parsed.wire});
}

export async function openLiveEnvelope(wire, trustedScope, documentKey) {
	const parsed = parse(wire), scope = scopeOf(trustedScope), key = bytes(documentKey, VDK_BYTES, VDK_BYTES);
	try {
		await authenticate(parsed, scope);
		return Object.freeze({header: parsed.header, bytes: await open(key, aad(parsed.header), parsed.sealed)});
	} finally { key.fill(0); }
}
