#!/usr/bin/env node
// Open one sealed object from a person's own bucket. Node's crypto only; the vault owner still
// decodes the header and the recovery code. The page never asks for a code, and this process
// never contacts the bucket: the two files are already on the machine.
import {createDecipheriv} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as V from '../notes/vault.mjs';
import {OBJECT_AAD, OBJECT_PREFIX} from '../notes/sync.mjs';

export function vaultPageFacts() {
	return {
		KDF_NAME: V.KDF_NAME,
		KDF_ITERATIONS: V.KDF_ITERATIONS,
		SALT_BYTES: V.SALT_BYTES,
		VDK_BYTES: V.VDK_BYTES,
		NONCE_BYTES: V.NONCE_BYTES,
		TAG_BYTES: V.TAG_BYTES,
		SEAL_VERSION: V.SEAL_VERSION,
		VAULT_VERSION: V.VAULT_VERSION,
		HEADER_KEY: V.HEADER_KEY,
		VERIFIER_PLAIN: V.VERIFIER_PLAIN,
		RECOVERY_LENGTH: V.RECOVERY_LENGTH,
		OBJECT_AAD,
		OBJECT_PREFIX,
		HEADER_PREFIX: V.HEADER_PREFIX,
	};
}

export function fillVaultPage(template) {
	const facts = vaultPageFacts();
	return String(template).replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, key) => {
		if (!Object.prototype.hasOwnProperty.call(facts, key)) throw new Error('unknown vault page token ' + key);
		return String(facts[key]);
	});
}

function refuse() {
	process.stderr.write('the recovery code was refused\n');
	process.exit(1);
}

function openSeal(vdk, aad, sealed) {
	const bytes = Buffer.from(sealed);
	if (bytes.length < 1 + V.NONCE_BYTES + V.TAG_BYTES || bytes[0] !== V.SEAL_VERSION) refuse();
	const nonce = bytes.subarray(1, 1 + V.NONCE_BYTES);
	const body = bytes.subarray(1 + V.NONCE_BYTES);
	const tag = body.subarray(body.length - V.TAG_BYTES);
	const ciphertext = body.subarray(0, body.length - V.TAG_BYTES);
	try {
		const decipher = createDecipheriv('aes-256-gcm', Buffer.from(vdk), nonce);
		decipher.setAAD(Buffer.from(aad, 'utf8'));
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	} catch (_) { refuse(); }
}

function main() {
	const [headerPath, objectPath, code] = process.argv.slice(2);
	if (!headerPath || !objectPath || !code || process.argv.length !== 5) {
		process.stderr.write('usage: node tools/check-vault.mjs <header> <object> <recovery-code>\n');
		process.exit(1);
	}
	let header, vdk;
	try {
		header = V.decodeHeader(readFileSync(headerPath));
		vdk = V.decodeRecovery(code);
	} catch (_) { refuse(); }
	const verifier = openSeal(vdk, V.HEADER_KEY, header.verifier);
	if (verifier.toString('utf8') !== V.VERIFIER_PLAIN) refuse();
	process.stdout.write(openSeal(vdk, OBJECT_AAD, readFileSync(objectPath)));
}

if (process.argv[1] && process.argv[1].endsWith('check-vault.mjs')) main();
