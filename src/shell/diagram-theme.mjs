// SPDX-License-Identifier: AGPL-3.0-only
export function presentPele(svg, runtime, animated = new Map(), id = 'rapier-anchor-diagram') {
	const tree = new runtime.DOMParser().parseFromString(svg.toWellFormed(), 'image/svg+xml'), drawing = tree.documentElement;
	if (drawing.localName !== 'svg') throw new Error('The diagram renderer returned no SVG');
	const authored = (element, name) => new RegExp('(?:^|;)\\s*' + name + '\\s*:', 'i').test(element.getAttribute('style') || '');
	const theme = (selector, values) => {
		for (const element of drawing.querySelectorAll(selector)) {
			for (const [name, value] of Object.entries(values)) if (!authored(element, name)) element.setAttribute(name, value);
		}
	};
	const family = name => drawing.classList.contains('pele-' + name);
	const grid = 'var(--md-mermaid-grid)';
	theme('.pele-edge-label > rect', {fill: 'var(--_bg)'});
	for (const edges of drawing.querySelectorAll('.pele-edges')) edges.setAttribute('stroke-width', family('gitGraph') ? '6' : '1.5');
	if (family('gitGraph')) for (const dot of drawing.querySelectorAll('.pele-commit > circle')) dot.setAttribute('r', String(Number(dot.getAttribute('r') || 7) * 1.5));
	for (const path of drawing.querySelectorAll('.pele-edge > path[stroke-width]:not(.pele-marker)')) {
		if (Number(path.getAttribute('stroke-width')) > 2) path.setAttribute('stroke-width', '3.5');
	}
	for (const figure of drawing.querySelectorAll('.pele-actor-actor > circle, .pele-actor-actor > path')) {
		figure.setAttribute('stroke', 'var(--_l)'); figure.setAttribute('stroke-width', '2');
	}
	for (const icon of drawing.querySelectorAll('svg.pele-icon')) {
		const shapes = [...icon.querySelectorAll('[stroke^="var(--"], [fill^="var(--"]')];
		const tone = shapes.map(shape => shape.getAttribute('stroke')?.startsWith('var(--') ? shape.getAttribute('stroke') : shape.getAttribute('fill'))[0];
		if (!tone || authored(icon, 'color')) continue;
		icon.setAttribute('color', tone);
		for (const shape of shapes) for (const name of ['stroke', 'fill']) if (shape.getAttribute(name)?.startsWith('var(--')) shape.setAttribute(name, 'currentColor');
	}
	theme('.pele-note:not(.pele-edge) > rect, .pele-note:not(.pele-edge) > path:first-of-type', {fill: 'var(--md-mermaid-tint-6)', stroke: 'var(--md-mermaid-series-6)'});
	theme('.pele-note:not(.pele-edge) > path:not(:first-of-type)', {stroke: 'var(--md-mermaid-series-6)'});
	theme('.pele-note:not(.pele-edge) .pele-label', {fill: 'var(--_fg)'});
	theme('.pele-lifelines', {stroke: grid, 'stroke-width': '2'});
	theme('.pele-frame > rect:first-child', {'stroke-dasharray': '3 3', 'stroke-width': '1.5'});
	if (family('c4')) {
		const kinds = {person: 'person', system: 'system system_db system_queue', container: 'container container_db container_queue',
			component: 'component component_db component_queue'};
		for (const [kind, names] of Object.entries(kinds)) for (const name of names.split(' ')) {
			const node = '.pele-c4-' + name, fill = 'var(--md-diagram-c4-' + kind + ')';
			const ink = kind === 'component' ? 'var(--md-diagram-c4-component-ink)' : 'var(--md-diagram-c4-ink)';
			theme(node + ' > rect, ' + node + ' > path:first-of-type, ' + node + ' > circle', {fill, stroke: fill});
			theme(node + ' > path:not(:first-of-type)', {stroke: ink, 'stroke-opacity': '0.45'});
			theme(node + ' text', {fill: ink});
		}
		theme('.pele-c4-external > rect, .pele-c4-external > path:first-of-type, .pele-c4-external > circle', {fill: 'var(--md-diagram-c4-external)', stroke: 'var(--md-diagram-c4-external)', 'stroke-dasharray': 'none'});
		theme('.pele-c4-external text', {fill: 'var(--md-diagram-c4-ink)'});
	}
	if (family('architecture')) {
		theme('.pele-service > rect, .pele-junction > rect', {fill: 'var(--md-diagram-tile)', stroke: 'none'});
		theme('.pele-service > svg.pele-icon', {color: 'var(--md-diagram-tile-ink)'});
		theme('.pele-cluster > rect', {fill: 'none', stroke: 'var(--_b)', 'stroke-width': '2', 'stroke-dasharray': '8 5'});
		theme('.pele-cluster > svg.pele-icon', {color: 'var(--md-diagram-tile)'});
		theme('.pele-edges', {'stroke-width': '2.5'});
		for (const icon of drawing.querySelectorAll('.pele-service > svg.pele-icon')) {
			const tile = icon.parentElement.querySelector(':scope > rect');
			if (!tile) continue;
			const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(name => Number(tile.getAttribute(name) || 0)), size = Math.min(w, h) * .72;
			icon.setAttribute('x', String(x + (w - size) / 2)); icon.setAttribute('y', String(y + (h - size) / 2));
			icon.setAttribute('width', String(size)); icon.setAttribute('height', String(size));
		}
	}
	if (family('gantt')) {
		theme('.pele-section[fill="var(--_s)"]', {fill: 'var(--md-color-surface)'});
		for (const task of drawing.querySelectorAll('.pele-task')) {
			const bar = task.querySelector(':scope > rect'), label = task.querySelector(':scope > text');
			if (!bar || authored(bar, 'fill')) continue;
			const fill = task.classList.contains('pele-done') ? 'var(--md-mermaid-muted)' : task.classList.contains('pele-active') ? 'var(--md-mermaid-series-4)' : 'var(--md-mermaid-series-1)';
			bar.setAttribute('fill', fill); bar.setAttribute('fill-opacity', '1');
			bar.setAttribute('stroke', task.classList.contains('pele-crit') ? 'var(--md-mermaid-series-5)' : fill); bar.setAttribute('stroke-width', '2');
			if (!label || authored(label, 'fill')) continue;
			const x = Number(label.getAttribute('x')), left = Number(bar.getAttribute('x')), width = Number(bar.getAttribute('width'));
			label.setAttribute('fill', x > left && x < left + width ? 'var(--md-mermaid-on-series)' : 'var(--_fg)');
		}
	}
	if (family('mindmap')) {
		for (const shape of drawing.querySelectorAll('.pele-node > [fill-opacity]')) {
			if (authored(shape, 'fill')) continue;
			shape.setAttribute('fill-opacity', '1');
			for (const label of shape.parentElement.querySelectorAll(':scope > text')) if (!authored(label, 'fill')) label.setAttribute('fill', 'var(--_bg)');
		}
		for (const root of drawing.querySelectorAll('.pele-node > [fill="var(--_s)"]')) {
			root.setAttribute('fill', 'var(--md-mermaid-series-12)'); root.setAttribute('stroke', 'var(--md-mermaid-series-12)');
			for (const label of root.parentElement.querySelectorAll(':scope > text')) if (!authored(label, 'fill')) label.setAttribute('fill', 'var(--_bg)');
		}
		theme('.pele-edges', {'stroke-width': '3'});
	}
	theme('.pele-wardley-component > text, .pele-wardley-anchor > text', {stroke: 'var(--_bg)', 'stroke-width': '4', 'stroke-linejoin': 'round', 'paint-order': 'stroke fill'});
	theme('.pele-packet-bits', {'font-size': '11'});
	for (const word of drawing.querySelectorAll('text.pele-edge-label')) {
		if (word.parentElement.querySelector(':scope > rect')) continue;
		for (const [name, value] of Object.entries({stroke: 'var(--_bg)', 'stroke-width': '4', 'stroke-linejoin': 'round', 'paint-order': 'stroke fill'})) if (!authored(word, name)) word.setAttribute(name, value);
	}
	for (const title of drawing.querySelectorAll('.pele-cluster > text.pele-cluster-label[text-anchor="middle"]')) {
		const frame = title.parentElement.querySelector(':scope > rect');
		if (frame && !title.querySelector('tspan[x]')) title.setAttribute('x', String(Number(frame.getAttribute('x')) + Number(frame.getAttribute('width')) / 2));
	}
	for (const title of family('architecture') ? drawing.querySelectorAll('.pele-cluster > text.pele-cluster-label') : []) {
		const icon = title.parentElement.querySelector(':scope > svg.pele-icon');
		if (!icon || title.querySelector('tspan[x]')) continue;
		title.setAttribute('text-anchor', 'start');
		title.setAttribute('x', String(Number(icon.getAttribute('x')) + Number(icon.getAttribute('width')) + 6));
	}
	theme('.pele-face > circle[fill="var(--_bg)"]', {fill: 'var(--md-mermaid-tint-6)', stroke: 'var(--md-mermaid-border)'});
	theme('.pele-tree-highlight', {fill: 'var(--md-mermaid-tint-6)', 'fill-opacity': '1', stroke: 'var(--md-mermaid-series-6)', 'stroke-width': '1'});
	if (family('treeView')) { theme('svg.pele-icon', {color: 'var(--_fg)'}); theme('svg.pele-icon > path', {fill: 'currentColor', 'fill-opacity': '0.85'}); }
	const inkOn = fill => /^var\(--(?:_|pele-|md-)/.test(fill) ? 'var(--_bg)' : 'contrast-color(' + fill + ')';
	for (const label of drawing.querySelectorAll('text')) {
		if (label.closest('[fill]')?.getAttribute('fill') !== 'var(--_bg)') continue;
		let owner = label.parentElement, ground;
		while (owner && owner !== drawing && !ground) {
			ground = [...owner.children].find(shape => ['rect', 'polygon', 'circle', 'path'].includes(shape.localName) &&
				shape.hasAttribute('fill') && shape.getAttribute('fill') !== 'none' &&
				Number(shape.getAttribute('fill-opacity') ?? 1) === 1);
			owner = owner.parentElement;
		}
		label.setAttribute('fill', ground ? inkOn(ground.getAttribute('fill')) : 'var(--_fg)');
	}
	const bars = [...drawing.querySelectorAll('.pele-bars')].flatMap(series => [...series.querySelectorAll(':scope > rect')]
		.map(bar => ({fill: series.getAttribute('fill'), at: ['x', 'y', 'width', 'height'].map(key => Number(bar.getAttribute(key)))})));
	for (const group of drawing.querySelectorAll('.pele-point-labels')) {
		const size = Number(group.getAttribute('font-size')) || 11;
		for (const name of ['stroke', 'stroke-width', 'paint-order']) group.removeAttribute(name);
		for (const label of [...group.querySelectorAll(':scope > text')]) {
			if (authored(label, 'fill')) continue;
			const x = Number(label.getAttribute('x')), y = Number(label.getAttribute('y')), anchor = label.getAttribute('text-anchor') || 'start';
			const width = label.textContent.length * size * .52 + 6, left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width + 3 : x - 3;
			const bar = bars.find(({at}) => left >= at[0] && left + width <= at[0] + at[2] && y - size >= at[1] && y + 3 <= at[1] + at[3]);
			if (bar && /^var\(--/.test(bar.fill || '')) { label.setAttribute('fill', 'var(--md-mermaid-on-series)'); continue; }
			label.setAttribute('fill', 'var(--_fg)');
			const plate = tree.createElementNS('http://www.w3.org/2000/svg', 'rect');
			for (const [name, value] of Object.entries({x: left, y: y - size, width, height: size * 1.4})) plate.setAttribute(name, String(Math.round(value * 100) / 100));
			plate.setAttribute('fill', 'var(--_bg)');
			label.before(plate);
		}
	}
	const sectionBoxes = !family('treemap') ? [] : [...drawing.querySelectorAll('.pele-section > rect')].map(box => ({box, area: ['x', 'y', 'width', 'height'].map(key => Number(box.getAttribute(key)))}));
	const inside = (a, b) => a[0] >= b[0] - .5 && a[1] >= b[1] - .5 && a[0] + a[2] <= b[0] + b[2] + .5 && a[1] + a[3] <= b[1] + b[3] + .5;
	const root = sectionBoxes.find(entry => sectionBoxes.every(other => inside(other.area, entry.area)));
	const tops = sectionBoxes.filter(entry => entry !== root && !sectionBoxes.some(other => other !== root && other !== entry && inside(entry.area, other.area)));
	const hue = new Map(tops.map((entry, index) => [entry, /(?:^|;)\s*stroke:\s*([^;]+)/.exec(entry.box.getAttribute('style') || '')?.[1].trim() || 'var(--md-mermaid-series-' + (index % 12 + 1) + ')']));
	if (root && !authored(root.box, 'fill')) { root.box.setAttribute('fill', 'var(--_s)'); root.box.setAttribute('fill-opacity', '1'); root.box.setAttribute('stroke', 'var(--_b)'); }
	for (const [entry, color] of hue) {
		if (authored(entry.box, 'fill')) continue;
		entry.box.setAttribute('fill', 'color-mix(in srgb, ' + color + ' 16%, var(--_bg))'); entry.box.setAttribute('fill-opacity', '1'); entry.box.setAttribute('stroke', color);
	}
	const tones = new Map();
	for (const tile of drawing.querySelectorAll('.pele-leaf > rect')) {
		const area = ['x', 'y', 'width', 'height'].map(key => Number(tile.getAttribute(key)));
		const owner = tops.find(entry => inside(area, entry.area));
		if (!owner || authored(tile, 'fill')) continue;
		const step = tones.get(owner) || 0; tones.set(owner, step + 1);
		const color = hue.get(owner), base = 'color-mix(in srgb, ' + color + ' 60%, light-dark(' + color + ', #000))';
		tile.setAttribute('fill', 'color-mix(in srgb, ' + base + ' ' + (100 - step * 14) + '%, #000)');
		for (const word of tile.parentElement.querySelectorAll(':scope > text')) word.setAttribute('fill', 'var(--md-diagram-tile-ink-deep)');
	}
	for (const leaf of drawing.querySelectorAll('.pele-leaf')) {
		const tile = leaf.querySelector(':scope > rect'), [name, value] = [...leaf.querySelectorAll(':scope > text')];
		if (!tile || !name) continue;
		const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(key => Number(tile.getAttribute(key) || 0));
		const size = Math.max(16, Math.min(34, h * .2, w * 1.7 / Math.max(4, name.textContent.length)));
		const small = Math.max(12, size * .6), middle = y + h / 2;
		name.setAttribute('font-size', size.toFixed(1)); name.setAttribute('x', String(x + w / 2));
		name.setAttribute('y', (middle + (value ? 0 : size * .35)).toFixed(1));
		if (value) { value.setAttribute('font-size', small.toFixed(1)); value.setAttribute('x', String(x + w / 2)); value.setAttribute('y', (middle + small * 1.3).toFixed(1)); }
	}
	for (const box of drawing.querySelectorAll('.pele-event > rect[fill-opacity]')) {
		const fill = box.getAttribute('fill');
		if (authored(box, 'fill') || !/^var\(--/.test(fill)) continue;
		box.setAttribute('fill', 'color-mix(in srgb, ' + fill + ' 45%, var(--_bg))'); box.setAttribute('fill-opacity', '1');
	}
	const periods = [...drawing.querySelectorAll('.pele-period')].map(period => ({period,
		events: [...period.querySelectorAll(':scope > .pele-event')].map(event => ({event, box: event.querySelector(':scope > rect')}))
			.filter(entry => entry.box).sort((a, b) => Number(a.box.getAttribute('y')) - Number(b.box.getAttribute('y')))})).filter(entry => entry.events.length);
	if (periods.length > 1) {
		const rows = Math.max(...periods.map(entry => entry.events.length));
		const heights = Array.from({length: rows}, (_, row) => Math.max(...periods.map(entry => Number(entry.events[row]?.box.getAttribute('height')) || 0)));
		let before = 0, after = 0;
		for (const {period, events} of periods) {
			const first = Number(events[0].box.getAttribute('y')), gap = events.length > 1 ? Number(events[1].box.getAttribute('y')) - first - Number(events[0].box.getAttribute('height')) : 8;
			let y = first;
			const spans = [];
			for (const [row, {event, box}] of events.entries()) {
				const oldY = Number(box.getAttribute('y')), oldH = Number(box.getAttribute('height'));
				before = Math.max(before, oldY + oldH);
				const shift = y - oldY + (heights[row] - oldH) / 2;
				box.setAttribute('y', String(y)); box.setAttribute('height', String(heights[row]));
				for (const word of event.querySelectorAll('text[y], tspan[y]')) word.setAttribute('y', (Number(word.getAttribute('y')) + shift).toFixed(1));
				spans.push([y, y + heights[row]]);
				y += heights[row] + gap;
			}
			after = Math.max(after, y - gap);
			const thread = period.querySelector(':scope > .pele-edge'), start = /^M([\d.]+),([\d.]+)V/.exec(thread?.getAttribute('d') || '');
			if (start) thread.setAttribute('d', 'M' + start[1] + ',' + start[2] + 'V' + spans[0][0] + spans.slice(1).map(([top], i) => 'M' + start[1] + ',' + spans[i][1] + 'V' + top).join(''));
		}
		const view = (drawing.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
		if (after > before && view.length === 4) {
			view[3] += after - before; drawing.setAttribute('viewBox', view.join(' '));
			if (Number(drawing.getAttribute('height'))) drawing.setAttribute('height', String(Number(drawing.getAttribute('height')) + after - before));
		}
	}
	theme('.pele-period > .pele-edge', {'stroke-dasharray': '4 4', 'stroke-width': '1.5'});
	[...drawing.querySelectorAll('.pele-column')].forEach((column, index) => {
		const ground = column.querySelector(':scope > rect');
		if (!ground || authored(ground, 'fill')) return;
		const band = tree.createElementNS('http://www.w3.org/2000/svg', 'rect');
		band.setAttribute('width', ground.getAttribute('width')); band.setAttribute('height', '34');
		band.setAttribute('fill', 'var(--md-mermaid-series-' + (index % 12 + 1) + ')');
		ground.after(band);
		for (const word of column.querySelectorAll(':scope > text')) word.setAttribute('fill', 'var(--_bg)');
	});
	theme('.pele-priority', {opacity: '1', 'stroke-width': '4', 'stroke-linecap': 'butt'});
	const columns = [...drawing.querySelectorAll('.pele-column')].map(column => [...column.querySelectorAll(':scope > .pele-card')]
		.map(card => ({card, y: Number(/translate\([^,]+,([\d.]+)\)/.exec(card.getAttribute('transform') || '')?.[1]), box: card.querySelector(':scope > rect')}))
		.filter(entry => entry.box && Number.isFinite(entry.y)).sort((a, b) => a.y - b.y));
	if (columns.length > 1 && columns.every(cards => cards.length)) {
		const rows = Math.max(...columns.map(cards => cards.length)), gap = 8, top = columns[0][0].y;
		const heights = Array.from({length: rows}, (_, row) => Math.max(...columns.map(cards => Number(cards[row]?.box.getAttribute('height')) || 0)));
		let tallest = 0;
		for (const cards of columns) {
			let y = top;
			cards.forEach(({card, box}, row) => {
				const height = Number(box.getAttribute('height')), grow = heights[row] - height;
				card.setAttribute('transform', card.getAttribute('transform').replace(/translate\(([^,]+),[\d.]+\)/, 'translate($1,' + y + ')'));
				box.setAttribute('height', String(heights[row]));
				card.querySelector(':scope > .pele-priority')?.setAttribute('d', 'M2.5,5V' + (heights[row] - 5));
				for (const word of card.querySelectorAll(':scope > .pele-ticket, :scope > .pele-assigned')) word.setAttribute('y', (Number(word.getAttribute('y')) + grow).toFixed(1));
				y += heights[row] + gap;
			});
			tallest = Math.max(tallest, y - gap);
		}
		const grounds = [...drawing.querySelectorAll('.pele-column > rect:first-child')];
		const before = Math.max(...grounds.map(ground => Number(ground.getAttribute('height'))));
		const after = Math.max(before, tallest + gap);
		for (const ground of grounds) ground.setAttribute('height', String(after));
		const view = (drawing.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
		if (after > before && view.length === 4) {
			view[3] += after - before; drawing.setAttribute('viewBox', view.join(' '));
			if (Number(drawing.getAttribute('height'))) drawing.setAttribute('height', String(Number(drawing.getAttribute('height')) + after - before));
		}
	}
	for (const slices of drawing.querySelectorAll('.pele-slices')) {
		slices.setAttribute('stroke-width', '2');
		const radius = Number(/A([\d.]+),/.exec(slices.querySelector('.pele-slice')?.getAttribute('d') || '')?.[1]);
		if (!radius) continue;
		const R = Math.max(radius, 185), k = R / radius, scale = text => text.replace(/-?[\d.]+/g, n => String(Math.round(Number(n) * k * 100) / 100));
		for (const slice of slices.querySelectorAll('.pele-slice')) {
			slice.setAttribute('d', slice.getAttribute('d').replace(/A([\d.]+),([\d.]+) ([\d.]+) ([01]) ([01]) /g, (_, rx, ry, turn, large, sweep) => 'A' + rx * k + ',' + ry * k + ' ' + turn + ' ' + large + ' ' + sweep + ' ')
				.replace(/([MLZ ]|^)(-?[\d.]+),(-?[\d.]+)/g, (all, lead, x, y) => lead + Math.round(x * k * 100) / 100 + ',' + Math.round(y * k * 100) / 100));
		}
		const ring = tree.createElementNS('http://www.w3.org/2000/svg', 'circle');
		ring.setAttribute('class', 'pele-slice-ring'); ring.setAttribute('r', String(R + 4));
		ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', 'var(--_b)'); ring.setAttribute('stroke-width', '2');
		slices.appendChild(ring);
		const labels = drawing.querySelector('.pele-slice-labels');
		for (const label of labels?.querySelectorAll('text') || []) {
			for (const axis of ['x', 'y']) label.setAttribute(axis, scale(label.getAttribute(axis) || '0'));
			label.setAttribute('font-size', '16');
		}
		const view = (drawing.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
		if (k === 1 || view.length !== 4) continue;
		const title = drawing.querySelector(':scope > .pele-title'), [cx, cy] = (/translate\(([\d.]+),([\d.]+)\)/.exec(slices.getAttribute('transform')) || []).slice(1).map(Number);
		if (title) { title.setAttribute('font-size', '22'); for (const line of title.querySelectorAll('tspan')) line.setAttribute('y', String(Number(line.getAttribute('y')) + 4)); }
		const top = cy - radius - 4, left = cx - radius - 4, x = left + R + 4, y = top + 8 + R + 4;
		for (const group of [slices, labels]) group?.setAttribute('transform', 'translate(' + x + ',' + y + ')');
		const legend = drawing.querySelector('.pele-legend'), rows = [...legend?.querySelectorAll('.pele-legend-item') || []];
		let right = x + R + 4 + 16;
		if (rows.length) {
			const keys = rows.map(row => row.querySelector('rect')), ys = keys.map(key => Number(key.getAttribute('y')));
			const oldLeft = Number(keys[0].getAttribute('x')), width = view[2] - oldLeft;
			const dx = x + R + 4 + 40 - oldLeft, dy = y - (Math.min(...ys) + Math.max(...ys) + 12) / 2;
			for (const row of rows) for (const mark of row.children) {
				mark.setAttribute('x', String(Number(mark.getAttribute('x')) + dx)); mark.setAttribute('y', String(Number(mark.getAttribute('y')) + dy));
			}
			right = oldLeft + dx + width;
		}
		view[2] = Math.max(view[2], right); view[3] = y + R + 4 + 24;
		drawing.setAttribute('viewBox', view.join(' ')); drawing.setAttribute('width', String(view[2])); drawing.setAttribute('height', String(view[3]));
		for (const line of title?.querySelectorAll('tspan') || []) line.setAttribute('x', String(view[2] / 2));
	}
	theme('.pele-graticule', {stroke: grid, 'stroke-width': '1'});
	theme('.pele-axes', {stroke: 'var(--_l)', 'stroke-width': '2'});
	theme('.pele-curves', {'fill-opacity': '0.16', 'stroke-width': '2'});
	const paint = typeof runtime.Path2D === 'function' && runtime.document.createElement('canvas').getContext('2d');
	const slices = [...drawing.querySelectorAll('.pele-slice')];
	for (const labels of drawing.querySelectorAll('.pele-slice-labels')) {
		labels.setAttribute('fill', 'var(--_fg)');
		if (!paint) continue;
		for (const label of labels.querySelectorAll('text')) {
			const x = Number(label.getAttribute('x')), y = Number(label.getAttribute('y')) - Number(labels.getAttribute('font-size') || 14) * .35;
			const slice = slices.find(path => paint.isPointInPath(new runtime.Path2D(path.getAttribute('d')), x, y));
			if (slice) label.setAttribute('fill', inkOn(slice.getAttribute('fill')));
		}
	}
	for (const rect of drawing.querySelectorAll('rect[rx], rect[ry]')) {
		const half = Math.min(Number(rect.getAttribute('width') || 0), Number(rect.getAttribute('height') || 0)) / 2;
		if (Number(rect.getAttribute('rx') || rect.getAttribute('ry') || 0) < half - .5) { rect.setAttribute('rx', '0'); rect.setAttribute('ry', '0'); }
	}
	if (family('sequence')) {
		const boxes = [...drawing.querySelectorAll('.pele-actor-participant > rect')].filter(box => !authored(box, 'width'));
		const widest = Math.max(0, ...boxes.map(box => Number(box.getAttribute('width'))));
		const centers = [...new Set(boxes.map(box => Math.round((Number(box.getAttribute('x')) + Number(box.getAttribute('width')) / 2) * 100) / 100))].sort((a, b) => a - b);
		const lines = [...drawing.querySelectorAll('.pele-lifeline')].map(line => Number(/^M(-?[\d.]+)/.exec(line.getAttribute('d') || '')?.[1])).filter(Number.isFinite).sort((a, b) => a - b);
		const roomy = lines.every((x, i) => !i || x - lines[i - 1] >= widest + 12);
		if (boxes.length > 1 && roomy) {
			let shift = 0;
			for (let node = boxes[0].parentElement; node && node !== drawing; node = node.parentElement) shift += Number(/translate\((-?[\d.]+)/.exec(node.getAttribute('transform') || '')?.[1] || 0);
			for (const box of boxes) {
				const center = Number(box.getAttribute('x')) + Number(box.getAttribute('width')) / 2;
				box.setAttribute('x', String(Math.round((center - widest / 2) * 100) / 100)); box.setAttribute('width', String(widest));
			}
			const view = (drawing.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number), right = shift + centers[centers.length - 1] + widest / 2 + 16;
			if (view.length === 4 && right > view[0] + view[2]) {
				view[2] = right - view[0]; drawing.setAttribute('viewBox', view.join(' '));
				if (Number(drawing.getAttribute('width'))) drawing.setAttribute('width', String(view[2]));
			}
		}
	}
	for (const word of drawing.querySelectorAll('text[font-size], tspan[font-size]')) if (Number(word.getAttribute('font-size')) < 11) word.setAttribute('font-size', '11');
	if (family('flowchart')) {
		const boxOf = cluster => ['x', 'y', 'width', 'height'].map(key => Number(cluster.querySelector(':scope > rect')?.getAttribute(key)));
		const clusters = [...drawing.querySelectorAll('.pele-clusters > .pele-cluster')].map(cluster => ({cluster, at: boxOf(cluster)})).filter(entry => entry.at.every(Number.isFinite));
		const within = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
		const tops = clusters.filter(entry => !clusters.some(other => other !== entry && within(entry.at, other.at)));
		const points = [...drawing.querySelectorAll('.pele-edges path, .pele-edge-labels rect')].flatMap(mark => {
			if (mark.localName === 'rect') return [[Number(mark.getAttribute('x')), Number(mark.getAttribute('y'))]];
			const numbers = (mark.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number) || [];
			return numbers.flatMap((n, i) => i % 2 ? [] : [[n, numbers[i + 1]]]);
		});
		const free = entry => !points.some(([x, y]) => x >= entry.at[0] && x <= entry.at[0] + entry.at[2] && y >= entry.at[1] && y <= entry.at[1] + entry.at[3]);
		const middle = entry => entry.at[1] + entry.at[3] / 2;
		for (const entry of tops) {
			const row = tops.filter(other => Math.abs(middle(other) - middle(entry)) < 2);
			if (row.length < 2 || row[0] !== entry || !row.every(free)) continue;
			const line = Math.min(...row.map(other => other.at[1]));
			for (const frame of row) {
				const dy = line - frame.at[1];
				if (Math.abs(dy) < .5) continue;
				const inside = at => within(at, frame.at);
				for (const nested of clusters.filter(other => inside(other.at))) {
					const box = nested.cluster.querySelector(':scope > rect');
					box.setAttribute('y', String(Number(box.getAttribute('y')) + dy));
					for (const word of nested.cluster.querySelectorAll(':scope > text, :scope > text tspan[y]')) if (word.hasAttribute('y')) word.setAttribute('y', String(Number(word.getAttribute('y')) + dy));
					for (const title of drawing.querySelectorAll('.pele-cluster-title')) {
						if (title.getAttribute('data-id') !== nested.cluster.getAttribute('data-id')) continue;
						for (const word of title.querySelectorAll('text')) word.setAttribute('y', String(Number(word.getAttribute('y')) + dy));
					}
				}
				for (const node of drawing.querySelectorAll('.pele-nodes > .pele-node')) {
					const at = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(node.getAttribute('transform') || '');
					if (!at || !inside([Number(at[1]), Number(at[2]), 0, 0])) continue;
					node.setAttribute('transform', node.getAttribute('transform').replace(at[0], 'translate(' + at[1] + ',' + (Number(at[2]) + dy) + ')'));
				}
				frame.at[1] = line;
			}
			const foot = Math.max(...row.map(frame => frame.at[1] + frame.at[3]));
			const others = [...drawing.querySelectorAll('.pele-nodes > .pele-node')].map(node => /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(node.getAttribute('transform') || '')).filter(Boolean).map(at => [Number(at[1]), Number(at[2])]);
			for (const frame of row) {
				const room = [frame.at[0], frame.at[1] + frame.at[3], frame.at[2], foot - frame.at[1] - frame.at[3]];
				if (room[3] < .5 || others.some(([x, y]) => x >= room[0] && x <= room[0] + room[2] && y >= room[1] && y <= room[1] + room[3])) continue;
				frame.cluster.querySelector(':scope > rect').setAttribute('height', String(foot - frame.at[1]));
			}
		}
	}
	if (family('flowchart') || family('state') || family('class') || family('usecase')) {
		const frames = [...drawing.querySelectorAll('.pele-clusters > .pele-cluster')].map(cluster => {
			const box = cluster.querySelector(':scope > rect'), at = box && ['x', 'y', 'width', 'height'].map(key => Number(box.getAttribute(key)));
			return box && {cluster, box, at, id: cluster.getAttribute('data-id')};
		}).filter(Boolean);
		const ground = frame => {
			const fill = /(?:^|;)\s*fill:\s*([^;]+)/.exec(frame.box.getAttribute('style') || '')?.[1].trim() || frame.box.getAttribute('fill') || 'var(--_bg)';
			const parent = frames.filter(other => other !== frame && other.at[0] <= frame.at[0] && other.at[1] <= frame.at[1] &&
				other.at[0] + other.at[2] >= frame.at[0] + frame.at[2] && other.at[1] + other.at[3] >= frame.at[1] + frame.at[3])
				.sort((a, b) => a.at[2] * a.at[3] - b.at[2] * b.at[3])[0];
			const under = parent ? ground(parent) : 'var(--_bg)', opacity = Number(frame.box.getAttribute('fill-opacity') ?? 1);
			return fill === 'none' ? under : opacity < 1 ? 'color-mix(in srgb, ' + fill + ' ' + Math.round(opacity * 100) + '%, ' + under + ')' : fill;
		};
		let layer = drawing.querySelector('.pele-cluster-titles');
		const edges = drawing.querySelector('.pele-edges');
		if (!layer && edges) { layer = tree.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.setAttribute('class', 'pele-cluster-titles'); edges.after(layer); }
		for (const frame of layer ? frames : []) {
			const label = frame.cluster.querySelector(':scope > text.pele-cluster-label');
			let title = [...layer.querySelectorAll(':scope > .pele-cluster-title')].find(entry => entry.getAttribute('data-id') === frame.id);
			if (!title && label) {
				title = tree.createElementNS('http://www.w3.org/2000/svg', 'g');
				title.setAttribute('class', 'pele-cluster-title'); title.setAttribute('data-id', frame.id || '');
				const halo = label.cloneNode(true);
				halo.removeAttribute('class'); halo.setAttribute('fill', 'none');
				title.append(halo, label); layer.appendChild(title);
			}
			const halo = title?.querySelector(':scope > text:not(.pele-cluster-label)');
			if (!halo) continue;
			for (const [name, value] of Object.entries({stroke: ground(frame), 'stroke-width': '12', 'stroke-linejoin': 'round'})) halo.setAttribute(name, value);
		}
	}
	const NS = 'http://www.w3.org/2000/svg', stamp = id + '-blend-';
	let defs = null, made = 0;
	const gradient = (stops, horizontal, along) => {
		if (!defs) { defs = tree.createElementNS(NS, 'defs'); drawing.insertBefore(defs, drawing.firstChild); }
		const id = stamp + (made++), shade = tree.createElementNS(NS, 'linearGradient');
		const [x1, y1, x2, y2] = along || [0, 0, horizontal ? 1 : 0, horizontal ? 0 : 1];
		shade.setAttribute('id', id);
		if (along) shade.setAttribute('gradientUnits', 'userSpaceOnUse');
		for (const [name, value] of Object.entries({x1, y1, x2, y2})) shade.setAttribute(name, String(value));
		for (const [offset, color] of stops) {
			const stop = tree.createElementNS(NS, 'stop');
			stop.setAttribute('offset', offset); stop.setAttribute('stop-color', color); shade.appendChild(stop);
		}
		defs.appendChild(shade);
		return 'url(#' + id + ')';
	};
	const ends = line => {
		const numbers = (line.getAttribute('d') || '').match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) || [];
		return numbers.length >= 4 ? [numbers[0], numbers[1], numbers[numbers.length - 2], numbers[numbers.length - 1]] : null;
	};
	const ribbon = new Map([...drawing.querySelectorAll('.pele-sankey-node')].map(node => [node.getAttribute('data-id'), node.getAttribute('fill')]));
	for (const link of drawing.querySelectorAll('.pele-sankey-link')) {
		const [from, to] = (link.getAttribute('data-id') || '').split('->').map(end => ribbon.get(end));
		const own = link.getAttribute('fill');
		if (authored(link, 'fill') || !own) continue;
		const tint = color => 'light-dark(color-mix(in srgb, ' + color + ' 40%, transparent), color-mix(in srgb, ' + color + ' 62%, transparent))';
		link.setAttribute('fill', gradient([['0', tint(from || own)], ['1', tint(to || own)]], true));
		link.parentElement?.setAttribute('fill-opacity', '1');
	}
	if (family('mindmap')) {
		const root = drawing.querySelector('.pele-node > [fill="var(--md-mermaid-series-12)"]');
		const centre = /translate\(([-\d.]+),([-\d.]+)\)/.exec(root?.parentElement.getAttribute('transform') || '')?.slice(1).map(Number) || [0, 0];
		for (const branch of root ? drawing.querySelectorAll('.pele-edges') : []) {
			const color = branch.getAttribute('stroke'), lines = [...branch.querySelectorAll(':scope > path')];
			if (!color || authored(branch, 'stroke')) continue;
			const first = lines.map(line => ({line, at: ends(line)})).filter(entry => entry.at)
				.sort((a, b) => Math.hypot(a.at[0] - centre[0], a.at[1] - centre[1]) - Math.hypot(b.at[0] - centre[0], b.at[1] - centre[1]))[0];
			if (first && !authored(first.line, 'stroke')) first.line.setAttribute('stroke', gradient([['0', 'var(--md-mermaid-series-12)'], ['1', color]], false, first.at));
		}
	}
	if (family('gitGraph')) {
		const lanes = [...drawing.querySelectorAll('.pele-lane')].map(lane => ({color: lane.getAttribute('stroke'), at: ends(lane)})).filter(lane => lane.color && lane.at);
		const laneAt = (x, y) => lanes.find(lane => lane.at[0] === lane.at[2] ? Math.abs(lane.at[0] - x) < .5 : Math.abs(lane.at[1] - y) < .5);
		for (const line of drawing.querySelectorAll('.pele-edges > path')) {
			const at = ends(line);
			if (!at || authored(line, 'stroke')) continue;
			const from = laneAt(at[0], at[1]), to = laneAt(at[2], at[3]);
			if (from && to && from !== to) line.setAttribute('stroke', gradient([['0', from.color], ['1', to.color]], false, at));
		}
	}
	for (const [id, speed] of animated) {
		const line = [...drawing.querySelectorAll('.pele-edge')].find(edge => edge.getAttribute('data-id') === id)?.querySelector(':scope > path:not(.pele-marker)');
		if (!line) continue;
		line.setAttribute('class', 'edge-animation-' + (speed === 'fast' ? 'fast' : 'slow'));
		line.setAttribute('stroke-dasharray', '9 5');
	}
	return new runtime.XMLSerializer().serializeToString(drawing).replaceAll('var(--pele-', 'var(--md-pele-');
}
