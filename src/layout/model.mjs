// SPDX-License-Identifier: MIT
import {prepareWithSegments} from '../agent/vendor/pretext/layout.js';
import {layoutNextRichInlineLineRange, materializeRichInlineLineRange} from '../agent/vendor/pretext/rich-inline.js';
import {validLayout} from '../spec/md-layout.mjs';
import {linePlan} from './line-plan.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const space = code => code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
let graphemeSegmenter;

function normalize(raw) {
  let start = 0, end = raw.length;
  while (start < end && space(raw.charCodeAt(start))) start++;
  while (end > start && space(raw.charCodeAt(end - 1))) end--;
  const pieces = [], offsets = [start];
  for (let cursor = start; cursor < end;) {
    if (space(raw.charCodeAt(cursor))) {
      while (cursor < end && space(raw.charCodeAt(cursor))) cursor++;
      pieces.push(' ');
      offsets.push(cursor);
    } else {
      const from = cursor;
      while (cursor < end && !space(raw.charCodeAt(cursor))) offsets.push(++cursor);
      pieces.push(raw.slice(from, cursor));
    }
  }
  return {text: pieces.join(''), offsets, trimStart: start, trimEnd: end};
}

export function prepareRun(raw, font, letterSpacing = 0) {
  if (typeof raw !== 'string' || typeof font !== 'string' || !font.trim() || !finite(letterSpacing)) return null;
  const normalized = normalize(raw);
  const prepared = prepareWithSegments(normalized.text, font, {letterSpacing});
  if (!Array.isArray(prepared.segments) || prepared.segments.join('') !== normalized.text) return null;
  const segmentOffsets = [0];
  for (const segment of prepared.segments) segmentOffsets.push(segmentOffsets.at(-1) + segment.length);
  return {raw, font, letterSpacing, ...normalized, prepared, segmentOffsets, graphemes: new Map()};
}

function normalizedOffset(run, cursor) {
  if (!run?.prepared || !cursor || !Number.isInteger(cursor.segmentIndex) || !Number.isInteger(cursor.graphemeIndex)) return null;
  const {segmentIndex, graphemeIndex} = cursor;
  const segments = run.prepared.segments;
  if (segmentIndex < 0 || segmentIndex > segments.length || graphemeIndex < 0) return null;
  if (segmentIndex === segments.length) return graphemeIndex === 0 ? run.text.length : null;
  let offsets = run.graphemes.get(segmentIndex);
  if (!offsets) {
    graphemeSegmenter ||= new Intl.Segmenter(undefined, {granularity: 'grapheme'});
    offsets = [0];
    for (const part of graphemeSegmenter.segment(segments[segmentIndex])) offsets.push(part.index + part.segment.length);
    run.graphemes.set(segmentIndex, offsets);
  }
  return graphemeIndex < offsets.length ? run.segmentOffsets[segmentIndex] + offsets[graphemeIndex] : null;
}

export function cursorOffset(run, cursor) {
  const offset = normalizedOffset(run, cursor);
  return offset === null ? null : run.offsets[offset];
}

export function mapFragment(run, fragment) {
  if (typeof fragment?.text !== 'string') return null;
  const from = normalizedOffset(run, fragment.start), to = normalizedOffset(run, fragment.end);
  if (from === null || to === null || to < from) return null;
  const source = run.text.slice(from, to);
  const plain = source.replaceAll('\u00ad', '');
  const hyphen = fragment.text === plain + '-' && source.endsWith('\u00ad') &&
    fragment.end.graphemeIndex === 0 && fragment.end.segmentIndex < run.prepared.segments.length;
  if (fragment.text !== plain && !hyphen) return null;
  const offsets = [run.offsets[from]];
  for (let index = from; index < to; index++) {
    if (run.text.charCodeAt(index) === 0xad) {
      if (hyphen && index === to - 1) {
        offsets.push(run.offsets[index + 1]);
      } else offsets[offsets.length - 1] = run.offsets[index + 1];
    } else {
      offsets.push(run.offsets[index + 1]);
    }
  }
  return {text: fragment.text, offsets, start: run.offsets[from], end: run.offsets[to]};
}

export function imageBox(columnWidth, naturalWidth, naturalHeight, layout = {}, defaultWidth = naturalWidth) {
  if (![columnWidth, naturalWidth, naturalHeight, defaultWidth].every(value => finite(value) && value > 0) ||
      !validLayout(layout) || layout.align === 'justify') return null;
  const requestedWidth = layout.width == null ? defaultWidth : columnWidth * layout.width / 100;
  if (!finite(requestedWidth) || requestedWidth <= 0) return null;
  const width = Math.min(columnWidth, requestedWidth), height = width * naturalHeight / naturalWidth;
  const center = layout.x == null ? width / 2 : columnWidth * layout.x / 100;
  const x = Math.max(0, Math.min(columnWidth - width, center - width / 2));
  return finite(height) && height > 0 ? {x, width, height} : null;
}

// Fit-then-clamp: scale until the turned AABB fits the column, then clamp its x. One result for live editor, styled export and Share.
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

// The picture's silhouette as 48 bands of horizontal runs, read from its alpha at four times that resolution both ways: a band
// holds the ink of its four pixel rows, and a run's ends fall on a 192nd of the picture's width, so the standoff a slice adds
// (`pictureSlices`' `gap`) is the least distance from the words to the paint however large the picture is drawn. At 48 columns
// a run's end drifted by a 48th of the width (9 px at 430) and a thin stroke fell between two samples.
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
  for (let band = 0; band < shapeGrid; band++) {
    const ink = new Uint8Array(fine);
    for (let y = band * alphaOversample; y < (band + 1) * alphaOversample; y++) {
      for (let x = 0; x < fine; x++) {
        const alpha = data[(y * fine + x) * 4 + 3];
        if (alpha < 250) opaque = false;
        if (alpha > alphaThreshold * 255) ink[x] = 1;
      }
    }
    const runs = [];
    let start = -1;
    for (let x = 0; x <= fine; x++) {
      if (x < fine && ink[x]) { if (start < 0) start = x; }
      else if (start >= 0) { runs.push([start / fine, x / fine]); start = -1; }
    }
    bands.push(runs);
  }
  if (opaque) return null;
  const runsAt = t => bands[Math.max(0, Math.min(shapeGrid - 1, Math.floor(t * shapeGrid)))];
  return {runsAt,
    spanAt(t) { const runs = runsAt(t); return runs.length ? [runs[0][0], runs.at(-1)[1]] : null; }};
}

// Scanline intersection over a normalized polygon; the one implementation for live and export wrap=box.
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

// F75-11: w'=w|cos|+h|sin|, h'=w|sin|+h|cos| (markdown-standard.md). Shared by browser.js, interchange.js and share.js.
export function rotatedBoundsRad(width, height, rad) {
  if (!rad) return {width, height};
  return {width: width * Math.abs(Math.cos(rad)) + height * Math.abs(Math.sin(rad)),
    height: width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad))};
}

// The `wrap=box` obstacle for a turned raster: its own untilted rectangle's four corners, rotated
// `rad` about its centre, normalized into the turned bounding box's own [0,1] space.
export function rasterTiltProfile(width, height, rad) {
  const cs = Math.cos(rad), sn = Math.sin(rad), rotated = rotatedBoundsRad(width, height, rad);
  const local = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]];
  return polygonProfile(local.map(([lx, ly]) => [(rotated.width / 2 + lx * cs - ly * sn) / rotated.width,
    (rotated.height / 2 + lx * sn + ly * cs) / rotated.height]));
}

// Each 48x48 cell of the turned box is unrotated into the raster's own pixels and sampled.
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

// One occupancy descriptor (I02): the editor's profile sampled at 48 band centres, shipped as data-rapier-occupancy, read back here.
export function bandsProfile(bands) {
  if (!Array.isArray(bands) || !bands.length) return null;
  const at = t => bands[Math.max(0, Math.min(bands.length - 1, Math.floor(t * bands.length)))] || [];
  return {runsAt: t => at(t), spanAt(t) { const runs = at(t); return runs.length ? [runs[0][0], runs.at(-1)[1]] : null; }};
}

export function serializeProfile(profile, count = shapeGrid) {
  if (!profile) return '';
  const bands = [];
  let any = false;
  for (let index = 0; index < count; index++) {
    const t = (index + .5) / count;
    let runs = profile.runsAt ? profile.runsAt(t) : null;
    if (!runs) { const span = profile.spanAt ? profile.spanAt(t) : null; runs = span ? [span] : []; }
    const clean = (runs || []).map(([a, b]) => [Math.max(0, Math.min(1, +a)), Math.max(0, Math.min(1, +b))]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
    if (clean.length) any = true;
    bands.push(clean.map(([a, b]) => {
      let left = Math.round(a * 1e4), right = Math.round(b * 1e4);
      // A narrow occupied run must not round to an invalid zero-width descriptor.
      if (left === right) { left = Math.floor(a * 1e4); right = Math.ceil(b * 1e4); }
      return (left / 1e4) + '-' + (right / 1e4);
    }).join(','));
  }
  return any ? bands.join('|') : '';
}

export function parseProfile(text) {
  if (typeof text !== 'string' || !text) return null;
  const bands = text.split('|').map(band => band ? band.split(',').map(run => run.split('-').map(Number)) : []);
  if (bands.length < 2 || bands.some(band => band.some(run => run.length !== 2 || !run.every(Number.isFinite) || run[0] < 0 || run[1] > 1 || run[1] <= run[0]))) return null;
  return bandsProfile(bands);
}

export function pictureSlices(profile, x, y, width, height, gap = 10) {
  if (!profile) return [{x: x - gap, y: y - gap, width: width + gap * 2, height: height + gap * 2}];
  let bands = profileBands.get(profile);
  if (!bands) {
    bands = [];
    let previous = new Map();
    for (let index = 0; index < shapeGrid; index++) {
      const top = index / shapeGrid, bottom = (index + 1) / shapeGrid;
      // Sampled just inside the bottom edge: on the edge itself a band profile answers with the next band's row and the slice runs a row long.
      const runs = [top, (top + bottom) / 2, bottom - 1e-9].flatMap(t => {
        if (profile.runsAt) return profile.runsAt(t) || [];
        const span = profile.spanAt(t);
        return span ? [span] : [];
      }).filter(run => Number.isFinite(run[0]) && Number.isFinite(run[1]) && run[1] > run[0])
        .sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const run of runs) {
        const last = merged.at(-1);
        if (last && run[0] <= last[1]) last[1] = Math.max(last[1], run[1]);
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
    profileBands.set(profile, bands);
  }
  return bands.map(band => ({x: x + band.left * width - gap, y: y + band.top * height - gap,
    width: (band.right - band.left) * width + gap * 2, height: (band.bottom - band.top) * height + gap * 2}));
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

export function flowLines(flow, width, top, obstacles, lineHeight, minWidth, direction = 'ltr', balance = 0) {
  return linePlan(flow, width, top, obstacles, lineHeight, minWidth, direction, balance, slotsForBand, layoutNextRichInlineLineRange, materializeRichInlineLineRange);
}

// ---- The one wrap shape (live: globalThis.RapierImageLayout; export: modules["layout/model.mjs"]) ----
// `obstacles` in the paragraph's coordinates. Null when nothing to flow around or too narrow for a float.
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

// ---- The one "paragraph holds only the picture": one meaningful child, the image or an <a> wrapping only it ----
export function imageOnly(paragraph, image) {
	const meaningful = node => [...node.childNodes].filter(child => child.nodeType !== 8 &&
		!(child.nodeType === 3 && !child.textContent.trim()));
	const children = meaningful(paragraph);
	return children.length === 1 && (children[0] === image || children[0].nodeType === 1 &&
		children[0].tagName === 'A' && meaningful(children[0]).length === 1 && meaningful(children[0])[0] === image);
}
