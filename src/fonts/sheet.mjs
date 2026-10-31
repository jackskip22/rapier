// SPDX-License-Identifier: AGPL-3.0-only
// The font library's browsing sheet. Every family is drawn in its own face from the catalog's build-time outlines, so
// browsing downloads no fonts; a tap on a family adds it (its complete files, through the library's one install path).
// Assembled from the font sheet's own parts: the sheet, its chips, its choice rows, and the Contents filter field.
import {admitFontPreviewManifest, admitFontPreviewShard} from './previews.mjs';

export const FONT_LIBRARY_KINDS = Object.freeze([['', 'All'], ['sans-serif', 'Sans'], ['serif', 'Serif'], ['display', 'Display'],
	['handwriting', 'Hand'], ['monospace', 'Mono']]);
const KIND_NAME = Object.freeze(Object.fromEntries(FONT_LIBRARY_KINDS.filter(([id]) => id)));
// Rows are drawn a page at a time as the list scrolls; a preview shard is fetched only when a row on screen needs it.
const PAGE = 40, EM = 23, SVG = 'http://www.w3.org/2000/svg';
const fold = text => String(text).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();

// The family's name in its own face: one path in the text color, its baseline shared by every row.
export function fontPreviewSvg(preview, label) {
	if (!preview?.d) return null;
	const [x0, y0, x1, y1] = preview.bounds || [0, -preview.ascent, preview.w, preview.descent];
	const left = Math.min(0, x0), right = Math.max(preview.w, x1), top = Math.min(-preview.ascent, y0), bottom = Math.max(preview.descent, y1);
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('viewBox', [left, top, right - left, bottom - top].map(n => +n.toFixed(4)).join(' '));
	svg.setAttribute('width', String(Math.ceil((right - left) * EM)));
	svg.setAttribute('height', String(Math.ceil((bottom - top) * EM)));
	svg.setAttribute('class', 'rapier-font-preview');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', label);
	if (preview.direction === 'rtl') svg.setAttribute('data-rtl', '');
	const path = document.createElementNS(SVG, 'path');
	path.setAttribute('d', preview.d);
	path.setAttribute('fill', 'currentColor');
	svg.append(path);
	return svg;
}

export function fontLibraryDetail(family, added) {
	const kind = KIND_NAME[family.category] || '';
	const styles = family.axes?.some(axis => axis.tag === 'wght') ? 'Variable' : family.variants.length + (family.variants.length === 1 ? ' style' : ' styles');
	return [kind, styles, added ? 'Added' : ''].filter(Boolean).join(' · ');
}

// host: the page's owners. beginDialog(overlay) → {close(cancel), blocking}; arrange(row); errorWords(error, fallback).
// readJson(url, {bytes, sri}) → the verified bytes as JSON (the verified data loader); manifest is the catalog's pin of its
// preview manifest, its url already resolved against the catalog's.
export function openFontLibrary({catalog, library, manifest: manifestPin, readJson, host}) {
	const manifestUrl = manifestPin.url;
	const families = catalog.families, byId = new Map(families.map((family, index) => [family.id, {family, index}]));
	// Search reads the name, and a curated family's line and tags too: "code" finds the monospace faces made for it.
	const words = new Map(families.map(family => [family.id, fold([family.name, family.curation?.description, ...(family.curation?.tags || [])].filter(Boolean).join(' '))]));
	const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
	const overlay = el('div', 'settings-overlay rapier-font-overlay open'), panel = el('section', 'settings-panel rapier-pop rapier-font-sheet rapier-font-library');
	panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'rapier-font-library-title');
	const body = el('div', 'settings-panel__body'), title = el('h2', 'settings-panel__title', 'Font library'); title.id = 'rapier-font-library-title';
	const search = el('input', 'navigator-outline-filter rapier-font-search');
	Object.assign(search, {type: 'search', placeholder: 'search', autocomplete: 'off', spellcheck: false});
	search.setAttribute('aria-label', 'search fonts'); search.setAttribute('autocapitalize', 'off');
	const head = el('div', 'rapier-font-head'), kinds = el('div', 'rapier-font-kinds'), list = el('div', 'rapier-font-choices'), status = el('p', 'rapier-font-status');
	status.setAttribute('role', 'status'); status.hidden = true;
	const more = el('div', 'rapier-font-more'); more.setAttribute('aria-hidden', 'true');
	const actions = el('div'); actions.setAttribute('data-pop-row', '');
	const done = el('button', 'rapier-draw-chip', 'Done'); done.type = 'button'; done.dataset.pop = 'affirm'; actions.append(done);
	head.append(search, kinds);
	body.append(title, head, list, more, status, actions); panel.append(body); overlay.append(panel);
	const dialog = host.beginDialog(overlay);
	let kind = '', query = '', shown = [], drawn = 0, busy = 0, manifest = null;
	dialog.blocking = () => busy > 0;
	const note = value => { status.hidden = !value; status.textContent = value || ''; };
	const close = () => { if (!busy) dialog.close(true); };
	overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
	done.addEventListener('click', close);

	// Preview shards: one fetch each, kept for the sheet's life.
	const shards = new Map();
	async function previewsFor(index) {
		manifest ||= readJson(manifestUrl, manifestPin).then(raw => admitFontPreviewManifest(raw, catalog));
		const admitted = await manifest, descriptor = admitted.shards.find(shard => index + 1 >= shard.first && index + 1 <= shard.last);
		if (!descriptor) return null;
		if (!shards.has(descriptor.name)) shards.set(descriptor.name, readJson(new URL(descriptor.url, manifestUrl).href, descriptor)
			.then(raw => new Map(admitFontPreviewShard(raw, descriptor, catalog).families.map(row => [row.id, row]))));
		return shards.get(descriptor.name);
	}

	for (const [id, label] of FONT_LIBRARY_KINDS) {
		const chip = el('button', 'rapier-draw-chip', label); chip.type = 'button'; chip.dataset.kind = id;
		chip.setAttribute('aria-pressed', String(id === kind));
		chip.addEventListener('click', () => { kind = id; for (const other of kinds.children) other.setAttribute('aria-pressed', String(other === chip)); refilter(); });
		kinds.append(chip);
	}

	function row(family) {
		const button = el('button', 'rapier-draw-chip rapier-font-choice'); button.type = 'button'; button.dataset.familyId = family.id;
		const face = el('span', 'rapier-font-name', family.name), detail = el('span', 'rapier-font-detail', fontLibraryDetail(family, false));
		button.append(face, detail); button.setAttribute('aria-pressed', 'false');
		button.addEventListener('click', () => void add(family, button, detail));
		void previewsFor(byId.get(family.id).index).then(rows => {
			const held = rows?.get(family.id), svg = fontPreviewSvg(held?.preview, family.name);
			if (!svg || !face.isConnected) return;
			// A family made for another script also shows a few words in that script, in its own face.
			const sample = fontPreviewSvg(held.sample, held.sample?.text || '');
			face.replaceChildren(...[svg, sample].filter(Boolean));
		}).catch(() => {});
		void library.installed(family.id).then(added => { if (added && button.isConnected) mark(button, detail, family); }).catch(() => {});
		return button;
	}
	function mark(button, detail, family) { button.setAttribute('aria-pressed', 'true'); detail.textContent = fontLibraryDetail(family, true); }
	async function add(family, button, detail) {
		if (button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-busy') === 'true') return;
		busy++; button.setAttribute('aria-busy', 'true'); note('');
		try { await library.install(family.id); if (button.isConnected) mark(button, detail, family); }
		catch (error) { if (overlay.isConnected) note(host.errorWords(error, 'Couldn’t add ' + family.name + '.')); }
		finally { busy--; button.removeAttribute('aria-busy'); }
	}
	function drawMore() {
		const end = Math.min(shown.length, drawn + PAGE);
		for (; drawn < end; drawn++) list.append(row(shown[drawn]));
		more.hidden = drawn >= shown.length;
	}
	function refilter() {
		const asked = fold(query.trim()).split(/\s+/).filter(Boolean);
		shown = families.filter(family => (!kind || family.category === kind) && asked.every(word => words.get(family.id).includes(word)));
		drawn = 0; list.replaceChildren();
		note(shown.length ? '' : 'No fonts match.');
		drawMore();
	}
	const watch = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) drawMore(); }, {root: body, rootMargin: '600px 0px'});
	watch.observe(more);
	let typed = 0;
	search.addEventListener('input', () => { const at = ++typed; setTimeout(() => { if (at === typed) { query = search.value; refilter(); } }, 120); });
	const end = dialog.onClose; dialog.onClose = (...args) => { watch.disconnect(); return end?.(...args); };
	refilter(); host.arrange(actions);
	search.focus({preventScroll: true});
	return dialog;
}
