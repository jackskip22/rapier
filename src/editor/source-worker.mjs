// SPDX-License-Identifier: AGPL-3.0-only
import {createMarkdownRenderer} from '../kit/render-markdown.mjs';
import {RAPIER_MARKDOWN_SPEC, RAPIER_HIGHLIGHT_COLORS, applyMarkdownSpec, installMarkdownMath,
  sourceCharEscaped, splitOpeningFrontmatter, parseInkBody} from '../agent/markdown-spec.mjs';
import {documentAssets, installMarkdownImages, configureParser, dataImage} from '../spec/md-assets.mjs';
import {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle} from '../layout/markdown.mjs';
import {_rapierVisibleSourceProjection, _rapierVisibleMarkText} from './visible-source.mjs';

const spec = {RAPIER_MARKDOWN_SPEC, RAPIER_HIGHLIGHT_COLORS, applyMarkdownSpec, installMarkdownMath,
  sourceCharEscaped, splitOpeningFrontmatter, parseInkBody};
const assets = {documentAssets, installMarkdownImages, configureParser, dataImage};
const layout = {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle};

export function sourceAssetSummary(source, floor = 0, parser) {
  if (!source.includes(']:')) return null;
  const parsed = assets.documentAssets(source, parser);
  const opening = spec.splitOpeningFrontmatter(source), rows = [];
  let end = source.length;
  for (let index = parsed.blocks.length - 1; index >= 0; index--) {
    const row = parsed.blocks[index];
    if (!row.active || !row.topLevel || row.start < Math.max(floor, opening.bodyOffset) || row.status !== 'unverified' ||
        parsed.assets.get(row.id)?.status !== 'unverified' || !/^[ \t\r\n]*$/.test(source.slice(row.end, end))) break;
    rows.push(row); end = row.start;
  }
  if (!rows.length) return null;
  const recordStart = end;
  // Keep the separator with the hidden definitions so prose deletion cannot join onto one.
  while (end > Math.max(floor, opening.bodyOffset) && /[ \t\r\n]/.test(source[end - 1])) end--;
  if (end <= opening.bodyOffset && !floor) return null;
  return {start: end, recordStart, count: new Set(rows.map(row => row.id)).size, records: rows.length,
    bytes: new TextEncoder().encode(source.slice(end)).length};
}

// The worker reads the same source and grammar. Only offsets and derived facts return.
export function installSourceWorker(scope) {
  let parser = null, input = null, parts = [];
  const ensureParser = () => {
    if (parser) return parser;
    const renderer = createMarkdownRenderer({window: scope,
      globalThis: {RapierImageAssets: assets, RapierMarkdownSpec: spec, RapierMarkdownLayout: layout},
      RAPIER_MARKDOWN_SPEC: spec.RAPIER_MARKDOWN_SPEC,
      RAPIER_HIGHLIGHT_COLOR_BY_MARKER: Object.fromEntries(Object.entries(spec.RAPIER_HIGHLIGHT_COLORS).map(([key, value]) => [value, key])),
      _rapierApplyMarkdownSpec: spec.applyMarkdownSpec, _rapierInstallMarkdownMath: spec.installMarkdownMath,
      _rapierSourceCharEscaped: spec.sourceCharEscaped, _rapierSplitOpeningFrontmatter: spec.splitOpeningFrontmatter});
    renderer.initMarkdownIt(); parser = renderer.parser();
    assets.configureParser(parser, spec.splitOpeningFrontmatter);
    return parser;
  };
  const progress = fraction => scope.postMessage({progress: fraction});
  scope.onmessage = event => {
    const data = event.data || {};
    if (data.operation === 'begin') { input = data; parts = []; return; }
    if (data.operation === 'part') { if (input) parts.push(String(data.text || '')); return; }
    if (data.operation !== 'finish' || !input) return;
    try {
      const source = parts.join(''); parts = [];
      progress(.3);
      if (input.kind === 'prepare') {
        const floor = Math.max(0, Number(input.floor) || 0);
        const summary = input.includeAssets === false ? null
          : sourceAssetSummary(source, floor, source.includes(']:') ? ensureParser() : null);
        progress(.75);
        const normalized = source.includes('\r') ? source.replace(/\r\n?/g, '\n') : source;
        const lines = [0];
        for (let at = normalized.indexOf('\n'); at >= 0; at = normalized.indexOf('\n', at + 1)) lines.push(at + 1);
        const starts = new Uint32Array(lines);
        scope.postMessage({result: {summary, starts: starts.buffer}}, [starts.buffer]);
      } else {
        const visible = input.surface === 'source' ? null : input.hidden
          ? {source, parser: ensureParser(), hidden: input.hidden, read: _rapierVisibleMarkText(source, input.hidden)}
          : _rapierVisibleSourceProjection(source, ensureParser());
        progress(.75);
        const read = visible?.read;
        const found = scope._rapierFindFlexibleSeparatorHits(read?.text ?? source, input.query, input.limit,
          read?.hidden ?? visible?.hidden ?? null);
        const hits = read ? found.hits.map(read.hit) : found.hits;
        const offsets = new Uint32Array(hits.length * 2);
        hits.forEach((hit, index) => { offsets[index * 2] = hit.start; offsets[index * 2 + 1] = hit.end; });
        const kinds = [], hidden = visible?.hidden || [], ranges = new Uint32Array(hidden.length * 3);
        hidden.forEach((row, index) => {
          let kind = kinds.indexOf(row.kind);
          if (kind < 0) { kind = kinds.length; kinds.push(row.kind); }
          ranges[index * 3] = row.start; ranges[index * 3 + 1] = row.end; ranges[index * 3 + 2] = kind;
        });
        scope.postMessage({result: {hits: offsets.buffer, shown: hits.map(hit => hit.shown ?? null),
          hidden: ranges.buffer, kinds, overflow: found.overflow, flexible: found.flexible}}, [offsets.buffer, ranges.buffer]);
      }
    } catch (error) { scope.postMessage({error: String(error?.message || error)}); }
    finally { input = null; parts = []; }
  };
}

// Source strings cross the worker boundary in bounded pieces; cancellation retires that request's worker.
export async function requestSourceWork(source, request, {createWorker, signal, onProgress, yield: pause} = {}) {
  if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
  const worker = createWorker();
  let settle, fail, finished = false;
  const completion = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
  const abort = () => { finished = true; fail(Object.assign(new Error('Cancelled'), {name: 'AbortError'})); };
  signal?.addEventListener('abort', abort, {once: true});
  worker.onmessage = event => {
    const data = event.data || {};
    if (typeof data.progress === 'number') { onProgress?.(data.progress); return; }
    finished = true;
    if (data.error) fail(new Error(data.error)); else settle(data.result);
  };
  worker.onerror = event => { finished = true; fail(new Error(event.message || 'Source worker failed')); };
  const feed = async () => {
    worker.postMessage({operation: 'begin', ...request});
    let started = performance.now();
    for (let at = 0; at < source.length; at += 65536) {
      if (signal?.aborted || finished) return;
      worker.postMessage({operation: 'part', text: source.slice(at, at + 65536)});
      if (performance.now() - started >= 8) {
        onProgress?.(.25 * Math.min(1, (at + 65536) / source.length));
        await (pause ? pause() : new Promise(resolve => setTimeout(resolve, 0)));
        started = performance.now();
      }
    }
    if (!signal?.aborted && !finished) worker.postMessage({operation: 'finish'});
  };
  void feed().catch(error => { finished = true; fail(error); });
  try { return await completion; }
  finally { finished = true; signal?.removeEventListener('abort', abort); worker.terminate(); }
}

// Decode a Find worker result through the same visible-source owner. The page supplies its
// parser identity and current-work guard; DOM ranges and picture results stay with the page.
export async function sourceFindIndex(source, query, surface, memo, task, {parser, limit, createWorker, now} = {}) {
	const prior = memo?.visible;
	const response = await requestSourceWork(source,
		{kind: 'find', query, surface, limit: limit,
			hidden: prior?.source === source && prior.parser === parser ? prior.hidden : null},
		{createWorker: createWorker, signal: task.signal, yield: task.yield,
			onProgress: fraction => task.set(.75 * fraction)});
	task.check();
	const offsets = new Uint32Array(response.hits), hiddenOffsets = new Uint32Array(response.hidden);
	const hidden = [], hits = [];
	let started = now();
	for (let at = 0; at < hiddenOffsets.length; at += 3) {
		hidden.push({start: hiddenOffsets[at], end: hiddenOffsets[at + 1], kind: response.kinds[hiddenOffsets[at + 2]]});
		if (now() - started >= 8) { await task.yield(.6 + .1 * at / Math.max(1, hiddenOffsets.length)); started = now(); }
	}
	for (let at = 0; at < offsets.length; at += 2) hits.push({start: offsets[at], end: offsets[at + 1],
		...(response.shown[at / 2] == null ? {} : {shown: response.shown[at / 2]})});
	const visible = surface === 'source' ? null : {source, parser, hidden, read: _rapierVisibleMarkText(source, hidden)};
	if (visible && memo) { memo.visible = visible; memo.spans = null; memo.blocks = new Map(); }
	return {hits, visible, overflow: response.overflow, flexible: response.flexible,
		maps: {projections: new Map(), ordinals: new Map(), shownHits: new Map()}};
}
