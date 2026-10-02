// SPDX-License-Identifier: AGPL-3.0-only
// Drawing ink from the words (docs/briefs/ink.md §3): the one reader of a rendered ink span's boxes, used by the editor's
// layer (editor/ink-layer.mjs), by the print page before it prints, and by an exported page's own script. It takes the
// grammar and the geometry as parameters and reads no global. The layer is one zero-height owner in the root's flow,
// so it scrolls and paginates with the words; every piece is its own small positioned <svg>, so a printed page carries
// the pieces that fall on it. Pieces are data a row reads back (box, fragments, element): a mark that drifted off its
// words would be a wrong document.

// Retained intact by the export. Editor-only hit testing lives outside this closure.
const inkDrawing = () => {
	// SPDX-License-Identifier: AGPL-3.0-only
	const LAYER_CLASS = 'rapier-ink-layer';
	const SPAN_SELECTOR = 'span.rapier-ink-mark[data-rapier-ink]';
	const DEFAULT_HEX = '#b32034';
	const SVG = 'http://www.w3.org/2000/svg';

	// The layer: at the root's end for a live editor (whose code reads its first blocks), at the start for a page that prints.
	function inkLayerOf(root, place = 'end') {
		let layer = null;
		for (const child of root.children) if (child.classList && child.classList.contains(LAYER_CLASS)) { layer = child; break; }
		if (!layer) {
			layer = root.ownerDocument.createElement('div');
			layer.className = LAYER_CLASS;
			layer.setAttribute('aria-hidden', 'true');
			if (place === 'start') root.insertBefore(layer, root.firstChild); else root.appendChild(layer);
		}
		return layer;
	}

	// The marked words' boxes, one per line: the span's client rects merged by line (a mark nested in the words adds rects
	// on the same line; a wrapped span gives one rect per line fragment).
	function inkFragments(span) {
		const range = span.ownerDocument.createRange();
		range.selectNodeContents(span);
		const lines = [];
		for (const r of range.getClientRects()) {
			if (!(r.width > 0) && !(r.height > 0)) continue;
			const middle = r.top + r.height / 2;
			const line = lines.find(l => middle > l.y && middle < l.y + l.height);
			if (!line) { lines.push({ x: r.left, y: r.top, width: r.width, height: r.height }); continue; }
			const right = Math.max(line.x + line.width, r.right), bottom = Math.max(line.y + line.height, r.bottom);
			line.x = Math.min(line.x, r.left); line.y = Math.min(line.y, r.top);
			line.width = right - line.x; line.height = bottom - line.y;
		}
		return lines.sort((a, b) => a.y - b.y || a.x - b.x);
	}

	// Every mark under the root drawn again from its words. deps: {spec, ink, dark?, place?}: the grammar (parseInkBody), the
	// geometry (deriveMark, bounds), the dark-page colour of a hex (else the span's own data-rapier-ink-dark, else the hex),
	// and where the layer stands. Returns the pieces drawn.
	function drawInk(root, deps) {
		const { spec, ink } = deps;
		const doc = root.ownerDocument, view = doc.defaultView;
		const records = [], arrows = new Map();
		for (const span of deps.spans || root.querySelectorAll(SPAN_SELECTOR)) {
			if (span.closest('.' + LAYER_CLASS)) continue;
			const body = span.getAttribute('data-rapier-ink') || '', mark = spec.parseInkBody(body);
			if (!mark) continue;
			const record = { span, body, mark };
			records.push(record);
			if (mark.kind === 'arrow' || mark.kind === 'end') {
				if (!arrows.has(mark.id)) arrows.set(mark.id, []);
				arrows.get(mark.id).push(record);
			}
		}
		const fragmentsOf = deps.fragments || inkFragments;
		const layer = inkLayerOf(root, deps.place);
		const origin = layer.getBoundingClientRect();
		for (const child of Array.from(layer.children)) if (!child.hasAttribute('data-ink-live')) layer.removeChild(child);
		const pieces = [];
		for (const { span, body, mark } of records) {
			if (mark.kind === 'end') continue;
			let endSpan = null, endFragments = [];
			if (mark.kind === 'arrow') {
				const pair = arrows.get(mark.id);
				if (pair.length !== 2 || !pair.some(r => r.mark.kind === 'end')) continue;
				endSpan = pair.find(r => r.mark.kind === 'end').span;
				endFragments = fragmentsOf(endSpan);
				if (!endFragments.length) continue;
			}
			const fragments = fragmentsOf(span);
			if (!fragments.length) continue;
			const em = parseFloat(view.getComputedStyle(span).fontSize) || 16;
			const hex = mark.hex || DEFAULT_HEX;
			const dark = typeof deps.dark === 'function' ? deps.dark(hex) : (span.getAttribute('data-rapier-ink-dark') || hex);
			const width = (mark.kind === 'free' ? 0.09 : 0.11) * em;
			const pad = width + 1;
			for (const piece of ink.deriveMark(mark, fragments, fragments[0], em, endFragments)) {
				if (piece.length < 2) continue;
				const box = ink.bounds(piece);
				const svg = doc.createElementNS(SVG, 'svg');
				const w = box.width + 2 * pad, h = box.height + 2 * pad;
				svg.setAttribute('class', 'rapier-ink-piece');
				svg.setAttribute('data-ink-kind', mark.kind);
				svg.setAttribute('viewBox', '0 0 ' + w.toFixed(2) + ' ' + h.toFixed(2));
				svg.style.left = (box.x - origin.left - pad).toFixed(2) + 'px';
				svg.style.top = (box.y - origin.top - pad).toFixed(2) + 'px';
				svg.style.width = w.toFixed(2) + 'px';
				svg.style.height = h.toFixed(2) + 'px';
				svg.style.setProperty('--md-ink', hex);
				svg.style.setProperty('--md-ink-dark', dark);
				const path = doc.createElementNS(SVG, 'path');
				path.setAttribute('d', piece.map((p, i) => (i ? 'L' : 'M') + (p.x - box.x + pad).toFixed(2) + ' ' + (p.y - box.y + pad).toFixed(2)).join(''));
				path.style.strokeWidth = width.toFixed(2) + 'px';
				svg.appendChild(path);
				svg._rapierInkSpan = span;
				if (endSpan) svg._rapierInkEndSpan = endSpan;
				layer.appendChild(svg);
				pieces.push({ kind: mark.kind, opener: body, box: { x: box.x, y: box.y, width: box.width, height: box.height },
					fragments: fragments.map(f => ({ x: f.x, y: f.y, width: f.width, height: f.height })),
					endFragments: endFragments.map(f => ({ x: f.x, y: f.y, width: f.width, height: f.height })), em, element: svg, span, endSpan });
			}
		}
		return pieces;
	}

	// A page's own watcher (the exported page): draws once laid out and again whenever the page lays out again, never on
	// scroll. Returns {draw, destroy}.
	function watchInk(root, spec, ink) {
		if (!root || !spec || !ink) return null;
		const doc = root.ownerDocument, view = doc.defaultView;
		let frame = 0, stopped = false;
		const draw = () => { frame = 0; if (stopped) return; try { drawInk(root, { spec, ink, place: 'start' }); } catch (_) {} };
		const schedule = () => { if (!frame && !stopped) frame = view.requestAnimationFrame(draw); };
		const onMutation = records => {
			for (const record of records) {
				const target = record.target, element = target.nodeType === 1 ? target : target.parentElement;
				if (element && element.closest && element.closest('.' + LAYER_CLASS)) continue;
				schedule();
				return;
			}
		};
		const observer = typeof view.MutationObserver === 'function' ? new view.MutationObserver(onMutation) : null;
		observer?.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden'] });
		const sizes = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null;
		sizes?.observe(root);
		root.addEventListener('load', schedule, true);
		root.addEventListener('toggle', schedule, true);
		view.addEventListener('resize', schedule);
		view.addEventListener('pageshow', schedule);
		view.addEventListener('beforeprint', draw);
		view.addEventListener('afterprint', schedule);
		doc.fonts?.addEventListener?.('loadingdone', schedule);
		Promise.resolve(doc.fonts?.ready).then(schedule, schedule);
		schedule();
		return Object.freeze({ draw, destroy() {
			stopped = true;
			if (frame) view.cancelAnimationFrame(frame);
			observer?.disconnect(); sizes?.disconnect();
			root.removeEventListener('load', schedule, true);
			root.removeEventListener('toggle', schedule, true);
			view.removeEventListener('resize', schedule);
			view.removeEventListener('pageshow', schedule);
			view.removeEventListener('beforeprint', draw);
			view.removeEventListener('afterprint', schedule);
			doc.fonts?.removeEventListener?.('loadingdone', schedule);
		} });
	}
	return { LAYER_CLASS, SPAN_SELECTOR, DEFAULT_HEX, inkLayerOf, inkFragments, drawInk, watchInk };
};
const { LAYER_CLASS, SPAN_SELECTOR, DEFAULT_HEX, inkLayerOf, inkFragments, drawInk, watchInk } = inkDrawing();
export { LAYER_CLASS, SPAN_SELECTOR, DEFAULT_HEX, inkLayerOf, inkFragments, drawInk, watchInk };

// The piece under a point, if any (the pen's eraser): its span.
export function inkSpanAt(root, x, y, slack = 4) {
	const layer = inkLayerOf(root);
	let found = null, best = Infinity;
	for (const svg of layer.children) {
		if (!svg._rapierInkSpan) continue;
		const r = svg.getBoundingClientRect();
		if (x < r.left - slack || x > r.right + slack || y < r.top - slack || y > r.bottom + slack) continue;
		const area = r.width * r.height;
		if (area < best) { best = area; found = svg._rapierInkSpan; }
	}
	return found;
}
