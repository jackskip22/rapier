// SPDX-License-Identifier: AGPL-3.0-only
import * as M from './model.mjs';
import * as H from './history.mjs';
import {buildSearchIndex, search, confirmSearch} from './search.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {enforceWill, minimalSplice} from '../agent/kernel.mjs';

const decode = bytes => bytes == null ? null : new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
const fail = code => Object.assign(new Error(code), {code, notesMutationStarted: false});
const refusal = error => ({refused: error?.name === 'AbortError' ? 'cancelled' : error?.code === 'notes_document_law' ? 'document_law' :
	String(error?.code || '').startsWith('notes_') ? error.code : error?.code === 'changed' ? 'notes_changed' : 'notes_folder_unreadable'});
const canonicalOf = ({author, transport, principal, requestId, turn_id, label}, operation) => ({author, transport, principal,
	requestId, turn_id, ...(label !== undefined ? {label} : {}), ...(operation ? {operation} : {})});
const sourceToken = (id, act) => 'notes-source:' + id + ':' + sha256(act);
const sourceAct = (id, act) => act && ({...act, id: sourceToken(id, act.id),
	...(act.reverses ? {reverses: act.reverses.map(value => sourceToken(id, value))} : {})});
const sourceSelector = value => /^notes-source:([A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]{0,15}):([a-f0-9]{64})$/.exec(value || '');

export function createNotesAgentHost({folder, store = folder?.store, refs = new Map(), readReceipts = new Map(), guard = () => {}} = {}) {
	if (!folder?.owner || !store?.read || !(refs instanceof Map) || !(readReceipts instanceof Map)) throw new TypeError('notes_owner_unavailable');
	const active = request => { request.signal?.throwIfAborted(); guard(); request.guard?.(); request.signal?.throwIfAborted(); };
	const indexOf = async request => { active(request); const snapshot = await folder.read(); active(request); return snapshot.index; };
	const refFor = (file, index, answered) => {
		const id = index.notes[file]?.id; if (!id) return null;
		for (const [ref, held] of refs) {
			if (held.folder !== folder || held.ownerEpoch !== folder.owner.incarnation) { refs.delete(ref); continue; }
			if (held.id === id) { answered?.add(ref); return ref; }
		}
		const ref = 'note_' + crypto.randomUUID();
		refs.set(ref, {id, folder, ownerEpoch: folder.owner.incarnation});
		answered?.add(ref);
		for (const old of refs.keys()) { if (refs.size <= 1024) break; if (!answered?.has(old)) refs.delete(old); }
		return ref;
	};
	const resolve = (ref, index) => {
		const held = refs.get(ref);
		if (!held || held.folder !== folder || held.ownerEpoch !== folder.owner.incarnation) return null;
		const file = Object.keys(index.notes).find(name => index.notes[name].id === held.id);
		return file ? {file, id: held.id, entry: index.notes[file]} : null;
	};
	const authorAvailable = request => request.author?.kind === 'agent' && typeof request.author.id === 'string' && request.author.id;
	const sourceGuard = (before, after, metadata) => {
		if (enforceWill(before, after, [minimalSplice(before, after)], {docKind: metadata?.docKind || 'markdown'})) throw fail('notes_document_law');
	};
	const historyOf = async (entry, request) => {
		const manifest = H.parseManifest(await store.read('history/' + H.manifestName(entry.id)), {noteId: entry.id, now: Date.now()});
		active(request); return manifest;
	};
	return {
		notesReadReceipts: readReceipts,
		async notesFind(request = {}) {
			try {
				const {query = ''} = request, index = await indexOf(request), rows = [], answered = new Set();
				for (const [file, entry] of Object.entries(index.notes)) {
					if (entry.trashed && !query) continue;
					let text; try { text = decode(await store.read(file)); } catch (error) { if (!(error instanceof TypeError)) throw error; text = null; }
					active(request);
					if (text === null) continue;
					if (query) {
						const texts = new Map([[file, text]]), built = buildSearchIndex(texts, index);
						const found = confirmSearch(search(built, query, {limit: 1}), texts);
						if (found.confirm.length) return {refused: 'notes_search_incomplete'};
						if (!found.results.length) continue;
					}
					const card = M.projectCard(file, text);
					rows.push({file, note_ref: refFor(file, index, answered), title: card.title || '', section: M.sectionOf(entry, index.sections),
						skill: entry.skill === true, ...(Number.isFinite(entry.modified) ? {modified: entry.modified} : {})});
				}
				active(request); return rows;
			} catch (error) { return refusal(error); }
		},
		async notesRead(request = {}) {
			try {
				const {note_ref, version} = request, index = await indexOf(request), selected = resolve(note_ref, index);
				if (!selected) return {refused: 'notes_reference_invalid'};
				const {file, id, entry} = selected;
				if (version !== undefined) {
					const manifest = await historyOf(entry, request);
					if (!manifest.versions.some(row => row.id === version)) return null;
					const held = await H.materialize(manifest, version, path => store.read('history/' + path));
					active(request); return {file, note_ref, text: held.text, version};
				}
				const snapshot = await folder.read({bodies: [file]}); active(request);
				if (snapshot.index.notes[file]?.id !== id) return {refused: 'notes_changed'};
				const text = decode(snapshot.bodies.get(file)); if (text === null) return null;
				return {file, note_ref, text, controls: {...M.noteControlsSnapshot(snapshot.index, file, text), ownerEpoch: folder.owner.incarnation},
					section: M.sectionOf(snapshot.index.notes[file], snapshot.index.sections), ...(Number.isFinite(entry.modified) ? {modified: entry.modified} : {})};
			} catch (error) { return refusal(error); }
		},
		async notesWrite(request = {}) {
			let submitted = false;
			try {
				const {text, title = '', target, base, by} = request;
				if (typeof text !== 'string' || !target || !['create', 'note'].includes(target.kind) ||
					Object.keys(target).some(key => !(target.kind === 'create' ? ['kind'] : ['kind', 'note_ref']).includes(key))) return {refused: 'notes_write_invalid'};
				if (!authorAvailable(request)) return {refused: 'notes_author_unavailable'};
				const index = await indexOf(request), selected = target.kind === 'note' ? resolve(target.note_ref, index) : null;
				if (target.kind === 'note' && (!selected || selected.entry.trashed)) return {refused: 'notes_target_missing'};
				const options = {signal: request.signal, guard: () => active(request), canonical: canonicalOf(request, 'notes.write'), sourceGuard};
				let saved;
				if (selected) {
					if (!base) return {refused: 'notes_not_read'};
					await folder.readCanonical({file: selected.file, id: selected.id}); active(request);
					submitted = true;
					saved = await folder.save({file: selected.file, id: selected.id, expectedDigest: [base], text}, options);
				} else {
					const agent = M.cleanAgent({by, at: Date.now()}); if (!agent) return {refused: 'notes_write_invalid'};
					const body = title && !/^#\s/.test(text) ? '# ' + title + '\n\n' + text : text;
					const key = request.requestId ? sha256(JSON.stringify([request.principal || '', request.transport || 'platform', request.requestId])) : undefined;
					submitted = true; saved = await folder.create(body, title, {agent}, key, options);
				}
				return {file: saved.file, note_ref: refFor(saved.file, saved.index), applied: true, original_changed: !!selected && !saved.unchanged,
					created: !selected, saved: saved.text, act: sourceAct(saved.id, saved.act)};
			} catch (error) { return submitted && error?.notesMutationStarted !== false ? {outcome: 'uncertain', reason: 'notes_write_unconfirmed'} : refusal(error); }
		},
		async notesHistory(request = {}) {
			try {
				const index = await indexOf(request), selected = resolve(request.note_ref, index);
				if (!selected) return {refused: 'notes_reference_invalid'};
				const manifest = await historyOf(selected.entry, request);
				return {file: selected.file, note_ref: request.note_ref, found: true,
					versions: H.versionsOf(manifest, selected.file).reverse().map(row => ({version: row.id, time: row.time, reason: row.reason, size: row.size, current: row.id === manifest.current})),
					tidied: manifest.thinned.reduce((sum, batch) => sum + batch.removes.length, 0), tidiedAt: manifest.thinned.at(-1)?.time ?? null};
			} catch (error) { return refusal(error); }
		},
		async notesSet(request = {}) {
			let submitted = false;
			try {
				const fields = Object.fromEntries(M.NOTE_CONTROL_FIELDS.filter(key => Object.hasOwn(request, key)).map(key => [key, request[key]]));
				if (Object.hasOwn(fields, 'reminder')) return {refused: 'notes_reminder_app_only'};
				if (!authorAvailable(request)) return {refused: 'notes_author_unavailable'};
				const index = await indexOf(request), selected = resolve(request.note_ref, index);
				if (!selected) return {refused: 'notes_reference_invalid'};
				submitted = true;
				const saved = await folder.controls({file: selected.file, id: selected.id, fields, expected: request.expected},
					{signal: request.signal, app: false, guard: () => active(request), canonical: canonicalOf(request), sourceGuard});
				return {file: saved.file, note_ref: request.note_ref, changed: saved.changed, previous: saved.previous, act: saved.act,
					replayed: saved.replayed, controls: saved.controls, revision: sha256(saved.text)};
			} catch (error) { return submitted && error?.notesMutationStarted !== false ? {outcome: 'uncertain', reason: 'notes_set_unconfirmed'} : refusal(error); }
		},
		async notesUndo(request = {}) {
			let submitted = false;
			try {
				const match = /^notes-controls:([A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*):[0-9a-f-]{36}$/.exec(request.act || '');
				if (!match) return {refused: 'notes_act_unavailable'};
				if (!authorAvailable(request)) return {refused: 'notes_author_unavailable'};
				if (request.expected?.ownerEpoch !== folder.owner.incarnation) return {refused: 'notes_read_required'};
				const index = await indexOf(request), selected = resolve(request.note_ref, index);
				if (!selected || selected.id !== match[1] || request.expected.id !== selected.id) return {refused: 'notes_reference_invalid'};
				const inverseGuard = target => { active(request); if (Object.hasOwn(target.groups, 'reminder')) throw fail('notes_reminder_app_only'); };
				submitted = true;
				const saved = await folder.controlsUndo({file: selected.file, id: selected.id, undo: request.act, expected: request.expected},
					{signal: request.signal, guard: () => active(request), canonical: canonicalOf(request), sourceGuard,
						sourceInverseGuard: () => active(request), inverseGuard});
				return {file: saved.file, note_ref: refFor(saved.file, saved.index), changed: saved.changed, previous: saved.previous,
					act: saved.act, replayed: saved.replayed, revision: sha256(saved.text)};
			} catch (error) { return submitted && error?.notesMutationStarted !== false ? {outcome: 'uncertain', reason: 'notes_undo_unconfirmed'} : refusal(error); }
		},
		async notesSourceUndo(request = {}) {
			let submitted = false;
			try {
				const match = sourceSelector(request.act); if (!match || !M.validNoteId(match[1])) return {refused: 'notes_act_unavailable'};
				if (!authorAvailable(request)) return {refused: 'notes_author_unavailable'};
				const index = await indexOf(request), file = Object.keys(index.notes).find(name => index.notes[name].id === match[1]);
				if (!file) return {refused: 'notes_target_missing'};
				const opened = await folder.readCanonical({file, id: match[1]}); active(request);
				const selected = opened.ledger.records.filter(row => sha256(row.transaction.id) === match[2]);
				if (selected.length !== 1) return {refused: 'notes_act_unavailable'};
				const tx = selected[0].transaction;
				if (tx.actor.kind !== 'agent' || tx.actor.id !== request.author.id || tx.transport !== (request.transport === 'webmcp' ? 'webmcp' : 'platform') ||
					!['notes.write', 'notes.undo'].includes(tx.operation)) return {refused: 'notes_act_not_owned'};
				submitted = true;
				const saved = await folder.save({file, id: match[1], expectedDigest: opened.digest, expectedLedger: opened.ledger.sha256, undo: [tx.id]},
					{signal: request.signal, guard: () => active(request), canonical: canonicalOf(request, 'notes.undo'), sourceGuard});
				return {file: saved.file, note_ref: refFor(saved.file, saved.index), revision: sha256(saved.text), act: sourceAct(saved.id, saved.act),
					applied: !saved.unchanged, replayed: saved.replayed};
			} catch (error) { return submitted && error?.notesMutationStarted !== false ? {outcome: 'uncertain', reason: 'notes_undo_unconfirmed'} : refusal(error); }
		},
	};
}
