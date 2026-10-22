// SPDX-License-Identifier: AGPL-3.0-only
import {isNoteFile} from './model.mjs';
import {lockedSyncBoundary} from './sync-state.mjs';

export const CARDS_FILE = '.rapier-cards.json';
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true});
const FIELDS = ['pinned', 'colour', 'category', 'archived', 'order'];
const DEFAULTS = Object.freeze({pinned: false, colour: '', category: '', archived: false});
const fieldsOf = entry => ({pinned: entry.pinned === true, colour: entry.colour || '', category: entry.category || '', archived: entry.archived === true, order: typeof entry.order === 'string' ? entry.order : ''});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const valid = value => value && typeof value === 'object' && !Array.isArray(value);

function read(bytes) {
	if (!bytes) return {notes: {}, sections: null};
	let doc; try { doc = JSON.parse(td.decode(bytes)); } catch { return {notes: {}, sections: null, unreadable: true}; }
	const notes = {};
	if (valid(doc?.notes)) for (const [file, row] of Object.entries(doc.notes)) {
		if (!isNoteFile(file) || !valid(row) || !Number.isSafeInteger(row.at)) continue;
		const v = {};
		if (typeof row.pinned === 'boolean') v.pinned = row.pinned;
		if (typeof row.colour === 'string') v.colour = row.colour;
		if (typeof row.category === 'string') v.category = row.category;
		if (typeof row.archived === 'boolean') v.archived = row.archived;
		if (typeof row.order === 'string' && row.order) v.order = row.order;
		notes[file] = {at: row.at, v};
	}
	const list = doc?.sections?.list, sections = valid(doc?.sections) && Number.isSafeInteger(doc.sections.at) && Array.isArray(list) && list.every(name => typeof name === 'string' && name)
		? {at: doc.sections.at, list} : null;
	return {notes, sections};
}
function write(notes, sections) {
	const out = {version: 1, notes: {}, sections: {at: sections.at, list: sections.list}};
	for (const file of Object.keys(notes).sort()) out.notes[file] = {at: notes[file].at, ...notes[file].v};
	return te.encode(JSON.stringify(out));
}

export async function syncPlainCards({folder, store, base, listing, guard = () => {}, now = Date.now}) {
	await guard();
	const privacy = await lockedSyncBoundary(folder, guard); guard = privacy.guard;
	const result = {pushed: 0, pulled: 0, held: []};
	const kept = await base.read() || {}, known = {rev: kept.rev ?? null, notes: kept.notes || {}, sections: kept.sections || null};
	const row = listing.find(item => item.name === CARDS_FILE) || null;
	const {index} = await folder.read();
	const here = new Map();
	for (const [file, entry] of Object.entries(index.notes || {})) if (entry.trashed !== true && await privacy.allows(file)) here.set(file, fieldsOf(entry));
	const listHere = (index.sections || []).map(section => section.name);
	if ((row?.rev ?? null) === known.rev && same(listHere, known.sections?.list ?? []) && [...here].every(([file, fields]) => known.notes[file] && same(fields, known.notes[file].v))) return result;

	await guard();
	const got = row ? await store.get(CARDS_FILE) : null;
	const there = read(got?.bytes);
	if (there.unreadable) { result.held.push({name: CARDS_FILE, why: 'unreadable'}); return result; }
	const clock = now(), merged = {}, adopt = new Map();
	for (const [file, mine] of here) {
		const was = known.notes[file], remote = there.notes[file], v = {};
		for (const field of FIELDS) {
			const lv = mine[field], bv = was?.v[field], rv = remote?.v[field];
			if (field === 'order' && !was) { v[field] = rv ?? lv; continue; }
			const lc = was ? !same(lv, bv) : lv !== DEFAULTS[field], rc = rv !== undefined && (!was || !same(rv, bv));
			v[field] = rc && (!lc || same(lv, rv) || clock < remote.at) ? rv : lv;
		}
		merged[file] = {at: remote && FIELDS.every(field => same(v[field], remote.v[field])) ? remote.at : Math.max(clock, (remote?.at ?? 0) + 1), v};
		if (FIELDS.some(field => !same(v[field], mine[field]))) adopt.set(file, v);
	}
	const lc = known.sections ? !same(listHere, known.sections.list) : listHere.length > 0;
	const rc = !!there.sections && (!known.sections || !same(there.sections.list, known.sections.list));
	const takeThere = rc && (!lc || same(listHere, there.sections.list) || clock < there.sections.at);
	const sections = takeThere || (!lc && there.sections) ? there.sections : {at: Math.max(clock, (there.sections?.at ?? 0) + 1), list: listHere};
	const sectionsAdopt = takeThere && !same(listHere, there.sections.list) ? there.sections.list : null;

	if (adopt.size || sectionsAdopt) {
		await guard();
		try {
			const before = (await folder.read()).index, next = structuredClone(before);
			if (sectionsAdopt) {
				const byName = new Map((next.sections || []).map(section => [section.name, section]));
				next.sections = sectionsAdopt.map(name => byName.get(name) || {name, collapsed: false});
			}
			for (const [file, v] of adopt) if (next.notes[file]) {
				next.notes[file] = {...next.notes[file], ...v};
				if (!v.category) delete next.notes[file].category;
			}
			await folder.metadata(before, next, {guard});
			result.pulled = adopt.size + (sectionsAdopt ? 1 : 0);
		} catch (error) { await guard(); result.held.push({name: 'cards', why: error?.code || 'changed'}); return result; }
	}
	const files = new Set(listing.map(item => item.name)), out = {...merged};
	for (const [file, record] of Object.entries(there.notes)) if (!here.has(file) && files.has(file)) out[file] = record;
	const bytes = write(out, sections);
	let rev = got?.rev ?? null;
	if (!got || !same(read(bytes), there)) {
		await guard();
		try { rev = (await store.put(CARDS_FILE, bytes, got ? {ifRev: got.rev} : {ifAbsent: true})).rev; result.pushed = 1; }
		catch (error) {
			if (error?.code === 'conflict' || error?.code === 'conditional_unverified') { result.held.push({name: CARDS_FILE, why: error.code}); return result; }
			throw error;
		}
	}
	await guard();
	const settled = {rev, notes: Object.fromEntries([...here.keys()].map(file => [file, {at: merged[file].at, v: merged[file].v}])), sections};
	if (!same(settled, kept)) await base.write(settled);
	return result;
}
