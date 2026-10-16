// SPDX-License-Identifier: AGPL-3.0-only
import {createMarkdownRenderer} from '../kit/render-markdown.mjs';
import {RAPIER_MARKDOWN_SPEC, RAPIER_HIGHLIGHT_COLORS, applyMarkdownSpec, installMarkdownMath,
  sourceCharEscaped, splitOpeningFrontmatter, parseInkBody, normalizeFontFamily, fontFamilyCss} from '../agent/markdown-spec.mjs';
import {documentAssets, packAssetIndex, installMarkdownImages, configureParser, dataImage} from '../spec/md-assets.mjs';
import {readFontAssets} from '../spec/document-fonts.mjs';
import {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle} from '../layout/markdown.mjs';
import {_rapierVisibleSourceProjection, _rapierVisibleMarkText, _rapierFindFlexibleSeparatorHits} from './visible-source.mjs';
import {textRoot} from '../kit/ledger/hash.mjs';
import {_splitByTokenStream} from './source-facts.mjs';
import {_rapierNormalizePlainTextPaste} from './plain-paste.mjs';
import {_rapierScanSourceHeadings} from '../agent/markdown.mjs';

const spec = {RAPIER_MARKDOWN_SPEC, RAPIER_HIGHLIGHT_COLORS, applyMarkdownSpec, installMarkdownMath,
  sourceCharEscaped, splitOpeningFrontmatter, parseInkBody, normalizeFontFamily, fontFamilyCss};
const assets = {documentAssets, installMarkdownImages, configureParser, dataImage};
const layout = {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle};

export function sourceAssetSummary(source, floor = 0, parser, index = null) {
  if (!source.includes(']:')) return null;
  const parsed = index || assets.documentAssets(source, parser);
  const blocks = [...parsed.blocks, ...readFontAssets(source, parser).blocks.map(row => ({...row, font: true}))]
    .sort((a, b) => a.start - b.start);
  const opening = spec.splitOpeningFrontmatter(source), rows = [];
  let end = source.length;
  for (let index = blocks.length - 1; index >= 0; index--) {
    const row = blocks[index];
    if (!row.active || !row.topLevel || row.start < Math.max(floor, opening.bodyOffset) || !row.font && (row.status !== 'unverified' ||
        parsed.assets.get(row.id)?.status !== 'unverified') || !/^[ \t\r\n]*$/.test(source.slice(row.end, end))) break;
    rows.push(row); end = row.start;
  }
  if (!rows.length) return null;
  const recordStart = end;
  while (end > Math.max(floor, opening.bodyOffset) && /[ \t\r\n]/.test(source[end - 1])) end--;
  if (end <= opening.bodyOffset && !floor) return null;
  return {start: end, recordStart, count: new Set(rows.map(row => row.id)).size, records: rows.length,
    bytes: new TextEncoder().encode(source.slice(end)).length};
}

export function installSourceWorker(scope) {
  let parser = null, input = null, parts = [], find = null, parse = null;
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
  const progress = fraction => scope.postMessage({id: input?.id, progress: fraction});
  scope.onmessage = event => {
    const data = event.data || {};
    if (data.reqId !== undefined) return (parse ||= blockParser(ensureParser()))(data, scope);
    if (data.operation === 'begin') { input = data; parts = []; find = null; return; }
    if (data.operation === 'part') { if (input) parts.push(String(data.text || '')); return; }
    if (data.operation === 'find' && find) input = {...data, kind: 'find', surface: find.surface};
    else if (data.operation !== 'finish' || !input) return;
    try {
      const source = find ? find.source : parts.join(''); parts = [];
      progress(.3);
      if (input.kind === 'prepare') {
        const floor = Math.max(0, Number(input.floor) || 0);
        const index = input.includeAssets === false ? null : assets.documentAssets(source, source.includes(']:') ? ensureParser() : null);
        const bodyOffset = spec.splitOpeningFrontmatter(source).bodyOffset;
        const summary = input.includeAssets === false ? null
          : sourceAssetSummary(source, floor, ensureParser(), index);
        progress(.75);
        let starts = new Uint32Array(Math.min(65536, source.length + 1)), count = 1, collapsed = 0;
        let lf = source.indexOf('\n'), cr = source.indexOf('\r');
        let sourceStarts = cr >= 0 ? new Uint32Array(starts.length) : null;
        while (lf >= 0 || cr >= 0) {
          let next;
          if (cr >= 0 && (lf < 0 || cr < lf)) {
            next = cr + 1;
            if (lf === next) { next++; collapsed++; lf = source.indexOf('\n', next); }
            cr = source.indexOf('\r', next);
          } else { next = lf + 1; lf = source.indexOf('\n', next); }
          if (count === starts.length) {
            const grown = new Uint32Array(Math.min(source.length + 1, starts.length * 2));
            grown.set(starts); starts = grown;
            if (sourceStarts) {
              const raw = new Uint32Array(starts.length); raw.set(sourceStarts); sourceStarts = raw;
            }
          }
          if (sourceStarts) sourceStarts[count] = next;
          starts[count++] = next - collapsed;
        }
        if (count !== starts.length) {
          starts = starts.slice(0, count);
          if (sourceStarts) sourceStarts = sourceStarts.slice(0, count);
        }
        const imageHashes = index?.blocks.filter(row => row.topLevel).map(row => ({
          start: row.start, end: row.end, hash: textRoot(row.source).split(':')[1],
        })) || [];
        const result = {summary, starts: starts.buffer, sourceStarts: sourceStarts?.buffer || null,
          projectedLength: source.length - collapsed, bodyOffset, imageHashes,
          imageIndex: index ? packAssetIndex(index, bodyOffset) : null};
        scope.postMessage({result}, sourceStarts ? [starts.buffer, sourceStarts.buffer] : [starts.buffer]);
      } else {
        const reused = !!find;
        const visible = reused ? find.visible : input.surface === 'source' ? null : input.hidden
          ? {source, parser: ensureParser(), hidden: input.hidden, read: _rapierVisibleMarkText(source, input.hidden)}
          : _rapierVisibleSourceProjection(source, ensureParser());
        find = {source, visible, surface: input.surface};
        progress(.75);
        const read = visible?.read;
        const found = _rapierFindFlexibleSeparatorHits(read?.text ?? source, input.query, input.limit,
          read?.hidden ?? visible?.hidden ?? null);
        const hits = read ? found.hits.map(read.hit) : found.hits;
        const offsets = new Uint32Array(hits.length * 2);
        hits.forEach((hit, index) => { offsets[index * 2] = hit.start; offsets[index * 2 + 1] = hit.end; });
        const result = {hits: offsets.buffer, shown: hits.map(hit => hit.shown ?? null),
          overflow: found.overflow, flexible: found.flexible};
        const transfer = [offsets.buffer];
        if (!reused) {
          const kinds = [], hidden = visible?.hidden || [], ranges = new Uint32Array(hidden.length * 3);
          hidden.forEach((row, index) => {
            let kind = kinds.indexOf(row.kind);
            if (kind < 0) { kind = kinds.length; kinds.push(row.kind); }
            ranges[index * 3] = row.start; ranges[index * 3 + 1] = row.end; ranges[index * 3 + 2] = kind;
          });
          Object.assign(result, {hidden: ranges.buffer, kinds});
          transfer.push(ranges.buffer);
        }
        scope.postMessage({id: input.id, result}, transfer);
      }
    } catch (error) { scope.postMessage({id: input?.id, error: String(error?.message || error)}); }
    finally { input = null; parts = []; }
  };
}

function blockParser(md) {
  let budget = null;
  const refuse = (reason, observed, limit) => {
    throw Object.assign(new Error(reason), {rapierProjectionRefusal: true, reason, observed, limit});
  };
  const spend = (dimension, amount, reason) => {
    if (!budget) return;
    budget.used[dimension] += amount;
    budget.used.nodes += amount;
    if (budget.used[dimension] > budget.limits[dimension]) refuse(reason, budget.used[dimension], budget.limits[dimension]);
    if (budget.used.nodes > budget.limits.nodes) refuse('wysiwyg_node_limit', budget.used.nodes, budget.limits.nodes);
  };
  const blockState = md.block.State.prototype, inlineState = md.inline.State.prototype;
  const blockPush = blockState.push;
  blockState.push = function (...args) {
    const token = blockPush.apply(this, args);
    spend('tokens', 1, 'wysiwyg_token_limit');
    return token;
  };
  let inlineDepth = 0;
  for (const name of ['push', 'pushPending']) {
    const original = inlineState[name];
    inlineState[name] = function (...args) {
      const outer = inlineDepth++ === 0, before = outer ? this.tokens.length : 0;
      try {
        const token = original.apply(this, args);
        if (outer) spend('inlineCandidates', this.tokens.length - before, 'wysiwyg_inline_limit');
        return token;
      } finally { inlineDepth--; }
    };
  }
  md.core.ruler.before('inline', 'rapier_projection_block_budget', state => {
    if (!budget) return;
    const blocks = state.tokens.reduce((count, token) => count + (token.level === 0 && token.nesting !== -1 && token.map ? 1 : 0), 0);
    budget.used.blocks = blocks;
    if (blocks > budget.limits.blocks) refuse('wysiwyg_block_limit', blocks, budget.limits.blocks);
  });
  const bareLinkCandidate = /@|[^\x00-\x7f]|\.\S/, linkTest = md.linkify.test;
  md.linkify.test = function (text) {
    if (!bareLinkCandidate.test(text)) {
      const schema = this.re.get_schema_search();
      schema.lastIndex = 0;
      if (!schema.test(text)) return false;
    }
    return linkTest.call(this, text);
  };
  const split = (markdown, references, tokens = null) => _splitByTokenStream(markdown, md, {references: references || Object.create(null)}, tokens);
  const blockTokens = (markdown, references) => {
    const env = {references: references || Object.create(null)}, state = new md.core.State(markdown, md, env);
    for (const rule of md.core.ruler.__rules__) {
      if (rule.name === 'inline') break;
      if (rule.enabled) rule.fn(state);
    }
    const tokens = state.tokens;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].type === 'inline' && tokens[i - 1].type === 'heading_open') {
        tokens[i].children = [];
        md.inline.parse(tokens[i].content, md, env, tokens[i].children);
      }
    }
    return tokens;
  };
  return (data, scope) => {
    const reqId = data.reqId;
    if (data.headingsOnly) {
      const scanned = _rapierScanSourceHeadings(String(data.markdown || ''), Number(data.limit) || 0);
      scope.postMessage({reqId, headings: scanned.buffer, headingsTotal: scanned.total}, [scanned.buffer]);
      return;
    }
    let markdown = data.markdown || '', blocks = [], error = null, refusal = null;
    const limits = data.limits || {};
    budget = {limits: Object.fromEntries(['blocks', 'tokens', 'inlineCandidates', 'nodes'].map(name => {
      const limit = Number(limits[name]);
      return [name, Number.isFinite(limit) ? limit : Infinity];
    })), used: {blocks: 0, tokens: 0, inlineCandidates: 0, nodes: 0}};
    const timing = {received: performance.now(), parseMs: 0, blockOnlyMs: 0, twoPhase: data.twoPhase === true};
    try {
      if (data.plainText) markdown = _rapierNormalizePlainTextPaste(markdown);
      const t0 = performance.now();
      blocks = split(markdown, data.references, data.twoPhase ? blockTokens(markdown, data.references) : null);
      timing.parseMs = performance.now() - t0;
      if (data.timeBlockOnly) {
        const t1 = performance.now(), state = new md.core.State(markdown, md, {});
        for (const rule of md.core.ruler.__rules__) { if (rule.name === 'inline') break; if (rule.enabled) rule.fn(state); }
        timing.blockOnlyMs = performance.now() - t1;
        timing.blockOnlyTokens = state.tokens.length;
      }
    } catch (err) {
      if (err?.rapierProjectionRefusal) refusal = {reason: String(err.reason || err.message), observed: Number(err.observed || 0), limit: Number(err.limit || 0)};
      else error = String(err?.message || err);
    }
    budget = null;
    if (refusal) { scope.postMessage({reqId, refusal}); return; }
    const metrics = {...blocks._rapierProjectionMetrics || {blocks: blocks.length, tokens: 0, inlineCandidates: 0, nodes: blocks.length}, timing};
    const exceeded = [
      ['wysiwyg_block_limit', metrics.blocks, limits.blocks],
      ['wysiwyg_token_limit', metrics.tokens, limits.tokens],
      ['wysiwyg_inline_limit', metrics.inlineCandidates, limits.inlineCandidates],
      ['wysiwyg_node_limit', metrics.nodes, limits.nodes],
    ].find(row => Number.isFinite(row[2]) && row[1] > row[2]);
    if (exceeded) { scope.postMessage({reqId, refusal: {reason: exceeded[0], observed: exceeded[1], limit: exceeded[2]}}); return; }
    const blockTypes = [], typeIndexes = Object.create(null), blockSpans = new Int32Array(blocks.length * 3);
    blocks.forEach((block, index) => {
      const type = String(block.type || 'paragraph');
      let typeIndex = typeIndexes[type];
      if (typeIndex == null) { typeIndex = typeIndexes[type] = blockTypes.length; blockTypes.push(type); }
      blockSpans[index * 3] = typeIndex;
      blockSpans[index * 3 + 1] = Number(block._sourceStart || 0);
      blockSpans[index * 3 + 2] = Number(block._sourceEnd || 0);
    });
    scope.postMessage({reqId, phase: data.twoPhase ? 1 : 0, blockTypes, blockSpans: blockSpans.buffer,
      facts: blocks._rapierFacts || [], metrics, source: data.plainText ? markdown : null, error}, [blockSpans.buffer]);
    if (!data.twoPhase || error) return;
    try {
      const t2 = performance.now(), full = split(markdown, data.references);
      scope.postMessage({reqId, phase: 2, facts: full._rapierFacts || [], metrics: {timing: {inlineMs: performance.now() - t2}}});
    } catch (err) {
      scope.postMessage({reqId, phase: 2, facts: null, error: String(err?.message || err)});
    }
  };
}

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

function sourceFindSession(source, surface, parser, createWorker) {
  const worker = createWorker();
  let active = null, queued = null, ready = false, serial = 0;
  const cancelled = () => Object.assign(new Error('Cancelled'), {name: 'AbortError'});
  const session = {source, surface, parser, disposed: false, metadata: null, visible: null,
    dispose(error = cancelled()) {
      if (session.disposed) return;
      session.disposed = true;
      active?.finish(error); queued?.finish(error);
      active = queued = null;
      session.metadata = session.visible = session.source = session.parser = null;
      worker.terminate();
    },
    request(query, limit, task) {
      if (session.disposed || task.signal?.aborted) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        active?.finish(cancelled()); queued?.finish(cancelled());
        const entry = {id: ++serial, query, limit, task, settled: false,
          finish(error, result) {
            if (entry.settled) return;
            entry.settled = true;
            task.signal?.removeEventListener('abort', abort);
            if (error) reject(error); else resolve(result);
          }};
        const abort = () => { entry.finish(cancelled()); if (queued === entry) queued = null; };
        task.signal?.addEventListener('abort', abort, {once: true});
        queued = entry;
        dispatch();
      });
    }};
  const progress = fraction => {
    const entry = queued || active;
    if (entry && !entry.settled) entry.task.set(.75 * fraction);
  };
  const dispatch = () => {
    if (session.disposed || active || !queued) return;
    active = queued; queued = null;
    if (ready) {
      try { worker.postMessage({operation: 'find', id: active.id, query: active.query, limit: active.limit}); }
      catch (error) { session.dispose(error); }
      return;
    }
    const feed = async () => {
      worker.postMessage({operation: 'begin', kind: 'find', surface, id: active.id,
        query: active.query, limit: active.limit});
      let started = performance.now();
      for (let at = 0; at < source.length; at += 65536) {
        if (session.disposed) return;
        worker.postMessage({operation: 'part', text: source.slice(at, at + 65536)});
        if (performance.now() - started >= 4) {
          progress(.25 * Math.min(1, (at + 65536) / source.length));
          await new Promise(resolve => setTimeout(resolve, 0));
          started = performance.now();
        }
      }
      if (!session.disposed) worker.postMessage({operation: 'finish'});
    };
    void feed().catch(error => session.dispose(error));
  };
  worker.onmessage = event => {
    const data = event.data || {};
    if (session.disposed || !active || data.id !== active.id) return;
    if (typeof data.progress === 'number') { progress(data.progress); return; }
    if (data.error) { session.dispose(new Error(data.error)); return; }
    if (data.result.hidden) session.metadata = {hidden: data.result.hidden, kinds: data.result.kinds};
    ready = true;
    active.finish(null, data.result); active = null;
    dispatch();
  };
  worker.onerror = event => session.dispose(new Error(event.message || 'Source worker failed'));
  return session;
}

export async function sourceFindIndex(source, query, surface, memo, task, {parser, limit, createWorker, now} = {}) {
  task.check();
  let session = memo?.worker;
  if (!session || session.disposed || session.source !== source || session.parser !== parser || session.surface !== surface) {
    session?.dispose();
    session = sourceFindSession(source, surface, parser, createWorker);
    if (memo) memo.worker = session;
  }
  try {
    const response = await session.request(query, limit, task);
    task.check();
    const offsets = new Uint32Array(response.hits), hits = [];
    if (surface !== 'source' && !session.visible) {
      const metadata = session.metadata;
      const hiddenOffsets = new Uint32Array(metadata.hidden), hidden = [];
      let started = now();
      for (let at = 0; at < hiddenOffsets.length; at += 3) {
        hidden.push({start: hiddenOffsets[at], end: hiddenOffsets[at + 1], kind: metadata.kinds[hiddenOffsets[at + 2]]});
        if (now() - started >= 8) { await task.yield(.6 + .1 * at / Math.max(1, hiddenOffsets.length)); started = now(); }
      }
      task.check();
      const visible = {source, parser, hidden, get read() {
        const read = _rapierVisibleMarkText(source, hidden);
        Object.defineProperty(visible, 'read', {value: read, enumerable: true});
        return read;
      }};
      session.visible = visible;
      session.metadata = null;
    }
    for (let at = 0; at < offsets.length; at += 2) hits.push({start: offsets[at], end: offsets[at + 1],
      ...(response.shown[at / 2] == null ? {} : {shown: response.shown[at / 2]})});
    const visible = session.visible;
    if (memo && memo.visible !== visible) { memo.visible = visible; memo.spans = null; memo.blocks = new Map(); }
    return {hits, visible, overflow: response.overflow, flexible: response.flexible,
      maps: {projections: new Map(), ordinals: new Map(), shownHits: new Map()}};
  } finally { if (!memo) session.dispose(); }
}
