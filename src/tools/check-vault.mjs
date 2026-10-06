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
		KDF_N: V.KDF_N,
		KDF_R: V.KDF_R,
		KDF_P: V.KDF_P,
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

// The recovery code is the vault key. It is read from standard input, never from an argument: a
// command line stays in the shell's history and in every listing of running processes.
const CODE_INPUT_MAX = 4096;
function readTyped(input) {
	return new Promise((resolve, reject) => {
		let code = '';
		const finish = (value, error) => {
			input.setRawMode(false); input.pause(); input.removeListener('data', take); process.stderr.write('\n');
			if (error) reject(error); else resolve(value);
		};
		const take = chunk => {
			for (const char of chunk) {
				if (char === '\r' || char === '\n' || char === '\u0004') return finish(code);
				if (char === '\u0003') return finish('', new Error('cancelled'));
				if (char === '\u007f' || char === '\b') code = code.slice(0, -1);
				else if (char >= ' ' && code.length < CODE_INPUT_MAX) code += char;
			}
		};
		process.stderr.write('recovery code (nothing shows as you type): ');
		input.setEncoding('utf8'); input.setRawMode(true); input.on('data', take); input.resume();
	});
}
async function readPiped(input) {
	const parts = []; let size = 0;
	for await (const chunk of input) { size += chunk.length; if (size > CODE_INPUT_MAX) refuse(); parts.push(chunk); }
	return Buffer.concat(parts).toString('utf8').split(/\r?\n/)[0];
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length > 2) {
		process.stderr.write('the recovery code is never a command argument: it would stay in your shell history and the process list. Run the command without it, then type the code when asked or pipe it in.\n');
		process.exit(1);
	}
	const [headerPath, objectPath] = args;
	if (!headerPath || !objectPath) {
		process.stderr.write('usage: node tools/check-vault.mjs <header> <object>, then the recovery code on standard input\n');
		process.exit(1);
	}
	let header, vdk;
	try {
		header = V.decodeHeader(readFileSync(headerPath));
		vdk = V.decodeRecovery(process.stdin.isTTY ? await readTyped(process.stdin) : await readPiped(process.stdin));
	} catch (_) { refuse(); }
	const verifier = openSeal(vdk, V.HEADER_KEY, header.verifier);
	if (verifier.toString('utf8') !== V.VERIFIER_PLAIN) refuse();
	process.stdout.write(openSeal(vdk, OBJECT_AAD, readFileSync(objectPath)));
}

if (process.argv[1] && process.argv[1].endsWith('check-vault.mjs')) await main();
