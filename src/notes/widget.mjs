// Home-screen projection and action. No native Markdown writer: the existing folder lease
// reads, admits, journals, publishes and recovers every tick. Nothing here decrypts a note.
import {isNoteFile, projectCard, toggleCheck, cutText, cardSource, cardHead} from './model.mjs';
import {scanLinks} from './links.mjs';
import {exactBytes, sha256} from './integrity.mjs';
import {manifestName, parseManifest, recordVersion, materialize} from './history.mjs';

const fail = (code, message) => Object.assign(new Error(message), {code});
const decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
export const WIDGET_LIMITS = Object.freeze({notes: 100, checks: 24, previewBytes: 4 * 1024 * 1024});

// Every note neither archived nor trashed; narrowing is the caller's `mayRead`.
export function widgetMayRead(index, entry) {
	return !!entry && !entry.trashed && !entry.archived;
}
function actionOf(value) {
	if (!value || !isNoteFile(value.file) || typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*$/.test(value.id)
		|| !/^[0-9a-f]{64}$/.test(value.digest) || !/^[0-9a-f]{64}$/.test(value.after)
		|| value.digest === value.after || !Number.isSafeInteger(value.check) || value.check < 0)
		throw fail('action', 'This checkbox is no longer available. Refresh the widget.');
	return value;
}
function locate(index, id) {
	const found = Object.keys(index.notes).filter(file => index.notes[file].id === id);
	if (found.length !== 1) throw fail('changed', 'This note moved or was removed. Refresh the widget.');
	return found[0];
}
// Launcher words are projected here, not in projectCard: its output is also the search
// byte oracle. Read complete visible lines so a long URL is removed BEFORE any text cut.
// Check/action numbering still comes exclusively from projectCard over the original note.
function widgetBody(text) {
	const {visible, checkable} = cardSource(text), {title, start, lead, at} = cardHead(visible), body = [];
	for (let i = lead >= 0 ? lead : start; i < visible.length && body.length < 2; i++) {
		if (lead >= 0 && title && i >= at && i < start) continue;
		const line = visible[i].trim();
		if (!line || /^\[(?:\\.|[^\]\\])+\]:[ \t]*<?data:/i.test(line)) continue;
		if (checkable && /^[-*]\s+\[( |x|X)\](?:\s+(.*))?$/.test(line)) continue;
		if (/^!\[/.test(line)) { body.push('🖼'); continue; }
		const source = line.replace(/^#{1,6}\s+/, '').replace(/^[-*>]\s+/, '');
		let words = '', end = 0;
		for (const link of scanLinks(source)) {
			if (link.kind !== 'inline' || link.image || link.start < end) continue;
			words += source.slice(end, link.start) + link.text; end = link.end;
		}
		body.push(cutText((words + source.slice(end)).replace(/[*_`~]/g, ''), 280, 280));
	}
	return cutText(body.join('\n'), 360, 360);
}
// A tick is a card edit in the note's own past (docs/notes-history.md, `edit-card`), recorded under the
// lease the tick already holds, in the shell's order: every immutable object first (an existing one is
// verified, never trusted by name), the new event read back, the manifest last. A manifest this cannot
// read is kept as it is (R85b). `once`: a redelivered tap records only if its event is not there yet.
async function recordCardEdit(store, {file, text, entry}, {once = false} = {}) {
	const id = entry?.id;
	if (!id) return false;
	const at = name => 'history/' + name, now = Date.now();
	const manifest = parseManifest(await store.read(at(manifestName(id))), {noteId: id, now}), last = manifest.versions.at(-1);
	const result = await recordVersion(manifest, {file, text, entry, reason: 'edit-card', now});
	if (once && last?.reason === 'edit-card' && last.hash === result.version.hash) return false;
	for (const write of result.writes) {
		if (!write.immutable) continue;
		const held = await store.read(at(write.name));
		if (held == null) await store.write(at(write.name), write.bytes);
		else if (held.length !== write.bytes.length || held.some((b, i) => b !== write.bytes[i])) throw new Error('A retained history object has different bytes.');
	}
	await materialize(result.manifest, result.version.id, name => store.read(at(name)));
	for (const write of result.writes) if (!write.immutable) await store.write(at(write.name), write.bytes);
	return true;
}
export function createWidgetNotes(folder, {mayRead = widgetMayRead, limits = WIDGET_LIMITS} = {}) {
	if (!Number.isSafeInteger(limits.notes) || limits.notes < 1 || limits.notes > WIDGET_LIMITS.notes || !Number.isSafeInteger(limits.checks) || limits.checks < 1 || limits.checks > WIDGET_LIMITS.checks || !Number.isSafeInteger(limits.previewBytes) || limits.previewBytes < 1 || limits.previewBytes > WIDGET_LIMITS.previewBytes) throw new TypeError('Invalid widget projection limits.');
	if (!folder?.owner?.acquire || typeof folder.scope !== 'string') throw new TypeError('A widget needs the existing Notes folder owner.');
	const owned = async run => {
		const lease = await folder.owner.acquire(folder.scope);
		try { return await run(lease); } finally { await lease.release(); }
	};
	const allowed = (index, entry) => widgetMayRead(index, entry) && mayRead(index, entry) === true;
	const snapshot = () => owned(async lease => {
		const fresh = await lease.read();
		const files = fresh.files.filter(file => allowed(fresh.index, fresh.index.notes[file])).sort((a, b) => {
			const x = fresh.index.notes[a], y = fresh.index.notes[b];
			return Number(y.pinned) - Number(x.pinned) || (y.modified || y.created || 0) - (x.modified || x.created || 0) || (a < b ? -1 : a > b ? 1 : 0);
		});
		// Bounded projection: plan rows from stats, fetch bodies in ONE read (per-row reads cost 31 s of 35 on 5,000 notes), recheck each against that read's index.
		const planned = [], wanted = [];
		let previewRemaining = limits.previewBytes;
		for (const file of files.slice(0, limits.notes)) {
			const entry = fresh.index.notes[file];
			const row = {file, id: entry.id, colour: entry.colour, pinned: entry.pinned, title: cutText(file.replace(/\.md$/i, ''), 512, 512), body: '', checks: []};
			const stat = await folder.store.stat?.(file);
			if (!stat || stat.size > previewRemaining) { row.body = 'Open this note to view its content'; planned.push({row}); continue; }
			previewRemaining -= stat.size;
			planned.push({row, entry}); wanted.push(file);
		}
		const read = wanted.length ? await lease.read({bodies: wanted}) : null;
		const notes = [];
		previewRemaining = limits.previewBytes;
		for (const {row, entry} of planned) {
			if (!entry) { notes.push(row); continue; }
			const file = row.file;
			if (!allowed(read.index, read.index.notes[file]) || read.index.notes[file]?.id !== entry.id) continue;
			const bytes = read.bodies.get(file);
			if (!bytes || bytes.length > previewRemaining) { row.body = 'Open this note to view its content'; notes.push(row); continue; }
			previewRemaining -= bytes.length;
			let text;
			try { text = decode(bytes); } catch (_) { row.body = 'This note is not UTF-8 text. Its original bytes are kept.'; notes.push(row); continue; }
			const card = projectCard(file, text, {bodyLines: Infinity, taskDepth: true});
			row.title = cutText(card.title || (card.checks.length ? 'Checklist' : 'Note'), 512, 512);
			row.body = card.needsReview ? 'Open this note to review its changes' : widgetBody(text);
			const digest = await sha256(bytes), pending = card.checks.map((check, n) => ({...check, n})).filter(check => !check.done);
			for (const check of pending.slice(0, limits.checks)) {
				const next = toggleCheck(text, check.n);
				if (next == null) continue;
				row.checks.push({text: (check.depth ? '  ' : '') + cutText(check.text || 'Untitled item', check.depth ? 118 : 120, check.depth ? 118 : 120), action: {file, id: entry.id, check: check.n, digest, after: await sha256(exactBytes(next))}});
			}
			row.remaining = Math.max(0, pending.length - row.checks.length);
			notes.push(row);
		}
		return {schema: 1, generation: fresh.generation, notes, remaining: Math.max(0, files.length - notes.length)};
	});
	const tick = value => owned(async lease => {
		const action = actionOf(value);
		let already = false, file, landed;
		// One read, the transaction's own: find by stable id, refuse a protected note before asking for its body.
		const result = await lease.transact(async ({index, readBodies}) => {
			file = locate(index, action.id);
			if (!allowed(index, index.notes[file])) throw fail('locked', 'This note is not available from the home screen.');
			const bytes = (await readBodies([file])).get(file), actual = await sha256(bytes);
			// A redelivered tap is SET-CHECKED, never TOGGLE. A lost reply after commit must not
			// undo the tick, including after Android has killed and restarted this worker.
			if (actual === action.after) { already = true; landed = {text: decode(bytes), entry: {...index.notes[file]}}; return {index}; }
			if (actual !== action.digest) throw fail('changed', 'This note changed. Its words were kept; refresh the widget.');
			const text = decode(bytes), card = projectCard(file, text, {bodyLines: Infinity});
			if (!card.checks[action.check] || card.checks[action.check].done) throw fail('changed', 'This checkbox changed. Refresh the widget.');
			const next = toggleCheck(text, action.check);
			if (next == null || await sha256(exactBytes(next)) !== action.after) throw fail('changed', 'This checkbox changed. Nothing was written.');
			index.notes[file].revision = 'sha256:' + action.after;
			index.notes[file].modified = Date.now();
			landed = {text: next, entry: {...index.notes[file]}};
			return {kind: 'widget-tick', index, writes: [{file, bytes: exactBytes(next), expectedDigest: action.digest}]};
		}, {brief: true});
		if (result.dropped?.includes(file)) throw fail('changed', 'This note changed while the tick was being saved. Its competing words were kept.');
		try { await recordCardEdit(folder.store, {file, ...landed}, {once: already}); }
		catch (error) { throw Object.assign(fail('history', 'The box is ticked, but this note’s history could not record it. Open Notes to check it.'), {cause: error}); }
		return {file, already, digest: action.after};
	});
	return {snapshot, tick};
}
