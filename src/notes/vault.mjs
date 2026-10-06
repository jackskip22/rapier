import {scrypt} from './scrypt.mjs';
// notes/vault.mjs: the keys and the seal. Pure (WebCrypto, crypto.subtle); the one owner of these bytes.
// - A random 256-bit VDK. The passphrase derives a wrapping key (scrypt N=32768, r=8, p=1, 16-byte salt); the VDK is wrapped with AES-256-GCM.
// A new passphrase re-wraps, never re-seals. The fixed 32 MiB ROMix workspace and cost parameters are public; no WASM is needed.
//   The product offers no re-wrap: sync never deletes, so the old header would stay readable, and a device code carries the header itself. A
// passphrase change is a new vault.
// - Every object: version byte, fresh 12-byte nonce, AES-256-GCM, domain/path as AAD. One tampered byte is refused; nothing partially
// decrypts.
// - keys/<header digest> is not sealed: format, KDF parameters, salt, wrapped VDK, verifier. Nothing secret.
// - The recovery code IS the VDK in a typable alphabet.
// - The passphrase is never trimmed or case-folded; unlock tries it as typed, then NFC, then NFD. Create and re-wrap use it as typed.

export const VAULT_VERSION = 1;
export const SEAL_VERSION = 1;
export const KDF_NAME = 'scrypt';
export const KDF_N = 32768;
export const KDF_R = 8;
export const KDF_P = 1;
export const HEADER_MAX_BYTES = 4096;
export const SALT_BYTES = 16;
export const VDK_BYTES = 32;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const HEADER_KEY = 'vault.json';
export const HEADER_PREFIX = 'keys/';
export const VERIFIER_PLAIN = 'rapier-notes-vault-v1';

// Crockford Base32 (no I/L/O/U): 52 symbols (256 bits plus four zero bits) in groups of four. Decode maps O to 0, I/L to 1. No checksum: the verifier refuses.
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_LENGTH = 52;
export const RECOVERY_GROUP = 4;

const te = new TextEncoder();
const td = new TextDecoder('utf-8', {fatal: true});
const subtle = () => {
	const s = globalThis.crypto && globalThis.crypto.subtle;
	if (!s) throw Object.assign(new Error('WebCrypto is required for the vault'), {code: 'crypto'});
	return s;
};
function asBytes(value) {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	refuse('invalid', 'vault input must be bytes, not a coerced value');
}
function cost(value) {
	if (value.n !== KDF_N || value.r !== KDF_R || value.p !== KDF_P) refuse('kdf', 'unsupported scrypt work parameters; the vault was not opened');
}
function passphraseText(value) {
	if (typeof value !== 'string' || value.length === 0) refuse('invalid', 'a nonempty passphrase is required');
	return value; // Deliberately no trimming or case folding; the forms an unlock also tries are below.
}
// The public wrapped header permits offline guesses, even by a compromised transport. Enforce
// the creation policy here as well as in sessions; low-level header callers have the same risk.
export function validateCreationPassphrase(value) {
	if (typeof value !== 'string' || [...value].length < 16) refuse('passphrase', 'use at least 16 characters for your sync passphrase.');
	return value;
}
// The passphrase as typed, then its NFC and NFD forms when they differ from it: the forms an
// unlock tries, in that order, each a key derivation of its own.
function passphraseForms(value) {
	const forms = [value];
	for (const form of [value.normalize('NFC'), value.normalize('NFD')]) if (!forms.includes(form)) forms.push(form);
	return forms;
}
function refuse(code, message) { throw Object.assign(new Error(message), {code}); }
function requireBytes(value, n, what) {
	const b = asBytes(value);
	if (b.length !== n) refuse('invalid', what + ' must be ' + n + ' bytes');
	return b;
}

export function generateVdk() { return globalThis.crypto.getRandomValues(new Uint8Array(VDK_BYTES)); }
export function generateSalt() { return globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES)); }

export function encodeRecovery(vdk) {
	const bytes = requireBytes(vdk, VDK_BYTES, 'a recovery code');
	let bits = 0, acc = 0, out = '';
	for (let i = 0; i < bytes.length; i++) {
		acc = (acc << 8) | bytes[i];
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			out += RECOVERY_ALPHABET[(acc >> bits) & 31];
		}
	}
	if (bits) out += RECOVERY_ALPHABET[(acc << (5 - bits)) & 31];
	if (out.length !== RECOVERY_LENGTH) refuse('invalid', 'recovery encoding length');
	const groups = [];
	for (let i = 0; i < out.length; i += RECOVERY_GROUP) groups.push(out.slice(i, i + RECOVERY_GROUP));
	return groups.join('-');
}

export function decodeRecovery(code) {
	if (typeof code !== 'string' || code.length > 256 || !code.trim()) refuse('invalid', 'the recovery code is empty');
	let raw = '';
	// Typographic dashes and non-breaking spaces are separators too.
	for (const ch of code.toUpperCase()) {
		if (/[\p{Pd}\p{Zs}\s]/u.test(ch)) continue;
		const mapped = ch === 'O' ? '0' : (ch === 'I' || ch === 'L' ? '1' : ch);
		if (!RECOVERY_ALPHABET.includes(mapped)) refuse('invalid', 'the recovery code is not in the alphabet');
		raw += mapped;
	}
	if (raw.length !== RECOVERY_LENGTH) refuse('invalid', 'the recovery code is the wrong length');
	const out = new Uint8Array(VDK_BYTES);
	let bits = 0, acc = 0, at = 0;
	for (let i = 0; i < raw.length; i++) {
		acc = (acc << 5) | RECOVERY_ALPHABET.indexOf(raw[i]);
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			if (at < VDK_BYTES) out[at++] = (acc >> bits) & 255;
		}
	}
	if (at !== VDK_BYTES || bits !== 4 || (acc & 15) !== 0) refuse('invalid', 'the recovery code has nonzero padding or the wrong length');
	return out;
}

function bytesToB64(bytes) {
	const b = asBytes(bytes);
	let s = '';
	for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
	return btoa(s);
}
function b64ToBytes(text) {
	if (typeof text !== 'string' || !text || text.length > HEADER_MAX_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) refuse('corrupt', 'a vault header field is not canonical base64');
	let bin;
	try { bin = atob(text); } catch (_) { refuse('corrupt', 'a vault header field is not base64'); }
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	if (bytesToB64(out) !== text) refuse('corrupt', 'a vault header field has nonzero base64 padding');
	return out;
}

async function aesKey(raw, usage) {
	return subtle().importKey('raw', asBytes(raw), {name: 'AES-GCM'}, false, usage);
}
export async function deriveWrappingKey(passphrase, salt) {
	passphraseText(passphrase);
	return scrypt(passphrase, requireBytes(salt, SALT_BYTES, 'salt'), {N: KDF_N, r: KDF_R});
}

async function aesGcmEncrypt(rawKey, nonce, plain, aad) {
	const key = await aesKey(rawKey, ['encrypt']);
	const params = {name: 'AES-GCM', iv: nonce, tagLength: 128};
	if (aad) params.additionalData = aad;
	return new Uint8Array(await subtle().encrypt(params, key, asBytes(plain)));
}
async function aesGcmDecrypt(rawKey, nonce, cipher, aad) {
	const key = await aesKey(rawKey, ['decrypt']);
	const params = {name: 'AES-GCM', iv: nonce, tagLength: 128};
	if (aad) params.additionalData = aad;
	try {
		return new Uint8Array(await subtle().decrypt(params, key, asBytes(cipher)));
	} catch (_) {
		refuse('tamper', 'the sealed bytes were refused');
	}
}

// The nonce is always drawn here: a nonce reused under one wrapping key would break AES-GCM.
export async function wrapVdk(wrappingKey, vdk) {
	const kek = requireBytes(wrappingKey, VDK_BYTES, 'the wrapping key');
	const key = requireBytes(vdk, VDK_BYTES, 'the vault key');
	const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
	const ct = await aesGcmEncrypt(kek, nonce, key, te.encode('vdk'));
	const out = new Uint8Array(NONCE_BYTES + ct.length);
	out.set(nonce, 0);
	out.set(ct, NONCE_BYTES);
	return out;
}
export async function unwrapVdk(wrappingKey, wrapped) {
	const kek = requireBytes(wrappingKey, VDK_BYTES, 'the wrapping key');
	const bytes = asBytes(wrapped);
	if (bytes.length !== NONCE_BYTES + VDK_BYTES + TAG_BYTES) refuse('corrupt', 'the wrapped key is the wrong length');
	return aesGcmDecrypt(kek, bytes.subarray(0, NONCE_BYTES), bytes.subarray(NONCE_BYTES), te.encode('vdk'));
}

// version || nonce || ciphertext+tag. AAD is the remote path, UTF-8. Version 1 is the only one.
export async function seal(vdk, key, bytes) {
	if (typeof key !== 'string' || !key) refuse('invalid', 'a sealed object names its remote path');
	const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
	const ct = await aesGcmEncrypt(requireBytes(vdk, VDK_BYTES, 'the vault key'), nonce, asBytes(bytes), te.encode(key));
	const out = new Uint8Array(1 + NONCE_BYTES + ct.length);
	out[0] = SEAL_VERSION;
	out.set(nonce, 1);
	out.set(ct, 1 + NONCE_BYTES);
	return out;
}
export async function open(vdk, key, sealed) {
	if (typeof key !== 'string' || !key) refuse('invalid', 'a sealed object names its remote path');
	const bytes = asBytes(sealed);
	if (bytes.length < 1 + NONCE_BYTES + TAG_BYTES) refuse('tamper', 'the sealed bytes were refused');
	if (bytes[0] !== SEAL_VERSION) refuse('tamper', 'the sealed bytes were refused');
	return aesGcmDecrypt(requireBytes(vdk, VDK_BYTES, 'the vault key'), bytes.subarray(1, 1 + NONCE_BYTES), bytes.subarray(1 + NONCE_BYTES), te.encode(key));
}

// Canonical header bytes: one format, bounded cost parameters, no whitespace.
export function encodeHeader(header) {
	if (!header || typeof header !== 'object') refuse('corrupt', 'the vault header is missing');
	const body = {
		v: header.v,
		kdf: header.kdf,
		n: header.n, r: header.r, p: header.p,
		salt: header.salt,
		wrapped: header.wrapped,
		verifier: header.verifier,
	};
	return te.encode(JSON.stringify(body));
}
export function decodeHeader(bytes) {
	if (asBytes(bytes).length > HEADER_MAX_BYTES) refuse('corrupt', 'the vault header is too large');
	let raw;
	try { raw = JSON.parse(td.decode(asBytes(bytes))); }
	catch (_) { refuse('corrupt', 'the vault header is not readable JSON'); }
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) refuse('corrupt', 'the vault header does not have the shape of one');
	const version = raw.v;
	if (version !== VAULT_VERSION) refuse(version > VAULT_VERSION ? 'newer' : 'corrupt', 'the vault header names no readable version');
	if (raw.kdf !== KDF_NAME) refuse('corrupt', 'the vault header names no readable KDF');
	cost(raw);
	if (typeof raw.salt !== 'string' || typeof raw.wrapped !== 'string' || typeof raw.verifier !== 'string') refuse('corrupt', 'the vault header is missing a field');
	const salt = b64ToBytes(raw.salt);
	if (salt.length !== SALT_BYTES) refuse('corrupt', 'the vault header salt is the wrong length');
	const wrapped = b64ToBytes(raw.wrapped);
	if (wrapped.length !== NONCE_BYTES + VDK_BYTES + TAG_BYTES) refuse('corrupt', 'the wrapped key is the wrong length');
	const verifier = b64ToBytes(raw.verifier);
	if (verifier.length !== 1 + NONCE_BYTES + TAG_BYTES + te.encode(VERIFIER_PLAIN).length) refuse('corrupt', 'the vault header verifier is the wrong length');
	return {v: VAULT_VERSION, kdf: KDF_NAME, n: raw.n, r: raw.r, p: raw.p, salt, wrapped, verifier, saltB64: raw.salt, wrappedB64: raw.wrapped, verifierB64: raw.verifier};
}

// Public callers may use wire bytes, the emitted JSON header, or a previously decoded header.
// Every path revalidates; a caller-created object cannot bypass the work bound.
function readHeader(value) {
	if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return decodeHeader(value);
	if (!value || typeof value !== 'object') refuse('corrupt', 'the vault header is missing');
	const encoded = value.salt instanceof Uint8Array ? {
		v: value.v, kdf: value.kdf, n: value.n, r: value.r, p: value.p, salt: bytesToB64(value.salt),
		wrapped: bytesToB64(value.wrapped), verifier: bytesToB64(value.verifier),
	} : value;
	return decodeHeader(encodeHeader(encoded));
}

async function makeVerifier(vdk) { return seal(vdk, HEADER_KEY, te.encode(VERIFIER_PLAIN)); }
async function checkVerifier(vdk, verifier) {
	const plain = await open(vdk, HEADER_KEY, verifier);
	if (td.decode(plain) !== VERIFIER_PLAIN) refuse('tamper', 'the vault verifier was refused');
}

export async function createVault(passphrase, options = {}) {
	validateCreationPassphrase(passphrase);
	const vdk = options.vdk ? requireBytes(options.vdk, VDK_BYTES, 'the vault key') : generateVdk();
	const salt = options.salt ? requireBytes(options.salt, SALT_BYTES, 'salt') : generateSalt();
	const kek = await deriveWrappingKey(passphrase, salt);
	let wrapped;
	try { wrapped = await wrapVdk(kek, vdk); }
	finally { kek.fill(0); }
	const verifier = await makeVerifier(vdk);
	const header = {
		v: VAULT_VERSION,
		kdf: KDF_NAME,
		n: KDF_N, r: KDF_R, p: KDF_P,
		salt: bytesToB64(salt),
		wrapped: bytesToB64(wrapped),
		verifier: bytesToB64(verifier),
	};
	return {vdk, salt, header, headerBytes: encodeHeader(header), recovery: encodeRecovery(vdk), vaultId: await vaultId(vdk)};
}

export async function unlockVault(headerBytes, passphrase) {
	const header = readHeader(headerBytes);
	passphraseText(passphrase);
	const forms = passphraseForms(passphrase);
	for (let i = 0; i < forms.length; i++) {
		const kek = await deriveWrappingKey(forms[i], header.salt);
		let vdk;
		try { vdk = await unwrapVdk(kek, header.wrapped); }
		catch (error) {
			if (!error || error.code !== 'tamper') throw error;
			if (i === forms.length - 1) refuse('passphrase', 'the passphrase was refused');
			continue;
		}
		finally { kek.fill(0); }
		await checkVerifier(vdk, header.verifier);
		return vdk;
	}
	refuse('passphrase', 'the passphrase was refused');
}

export async function unlockVaultWithRecovery(headerBytes, code) {
	const header = readHeader(headerBytes);
	const vdk = decodeRecovery(code);
	try { await checkVerifier(vdk, header.verifier); }
	catch (error) { if (error && error.code === 'tamper') refuse('recovery', 'the recovery code was refused'); throw error; }
	return vdk;
}

export async function rewrapVault(headerBytes, vdk, passphrase, options = {}) {
	const header = readHeader(headerBytes);
	requireBytes(vdk, VDK_BYTES, 'the vault key');
	validateCreationPassphrase(passphrase);
	await checkVerifier(vdk, header.verifier);
	const salt = options.salt ? requireBytes(options.salt, SALT_BYTES, 'salt') : generateSalt();
	const kek = await deriveWrappingKey(passphrase, salt);
	let wrapped;
	try { wrapped = await wrapVdk(kek, vdk); }
	finally { kek.fill(0); }
	const next = {
		v: VAULT_VERSION,
		kdf: KDF_NAME,
		n: KDF_N, r: KDF_R, p: KDF_P,
		salt: bytesToB64(salt),
		wrapped: bytesToB64(wrapped),
		verifier: header.verifierB64 || bytesToB64(header.verifier),
	};
	return {header: next, headerBytes: encodeHeader(next), salt};
}

export async function headerDigest(bytes) {
	const hash = await subtle().digest('SHA-256', asBytes(bytes));
	const out = new Uint8Array(hash);
	let hex = '';
	for (let i = 0; i < out.length; i++) hex += out[i].toString(16).padStart(2, '0');
	return hex;
}

// An opaque, domain-separated vault locator, never a filename or an account credential.
// Knowing this 128-bit fingerprint does not help guess a random 256-bit VDK.
export async function vaultId(vdk) {
	const domain = te.encode('rapier-notes-vault-id-v1\0');
	const bytes = new Uint8Array(domain.length + VDK_BYTES);
	bytes.set(domain); bytes.set(requireBytes(vdk, VDK_BYTES, 'the vault key'), domain.length);
	try { return (await headerDigest(bytes)).slice(0, 32); } finally { bytes.fill(0); }
}
export async function headerObject(headerBytes) {
	decodeHeader(headerBytes);
	const bytes = asBytes(headerBytes).slice();
	return {key: HEADER_PREFIX + await headerDigest(bytes), bytes};
}
