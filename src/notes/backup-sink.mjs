// SPDX-License-Identifier: AGPL-3.0-only
import {sha256State} from './integrity.mjs';
import {verifyBackupFile} from './backup-lifecycle.mjs';
import {ZIP_READ_MAX_BYTES} from './zip.mjs';
import {backupLimitError} from './backup-folder.mjs';
import {attachmentSizeWords} from './size-words.mjs';

// Closing certifies PRIVATE staging only. Export success is a different owner and outcome.
export function createBackupSink(target) {
	for (const method of ['write', 'close', 'abort', 'file', 'remove']) if (typeof target?.[method] !== 'function') throw new TypeError('backup staging needs ' + method);
	let state = 'writing', bytes = 0, busy = false, closed = false, digest = '', active = null, aborting = null;
	const hash = sha256State();
	const exclusive = (wanted, job) => {
		if (state !== wanted || busy || aborting) return Promise.reject(new Error('backup staging is not available for this operation: ' + state));
		busy = true;
		active = (async () => { try { return await job(); } finally { busy = false; } })();
		return active;
	};
	return {
		get state() { return state; }, get bytes() { return bytes; }, get digest() { return digest; },
		write(chunk) { return exclusive('writing', async () => { if (!(chunk instanceof Uint8Array)) throw new TypeError('backup staging needs bytes'); hash.update(chunk); await target.write(chunk); bytes += chunk.length; }); },
		endMember(size) { return exclusive('writing', async () => target.endMember?.(size)); },
		close({onProgress} = {}) { return exclusive('writing', async () => { await target.close(); closed = true; digest = hash.finish(); const file = await verifyBackupFile(await target.file(), {bytes, digest}, {onProgress}); state = 'sealed'; return file; }); },
		abort(reason) {
			if (aborting) return aborting;
			if (state === 'aborted') return Promise.resolve();
			if (state !== 'writing') return Promise.reject(new Error('a complete backup is retained, never removed by failure cleanup'));
			aborting = (async () => {
				await active?.catch(() => {});
				if (state === 'sealed') { aborting = null; throw new Error('a complete backup is retained, never removed by failure cleanup'); }
				state = 'aborted'; const errors = [];
				try { if (!closed) await target.abort(reason); } catch (error) { errors.push(error); }
				try { await target.remove(); } catch (error) { state = 'incomplete'; errors.push(error); }
				if (errors.length) throw new AggregateError(errors, 'incomplete private backup staging cleanup reported an error');
			})();
			return aborting;
		},
		file({onProgress} = {}) { return exclusive('sealed', async () => verifyBackupFile(await target.file(), {bytes, digest}, {onProgress})); },
		async discard() {
			return exclusive('sealed', async () => { await target.remove(); state = 'discarded'; });
		}
	};
}

// The browser owns each part as soon as write returns; no archive-sized typed-array list
// stays on the JS heap. This does not promise disk spill or survival after the page closes.
export function memoryBackupTarget({maxBytes = ZIP_READ_MAX_BYTES, makeFile, names = [], limitError = reason => backupLimitError(names, reason)} = {}) {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > ZIP_READ_MAX_BYTES || typeof makeFile !== 'function') throw new TypeError('backup needs a bounded file factory');
	let parts = [], bytes = 0, file = null;
	// A size in the words a person thinks in (attachmentSizeWords), never a count of bytes.
	const refused = (size, cause) => Object.assign(limitError('need ' + attachmentSizeWords(size)
		+ ' of browser storage, more than this browser could hold'), {cause});
	return {
		async write(chunk) {
			const size = bytes + chunk.length;
			if (size > maxBytes) throw limitError('need ' + attachmentSizeWords(size) + ', more than one backup file can hold (' + attachmentSizeWords(maxBytes) + ')');
			let part;
			try { part = new globalThis.Blob([chunk]); } catch (error) { throw refused(size, error); }
			parts.push(part); bytes = size;
		},
		async close() {
			try { file = makeFile(parts); } catch (error) { throw refused(bytes, error); }
			parts = [];
		},
		async abort() { parts = []; file = null; },
		async file() { if (!file) throw new Error('backup is not complete'); return file; },
		async remove() { parts = []; file = null; }
	};
}
