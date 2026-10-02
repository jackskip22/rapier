// SPDX-License-Identifier: AGPL-3.0-only
// The one seam between the page and the app (docs/briefs/bridge-and-grants.md section 2). A frame
// is {v, op, requestId, generation, meta} and no payload, a text payload or bytes. Bytes cross as
// one binary message when the host carries ArrayBuffers; base64 exists only inside this file, for a
// WebView that cannot. Every frame may name the document generation; a stale one is refused by
// name, never thrown. Pure: the caller injects the host (the message object, or a MessagePort for
// a large transfer: a port is a host) and the generation.

const RAPIER_TRANSPORT_VERSION = 1;
const RAPIER_TRANSPORT_MAGIC = Object.freeze([0x52, 0x50, 0x52, 0x31]); // RPR1
const RAPIER_TRANSPORT_HEADER_LIMIT = 64 * 1024;
const RAPIER_TRANSPORT_PREFIX = 8; // magic + u32 header length

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});

export function nativeTransportOrigin(origin) {
	if (typeof origin !== 'string' || !origin || origin.includes('*')) throw new TypeError('the transport binds one exact origin');
	let url;
	try { url = new URL(origin); } catch (_) { throw new TypeError('the transport binds one exact origin'); }
	if (url.origin !== origin || url.origin === 'null') throw new TypeError('the transport binds one exact origin');
	return origin;
}

const bytesOf = payload => payload instanceof Uint8Array ? payload
	: payload instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && payload instanceof SharedArrayBuffer) ? new Uint8Array(payload)
	: null;

function base64Encode(bytes) {
	let text = '';
	for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(at, at + 0x8000));
	return btoa(text);
}
const base64Decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

const header = frame => ({v: RAPIER_TRANSPORT_VERSION, op: frame.op, requestId: frame.requestId ?? null,
	generation: frame.generation == null ? null : String(frame.generation), meta: frame.meta ?? {}});

export function encodeFrame(frame, {binary = true} = {}) {
	if (typeof frame?.op !== 'string' || !frame.op) throw new TypeError('a frame names one op');
	const bytes = bytesOf(frame.payload);
	if (bytes && binary) {
		const head = encoder.encode(JSON.stringify(header(frame)));
		if (head.length > RAPIER_TRANSPORT_HEADER_LIMIT) throw new RangeError('the frame header is too large');
		const out = new Uint8Array(RAPIER_TRANSPORT_PREFIX + head.length + bytes.length);
		out.set(RAPIER_TRANSPORT_MAGIC, 0);
		new DataView(out.buffer).setUint32(4, head.length, true);
		out.set(head, RAPIER_TRANSPORT_PREFIX);
		out.set(bytes, RAPIER_TRANSPORT_PREFIX + head.length);
		return out.buffer;
	}
	const text = header(frame);
	if (bytes) text.bytes = base64Encode(bytes);
	else if (frame.payload != null) {
		if (typeof frame.payload !== 'string') throw new TypeError('a payload is text or bytes');
		text.payload = frame.payload;
	}
	return JSON.stringify(text);
}

const refuse = (reason, head) => Object.freeze({ok: false, refused: reason, op: head?.op ?? null, requestId: head?.requestId ?? null});

function checkHead(head, current) {
	if (!head || typeof head !== 'object' || Array.isArray(head)) return refuse('malformed');
	if (head.v !== RAPIER_TRANSPORT_VERSION) return refuse('version', head);
	if (typeof head.op !== 'string' || !head.op) return refuse('malformed', head);
	if (head.generation != null && current != null && String(head.generation) !== String(current)) return refuse('generation', head);
	return null;
}

const accept = (head, payload, lane) => Object.freeze({ok: true, lane, frame: Object.freeze({v: head.v, op: head.op,
	requestId: head.requestId ?? null, generation: head.generation == null ? null : String(head.generation),
	meta: head.meta && typeof head.meta === 'object' ? head.meta : {}, payload})});

export function decodeFrame(data, {current = null} = {}) {
	const bytes = bytesOf(data);
	if (bytes) {
		if (bytes.length < RAPIER_TRANSPORT_PREFIX || RAPIER_TRANSPORT_MAGIC.some((byte, at) => bytes[at] !== byte)) return refuse('malformed');
		const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
		if (length > RAPIER_TRANSPORT_HEADER_LIMIT || RAPIER_TRANSPORT_PREFIX + length > bytes.length) return refuse('malformed');
		let head;
		try { head = JSON.parse(decoder.decode(bytes.subarray(RAPIER_TRANSPORT_PREFIX, RAPIER_TRANSPORT_PREFIX + length))); } catch (_) { return refuse('malformed'); }
		return checkHead(head, current) || accept(head, bytes.subarray(RAPIER_TRANSPORT_PREFIX + length), 'binary');
	}
	if (typeof data !== 'string') return refuse('malformed');
	let head;
	try { head = JSON.parse(data); } catch (_) { return refuse('malformed'); }
	const refused = checkHead(head, current);
	if (refused) return refused;
	if (typeof head.bytes === 'string') {
		let payload;
		try { payload = base64Decode(head.bytes); } catch (_) { return refuse('malformed', head); }
		return accept(head, payload, 'base64');
	}
	if (head.payload != null && typeof head.payload !== 'string') return refuse('malformed', head);
	return accept(head, head.payload ?? null, 'text');
}

// The ops whose request or reply carries bytes. Every other op stays on the host's control grammar.
export const NATIVE_BYTE_OPS = Object.freeze(['notes.store.read.chunk', 'notes.store.write.chunk', 'notes.store.recording.append', 'transfer.chunk', 'intake.chunk',
	'sync.put.chunk', 'sync.get.chunk', 'shares.read.chunk']);

export function createNativeTransport({host, origin, binary = false, generation = () => null} = {}) {
	nativeTransportOrigin(origin);
	if (typeof host?.postMessage !== 'function') throw new TypeError('the transport needs a host that posts messages');
	const lane = binary ? 'binary' : 'base64';
	// A call bound to its own generation (a document's transfer or delivery) is answered against it.
	const bound = new Map();
	function send(op, {requestId = null, meta = {}, payload = null, generation: own = generation()} = {}) {
		const frame = {op, requestId, generation: own, meta, payload};
		const encoded = encodeFrame(frame, {binary});
		host.postMessage(encoded);
		return Object.freeze({...frame, lane: typeof encoded === 'string' ? (payload != null && typeof payload !== 'string' ? 'base64' : 'text') : 'binary'});
	}
	const receive = (data, {generation: own = generation()} = {}) => decodeFrame(data, {current: own});
	// A call: args.bytes is the payload, the rest is meta. The app answers under the same op and
	// requestId with meta {ok, result} or {ok: false, error, refused?}; reply bytes become result.bytes.
	function request(op, requestId, {bytes = null, ...meta} = {}, {generation: own} = {}) {
		if (own === undefined) return send(op, {requestId, meta, payload: bytes});
		bound.set(String(requestId), own == null ? null : String(own));
		try { return send(op, {requestId, meta, payload: bytes, generation: own}); }
		catch (error) { bound.delete(String(requestId)); throw error; }
	}
	function answer(data) {
		let got = decodeFrame(data);
		const id = got.ok ? got.frame.requestId : got.requestId;
		const own = id != null && bound.has(String(id)) ? bound.get(String(id)) : generation();
		if (id != null) bound.delete(String(id));
		if (got.ok && got.frame.generation != null && own != null && got.frame.generation !== String(own)) got = refuse('generation', got.frame);
		if (!got.ok) return Object.freeze({requestId: got.requestId, ok: false, refused: got.refused, error: 'The native frame was refused: ' + got.refused});
		const {requestId, meta, payload} = got.frame;
		if (meta.ok !== true) return Object.freeze({requestId, ok: false, refused: typeof meta.refused === 'string' ? meta.refused : null,
			error: String(meta.error || (meta.refused ? 'The native frame was refused: ' + meta.refused : 'native operation failed'))});
		const result = meta.result && typeof meta.result === 'object' && !Array.isArray(meta.result) ? {...meta.result} : {};
		if (payload instanceof Uint8Array) result.bytes = payload;
		return Object.freeze({requestId, ok: true, result});
	}
	return Object.freeze({send, receive, request, answer, connected: () => Object.freeze({v: RAPIER_TRANSPORT_VERSION, origin, lane})});
}
