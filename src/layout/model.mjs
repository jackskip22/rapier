// SPDX-License-Identifier: MIT
import {layoutNextRichInlineLineRange, materializeRichInlineLineRange} from '../agent/vendor/pretext/rich-inline.js';
import {validLayout} from '../spec/md-layout.mjs';
import {linePlan} from './line-plan.mjs';
import {captureFontAuthority, createPreparationScope, fontReady, invalidateRichMetrics, paragraphItems,
  prepareRichParagraph, supportsRichStyle} from './preparation.mjs';
export {captureFontAuthority, createPreparationScope, invalidateRichMetrics, prepareRichParagraph, supportsRichStyle};

const finite = value => typeof value === 'number' && Number.isFinite(value);
const space = code => code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
export function mapFragment(run, fragment, {whiteSpace = 'normal'} = {}) {
  const raw = typeof run === 'string' ? run : run?.raw;
  if (run?.break === 'never') whiteSpace = 'normal';
  const start = fragment?.sourceStart, end = fragment?.sourceEnd;
  if (typeof raw !== 'string' || typeof fragment?.text !== 'string' ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > raw.length ||
      whiteSpace !== 'normal' && whiteSpace !== 'pre-wrap') return null;
  const pieces = [], offsets = [start];
  let lastSoftHyphen = -1;
  for (let at = start; at < end;) {
    const code = raw.charCodeAt(at);
    if (code === 0xad) {
      lastSoftHyphen = at;
      offsets[offsets.length - 1] = ++at;
    } else if (whiteSpace === 'normal' && space(code)) {
      do { at++; } while (at < end && space(raw.charCodeAt(at)));
      pieces.push(' '); offsets.push(at);
    } else if (whiteSpace === 'pre-wrap' && (code === 10 || code === 13 || code === 12)) {
      at += code === 13 && raw.charCodeAt(at + 1) === 10 && at + 1 < end ? 2 : 1;
      offsets[offsets.length - 1] = at;
    } else {
      pieces.push(raw[at]); offsets.push(++at);
    }
  }
  let text = pieces.join('');
  if (lastSoftHyphen === end - 1 && fragment.text === text + '-') {
    offsets[offsets.length - 1] = lastSoftHyphen;
    offsets.push(end); text += '-';
  }
  return text === fragment.text ? {text, offsets, start, end} : null;
}

export function createLineMeasurer(authority = null) {
  const measurers = new WeakMap();
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  return function lineMetrics(element) {
    const view = element?.ownerDocument?.defaultView;
    if (!view) return null;
    const computed = view.getComputedStyle(element), size = parseFloat(computed.fontSize) || 16;
    const font = computed.fontStyle + ' ' + computed.fontWeight + ' ' + size + 'px ' + computed.fontFamily;
    const document = element.ownerDocument, epoch = authority?.captureFontAuthority(document);
    if (authority) { if (!authority.fontReady(document, font, 'H')) return null; }
    else {
      try {
        if (!document.fonts || document.fonts.status === 'loading' || document.fonts.check(font, 'H') !== true ||
            [...document.fonts].some(face => face.status === 'error')) return null;
      } catch (_) { return null; }
    }
    let state = measurers.get(document);
    if (!state || state.epoch !== epoch) {
      state = {epoch, context: state?.context || document.createElement('canvas').getContext('2d'), metrics: authority ? new Map() : null};
      measurers.set(document, state);
    }
    let metrics = state.metrics?.get(font);
    if (!metrics) {
      const context = state.context;
      if (!context) return null;
      context.font = font;
      const capital = context.measureText('H');
      metrics = {ascent: capital.fontBoundingBoxAscent, descent: capital.fontBoundingBoxDescent, cap: capital.actualBoundingBoxAscent};
      if (![metrics.ascent, metrics.descent, metrics.cap].every(finite) || !(metrics.cap > 0)) return null;
      if (state.metrics) {
        if (state.metrics.size === 64) state.metrics.delete(state.metrics.keys().next().value);
        state.metrics.set(font, metrics);
      }
    }
    const line = parseFloat(computed.lineHeight) || metrics.ascent + metrics.descent;
    return {line, cap: metrics.cap, capTop: (line - metrics.ascent - metrics.descent) / 2 + metrics.ascent - metrics.cap};
  };
}

export const lineMetrics = createLineMeasurer({captureFontAuthority, fontReady});

export function linesHeight(lines, metrics) {
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const height = Number.isInteger(lines) && lines > 0 && metrics && finite(metrics.line) && finite(metrics.cap)
    ? (lines - 1) * metrics.line + metrics.cap : NaN;
  return height > 0 ? height : null;
}

export function linesSlices(slices, layout, metrics, y, height) {
  if (layout?.lines == null || !metrics || !(slices?.length)) return slices;
  const floor = y + height + Math.max(0, metrics.line - metrics.capTop - metrics.cap) - .5;
  return slices.filter(slice => slice.y < floor).map(slice => slice.y + slice.height > floor ? {...slice, height: floor - slice.y} : slice);
}

export const linesTop = (layout, metrics) => layout?.lines != null && finite(metrics?.capTop) ? metrics.capTop : 0;

export function imageBox(columnWidth, naturalWidth, naturalHeight, layout = {}, defaultWidth = naturalWidth, metrics = null) {
  if (![columnWidth, naturalWidth, naturalHeight, defaultWidth].every(value => finite(value) && value > 0) ||
      !validLayout(layout) || layout.align === 'justify') return null;
  const tall = layout.lines == null ? null : linesHeight(layout.lines, metrics);
  const requestedWidth = tall ? tall * naturalWidth / naturalHeight : layout.width == null ? defaultWidth : columnWidth * layout.width / 100;
  if (!finite(requestedWidth) || requestedWidth <= 0) return null;
  const width = Math.min(columnWidth, requestedWidth), height = width * naturalHeight / naturalWidth;
  const center = layout.x == null ? width / 2 : columnWidth * layout.x / 100;
  const x = Math.max(0, Math.min(columnWidth - width, center - width / 2));
  return finite(height) && height > 0 ? {x, width, height} : null;
}

export function rasterReserved(columnWidth, unrotated, rad) {
  if (!unrotated || ![columnWidth, unrotated.x, unrotated.width, unrotated.height].every(value => finite(value) && value >= 0) ||
      columnWidth <= 0 || unrotated.width <= 0 || unrotated.height <= 0) return null;
  if (!rad) return {fit: unrotated, reserved: unrotated, visualDeltaX: 0, visualDeltaY: 0};
  let width = unrotated.width, height = unrotated.height, rotated = rotatedBoundsRad(width, height, rad);
  if (rotated.width > columnWidth) {
    const scale = columnWidth / rotated.width;
    width *= scale;
    height *= scale;
    rotated = rotatedBoundsRad(width, height, rad);
  }
  const center = unrotated.x + unrotated.width / 2;
  const x = Math.max(0, Math.min(columnWidth - rotated.width, center - rotated.width / 2));
  const visualDeltaX = (rotated.width - width) / 2, visualDeltaY = (rotated.height - height) / 2;
  return {fit: {x: x + visualDeltaX, width, height}, reserved: {x, width: rotated.width, height: rotated.height}, visualDeltaX, visualDeltaY};
}


const shapeGrid = 48, alphaThreshold = .1, alphaOversample = 4, profileBands = new WeakMap();
const sliceGridMax = shapeGrid * alphaOversample, slicePixelsPerBand = 6;

export function alphaProfile(image) {
  const src = image.currentSrc || image.getAttribute('src') || '';
  if (!image.complete || !image.naturalWidth || !image.naturalHeight || !src || /^data:image\/jpe?g[;,]/i.test(src)) return null;
  const fine = shapeGrid * alphaOversample;
  const canvas = image.ownerDocument.createElement('canvas');
  canvas.width = canvas.height = fine;
  let data;
  try {
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) return null;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, fine, fine);
    data = context.getImageData(0, 0, fine, fine).data;
  } catch (_) { return null; }
  finally { canvas.width = canvas.height = 0; }
  const bands = [];
  let opaque = true;
  for (let y = 0; y < fine; y++) {
    const runs = [];
    let start = -1;
    for (let x = 0; x <= fine; x++) {
      const alpha = x < fine ? data[(y * fine + x) * 4 + 3] : 0;
      if (x < fine && alpha < 250) opaque = false;
      if (x < fine && alpha > alphaThreshold * 255) { if (start < 0) start = x; }
      else if (start >= 0) { runs.push([start / fine, x / fine]); start = -1; }
    }
    bands.push(runs);
  }
  if (opaque) return null;
  const runsAt = t => bands[Math.max(0, Math.min(fine - 1, Math.floor(t * fine)))];
  return {runsAt,
    spanAt(t) { const runs = runsAt(t); return runs.length ? [runs[0][0], runs.at(-1)[1]] : null; }};
}

export function polygonProfile(corners) {
  return {spanAt(t) {
    const xs = [];
    for (let index = 0; index < corners.length; index++) {
      const [x1, y1] = corners[index], [x2, y2] = corners[(index + 1) % corners.length];
      if ((y1 <= t) === (y2 <= t)) continue;
      xs.push(x1 + (t - y1) / (y2 - y1) * (x2 - x1));
    }
    if (xs.length < 2) return null;
    xs.sort((a, b) => a - b);
    return [xs[0], xs.at(-1)];
  }};
}

export function rotatedBoundsRad(width, height, rad) {
  if (!rad) return {width, height};
  return {width: width * Math.abs(Math.cos(rad)) + height * Math.abs(Math.sin(rad)),
    height: width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad))};
}

export function rasterTiltProfile(width, height, rad) {
  const cs = Math.cos(rad), sn = Math.sin(rad), rotated = rotatedBoundsRad(width, height, rad);
  const local = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]];
  return polygonProfile(local.map(([lx, ly]) => [(rotated.width / 2 + lx * cs - ly * sn) / rotated.width,
    (rotated.height / 2 + lx * sn + ly * cs) / rotated.height]));
}

export function rotatedRasterAlpha(baseAlpha, width, height, rad) {
  if (!baseAlpha) return null;
  if (!rad) return baseAlpha;
  const grid = 48, cs = Math.cos(-rad), sn = Math.sin(-rad), rotated = rotatedBoundsRad(width, height, rad);
  const pivotX = width / 2, pivotY = height / 2, viewX = pivotX - rotated.width / 2, viewY = pivotY - rotated.height / 2;
  const bands = [];
  for (let i = 0; i < grid; i++) {
    const runs = [];
    let start = -1;
    for (let j = 0; j <= grid; j++) {
      let occupied = false;
      if (j < grid) {
        const px = viewX + (j + .5) / grid * rotated.width, py = viewY + (i + .5) / grid * rotated.height;
        const dx = px - pivotX, dy = py - pivotY;
        const nx = (pivotX + dx * cs - dy * sn) / width, ny = (pivotY + dx * sn + dy * cs) / height;
        if (nx >= 0 && nx < 1 && ny >= 0 && ny < 1) occupied = (baseAlpha.runsAt(ny) || []).some(([a, b]) => nx >= a && nx < b);
      }
      if (occupied) { if (start < 0) start = j; } else if (start >= 0) { runs.push([start / grid, j / grid]); start = -1; }
    }
    bands.push(runs);
  }
  return bandsProfile(bands);
}

export function bandsProfile(bands) {
  if (!Array.isArray(bands) || !bands.length) return null;
  const at = t => bands[Math.max(0, Math.min(bands.length - 1, Math.floor(t * bands.length)))] || [];
  return {runsAt: t => at(t), spanAt(t) { const runs = at(t); return runs.length ? [runs[0][0], runs.at(-1)[1]] : null; }};
}

export function serializeProfile(profile, count = shapeGrid) {
  if (!profile) return '';
  const bands = [];
  for (let index = 0; index < count; index++) {
    const t = (index + .5) / count;
    let runs = profile.runsAt ? profile.runsAt(t) : null;
    if (!runs) { const span = profile.spanAt ? profile.spanAt(t) : null; runs = span ? [span] : []; }
    const clean = (runs || []).map(([a, b]) => [Math.max(0, Math.min(1, +a)), Math.max(0, Math.min(1, +b))]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
    bands.push(clean.map(([a, b]) => {
      let left = Math.round(a * 1e4), right = Math.round(b * 1e4);
      if (left === right) { left = Math.floor(a * 1e4); right = Math.ceil(b * 1e4); }
      return (left / 1e4) + '-' + (right / 1e4);
    }).join(','));
  }
  return bands.join('|');
}

export function parseProfile(text) {
  if (typeof text !== 'string' || !text || text.length > 262144) return null;
  const bands = text.split('|').map(band => band ? band.split(',').map(run => run.split('-').map(Number)) : []);
  if (bands.length < 2 || bands.length > 192 || bands.some(band => band.length > 192 || band.some(run => run.length !== 2 || !run.every(Number.isFinite) || run[0] < 0 || run[1] > 1 || run[1] <= run[0]))) return null;
  return bandsProfile(bands);
}

const shoulderSteps = 3, shoulders = Array.from({length: shoulderSteps}, (_, k) => ({from: k / shoulderSteps, to: (k + 1) / shoulderSteps, reach: Math.sqrt(1 - ((k + .5) / shoulderSteps) ** 2)}));

export function frameScale(element) {
  const view = element?.ownerDocument?.defaultView;
  const unit = view ? parseFloat(view.getComputedStyle(element).getPropertyValue('--md-unit')) : NaN;
  return unit > 0 ? unit / 16 : 1;
}

export function pictureSlices(profile, x, y, width, height, scale = 1) {
  const gap = 10 * scale;
  if (!profile) return [{x: x - gap, y: y - gap, width: width + gap * 2, height: height + gap * 2}];
  const count = Math.max(shapeGrid, Math.min(sliceGridMax, Math.ceil((finite(height) && height > 0 ? height : 0) / (slicePixelsPerBand * scale))));
  let byCount = profileBands.get(profile);
  if (!byCount) profileBands.set(profile, byCount = new Map());
  let bands = byCount.get(count);
  if (!bands) {
    bands = [];
    let previous = new Map();
    for (let index = 0; index < count; index++) {
      const top = index / count, bottom = (index + 1) / count;
      const runs = [top, (top + bottom) / 2, bottom - 1e-9].flatMap(t => {
        if (profile.runsAt) return profile.runsAt(t) || [];
        const span = profile.spanAt(t);
        return span ? [span] : [];
      }).filter(run => Number.isFinite(run[0]) && Number.isFinite(run[1]) && run[1] > run[0])
        .sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const run of runs) {
        const tail = merged.at(-1);
        if (tail && run[0] <= tail[1]) tail[1] = Math.max(tail[1], run[1]);
        else merged.push([...run]);
      }
      const current = new Map();
      for (const [left, right] of merged) {
        const key = left + ':' + right;
        let band = previous.get(key);
        if (band) band.bottom = bottom;
        else { band = {left, right, top, bottom}; bands.push(band); }
        current.set(key, band);
      }
      previous = current;
    }
    byCount.set(count, bands);
  }
  const slices = [];
  for (const band of bands) {
    const left = x + band.left * width, right = x + band.right * width, top = y + band.top * height, bottom = y + band.bottom * height;
    slices.push({x: left - gap, y: top, width: right - left + gap * 2, height: bottom - top});
    for (const {from, to, reach} of shoulders) {
      const ext = gap * reach, span = gap * (to - from);
      slices.push({x: left - ext, y: top - gap * to, width: right - left + ext * 2, height: span});
      slices.push({x: left - ext, y: bottom + gap * from, width: right - left + ext * 2, height: span});
    }
  }
  return slices;
}

export function slotsForBand(width, obstacles, top, height, minWidth = 40) {
  if (!finite(width) || width <= 0 || !finite(top) || !finite(height) || height <= 0 ||
      !finite(top + height) || !finite(minWidth) || minWidth <= 0 || !Array.isArray(obstacles)) return null;
  const blocked = [];
  for (const rect of obstacles) {
    if (!rect || !finite(rect.x) || !finite(rect.y) || !finite(rect.width) || rect.width < 0 ||
        !finite(rect.height) || rect.height < 0 || !finite(rect.x + rect.width) || !finite(rect.y + rect.height)) return null;
    if (!rect.width || !rect.height || rect.y >= top + height || rect.y + rect.height <= top) continue;
    const left = Math.max(0, rect.x), right = Math.min(width, rect.x + rect.width);
    if (right > left) blocked.push({left, right});
  }
  blocked.sort((a, b) => a.left - b.left);
  const slots = [];
  let x = 0;
  for (const interval of blocked) {
    if (interval.left - x >= minWidth) slots.push({x, width: interval.left - x});
    x = Math.max(x, interval.right);
  }
  if (width - x >= minWidth) slots.push({x, width: width - x});
  return slots;
}

export function flowLines(flow, width, top, obstacles, lineHeight, minWidth, direction = 'ltr', balance = 0, align = 'start') {
  const items = paragraphItems(flow);
  const plan = linePlan(flow, width, top, obstacles, lineHeight, minWidth, direction, balance, slotsForBand, layoutNextRichInlineLineRange, materializeRichInlineLineRange, items);
  const side = align === 'center' ? 'center' : align === 'left' || align === 'right' ? align
    : (align === 'end') === (direction === 'rtl') ? 'left' : 'right';
  if (!plan || !obstacles?.length) return plan;
  const free = linePlan(flow, width, top, [], lineHeight, minWidth, direction, balance, slotsForBand, layoutNextRichInlineLineRange, materializeRichInlineLineRange, items);
  if (!free) return plan;
  const meets = free.lines.some(line => {
    const words = line.fragments.reduce((sum, fragment) => sum + (fragment.gapBefore || 0) + (fragment.occupiedWidth || 0), 0);
    const left = side === 'left' ? 0 : side === 'right' ? width - words : (width - words) / 2;
    const lineTop = top + line.y;
    return obstacles.some(obstacle => obstacle.width > 0 && obstacle.height > 0 &&
      obstacle.x < left + words && obstacle.x + obstacle.width > left && obstacle.y < lineTop + lineHeight && obstacle.y + obstacle.height > lineTop);
  });
  return meets ? plan : free;
}

export function wrapShape(side, obstacles, width, top) {
	const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
	const rows = obstacles.filter(obstacle => (obstacle.x > width - (obstacle.x + obstacle.width) ? 'right' : 'left') === side);
	if (!rows.length) return null;
	let reach = 0, first = Infinity, last = -Infinity;
	for (const row of rows) {
		reach = Math.max(reach, side === 'left' ? row.x + row.width : width - row.x);
		first = Math.min(first, row.y); last = Math.max(last, row.y + row.height);
	}
	const boxWidth = clamp(reach, 0, width), startY = Math.max(0, first - top);
	const boxHeight = last - top - startY;
	if (boxWidth < 8 || boxHeight <= 0) return null;
	const origin = top + startY, edge = side === 'left' ? 0 : boxWidth;
	const levels = [...new Set([0, boxHeight, ...rows.flatMap(row =>
		[clamp(row.y - origin, 0, boxHeight), clamp(row.y + row.height - origin, 0, boxHeight)])])].sort((a, b) => a - b);
	const points = [[edge, 0]];
	for (let i = 0; i + 1 < levels.length; i++) {
		const a = levels[i], b = levels[i + 1];
		let span = 0;
		for (const row of rows) if (row.y < origin + b && row.y + row.height > origin + a)
			span = Math.max(span, side === 'left' ? row.x + row.width : width - row.x);
		span = clamp(span, 0, boxWidth);
		const x = side === 'left' ? span : boxWidth - span;
		const previous = points.at(-1);
		if (previous[0] !== x) points.push([x, a]);
		else if (points.length > 1) points.pop();
		points.push([x, b]);
	}
	points.push([edge, boxHeight]);
	return {boxWidth, boxHeight, startY, points};
}

export function boxClearance(obstacles, width, top, height, floor) {
	let left = 0, right = 0;
	for (const row of obstacles) {
		if (row.y >= top + height || row.y + row.height <= top || row.x >= width || row.x + row.width <= 0) continue;
		if (row.x > width - (row.x + row.width)) right = Math.max(right, width - row.x);
		else left = Math.max(left, row.x + row.width);
	}
	return left || right ? {left, right, fits: width - left - right >= floor} : null;
}

function contentStart(element) {
	const style = element.ownerDocument.defaultView.getComputedStyle(element), box = element.getBoundingClientRect();
	return style.direction === 'rtl' ? -(box.right - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderRightWidth) || 0))
		: box.left + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
}

export function edgeLines(root, skip = () => false) {
	const doc = root.ownerDocument, view = doc.defaultView, lines = [], starts = new Map();
	const walker = doc.createTreeWalker(root, 4);
	for (let node; (node = walker.nextNode());) {
		if (!node.data.trim() || skip(node)) continue;
		let block = node.parentElement;
		while (block !== root && view.getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
		if (!starts.has(block)) starts.set(block, contentStart(block));
		const rtl = view.getComputedStyle(block).direction === 'rtl', range = doc.createRange();
		range.selectNodeContents(node);
		for (const box of range.getClientRects()) {
			if (!(box.width > 0)) continue;
			const line = lines.find(row => row.block === block && Math.abs(row.top - box.top) < 2);
			const start = rtl ? -box.right : box.left;
			if (line) { line.start = Math.min(line.start, start); line.bottom = Math.max(line.bottom, box.bottom); }
			else lines.push({block, top: box.top, bottom: box.bottom, start, content: starts.get(block)});
		}
	}
	return lines;
}

export function edgeMarks(root, before, skip = () => false) {
	const view = root.ownerDocument.defaultView, home = new Map();
	const byBlock = rows => {
		const blocks = new Map();
		for (const row of rows) { if (!blocks.has(row.block)) blocks.set(row.block, []); blocks.get(row.block).push(row); }
		for (const list of blocks.values()) list.sort((a, b) => a.top - b.top);
		return blocks;
	};
	for (const [block, rows] of byBlock(before)) {
		const content = rows[0].content;
		home.set(block, {content, first: rows[0].start, rest: rows.length > 1 ? Math.min(...rows.slice(1).map(row => row.start)) : content});
	}
	const lines = [];
	for (const [block, rows] of byBlock(edgeLines(root, skip))) rows.forEach((row, index) => {
		const natural = home.get(block);
		if (natural) lines.push({...row, content: natural.content, moved: Math.max(0, row.start - (index ? natural.rest : natural.first))});
	});
	const within = selector => [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
	const shiftOf = item => lines.filter(line => line.block.closest('li') === item).sort((a, b) => a.top - b.top)[0]?.moved || 0;
	const markers = [];
	for (const item of within('li')) {
		if (item.classList.contains('task-list-item')) continue;
		const shift = shiftOf(item);
		if (shift > .5) markers.push({item, shift});
	}
	const steps = [];
	for (const list of within('ol')) {
		const items = [...list.children].filter(child => child.tagName === 'LI');
		items.forEach((item, index) => {
			const next = items[index + 1];
			if (next ? Math.abs(shiftOf(item) - shiftOf(next)) > .5 : list.hasAttribute('data-rapier-list-continues') && shiftOf(item) > .5) steps.push(item);
		});
	}
	const bars = [];
	for (const quote of within('blockquote')) {
		if (!(parseFloat(view.getComputedStyle(quote).borderInlineStartWidth) > 0)) continue;
		const start = contentStart(quote);
		const own = lines.filter(line => quote.contains(line.block)).sort((a, b) => a.top - b.top)
			.map(line => ({...line, shift: line.moved > .5 ? line.moved + line.content - start : 0}));
		if (!own.some(line => line.shift > .5)) continue;
		const box = quote.getBoundingClientRect(), runs = [];
		for (const line of own) {
			const run = runs.at(-1);
			if (run && Math.abs(run.shift - line.shift) <= .5) { run.bottom = line.bottom; continue; }
			if (run) run.end = (run.bottom + line.top) / 2;
			runs.push({shift: line.shift, top: run ? run.end : box.top, bottom: line.bottom});
		}
		runs.at(-1).end = box.bottom;
		bars.push({quote, runs: runs.map(run => ({shift: run.shift, top: run.top, bottom: run.end}))});
	}
	return {markers, bars, steps};
}

export function imageOnly(paragraph, image) {
	const meaningful = node => [...node.childNodes].filter(child => child.nodeType !== 8 &&
		!(child.nodeType === 3 && !child.textContent.trim()));
	const children = meaningful(paragraph);
	return children.length === 1 && (children[0] === image || children[0].nodeType === 1 &&
		children[0].tagName === 'A' && meaningful(children[0]).length === 1 && meaningful(children[0])[0] === image);
}
