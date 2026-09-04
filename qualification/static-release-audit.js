#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.resolve(process.argv[2] || '.');
const htmlPath = path.join(root, 'rapier.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const headersPath = path.join(root, '_headers');
const headersSource = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
const failures = [];
let checks = 0;

function check(name, condition, detail) {
  checks += 1;
  if (condition) {
    process.stdout.write(`PASS ${name}\n`);
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  process.stdout.write(`FAIL ${name}${detail ? ` — ${detail}` : ''}\n`);
}

const metaMatch = html.match(/<meta\s+name="rapier-version"\s+content="([^"]+)"/);
const version = metaMatch && metaMatch[1];
check('semantic release identity exists', /^\d+\.\d+\.\d+$/.test(version || ''));

/* One token, two carriers (README.md "The Chrome origin trial"): the _headers Origin-Trial
   response header is the delivery path on rapier.website, and the same token rides in the head
   of rapier.html as a meta tag so the trial does not depend on the deploy's header layer alone
   (the founder's ruling, 2026-09-02). Two carriers are one truth only while they are equal, so
   the meta tag is pinned byte-for-byte to the header below; a second meta tag, or a differing
   one, is drift. */
const originTrialTags = [...html.matchAll(/<meta\s+http-equiv=origin-trial\s+content="([^"]+)">/g)];
const originTrialHeaderMatch = headersSource.match(/^\s*Origin-Trial:\s*(\S+)\s*$/m);
const originTrialToken = originTrialHeaderMatch ? originTrialHeaderMatch[1] : '';
check('the origin-trial meta tag in rapier.html carries exactly the _headers token, once',
  originTrialTags.length === 1 && originTrialToken !== '' && originTrialTags[0][1] === originTrialToken);
let originTrialClaims = null;
try {
  const tokenBytes = Buffer.from(originTrialToken, 'base64');
  originTrialClaims = JSON.parse(tokenBytes.subarray(tokenBytes.indexOf(0x7b)).toString('utf8'));
} catch (_) {}
/* The expiry is read and printed, never compared against "now": a check that starts failing on
   its own, unattended, the moment a date arrives is the countdown bomb THE-STANDARD law 14
   forbids. Equality against this exact, known-good token's own decoded value has no such clock —
   it is either always true or always false, like the sha256 pin beside it — so renewal is left
   to whoever reads the printed date, not to an assertion that silently flips itself later. */
const originTrialExpiry = originTrialClaims && Number.isFinite(originTrialClaims.expiry)
  ? new Date(originTrialClaims.expiry * 1000).toISOString() : 'undecoded';
check(`WebMCP origin-trial token in _headers is exact, expiry ${originTrialExpiry}`,
  !!originTrialHeaderMatch
    && crypto.createHash('sha256').update(originTrialToken).digest('hex')
      === 'ef226c4a194bbd71e102cac692b309e54787e2ce069f6a1f5e955d2933ed1e82'
    && originTrialClaims && originTrialClaims.origin === 'https://rapier.website:443'
    && originTrialClaims.feature === 'WebMCP' && originTrialClaims.expiry === 1794873600
    && originTrialClaims.isSubdomain === true);

/* The deploy's half of the content boundary, read as directives rather than as a string, so a
   reordering is not a failure and a widened source is. Every source below was decided by serving
   the header and driving the surface that would break without it — that evidence is
   docs/evidence/lane-b/csp-probe.log, and the reason each one is here is beside it in _headers.
   `report-only` is absent on purpose: a policy that only reports is a policy that permits. */
const cspMatch = headersSource.match(/^\s*Content-Security-Policy:\s*(.+?)\s*$/m);
const cspDirectives = new Map((cspMatch ? cspMatch[1] : '').split(';')
  .map(part => part.trim()).filter(Boolean)
  .map(part => [part.split(/\s+/)[0].toLowerCase(), part.split(/\s+/).slice(1).join(' ')]));
const CSP_EXPECTED = [
  ['default-src', "'none'"], ['script-src', "'unsafe-inline' blob:"],
  ['style-src', "'unsafe-inline'"], ['img-src', "'self' data: blob: https:"],
  ['media-src', "'self' https:"],
  ['font-src', 'data:'], ['connect-src', "'self' https://cdn.jsdelivr.net"], ['worker-src', "'self' blob:"],
  ['manifest-src', "'self'"], ['base-uri', "'none'"], ['form-action', "'none'"],
  ['frame-ancestors', '*'],
];
const cspDrift = CSP_EXPECTED
  .filter(([name, sources]) => cspDirectives.get(name) !== sources)
  .map(([name, sources]) => `${name}: ${JSON.stringify(cspDirectives.get(name))} ≠ ${JSON.stringify(sources)}`)
  .concat([...cspDirectives.keys()].filter(name => !CSP_EXPECTED.some(([known]) => known === name))
    .map(name => `unadmitted directive ${name}`));
check('_headers ships one enforcing Content-Security-Policy, exact directive for directive',
  !!cspMatch && cspDrift.length === 0
    && !/Content-Security-Policy-Report-Only/i.test(headersSource),
  JSON.stringify(cspDrift));

const scripts = [];
const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let match;
while ((match = scriptPattern.exec(html))) scripts.push({ attrs: match[1], body: match[2] });
check('all executable code is embedded', !scripts.some((script) => /\bsrc\s*=/.test(script.attrs)));
/* Sixteen until BOUNDARY-1 retired the @alpinejs/focus block, fifteen until S7's preference
   owner retired @alpinejs/persist, fourteen until the chrome's own owner retired the shell
   script that declared the framework component, thirteen until the chrome needed no framework
   to start and both the startup gate and the framework core left together. A census, not a
   ceiling — an unexpected script appearing still fails. */
check('expected embedded script inventory', scripts.length === 11, `found ${scripts.length}`);

/* The inventory above is found with a lazy regex, which is not how a browser finds script
   blocks. HTML's script-data tokenizer has escaped and double-escaped states: `<!--` inside
   script text opens the escaped state, a following `<script` opens the double-escaped state,
   and in that state a `</script>` only returns to escaped rather than ending the block. A file
   can therefore split cleanly under a regex, parse as valid JavaScript under `vm.Script`, and
   still hand the browser one block that runs to EOF and never executes at all — which is
   exactly what shipped, and what let this audit report 36/36 over a dead engine. Every check
   above this line reads text the browser may never run, so this one runs each block through
   those states and demands it end CLOSED at its own end tag. */
function tokenizerClosure(source) {
  const opener = /<script\b[^>]*>/gi;
  const blocks = [];
  let cursor = 0;
  for (;;) {
    opener.lastIndex = cursor;
    const start = opener.exec(source);
    if (!start) break;
    const line = source.slice(0, start.index).split('\n').length;
    let at = opener.lastIndex;
    let state = 'data';
    let closedAt = -1;
    while (at < source.length) {
      const ahead = source.slice(at, at + 9);
      if (state === 'data') {
        if (source.startsWith('<!--', at)) { state = 'escaped'; at += 4; continue; }
        if (/^<\/script[\s/>]/i.test(ahead)) { closedAt = at; break; }
      } else if (state === 'escaped') {
        if (source.startsWith('-->', at)) { state = 'data'; at += 3; continue; }
        if (/^<script[\s/>]/i.test(ahead)) { state = 'double'; at += 7; continue; }
        if (/^<\/script[\s/>]/i.test(ahead)) { closedAt = at; break; }
      } else {
        if (source.startsWith('-->', at)) { state = 'data'; at += 3; continue; }
        if (/^<\/script[\s/>]/i.test(ahead)) { state = 'escaped'; at += 8; continue; }
      }
      at += 1;
    }
    blocks.push({ line, closed: closedAt >= 0 });
    if (closedAt < 0) break;
    cursor = source.indexOf('>', closedAt) + 1;
  }
  return blocks;
}
const tokenized = tokenizerClosure(html);
const unclosed = tokenized.filter((block) => !block.closed);
check('every script block closes under the HTML script-data tokenizer',
  unclosed.length === 0 && tokenized.length === scripts.length,
  unclosed.length
    ? `block opened at line ${unclosed[0].line} runs to EOF and never executes`
    : `tokenizer saw ${tokenized.length} blocks, regex saw ${scripts.length}`);

/* Declared non-JavaScript blocks are excluded from every parse and scope census below: the
   SpeedRacer manifest is JSON, and a stored vendor is gzip+base64 at rest, its inertness,
   byte-exactness and digests being the stored-vendor check's job rather than a parser's. The
   type attribute is the whole test — a stored vendor that regained an executable type would
   fall back into this census and fail here, which is the direction that failure must go. */
const storedVendor = (script) => /type="text\/rapier-vendor"/.test(script.attrs);
const manifestBlock = (script) => /type="application\/speedracer-app\+json"/.test(script.attrs);
const executedScripts = scripts.filter((script) => !manifestBlock(script) && !storedVendor(script));
let manifest = null;
let parsedJavaScript = 0;
for (const [index, script] of scripts.entries()) {
  if (manifestBlock(script)) {
    try {
      manifest = JSON.parse(script.body);
    } catch (error) {
      failures.push(`SpeedRacer manifest parses — ${error.message}`);
    }
    continue;
  }
  if (storedVendor(script)) continue;
  try {
    new vm.Script(script.body, { filename: `rapier.html#script-${index + 1}` });
    parsedJavaScript += 1;
  } catch (error) {
    failures.push(`script ${index + 1} parses — ${error.message}`);
  }
}
check('all JavaScript parses', parsedJavaScript === executedScripts.length,
  `${parsedJavaScript}/${executedScripts.length}`);
check('SpeedRacer manifest parses', Boolean(manifest));
check('HTML and SpeedRacer versions agree',
  Boolean(manifest && manifest.factory && manifest.factory.version === version));

/* ── THE ARTIFACT PROVES ITSELF WITH ITS OWN VENDORED PARSER ────────────────────────────────
   Acorn is paid for exactly once: the shipped bytes ride as one INERT payload the page never
   executes, and the only thing that ever runs them is a Worker realm conjured from those same
   bytes. So this audit runs them too — not an npm copy, which could agree with a release the
   artifact does not contain. It extracts the payload, uses it to find the artifact's own
   structural analyser BY PARSING THE ARTIFACT, and then turns that analyser on every inline
   script the page really executes.

   What it looks for is the one bug class this whole tranche exists to disclose: an identifier
   referenced where nothing declares it. A page's scripts share one global scope, so a name any
   script declares at its own top level resolves everywhere; what is left over is either a
   genuine cross-script global or a defect, and the difference is an EXACT NAMED LIST rather
   than a suppressed rule. A new name appearing here fails this release. */
/* A stored marker pins two identities: bytes=/sha256= name the INFLATED upstream text (what
   the release actually runs), storedBytes=/storedSha256= name the gzip+base64 text sitting
   between the comments (what the artifact actually ships). Both are checked for every stored
   span of every stored block — self-consistency of the stored bytes is not evidence the
   inflated bytes are the library the marker names. */
const STORED_SPAN = /\/\* RAPIER_VENDOR_BEGIN (\S+) bytes=(\d+) sha256=([0-9a-f]{64}) stored=gzip\+base64 storedBytes=(\d+) storedSha256=([0-9a-f]{64})((?:[^*]|\*(?!\/))*)\*\//g;
const sha256 = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const storedRows = [];
const storedSources = new Map();
for (const script of scripts.filter(storedVendor)) {
  const id = /\bid="([^"]*)"/.exec(script.attrs);
  const type = /\btype\s*=\s*"([^"]*)"/.exec(script.attrs);
  const inflatedHere = [];
  const spans = [...script.body.matchAll(STORED_SPAN)];
  for (const marker of spans) {
    const from = script.body.indexOf('*/', marker.index) + 3;
    const to = script.body.indexOf(`/* RAPIER_VENDOR_END ${marker[1]} */`, from);
    const stored = to > from ? script.body.slice(from, to).trim() : '';
    let inflated = '';
    let error = '';
    try { inflated = zlib.gunzipSync(Buffer.from(stored, 'base64')).toString('utf8'); }
    catch (failure) { error = String((failure && failure.message) || failure); }
    inflatedHere.push(inflated);
    storedRows.push({ id: id && id[1], name: marker[1],
      inert: !/^(?:|text\/javascript|application\/javascript|module)$/i.test(type ? type[1] : ''),
      storedExact: Buffer.byteLength(stored, 'utf8') === Number(marker[4]) && sha256(stored) === marker[5],
      inflatedExact: !error && Buffer.byteLength(inflated, 'utf8') === Number(marker[2])
        && sha256(inflated) === marker[3],
      bytes: Buffer.byteLength(inflated, 'utf8'), stored: Buffer.byteLength(stored, 'utf8'),
      digest: inflated ? sha256(inflated) : '', error: error || null });
  }
  if (!spans.length) storedRows.push({ id: id && id[1], name: null, inert: false, storedExact: false, inflatedExact: false, error: 'no stored span' });
  storedSources.set(id && id[1], inflatedHere.join('\n'));
}
const acornBytes = storedSources.get('lib-acorn') || '';
const acornDigest = acornBytes ? sha256(acornBytes) : '';
const acornMarker = /RAPIER_VENDOR_BEGIN acorn-(\d+\.\d+\.\d+)\.dist\.acorn\.js bytes=(\d+) sha256=([0-9a-f]{64}) stored=gzip\+base64/
  .exec(html);
check('every stored vendor span is inert, provenance-marked, byte-exact at rest, and inflates to the upstream digest',
  storedRows.length > 0 && storedRows.every((row) => row.inert && row.storedExact && row.inflatedExact),
  JSON.stringify({ spans: storedRows.length,
    refused: storedRows.filter((row) => !(row.inert && row.storedExact && row.inflatedExact)),
    blocks: [...storedSources.keys()] }));

/* PROVENANCE IS NOT SELF-CONSISTENCY. The check above proves the payload agrees WITH ITS OWN
   MARKER — which a repackaged bundle carrying a rewritten marker also satisfies. Provenance is
   an independent claim, so the release's vendored parser identity is pinned HERE, in the
   qualification tooling, and compared against the artifact. A dependency bump is a
   requalification event: it changes these four constants deliberately, in the same tranche that
   changes the payload, and any change that does not is a release the audit refuses. */
const ACORN_PIN = Object.freeze({
  path: 'acorn-8.18.0.dist.acorn.js',
  version: '8.18.0',
  bytes: 245232,
  sha256: 'fc3ed7b81e58464715d0291402892f22c3d86ea75302645a330390f85d8015c9',
});
const acornPathMarker = /RAPIER_VENDOR_BEGIN (acorn-\d+\.\d+\.\d+\.dist\.acorn\.js)\b/.exec(html);
const acornEngine = /const RAPIER_STRUCTURE_ENGINE = 'acorn@(\d+\.\d+\.\d+)'/.exec(html);
check('the vendored parser is the exact release qualification pinned, independently of its own marker',
  Boolean(acornMarker) && Boolean(acornPathMarker) && Boolean(acornEngine)
    && acornPathMarker[1] === ACORN_PIN.path
    && acornMarker[1] === ACORN_PIN.version
    && Buffer.byteLength(acornBytes, 'utf8') === ACORN_PIN.bytes
    && acornDigest === ACORN_PIN.sha256
    && acornEngine[1] === ACORN_PIN.version,
  JSON.stringify({
    pinned: ACORN_PIN,
    aboard: {
      path: acornPathMarker && acornPathMarker[1],
      version: acornMarker && acornMarker[1],
      bytes: Buffer.byteLength(acornBytes, 'utf8'),
      sha256: acornDigest,
      engine: acornEngine && acornEngine[1],
    },
  }));

/* Names this artifact genuinely reaches across its own script boundary, plus the two a
   vendored bundle brings with it. Narrow and named, never a suppressed rule: `Rapier`,
   `rapier` and `showToast` are the engine's own cross-script globals, `_rapierTextIntegrity`
   and `_rapierIntegrityMatches` are the one integrity pair the SpeedRacer realm calls rather
   than keep its own copy of (D2: four FNV+Adler copies to one owner), `define` is the AMD
   probe every UMD wrapper carries, and `error` is one unreachable `throw error` inside a
   vendored bundle Rapier does not author. `RapierDiff`, `DOMPurify` and `markdownit` are the
   vendored libraries a UMD factory assigns onto the page rather than declares. Anything else
   is a defect — and one of them, a `source` that named nothing in the source-view navigator,
   is exactly what this check found the first time it ran. */
const ADMITTED_FREE_NAMES = new Set([
  'Rapier', 'rapier', 'showToast', 'RapierDiff', 'DOMPurify', 'markdownit', 'TurndownService',
  '_rapierTextIntegrity', '_rapierIntegrityMatches',
  /* The vendored UMD envelopes probe Node/AMD names before assigning their browser globals.
     They are named here rather than smuggled into Rapier's browser host profile. */
  'define', 'exports', 'global', 'module', 'require', 'error',
]);
let releasedSelfRead = { ok: false, reason: 'not attempted' };
let selfScope = { ok: false, reason: 'not attempted', names: [] };
let shippedStructureAnalyse = null;
let releasedStructureLimits = null;
let structureEngineBody = '';
let shippedAcorn = null;
if (acornBytes) {
  try {
    const realm = { console };
    realm.self = realm;
    realm.globalThis = realm;
    vm.createContext(realm);
    vm.runInContext(acornBytes, realm, { filename: 'rapier.html#lib-acorn' });
    const shipped = realm.acorn;
    if (!shipped || typeof shipped.parse !== 'function') throw new Error('the payload defined no parser');
    shippedAcorn = shipped;
    if (shipped.version !== acornMarker[1]) {
      throw new Error('the payload reports ' + shipped.version + ', its marker says ' + acornMarker[1]);
    }
    const engine = scripts.find((script) => script.body.indexOf('function _rapierStructureAnalyze(') >= 0);
    if (!engine) throw new Error('the artifact carries no structural analyser');
    const tree = shipped.parse(engine.body, { ecmaVersion: 'latest', sourceType: 'script' });
    let analyserNode = null;
    const stack = [tree];
    while (stack.length && !analyserNode) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { for (const item of node) stack.push(item); continue; }
      if (node.type === 'FunctionDeclaration' && node.id && node.id.name === '_rapierStructureAnalyze') {
        analyserNode = node;
        break;
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc') continue;
        const value = node[key];
        if (value && typeof value === 'object') stack.push(value);
      }
    }
    if (!analyserNode) throw new Error('the analyser could not be located in the artifact');
    const box = { acorn: shipped, self: { acorn: shipped }, console };
    vm.createContext(box);
    vm.runInContext(engine.body.slice(analyserNode.start, analyserNode.end)
      + '\n;globalThis.__analyse = _rapierStructureAnalyze;', box);
    const analyse = box.__analyse;
    /* The artifact's own ceilings, read out of the artifact. Qualification must execute the
       product a person receives: increasing tokens, nodes, scopes, bindings, declarations or
       any other semantic ceiling here would prove a more capable imaginary analyser. */
    const declaredLimits = /const _RAPIER_STRUCTURE_LIMITS = Object\.freeze\((\{[\s\S]*?\})\);/.exec(html);
    if (!declaredLimits) throw new Error('the artifact declares no structural ceilings');
    const limits = Object.freeze(vm.runInNewContext('(' + declaredLimits[1] + ')'));
    shippedStructureAnalyse = analyse;
    releasedStructureLimits = limits;
    structureEngineBody = engine.body;
    /* Executed code only. The manifest is data and a stored vendor is data; neither is a
       script this page runs, so neither is a script this analysis is about. */
    const executed = executedScripts;
    /* One HTML document has one script topology. Running the blocks independently would
       manufacture caller-supplied globals and qualify a scope graph the product never uses;
       the released source-unit lexer must find the executable blocks, share classic globals,
       isolate modules, and resolve the browser profile itself. */
    const releasedFacts = analyse({ mode: 'audit', kind: 'html', source: html,
      dialect: 'infer', limits });
    const releasedBudgetKeys = Object.freeze({
      token_budget: 'tokens', node_budget: 'nodes', depth_budget: 'depth',
      unit_budget: 'units', declaration_budget: 'declarations',
      occurrence_budget: 'occurrences', binding_budget: 'bindings', scope_budget: 'scopes',
      entry_budget: 'entries', match_budget: 'matches', string_bytes: 'strings',
      result_bytes: 'resultBytes',
    });
    const budgetLedger = (releasedFacts.omissions || []).filter(row =>
      row && releasedBudgetKeys[row.reason]);
    const badReleasedUnit = (releasedFacts.units || []).find(unit =>
      unit.status === 'syntax_error' || unit.status === 'unavailable');
    const honestBudgetLedger = budgetLedger.length > 0 && budgetLedger.every(row => {
      const key = releasedBudgetKeys[row.reason];
      const observed = Number(row.observed);
      const emitted = Number(row.emitted);
      const omitted = Number(row.omitted);
      return Number.isSafeInteger(observed) && Number.isSafeInteger(emitted)
        && Number.isSafeInteger(omitted) && observed >= emitted && omitted === observed - emitted
        && typeof row.exact === 'boolean'
        && Number(releasedFacts.budget.used[key]) === Number(limits[key]);
    });
    const completeTruth = releasedFacts.status === 'ok' && releasedFacts.complete === true
      && budgetLedger.length === 0;
    const boundedTruth = releasedFacts.status === 'bounded' && releasedFacts.complete === false
      && honestBudgetLedger;
    const releasedTruth = releasedFacts.ok === true && releasedFacts.parse.status === 'ok'
      && !badReleasedUnit && (completeTruth || boundedTruth);
    releasedSelfRead = {
      ok: releasedTruth,
      reason: releasedTruth ? '' : JSON.stringify({
        status: releasedFacts.status, complete: releasedFacts.complete,
        parse: releasedFacts.parse, badUnit: badReleasedUnit || null,
        budgetLedger, omissions: releasedFacts.omissions,
        used: releasedFacts.budget && releasedFacts.budget.used,
      }),
    };

    /* Free-name qualification is a distinct static-analysis question. These are deliberately
       named AUDIT ceilings, not product limits and not evidence that the released defaults read
       Rapier completely. Their sole purpose is to let the release audit finish the semantic
       inventory after the product has already proved that it stops honestly at its own bound. */
    const qualificationSemanticLimits = Object.freeze({
      ...limits,
      tokens: 2000000,
      nodes: 1000000,
      scopes: 50000,
      declarations: 25000,
      entries: 25000,
      strings: 8388608,
    });
    const facts = analyse({ mode: 'audit', kind: 'html', source: html,
      dialect: 'infer', limits: qualificationSemanticLimits });
    const unreadable = (facts.units || []).filter((unit) => unit.status !== 'ok')
      .map((unit) => unit.message || unit.status);
    const semanticBounds = (facts.omissions || []).filter(row =>
      !(row && row.domain === 'occurrence_strings' && row.reason === 'field_length'));
    if (unreadable.length || facts.parse.status !== 'ok' || semanticBounds.length) {
      throw new Error('audit-only semantic resolution did not complete: ' +
        unreadable.join(' | ') + ' ' + JSON.stringify(facts.omissions || []));
    }
    const free = new Set((facts.unresolved || []).map((row) => row.name));
    selfScope = {
      ok: true, reason: '', names: [...free].sort(), scripts: executed.length,
      shared: (facts.declarations || []).filter((row) => !row.container).length,
    };
  } catch (error) {
    selfScope = { ok: false, reason: String((error && error.message) || error), names: [] };
  }
}
check('released structural limits truthfully read Rapier with an exact budget ledger',
  releasedSelfRead.ok === true, releasedSelfRead.reason);
check('the audit-only semantic ceiling resolves all executable scripts with the vendored parser',
  selfScope.ok === true, selfScope.reason);
check('no inline script references an identifier nothing declares, beyond the named list',
  selfScope.ok === true && selfScope.names.every((name) => ADMITTED_FREE_NAMES.has(name)),
  JSON.stringify({
    found: selfScope.names,
    unadmitted: selfScope.names.filter((name) => !ADMITTED_FREE_NAMES.has(name)),
  }));

const operations = (manifest && manifest.operations) || [];
const operation = name => operations.find((entry) => entry.name === name);
const getContext = operation('document.get_context');

function objectBranch(schema) {
  if (!schema) return null;
  if (schema.type === 'object') return schema;
  return Array.isArray(schema.anyOf)
    ? schema.anyOf.find((entry) => entry && entry.type === 'object') || null
    : null;
}

function sourceSlice(start, end) {
  const from = html.indexOf(start);
  if (from < 0) return '';
  const to = html.indexOf(end, from + start.length);
  return to < 0 ? '' : html.slice(from, to);
}

function functionSourceFrom(source, name) {
  const text = String(source || '');
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const signature = new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${escaped}\\s*\\(`, 'm');
  const match = signature.exec(text);
  if (!match) return '';
  const from = match.index + (text.charAt(match.index) === '\n' ? 1 : 0);
  const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = from + match[0].length;
  const following = next.exec(text);
  return text.slice(from, following ? following.index : text.length);
}

function functionSource(name) {
  return functionSourceFrom(html, name);
}

function matchesAll(source, patterns) {
  return patterns.every((pattern) => pattern.test(source));
}

function includesInOrder(source, needles) {
  let cursor = 0;
  for (const needle of needles) {
    const found = source.indexOf(needle, cursor);
    if (found < 0) return false;
    cursor = found + needle.length;
  }
  return true;
}

/* ── A3.1 PERMANENT ACCEPTANCE FLOOR ───────────────────────────────────────────────────
   These cases run the parser and analyser shipped in rapier.html. A test may lower a released
   ceiling to reach a bound cheaply, but it may never raise one: qualification must not prove
   a more capable imaginary product. Source predicates are reserved for seams which necessarily
   belong to the browser/Worker adapters rather than the pure analyser. */
function a31Analyse(request, lowerLimits) {
  if (typeof shippedStructureAnalyse !== 'function' || !releasedStructureLimits) {
    throw new Error('the shipped structural analyser is unavailable');
  }
  const limits = { ...releasedStructureLimits };
  for (const [name, raw] of Object.entries(lowerLimits || {})) {
    if (!Object.prototype.hasOwnProperty.call(limits, name)) {
      throw new Error('unknown structural limit ' + name);
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > Number(limits[name])) {
      throw new Error('A3.1 attempted to increase structural limit ' + name);
    }
    limits[name] = value;
  }
  return JSON.parse(JSON.stringify(shippedStructureAnalyse(Object.assign({
    mode: 'index', kind: 'javascript', dialect: 'infer',
  }, request || {}, { limits }))));
}

function a31Result(condition, detail) {
  return condition ? true : String(detail || 'acceptance predicate was false');
}

function a31Omission(analysis, domain) {
  return ((analysis && analysis.omissions) || []).find(row => row && row.domain === domain) || null;
}

function a31CallCount(source, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(source || '').match(new RegExp('\\b' + escaped + '\\s*\\(', 'g')) || []).length;
}

function a31Worker(request, analyse) {
  const posted = [];
  const workerSelf = {
    __rapierStructureAnalyze: analyse || shippedStructureAnalyse,
    postMessage(value) { posted.push(String(value)); },
  };
  const box = { self: workerSelf, TextEncoder };
  vm.createContext(box);
  vm.runInContext('(' + functionSource('_rapierStructureWorkerBody') + ')()', box);
  workerSelf.onmessage({ data: { type: 'boot', generation: 31 } });
  posted.length = 0;
  workerSelf.onmessage({ data: { type: 'analyze', generation: 31, jobId: 32, request } });
  return posted.map(wire => ({ wire, value: JSON.parse(wire) }));
}

/* The clock a minted name states is written as a product of its units, not as a literal, so a
   fixture that needs it reads the factors rather than becoming a second copy of the number. */
/* The mint's own table and the outline-ref grammar derived from it, read from the artifact so
   no fixture below is a second copy of a published grammar. */
const nameTableSource = sourceSlice('const _RAPIER_NAME_TTL_MS =', '/* The id IS the wire name');
const outlineRefGrammarSource = sourceSlice(
  'const _RAPIER_OUTLINE_REF_GRAMMAR =', 'function _rapierOutlineRef(');

function productConstantValue(name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp('const\\s+' + escaped + '\\s*=\\s*([\\d\\s*]+);').exec(html);
  return found
    ? found[1].split('*').reduce((total, part) => total * Number(part.trim()), 1) : NaN;
}
const webMcpNameTtlMs = productConstantValue('_RAPIER_NAME_TTL_MS');

function a31Functions(names, context, expression) {
  const box = Object.assign({ console }, context || {});
  vm.createContext(box);
  const bodies = names.map(name => functionSource(name)).join('\n');
  return vm.runInContext(bodies + '\n' + expression, box);
}

function a31Schema(name) {
  const entry = operation(name);
  return entry && entry.result && entry.result.properties || {};
}

const A31_ACCEPTANCE = [
  {
    id: 'A3.1-01', name: 'HTML tokenizer rejects comment, attribute, template and raw-text ghosts',
    run() {
      const source = '<!-- <script>ghostComment()</script> -->' +
        '<div data-code="<script>ghostAttribute()</script>"></div>' +
        '<template><script>ghostTemplate()</script></template>' +
        '<style><script>ghostRaw()</script></style><script>realCall()</script>';
      const value = a31Analyse({ kind: 'html', source });
      return a31Result(value.units.length === 1 && value.calls.includes('realCall') &&
        !value.calls.some(name => /^ghost/.test(name)),
      JSON.stringify({ units: value.units.length, calls: value.calls }));
    },
  },
  {
    id: 'A3.1-02', name: 'only an exact src attribute makes an eligible script external',
    run() {
      const source = '<script data-src="x">dataSrc()</script><script xsrc="x">xSrc()</script>' +
        '<script SRC="x">externalA()</script><script src=x>externalB()</script>';
      const value = a31Analyse({ kind: 'html', source });
      return a31Result(value.calls.includes('dataSrc') && value.calls.includes('xSrc') &&
        !value.calls.includes('externalA') && !value.calls.includes('externalB') &&
        value.units.length === 2,
      JSON.stringify({ calls: value.calls, units: value.units }));
    },
  },
  {
    id: 'A3.1-03', name: 'eligible JavaScript MIME and classic/module truth are exact',
    run() {
      const source = '<script type="application/json">jsonGhost()</script>' +
        '<script>classicCall()</script><script type="module">moduleCall()</script>' +
        '<script type="module;foo">badModule()</script><script nomodule>legacyGhost()</script>';
      const value = a31Analyse({ kind: 'html', source });
      const goals = value.units.map(unit => unit.goal);
      return a31Result(JSON.stringify(goals) === JSON.stringify(['script', 'module']) &&
        value.calls.includes('classicCall') && value.calls.includes('moduleCall') &&
        !value.calls.includes('jsonGhost') && !value.calls.includes('badModule') &&
        !value.calls.includes('legacyGhost'), JSON.stringify({ goals, calls: value.calls }));
    },
  },
  {
    id: 'A3.1-04', name: 'a classic parse failure never falls back to the module goal',
    run() {
      const classic = a31Analyse({ kind: 'html', source: '<script>import x from "x";</script>' });
      const module = a31Analyse({ kind: 'html', source: '<script type="module">import x from "x";</script>' });
      return a31Result(classic.status === 'syntax_error' && classic.parse.status === 'failed' &&
        classic.units[0].goal === 'script' && module.status === 'ok' &&
        module.units[0].sourceType === 'module',
      JSON.stringify({ classic: classic.status, module: module.status }));
    },
  },
  {
    id: 'A3.1-05', name: 'CommonJS/classic rejects top-level await while module accepts it',
    run() {
      const classic = a31Analyse({ kind: 'javascript', dialect: 'script', source: 'await task' });
      const module = a31Analyse({ kind: 'javascript', dialect: 'module', source: 'await task' });
      return a31Result(classic.status === 'syntax_error' && classic.complete === false &&
        module.status === 'ok' && module.parse.sourceType === 'module',
      JSON.stringify({ classic: classic.status, module: module.status }));
    },
  },
  {
    id: 'A3.1-06', name: 'one broken eligible script makes the HTML answer unavailable as a whole',
    run() {
      const value = a31Analyse({ kind: 'html',
        source: '<script>const sound=1</script><script>const =</script>' });
      return a31Result(value.ok === false && value.status === 'syntax_error' &&
        value.complete === false && value.parse.status === 'failed' &&
        value.units.some(unit => unit.status === 'syntax_error'),
      JSON.stringify({ ok: value.ok, status: value.status, complete: value.complete }));
    },
  },
  {
    id: 'A3.1-07', name: 'escaped and double-escaped script-data states close at the browser boundary',
    run() {
      const source = '<script><!--\n// <script>\n// const fake=1;\n// </script>\n-->\nconst real=2;</script>';
      const value = a31Analyse({ kind: 'html', source });
      return a31Result(value.units.length === 1 &&
        value.units[0].end === source.lastIndexOf('</script>') &&
        value.declarations.some(row => row.name === 'real') &&
        !value.declarations.some(row => row.name === 'fake'), JSON.stringify(value.units));
    },
  },
  {
    id: 'A3.1-08', name: 'classic scripts share document globals and modules remain isolated',
    run() {
      const source = '<script>const sharedName=1</script><script>sharedName</script>' +
        '<script type="module">const privateName=1</script>' +
        '<script type="module">privateName</script>';
      const value = a31Analyse({ kind: 'html', source });
      const unresolved = value.unresolved.map(row => row.name);
      return a31Result(!unresolved.includes('sharedName') &&
        unresolved.filter(name => name === 'privateName').length === 1,
      JSON.stringify(unresolved));
    },
  },
  {
    id: 'A3.1-09', name: 'HTML diagnostics are translated to absolute document coordinates',
    run() {
      const source = '<p>x</p>\r\n<script>let ok=1;</script>\r\n<script>const =</script>';
      const value = a31Analyse({ kind: 'html', source });
      const at = value.parse;
      const prefix = source.slice(0, at.pos);
      const expectedLine = prefix.split(/\r\n|\r|\n/).length;
      const lastBreak = Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('\r'));
      const expectedColumn = at.pos - (lastBreak + 1);
      return a31Result(at.status === 'failed' && at.pos === source.indexOf('=', source.indexOf('const =')) &&
        at.line === expectedLine && at.column === expectedColumn,
      JSON.stringify({ at, expectedLine, expectedColumn }));
    },
  },
  {
    id: 'A3.1-10', name: 'one aggregate request budget includes every unit and serialized result bytes',
    run() {
      const before = 'const a=1; function first(){return a}';
      const after = 'const a=2; function first(){return a} function second(){return a}';
      const pair = a31Analyse({ mode: 'receipt', kind: 'javascript', before: { source: before },
        after: { source: after } });
      const additive = ['tokens', 'nodes', 'units', 'declarations', 'occurrences', 'bindings',
        'scopes', 'entries', 'matches', 'strings'];
      const aggregate = additive.every(name =>
        Number(pair.budget.used[name]) === Number(pair.before.budget.used[name] || 0) +
          Number(pair.after.budget.used[name] || 0) &&
        Number(pair.budget.used[name]) <= Number(pair.budget.limits[name]));
      const request = { mode: 'index', kind: 'javascript', dialect: 'infer', source: 'const wire=1;',
        limits: { ...releasedStructureLimits } };
      const delivered = a31Worker(request);
      const message = delivered[0];
      const wireBytes = message && Buffer.byteLength(message.wire, 'utf8');
      const reported = message && message.value.analysis.budget.used.resultBytes;
      return a31Result(aggregate && delivered.length === 1 && wireBytes === reported &&
        wireBytes > 0 && wireBytes <= releasedStructureLimits.resultBytes,
      JSON.stringify({ aggregate, delivered: delivered.length, wireBytes, reported }));
    },
  },
  {
    id: 'A3.1-11', name: 'token callback aborts the parse and cancellation has its own status',
    run() {
      const value = a31Analyse({ kind: 'javascript', source: 'const a=1; const b=2; const c=3;' },
        { tokens: 8 });
      const omission = a31Omission(value, 'tokens');
      const cancelled = functionSource('_rapierStructureCancelled');
      const cancelWaiter = functionSource('_rapierStructureCancelWaiter');
      const offThread = functionSource('_rapierStructureOffThread');
      return a31Result(value.status === 'bounded' && value.complete === false && omission &&
        omission.reason === 'token_budget' && value.parse.status !== 'failed' &&
        /status:\s*['"]cancelled['"]/.test(cancelled) &&
        /_rapierStructureCancelled\s*\(\s*\)/.test(cancelWaiter) &&
        /signal\s*&&\s*signal\.aborted[\s\S]*_rapierStructureCancelled\s*\(\s*\)/.test(offThread) &&
        !/_rapierStructureUnavailable\s*\(\s*['"]aborted['"]/.test(cancelWaiter + offThread),
      JSON.stringify({ status: value.status, parse: value.parse, omission }));
    },
  },
  {
    id: 'A3.1-12', name: 'the Worker replaces oversized answers before postMessage',
    run() {
      const limits = { ...releasedStructureLimits, resultBytes: 512 };
      const delivered = a31Worker({ mode: 'index', kind: 'javascript', source: 'x', limits },
        () => ({ ok: true, status: 'ok', complete: true, kind: 'javascript', mode: 'index',
          omissions: [], budget: { limits, used: {} }, marker: 'Z'.repeat(20000) }));
      const only = delivered[0];
      const analysis = only && only.value.analysis;
      const omission = a31Omission(analysis, 'result_bytes');
      return a31Result(delivered.length === 1 && Buffer.byteLength(only.wire, 'utf8') <= 512 &&
        analysis.status === 'bounded' && analysis.complete === false &&
        !only.wire.includes('ZZZZZZZZ') && (omission || analysis.unavailable === 'result_too_large'),
      JSON.stringify({ count: delivered.length, bytes: only && Buffer.byteLength(only.wire), analysis }));
    },
  },
  {
    id: 'A3.1-13', name: '9600 declarations disclose the exact 4096-row declaration bound',
    run() {
      const source = Array.from({ length: 9600 }, (_, index) => 'let d' + index + ';').join('\n');
      const value = a31Analyse({ kind: 'javascript', source });
      const omission = a31Omission(value, 'declarations');
      return a31Result(value.declarations.length === 4096 && value.complete === false &&
        omission && omission.observed === 9600 && omission.emitted === 4096 &&
        omission.omitted === 5504 && omission.exact === true,
      JSON.stringify({ rows: value.declarations.length, omission }));
    },
  },
  {
    id: 'A3.1-14', name: 'every public adapter preserves the one completeness ledger',
    run() {
      const source = Array.from({ length: 3000 }, (_, index) =>
        'function f' + index + '(){return ' + index + ';}').join('\n');
      const value = a31Analyse({ mode: 'outline', kind: 'javascript', source });
      const omission = a31Omission(value, 'entries');
      const fact = a31Functions(['_rapierStructurePublicOmissionRow',
        '_rapierStructurePublicOmissions', '_rapierStructurePublicFact'],
        { RAPIER_STRUCTURE_ENGINE: 'acorn@8.18.0',
          _RAPIER_STRUCTURE_PUBLIC_OMISSION_LIMIT: 4, __value: value },
        ';_rapierStructurePublicFact(__value, "javascript")');
      const cleanFact = a31Functions(['_rapierStructurePublicOmissionRow',
        '_rapierStructurePublicOmissions', '_rapierStructurePublicFact'],
        { RAPIER_STRUCTURE_ENGINE: 'acorn@8.18.0',
          _RAPIER_STRUCTURE_PUBLIC_OMISSION_LIMIT: 4,
          __value: { ok: true, status: 'ok', complete: true, omissions: [],
            budget: { limits: { tokens: 99 }, used: { tokens: 3 } } } },
        ';_rapierStructurePublicFact(__value, "javascript")');
      const projectedBoundFact = a31Functions(['_rapierStructurePublicOmissionRow',
        '_rapierStructurePublicOmissions', '_rapierStructurePublicFact'],
        { RAPIER_STRUCTURE_ENGINE: 'acorn@8.18.0',
          _RAPIER_STRUCTURE_PUBLIC_OMISSION_LIMIT: 4,
          __value: { ok: true, status: 'ok', complete: true, omissions: [],
            budget: { limits: { tokens: 99 }, used: { tokens: 3 } } } },
        ';_rapierStructurePublicFact(__value, "javascript", true)');
      const longName = 'f'.repeat(140);
      const boundedSource = "import { imported } from 'pkg';\nexport function " + longName + '(){\n' +
        Array.from({ length: 15 }, (_, index) => '  call' + index + '();').join('\n') +
        '\n  imported = 1;\n  let over = imported;\n  { let inner = over; }\n  return over;\n}';
      const bounded = a31Analyse({
        mode: 'outline', kind: 'javascript', dialect: 'module', source: boundedSource,
        target: { start: boundedSource.indexOf('export function'), end: boundedSource.length },
      }, { bindings: 2, scopes: 3, occurrences: 32 });
      const projectionRows = [
        { domain: 'structure_labels', reason: 'field_length', observed: null,
          emitted: null, omitted: 76, exact: true, unit: null },
        { domain: 'packet', reason: 'projection_budget', observed: null,
          emitted: null, omitted: 3, exact: false, unit: null },
      ];
      const merged = a31Functions(['_rapierStructurePublicOmissionRow',
        '_rapierStructurePublicOmissions'], {
        _RAPIER_STRUCTURE_PUBLIC_OMISSION_LIMIT: 4,
        __sourceRows: bounded.omissions, __projectionRows: projectionRows,
      }, ';_rapierStructurePublicOmissions(__sourceRows, __projectionRows)');
      const mergedDomains = merged.omissions.map(row => row.domain + '/' + row.reason);
      const sentinel = merged.omissions.find(row =>
        row.domain === 'omissions' && row.reason === 'ledger_budget');
      const shapedRead = a31Functions(['_rapierWebMcpClip', '_rapierWebMcpReadShape'], {
        _RAPIER_OUTLINE_LABEL_LIMIT: 64,
        /* A walked page states the clock its names die on, so the shape needs that constant in
           scope here exactly as it needs the label bound. What this acceptance proves — the
           completeness ledger — does not depend on the value; the qualification suite asserts
           the wire against the mint's own clock, where the mint lives. */
        _RAPIER_NAME_TTL_MS: webMcpNameTtlMs,
        /* The wire states a name's REMAINING life, read from the row that holds it. These
           acceptances are about the completeness ledger, not the clock, and their receipts name
           no live row — so the fixture answers with the whole life and the suite, which runs
           where the rows live, is what proves the countdown. */
        _rapierNameRemainingMs: function () { return webMcpNameTtlMs; },
        __receipt: {
          outcome: 'read', label: 'unit', representation: 'text', chars: 5,
          remaining: 0, context_handle: 'ctx_fixture', text: 'whole',
          structure: { status: 'bounded', complete: false, truncated: true },
        },
      }, ';_rapierWebMcpReadShape(__receipt)');
      const navigator = functionSource('_rapierOpenDocumentNavigator');
      const outline = functionSource('_rapierDocumentOutline');
      const find = sourceSlice("'document.find':", "'document.read_context':");
      const read = sourceSlice("'document.read_context':", "'document.apply_edits':");
      const structureResults = ['document.get_outline', 'document.find', 'document.read_context']
        .map(name => {
          const props = a31Schema(name);
          return props && props.structure;
        });
      const manifests = structureResults.every(schema => schema && schema.type === 'object');
      const cleanBudgetSchemas = structureResults.every(schema => {
        const budget = schema && schema.properties && schema.properties.budget;
        return budget && budget.type === 'object' && budget.additionalProperties === false &&
          !Object.prototype.hasOwnProperty.call(budget, 'required');
      });
      return a31Result(value.entries.length === 2048 && omission && omission.omitted === 952 &&
        fact.complete === false && fact.omitted >= 952 && fact.omissions.some(row => row.domain === 'entries') &&
        fact.budget.used.entries === value.budget.used.entries &&
        Object.keys(cleanFact.budget).length === 0 && cleanFact.complete === true &&
        projectedBoundFact.budget.used.tokens === 3 &&
        JSON.stringify(bounded.omissions.map(row => row.domain)) ===
          JSON.stringify(['bindings', 'scopes', 'occurrences']) &&
        merged.omissions.length === 4 &&
        mergedDomains.includes('structure_labels/field_length') &&
        mergedDomains.includes('packet/projection_budget') &&
        sentinel && sentinel.exact === true && sentinel.observed === 3 &&
          sentinel.emitted === 1 && sentinel.omitted === 2 &&
        shapedRead.truncated === true && shapedRead.handle === 'ctx_fixture' &&
        shapedRead.structure && shapedRead.structure.complete === false &&
        /_rapierStructurePublicFact/.test(outline + find + read) && manifests && cleanBudgetSchemas &&
        /analysis\.complete\s*!==\s*true/.test(navigator) &&
        /domain\s*===\s*['"]entries['"]/.test(navigator) &&
        /structure is bounded for this file/.test(navigator),
      JSON.stringify({ entries: value.entries.length, omission, fact, cleanFact, projectedBoundFact, bounded: {
        omissions: bounded.omissions,
      }, merged, shapedRead, manifests, cleanBudgetSchemas,
      navigatorErasesLedger: /domain\s*===\s*['"]entries['"]/.test(navigator) }));
    },
  },
  {
    id: 'A3.1-15', name: 'opaque outline references remain spendable above ordinal 999',
    run() {
      const refs = Array.from({ length: 1201 }, (_, index) => index.toString(16).padStart(16, '0'));
      const ticket = { id: 'rref_0123456789abcdef', refs,
        byToken: new Map(refs.map((token, index) => [token, index])) };
      /* The shipped mint table and the ref grammar it derives, so the fixture spends the
         product's own grammar rather than a second copy of it. */
      const grammar = nameTableSource + outlineRefGrammarSource;
      const result = a31Functions(['_rapierOutlineRef', '_rapierParseOutlineRef'],
        { __ticket: ticket },
        grammar +
        ';(()=>{const ref=_rapierOutlineRef(__ticket,1200); const parsed=_rapierParseOutlineRef(ref);' +
          'return {ref,parsed,index:parsed?__ticket.byToken.get(parsed.token):-1};})()');
      const consumers = functionSource('_rapierReadOutlineContext') +
        functionSource('_rapierDocumentOutline') + functionSource('_rapierStructureScopeOf');
      return a31Result(/^rref_[0-9a-f]{16}_[0-9a-f]{16}$/.test(result.ref) &&
        result.index === 1200 && a31CallCount(consumers, '_rapierResolveOutlineReference') >= 3 &&
        !/\\d\{1,3\}/.test(outlineRefGrammarSource),
      JSON.stringify(result));
    },
  },
  {
    id: 'A3.1-16', name: 'block lexical bindings stop at their block boundary',
    run() {
      const value = a31Analyse({ kind: 'javascript',
        source: '{ let localOnly=1; localOnly; } localOnly;' });
      const misses = value.unresolved.filter(row => row.name === 'localOnly');
      return a31Result(misses.length === 1 && misses[0].start > 30 &&
        value.scopes.some(scope => scope.kind === 'block' &&
          scope.bindings.some(binding => binding.name === 'localOnly')), JSON.stringify(misses));
    },
  },
  {
    id: 'A3.1-17', name: 'var hoists to its function while lexical declarations do not',
    run() {
      const value = a31Analyse({ kind: 'javascript', source:
        '{ var raised=1; let closed=2; } raised; closed; function f(){var inner=1;} inner;' });
      const misses = value.unresolved.map(row => row.name);
      return a31Result(!misses.includes('raised') && misses.filter(name => name === 'closed').length === 1 &&
        misses.filter(name => name === 'inner').length === 1 &&
        value.scopes.some(scope => scope.kind === 'block') &&
        value.scopes.some(scope => scope.kind === 'function-body'), JSON.stringify(misses));
    },
  },
  {
    id: 'A3.1-18', name: 'parameter defaults resolve in the parameter environment, not the body',
    run() {
      const value = a31Analyse({ kind: 'javascript',
        source: 'function f(a=body,b=a){var body=1;return [a,b,body]}' });
      const misses = value.unresolved.map(row => row.name);
      const kinds = value.scopes.map(scope => scope.kind);
      return a31Result(JSON.stringify(misses) === JSON.stringify(['body']) &&
        kinds.includes('parameters') && kinds.includes('function-body'),
      JSON.stringify({ misses, kinds }));
    },
  },
  {
    id: 'A3.1-19', name: 'destructuring, catch, class and static scopes stay bounded without invented misses',
    run() {
      const source = 'const {a:{b},c:[d]}=obj; try{throw 1}catch({message}){message} ' +
        'class C{static{let z=1;z} m({q}){return q}} message; C;';
      const value = a31Analyse({ kind: 'javascript', source });
      const misses = value.unresolved.map(row => row.name).sort();
      const bounded = a31Analyse({ kind: 'javascript',
        source: 'const {a,b,c,d}=input; a;b;c;d;' }, { bindings: 2 });
      const bindingOmission = a31Omission(bounded, 'bindings');
      return a31Result(JSON.stringify(misses) === JSON.stringify(['message', 'obj']) &&
        ['catch', 'class', 'static-block', 'parameters'].every(kind =>
          value.scopes.some(scope => scope.kind === kind)) &&
        bounded.complete === false && bindingOmission && bounded.unresolved.length === 0,
      JSON.stringify({ misses, bounded: bounded.status, omissions: bounded.omissions,
        boundedUnresolved: bounded.unresolved }));
    },
  },
  {
    id: 'A3.1-20', name: 'dialect and host builtin profiles never bleed into one another',
    run() {
      const browser = a31Analyse({ kind: 'html', source: '<script>require; document;</script>' });
      const commonjs = a31Analyse({ kind: 'javascript', dialect: 'script', source: 'require; document;' });
      const module = a31Analyse({ kind: 'javascript', dialect: 'module', source: 'require; document;' });
      const names = value => value.unresolved.map(row => row.name).sort().join(',');
      return a31Result(names(browser) === 'require' && names(commonjs) === 'document' &&
        names(module) === 'document,require', JSON.stringify({
          browser: names(browser), commonjs: names(commonjs), module: names(module),
        }));
    },
  },
  {
    id: 'A3.1-21', name: 'occurrence identity excludes pure writes from references',
    run() {
      const source = 'let x=0; x=1; x+=2; x++;';
      const index = a31Analyse({ kind: 'javascript', source });
      const roles = index.occurrences.filter(row => row.kind === 'identifier' && row.name === 'x')
        .map(row => row.role);
      const references = a31Analyse({ mode: 'find', kind: 'javascript', source,
        query: 'x', kinds: ['reference'] });
      const writes = a31Analyse({ mode: 'find', kind: 'javascript', source,
        query: 'x', kinds: ['write'] });
      return a31Result(roles.filter(role => role === 'write').length === 1 &&
        roles.filter(role => role === 'readwrite').length === 2 &&
        references.matches.length === 2 && writes.matches.length === 3 &&
        references.matches.every(row => row.start !== source.indexOf('x=1')),
      JSON.stringify({ roles, references: references.matches, writes: writes.matches }));
    },
  },
  {
    id: 'A3.1-22', name: 'read_context disclosure and facts spend one exact structural identity',
    run() {
      const read = functionSource('_rapierStructuralRead');
      const plan = functionSource('_rapierStructurePlan');
      const operationRead = sourceSlice("'document.read_context':", "'document.wait_for_user':");
      return a31Result(a31CallCount(read, '_rapierStructureJob') === 1 &&
        a31CallCount(read, '_rapierWithSettledExternalDocument') === 2 &&
        /now\.identityKey\s*!==\s*plan\.identityKey/.test(read) &&
        /now\.capture\.source\s*!==\s*plan\.capture\.source/.test(read) &&
        /Object\.freeze\s*\(\s*\{\s*source\s*,\s*identity/.test(plan) &&
        ['epoch', 'authority', 'filename', 'revision', 'generation', 'chars', 'fnv', 'adler']
          .every(field => new RegExp('\\b' + field + '\\b').test(plan)) &&
        /_rapierStructuralRead/.test(operationRead) && /_rapierStructurePacket\s*\(\s*analysis\s*\)/.test(operationRead) &&
        a31CallCount(operationRead, '_rapierStructureJob') === 0,
      JSON.stringify({ jobs: a31CallCount(read, '_rapierStructureJob'),
        settledReads: a31CallCount(read, '_rapierWithSettledExternalDocument') }));
    },
  },
  {
    id: 'A3.1-23', name: 'find-within resolves the reference in the same disposable index',
    run() {
      const findOperation = sourceSlice("'document.find':", "'document.compare':");
      const plan = functionSource('_rapierStructurePlan');
      const scope = functionSource('_rapierStructureScopeOf');
      const target = functionSource('_rapierStructureTargetForRef');
      return a31Result(a31CallCount(findOperation, '_rapierStructuralRead') === 1 &&
        a31CallCount(findOperation, '_rapierStructureJob') === 0 &&
        /targetRef:\s*withinRef/.test(findOperation) &&
        /\{\s*kind\s*,\s*analysis\s*,\s*plan\s*,\s*withinRef\s*\}/.test(findOperation) &&
        /projection\.target\s*=\s*target/.test(plan) &&
        /_rapierResolveOutlineReference\s*\(\s*ref\s*,\s*analysis\s*\)/.test(scope) &&
        /_rapierParseOutlineRef/.test(target), 'find-within grew a second capture, job or reference grammar');
    },
  },
  {
    id: 'A3.1-24', name: 'receipt before/after bytes are pinned at the settled commit seam',
    run() {
      const capture = functionSource('_rapierCaptureCommitObservation');
      const transaction = functionSource('_rapierWithCompoundTransaction');
      const operationApply = sourceSlice("'document.apply_edits':", "'document.list_changes':");
      return a31Result(matchesAll(capture, [
        /beforeSnapshot\.integrity\s*\(\s*\)/,
        /_rapierIntegrityOf\s*\(\s*afterSource\s*\)/,
        /beforeSource\s*,/, /afterSource\s*,/,
      ]) && includesInOrder(transaction, [
        '_rapierCommitSplices', '_rapierCaptureCommitObservation',
        '_rapierFinishMutationBarrier',
      ]) && /snapshot\.source\.capture|source:\s*rapier\.document\.source\.capture/.test(transaction) &&
        /snapshot\.source\.read\s*\(\s*\)/.test(transaction) &&
        /raw\s*&&\s*raw\._commitObservation/.test(operationApply) &&
        /ctx\?\.actor\?\.kind[^\n]*['"]agent['"]/.test(operationApply) &&
        !/beforeSource\s*=\s*_rapierGetCanonicalText/.test(operationApply),
      'commit evidence is no longer pinned under the mutation owner');
    },
  },
  {
    id: 'A3.1-25', name: 'late structural results are dropped on full identity or byte movement',
    run() {
      const read = functionSource('_rapierStructuralRead');
      const ladder = functionSource('_rapierExpandSyntaxSelection');
      const naming = functionSource('_rapierAgentBarNameSymbol');
      const identity = functionSource('_rapierStructuralIdentityCurrent');
      return a31Result(/reason:\s*['"]source_moved['"]/.test(read) &&
        /identityKey\s*!==\s*plan\.identityKey/.test(read) &&
        /capture\.source\s*!==\s*plan\.capture\.source/.test(read) &&
        /identityKey\s*!==\s*plan\.identityKey/.test(ladder) &&
        /capture\.source\s*!==\s*plan\.capture\.source/.test(ladder) &&
        /_rapierStructuralIdentityCurrent\s*\(\s*identity\s*\)/.test(naming) &&
        ['authority', 'epoch', 'filename', 'revision', 'generation', 'chars', 'fnv', 'adler']
          .every(field => new RegExp('identity\\.' + field).test(identity)),
      'one late-result consumer no longer re-proves the whole identity');
    },
  },
  {
    id: 'A3.1-26', name: 'the acorn glyph is worn while a call is using the document\'s structure, and lingers after it',
    run() {
      /* The founder's words 115, 129 and 142: the acorn is activity, not a badge. It was never seen
         while it lived only for the milliseconds of the worker's job, so it is worn for the whole of
         a call that uses the structure (known at the call's start) and lingers a few seconds after,
         never while idle, never on a document without a structural sense. Invocation liveness still
         names the symbol. */
      const render = functionSource('_rapierAgentBarRender');
      const active = functionSource('_rapierStructureActiveHere');
      const setLive = functionSource('_rapierStructureSetLive');
      const name = functionSource('_rapierAgentBarNameSymbol');
      return a31Result(/const acorn\s*=\s*!!_rapierStructureDocKind\s*\(\s*\)\s*&&\s*\(usingAcorn\s*\|\|\s*lingering\)/.test(render) &&
        /invocation\.structural/.test(render) && /_RAPIER_ACORN_LINGER_MS/.test(render) &&
        /active\.invocationIds\s+instanceof\s+Set/.test(active) &&
        /_rapierStructuralIdentityCurrent\s*\(\s*identity\s*\)/.test(active) &&
        /active\.invocationIds\.has/.test(active) &&
        /_rapierAgentBarRender/.test(setLive) && /_rapierStructuralIdentityCurrent/.test(name) &&
        !/engineReady|StructureEngineReady/.test(render.slice(render.indexOf('const glyph'))),
      'glyph visibility is not a presence-and-structure fact');
    },
  },
  {
    id: 'A3.1-27', name: 'the one circle opens declarations or line in source, outline in rendered, drag remains fast scroll',
    run() {
      const bind = functionSource('_bindScrollFab');
      const kindForFab = functionSource('_rapierNavigatorKindForFab');
      const label = /id="scroll-fab"[\s\S]{0,200}aria-label="([^"]+)"/.exec(html);
      return a31Result(matchesAll(bind, [
        /DRAG_THRESHOLD_SQ\s*=\s*64/,
        /addEventListener\s*\(\s*['"]pointerdown['"]/,
        /addEventListener\s*\(\s*['"]pointermove['"]/,
        /finishPointer\s*\([^)]*cancelled/,
        /virtual\(\)\.seek\s*\(\s*progress\s*,\s*false\s*\)/,
        /h\.scrollTop\s*=\s*progress/,
        /_rapierOpenDocumentNavigator\s*\(\s*_rapierNavigatorKindForFab\s*\(\s*\)\s*,\s*journey\s*\)/,
      ]) && !/new\s+KeyboardEvent|dispatchEvent\s*\(\s*new\s+KeyboardEvent/.test(bind) &&
        /* One circle, one twin buried: no second fast-scroll element survives to branch on. */
        !/id="source-scroll-fab"/.test(html) &&
        /!_rapierFlatSurface\s*\(\s*\)\s*\)\s*return\s*['"]outline['"]/.test(kindForFab) &&
        /_rapierStructureDocKind\s*\(\s*\)[\s\S]*_rapierStructureEngineReady\s*\(\s*\)[\s\S]*['"]outline['"][\s\S]*['"]line['"]/.test(kindForFab) &&
        label && /declarations|line/i.test(label[1]) && /headings/i.test(label[1]),
        label ? label[1] : (/id="source-scroll-fab"/.test(html) ? 'twin source-scroll-fab still present' : 'circle absent'));
    },
  },
  {
    id: 'A3.1-28', name: 'declarations, Go Line and syntax expansion share one transient sheet',
    run() {
      const sheet = sourceSlice('DOCUMENT NAVIGATOR —', 'Math plug-in install prompt.');
      const open = functionSource('_rapierOpenDocumentNavigator');
      const line = functionSource('rapierGoToLine');
      const expand = functionSource('rapierExpandNavigatorSelection');
      /* The sense the sheet is showing is still decided by the opener and still written once —
         the write itself moved to the UI owner that owns the panel's DOM, so the opener names
         the noun and renderOutlineReset is where it lands. */
      const reset = functionSource('renderOutlineReset');
      return a31Result((sheet.match(/role="dialog"/g) || []).length === 1 &&
        /id="navigator-outline"/.test(sheet) && /goto-line-form/.test(sheet) &&
        /data-action="navigator-expand"/.test(sheet) &&
        /noun:\s*structural\s*\?\s*['"]declarations['"]/.test(open) &&
        /root\.dataset\.outlineNoun\s*=\s*model\.noun/.test(reset) &&
        /rapierCloseDocumentNavigator\s*\(\s*false\s*\)/.test(line) &&
        /rapierCloseDocumentNavigator\s*\(\s*false\s*\)/.test(expand),
      'the three source navigation gestures no longer converge on one dialog');
    },
  },
  {
    id: 'A3.1-29', name: 'one Worker lifecycle owns abort, coalescing, deadlines and crash withdrawal',
    run() {
      const create = functionSource('_rapierStructureCreateWorker');
      const restart = functionSource('_rapierStructureRestart');
      const start = functionSource('_rapierStructureStartNext');
      const off = functionSource('_rapierStructureOffThread');
      const cancel = functionSource('_rapierStructureCancelWaiter');
      const receipt = functionSource('_rapierStructuralReceipt');
      return a31Result(/worker\.onerror[\s\S]*_rapierStructureRestart/.test(create) &&
        /worker\.onmessageerror[\s\S]*_rapierStructureRestart/.test(create) &&
        /worker\.terminate\s*\(\s*\)/.test(restart) &&
        /_rapierStructureCreateWorker\s*\(\s*\)/.test(restart) &&
        /runtime\.active\s*\|\|\s*!runtime\.worker/.test(start) &&
        /job\.timer\s*=\s*setTimeout/.test(start) && !/setTimeout/.test(off) &&
        /bucket\.find\s*\([^)]*_rapierStructureSameRequest/.test(off) &&
        /runtime\.queue\.length\s*\+\s*\(runtime\.active\s*\?\s*1\s*:\s*0\)\s*>=\s*5/.test(off) &&
        /_RAPIER_STRUCTURE_WAITER_LIMIT/.test(off) &&
        /_rapierStructureRestart\s*\(\s*['"]structure_cancelled['"]\s*\)/.test(cancel) &&
        a31CallCount(receipt, '_rapierStructureJob') === 1 && /mode:\s*['"]receipt['"]/.test(receipt),
      'queue, deadline, cancellation, crash, or receipt ownership regressed');
    },
  },
  {
    id: 'A3.1-30', name: 'receipt facts preserve exact declaration slices and module tuples',
    run() {
      const beforeSource = 'const {a:x}=obj; import {a as b} from "m"; export {b as c};';
      const afterSource = 'let {a:y}=obj; import {a as z} from "m2"; export {z as d};';
      const pair = a31Analyse({ mode: 'receipt', kind: 'javascript', dialect: 'module',
        before: { source: beforeSource }, after: { source: afterSource } });
      const beforeDecl = pair.before.declarations.find(row => row.name === 'x');
      const afterDecl = pair.after.declarations.find(row => row.name === 'y');
      const receiptSource = functionSource('_rapierStructuralReceipt');
      return a31Result(beforeDecl && afterDecl && beforeDecl.declarationKind === 'const' &&
        afterDecl.declarationKind === 'let' &&
        beforeSource.slice(beforeDecl.start, beforeDecl.end) === '{a:x}=obj' &&
        afterSource.slice(afterDecl.start, afterDecl.end) === '{a:y}=obj' &&
        JSON.stringify(pair.before.imports.map(row => [row.source, row.imported, row.local])) ===
          JSON.stringify([['m', 'a', 'b']]) &&
        JSON.stringify(pair.after.imports.map(row => [row.source, row.imported, row.local])) ===
          JSON.stringify([['m2', 'a', 'z']]) &&
        JSON.stringify(pair.before.exports.map(row => [row.source, row.local, row.exported])) ===
          JSON.stringify([['', 'b', 'c']]) &&
        JSON.stringify(pair.after.exports.map(row => [row.source, row.local, row.exported])) ===
          JSON.stringify([['', 'z', 'd']]) &&
        /String\(row\.declarationKind\s*\|\|\s*row\.kind/.test(receiptSource) &&
        /JSON\.stringify\s*\(\s*\[[\s\S]*row\.source[\s\S]*row\.imported[\s\S]*row\.local/.test(receiptSource) &&
        /row\.exported[\s\S]*row\.local[\s\S]*row\.source/.test(receiptSource),
      JSON.stringify({ beforeDecl, afterDecl, imports: pair.before.imports, exports: pair.before.exports }));
    },
  },
  {
    id: 'A3.1-31', name: 'rename proof is one-to-one, ambiguity-safe and clipping-disclosed',
    run() {
      const result = a31Functions(['_rapierStructureRenameWitness'], {},
        ';(()=>{const before="function old(){}";const after="function neo(){}";' +
        'const gone={kind:"function",declarationKind:"function",container:"",name:"old",start:0,end:before.length,nameStart:9};' +
        'const arrived={kind:"function",declarationKind:"function",container:"",name:"neo",start:0,end:after.length,nameStart:9};' +
        'const exact=_rapierStructureRenameWitness([gone],[arrived],before,after,new Set());' +
        'const duplicate=_rapierStructureRenameWitness([gone,{...gone}],[arrived],before,after,new Set());' +
        'const same=_rapierStructureRenameWitness([gone],[{...arrived,name:"old"}],before,before,new Set());' +
        'return {exact:exact.map(x=>[x.from,x.to]),duplicates:duplicate.length,same:same.length};})()');
      const receipt = functionSource('_rapierStructuralReceipt');
      return a31Result(JSON.stringify(result.exact) === JSON.stringify([['old', 'neo']]) &&
        result.duplicates === 0 && result.same === 0 &&
        /ambiguousContainers/.test(functionSource('_rapierStructureRenameWitness')) &&
        /proof\.fnv[\s\S]*proof\.adler/.test(receipt) &&
        /receipt\.omitted[\s\S]*receipt\.truncated\s*=\s*true/.test(receipt), JSON.stringify(result));
    },
  },
  {
    id: 'A3.1-32', name: 'one symbol model feeds outline, find, focus and effect taxonomy',
    run() {
      const source = 'export const exposed=1; const obj={method(){return exposed}}; ' +
        'class C{member(){return obj.method()}}';
      const index = a31Analyse({ kind: 'javascript', dialect: 'module', source });
      const find = a31Analyse({ mode: 'find', kind: 'javascript', dialect: 'module', source,
        query: 'method', kinds: ['declaration'] });
      const symbol = index.symbols.find(row => row.name === 'method');
      const entry = index.entries.find(row => row.name === 'method');
      const match = find.matches.find(row => row.name === 'method');
      const exported = index.symbols.find(row => row.name === 'exposed');
      const navigator = functionSource('_rapierOpenDocumentNavigator');
      const readOperation = sourceSlice("'document.read_context':", "'document.wait_for_user':");
      const outlineItems = a31Schema('document.get_outline').entries;
      const outlineProps = outlineItems && outlineItems.items && outlineItems.items.properties;
      return a31Result(symbol && entry && match &&
        symbol.headerSpan.start === entry.start && symbol.headerSpan.end === entry.end &&
        symbol.completeSpan.start === match.start && symbol.completeSpan.end === match.end &&
        exported && exported.exported === true &&
        index.symbols.some(row => row.depth === 0) && index.symbols.every(row => row.depth <= 64) &&
        /* The outline's own DOM is the UI owner's now: the opener still decides the sense and
           still applies the standing filter to asynchronously arrived buttons, and the two
           writes it used to make itself land in the renderers named here. */
        /renderOutlineFilter\s*\(\s*_rapierUiNavigator\.filter\s*\)/.test(navigator) &&
        /noun:\s*structural\s*\?\s*['"]declarations['"]/.test(navigator) &&
        /root\.dataset\.outlineNoun\s*=\s*model\.noun/.test(functionSource('renderOutlineReset')) &&
        /setAttribute\s*\(\s*['"]aria-busy['"]\s*,\s*model\.busy\s*\?/.test(functionSource('renderOutlineList')) &&
        /Symbol naming is a view effect/.test(readOperation) &&
        includesInOrder(readOperation, ['ctx.signal.throwIfAborted()', '_rapierAgentBarNameSymbol']) &&
        outlineProps && outlineProps.kind && outlineProps.depth && outlineProps.exported,
      JSON.stringify({ symbol, entry, match, exported, outlineSchema: Boolean(outlineProps) }));
    },
  },
];

const a31Ids = new Set(A31_ACCEPTANCE.map(item => item.id));
const a31Shape = A31_ACCEPTANCE.length === 32 && a31Ids.size === 32 &&
  A31_ACCEPTANCE.every((item, index) =>
    item.id === 'A3.1-' + String(index + 1).padStart(2, '0') &&
    typeof item.name === 'string' && item.name.length > 0 && typeof item.run === 'function');
if (!a31Shape) {
  const detail = `A3.1 registry shape is ${A31_ACCEPTANCE.length} cases / ${a31Ids.size} unique ids`;
  failures.push(detail);
  process.stdout.write(`FAIL ${detail}\n`);
} else {
  for (const item of A31_ACCEPTANCE) {
    let result = true;
    try { result = item.run(); }
    catch (error) { result = String((error && error.stack) || error); }
    check(`${item.id} ${item.name}`, result === true, result === true ? '' : String(result));
  }
}

/* ── KERNEL-3 PERMANENT ACCEPTANCE FLOOR ────────────────────────────────────────────────
   Browser drivers own visible routes. These five Node cases own the architecture and pure
   behavior underneath them, using functions extracted from the shipped artifact itself. */
function k3SourceStoreProbe() {
  try {
    const box = { TextEncoder };
    vm.runInNewContext(`
      const _RAPIER_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
      const _rapierSourceEncoder = new TextEncoder();
      function _rapierSpliceHash(value) {
        const text = String(value == null ? '' : value);
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        return text.length + ':' + (hash >>> 0).toString(36);
      }
      ${functionSource('_rapierSourceRootAfter')}
      ${functionSource('_rapierCreateSourceStore')}
      this.makeStore = _rapierCreateSourceStore;
    `, box);
    const original = 'A\r\nB\nC\r\nD';
    const store = box.makeStore(original);
    const captured = store.capture();
    const beforeRoot = store.rootId;
    store.splice(3, 'B', '\u03b2');
    const edited = store.read();
    const mapped = store.sourceOffsetFromProjection(2) === 3
      && store.projectionOffsetFromSource(3) === 2;
    let refused = false;
    try { store.splice(0, 'Z', ''); } catch (_) { refused = true; }
    const unchangedAfterRefusal = store.read() === edited;
    captured.restore();
    return original === store.read() && store.rootId === beforeRoot && mapped && refused
      && unchangedAfterRefusal && edited === 'A\r\n\u03b2\nC\r\nD';
  } catch (_) { return false; }
}

function k3RecoveryProbe() {
  const expectedIds = Object.freeze([
    'honest_root_chain', 'forged_root', 'duplicate_id', 'reordered_branch',
    'incomplete_branch', 'trimmed_prefix', 'source_only_identity',
    'topology_mismatch', 'large_8mib_plus_one', 'side_over_25mib',
  ]);
  try {
    const box = { TextEncoder };
    vm.runInNewContext(`
      const RapierTextCodec = Object.freeze({
        maxDocumentBytes: 25 * 1024 * 1024,
        isDocumentFragment: value => typeof value === 'string' &&
          new TextEncoder().encode(value).length <= 25 * 1024 * 1024,
      });
      const _RAPIER_HISTORY_LIMIT = 500;
      const _RAPIER_JOURNAL_BYTE_BUDGET = 4 * 1024 * 1024;
      const _RAPIER_TRANSACTION_ACTOR_LIMIT = 96;
      const _RAPIER_TRANSACTION_OPERATION_LIMIT = 96;
      const _RAPIER_TRANSACTION_REQUEST_LIMIT = 160;
      const _rapierJournalByteEncoder = new TextEncoder();
      const _rapierPersistenceRuntime = { durable: null };
      const _rapierTransactionRuntime = { compound: null, context: null };
      function _rapierSpliceHash(value) {
        const text = String(value == null ? '' : value);
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        return text.length + ':' + (hash >>> 0).toString(36);
      }
      ${functionSource('_rapierSourceRootAfter')}
      ${functionSource('_rapierTransformSplices')}
      ${functionSource('_rapierRecordSplices')}
      ${functionSource('_rapierSegmentIdentity')}
      function _rapierJournalUtf8Length(text) {
        return _rapierJournalByteEncoder.encode(text).length;
      }
      function _rapierJournalEntryBytes(record) {
        return (Array.isArray(record && record.splices) ? record.splices : [])
          .reduce((total, row) => total + _rapierJournalUtf8Length(row.removed)
            + _rapierJournalUtf8Length(row.inserted), 0);
      }
      function sourceStore(text, rootId) {
        let value = String(text == null ? '' : text);
        let root = String(rootId || _rapierSpliceHash(value));
        return {
          get rootId() { return root; },
          read: () => value,
          capture() {
            const savedValue = value, savedRoot = root;
            return { rootId: savedRoot, read: () => savedValue,
              restore() { value = savedValue; root = savedRoot; } };
          },
          splice(pos, removed, inserted) {
            const row = { pos: Number(pos), removed: String(removed), inserted: String(inserted) };
            if (!Number.isSafeInteger(row.pos) || row.pos < 0 ||
                value.slice(row.pos, row.pos + row.removed.length) !== row.removed) {
              throw Object.assign(new Error('target changed'), { code: 'target_changed' });
            }
            value = value.slice(0, row.pos) + row.inserted +
              value.slice(row.pos + row.removed.length);
            root = _rapierSourceRootAfter(root, row);
            return row;
          },
        };
      }
      function _rapierApplySourceSplices(splices, inverse = false) {
        const rows = Array.isArray(splices) ? splices : [];
        const ordered = inverse ? rows.slice().reverse() : rows;
        return ordered.map(row => {
          const splice = inverse
            ? { pos: row.pos, removed: row.inserted, inserted: row.removed } : row;
          return rapier.document.source.splice(splice.pos, splice.removed, splice.inserted);
        });
      }
      function _rapierAdvanceDocumentRevision(options) {
        const config = options || {};
        const baseRevision = Number(rapier.revision.settled || 0);
        const revision = baseRevision + 1;
        const parent = rapier.undo.ledger[rapier.undo.ledger.length - 1]?.transaction?.id || null;
        const transaction = Object.freeze({
          id: 'doc:' + revision, documentAuthority: 'doc', baseRevision, revision,
          actor: Object.freeze({ kind: 'human', id: 'local' }), transport: 'platform',
          operation: String(config.operation || 'document.change'), requestId: null,
          sourceTransactionId: config.sourceTransactionId == null
            ? null : String(config.sourceTransactionId),
          affectedBlockIds: Object.freeze((config.affectedBlockIds || []).filter(id =>
            Number.isSafeInteger(id) && id >= 0).slice(0, 64)),
          parent, reverts: config.reverts || null, reapplies: config.reapplies || null,
          createdAt: revision,
        });
        rapier.revision.settled = revision;
        return transaction;
      }
      ${functionSource('_rapierJournalTrim')}
      ${functionSource('_rapierCommitSplices')}
      function _rapierHistoryStateId() { return 'restored'; }
      function _rapierSourceText() { return rapier.document.source.read(); }
      function _rapierResetSource(text, rootId) { rapier.document.source = sourceStore(text, rootId); }
      function _rapierCurrentSegmentIdentity() { return rapier.__actualIdentity; }
      ${functionSource('_rapierValidLedgerRecord')}
      ${functionSource('_rapierClearRestoredLedger')}
      ${functionSource('_rapierInstallRestoredHistory')}

      function transaction(id, revision, parent, affectedBlockIds) {
        return {
          id, documentAuthority: 'doc', baseRevision: revision - 1, revision,
          actor: { kind: 'human', id: 'local' }, parent: parent == null ? null : parent,
          transport: 'platform', operation: 'document.change', requestId: null,
          sourceTransactionId: null, reverts: null, reapplies: null, createdAt: revision,
          affectedBlockIds: affectedBlockIds === undefined ? [0] : affectedBlockIds,
        };
      }
      function build(base, rows, ids) {
        let source = String(base), root = _rapierSpliceHash(source), parent = null;
        const earliestHash = root;
        const ledger = rows.map((row, index) => {
          const beforeHash = root;
          const next = _rapierTransformSplices(source, [row]);
          if (next == null) throw new Error('invalid fixture splice ' + index);
          root = _rapierSourceRootAfter(root, row);
          const id = ids && ids[index] || 'doc:' + (index + 1);
          const record = {
            splices: [row], transaction: transaction(id, index + 1, parent),
            beforeHash, afterHash: root,
          };
          source = next;
          parent = id;
          return record;
        });
        return { base: String(base), current: source, root, earliestHash,
          earliestRevision: 0, ledger, branch: ledger.map(row => row.transaction.id),
          cursor: ledger.length, trimReason: '', historyComplete: true };
      }
      function simple() {
        return build('abc', [{ pos: 1, removed: 'b', inserted: 'X' }]);
      }
      function envelope(fixture, overrides) {
        const last = fixture.ledger[fixture.ledger.length - 1];
        return Object.assign({
          schemaVersion: 4, documentAuthority: 'doc',
          documentRevision: last ? last.transaction.revision : 0,
          sourceRootId: fixture.root, earliestRevision: fixture.earliestRevision,
          earliestHash: fixture.earliestHash, historyComplete: fixture.historyComplete,
          trimReason: fixture.trimReason, trimmedBytes: fixture.trimReason ? 1 : 0,
          ledger: fixture.ledger, branch: fixture.branch, cursor: fixture.cursor,
          segmentIdentity: [],
        }, overrides || {});
      }
      function install(fixture, options) {
        const config = options || {};
        const documentRevision = Number(config.documentRevision == null
          ? fixture.ledger[fixture.ledger.length - 1]?.transaction?.revision || 0
          : config.documentRevision);
        globalThis.rapier = {
          identity: { authority: 'doc' }, revision: { settled: documentRevision },
          document: {
            docKind: config.docKind || 'text',
            projection: { wysiwyg: config.projection || 'available' },
            source: sourceStore(fixture.current, fixture.root),
          },
          undo: { ledger: [], branch: [], cursor: 0, earliestRevision: 0,
            earliestHash: '', trimReason: '', trimmedBytes: 0 },
          __actualIdentity: config.actualIdentity || [],
        };
        const sourceBefore = _rapierSourceText();
        const accepted = _rapierInstallRestoredHistory(envelope(fixture, config.envelope));
        return { accepted, sourceRetained: _rapierSourceText() === sourceBefore,
          reason: rapier.undo.trimReason, fixture };
      }

      const results = [];
      let fixture = simple();
      results.push({ id: 'honest_root_chain', pass: install(fixture).accepted === true });

      fixture = simple();
      fixture.ledger[0].afterHash = 'forged-root';
      fixture.root = 'forged-root';
      let attempt = install(fixture);
      results.push({ id: 'forged_root', pass: attempt.accepted === false &&
        attempt.reason === 'identity_unproven' && attempt.sourceRetained });

      fixture = build('ab', [
        { pos: 1, removed: '', inserted: 'X' },
        { pos: 2, removed: '', inserted: 'Y' },
      ]);
      fixture.ledger[1].transaction.id = fixture.ledger[0].transaction.id;
      fixture.ledger[1].transaction.parent = fixture.ledger[0].transaction.id;
      fixture.branch = [fixture.ledger[0].transaction.id];
      results.push({ id: 'duplicate_id', pass: install(fixture).accepted === false });

      fixture = build('ab', [
        { pos: 1, removed: '', inserted: 'X' },
        { pos: 2, removed: '', inserted: 'Y' },
      ]);
      fixture.branch = fixture.branch.slice().reverse();
      results.push({ id: 'reordered_branch', pass: install(fixture).accepted === false });

      fixture = build('ab', [
        { pos: 1, removed: '', inserted: 'X' },
        { pos: 2, removed: '', inserted: 'Y' },
      ]);
      fixture.branch = [fixture.branch[0]];
      fixture.cursor = 1;
      results.push({ id: 'incomplete_branch', pass: install(fixture).accepted === false });

      /* Honest output after trim closes the prefix over compact U4/U5 dependencies: C6 is the
         sole retained material record, and its pre-boundary parent is intentionally absent. */
      let source = 'a', root = _rapierSpliceHash(source), parent = null, lastRow = null;
      function advance(row) {
        source = _rapierTransformSplices(source, [row]);
        root = _rapierSourceRootAfter(root, row);
        lastRow = row;
      }
      advance({ pos: 1, removed: '', inserted: '1' }); parent = 'doc:1';
      advance({ pos: 2, removed: '', inserted: '2' }); parent = 'doc:2';
      advance({ pos: 3, removed: '', inserted: '3' }); parent = 'doc:3';
      advance({ pos: 3, removed: '3', inserted: '' }); parent = 'doc:4';
      advance({ pos: 2, removed: '2', inserted: '' }); parent = 'doc:5';
      const beforeC6 = root;
      const rowC6 = { pos: 2, removed: '', inserted: 'Z' };
      advance(rowC6);
      const c6 = { splices: [rowC6], transaction: transaction('doc:6', 6, parent),
        beforeHash: beforeC6, afterHash: root };
      fixture = { current: source, root, earliestHash: beforeC6, earliestRevision: 5,
        ledger: [c6], branch: ['doc:6'], cursor: 1,
        trimReason: 'ledger_budget', historyComplete: false };
      results.push({ id: 'trimmed_prefix', pass: install(fixture).accepted === true });

      fixture = simple();
      attempt = install(fixture, { docKind: 'markdown', projection: 'unavailable',
        actualIdentity: [[1, 'paragraph', 0, fixture.current.length]],
        envelope: { segmentIdentity: [[1, 'paragraph', 0, fixture.current.length]] } });
      results.push({ id: 'source_only_identity', pass: attempt.accepted === false &&
        attempt.sourceRetained && attempt.reason === 'identity_unproven' });

      fixture = simple();
      attempt = install(fixture, { docKind: 'markdown', projection: 'available',
        actualIdentity: [[1, 'heading', 0, fixture.current.length]],
        envelope: { segmentIdentity: [[1, 'paragraph', 0, fixture.current.length]] } });
      results.push({ id: 'topology_mismatch', pass: attempt.accepted === false &&
        attempt.sourceRetained && attempt.reason === 'identity_unproven' });

      const large = 'x'.repeat(8 * 1024 * 1024 + 1);
      fixture = build('', [{ pos: 0, removed: '', inserted: large }]);
      results.push({ id: 'large_8mib_plus_one', pass: install(fixture).accepted === true });

      const over = 'x'.repeat(RapierTextCodec.maxDocumentBytes + 1);
      fixture = {
        current: '', root: 'over-after', earliestHash: 'over-before', earliestRevision: 0,
        ledger: [{
          splices: [{ pos: 0, removed: over, inserted: '' }],
          transaction: transaction('doc:1', 1, null),
          beforeHash: 'over-before', afterHash: 'over-after',
        }],
        branch: ['doc:1'], cursor: 1, trimReason: '', historyComplete: true,
      };
      results.push({ id: 'side_over_25mib', pass: install(fixture).accepted === false });

      function affectedAttempt(value) {
        const candidate = simple();
        candidate.ledger[0].transaction.affectedBlockIds = value;
        return install(candidate).accepted;
      }
      const affectedRejects = [
        affectedAttempt(1), affectedAttempt({}), affectedAttempt('0'),
        affectedAttempt([0, NaN]), affectedAttempt(Array.from({ length: 65 }, (_, i) => i)),
      ].every(value => value === false);
      fixture = simple();
      fixture.ledger[0].transaction.affectedBlockIds = [0, 1];
      const originalAffected = fixture.ledger[0].transaction.affectedBlockIds;
      attempt = install(fixture);
      const installed = rapier.undo.ledger[0];
      originalAffected[0] = 99;
      const undone = attempt.accepted && installed && _rapierTransformSplices(
        fixture.current, installed.splices, true);
      const redone = undone == null ? null : _rapierTransformSplices(undone, installed.splices);
      this.affected = {
        rejects: affectedRejects,
        accepts: attempt.accepted === true,
        clonedFrozen: Boolean(installed && Object.isFrozen(installed.transaction.affectedBlockIds)
          && installed.transaction.affectedBlockIds[0] === 0),
        undoRedoExact: undone === fixture.base && redone === fixture.current,
      };

      function writerAttempt(change) {
        const candidate = simple();
        change(candidate.ledger[0].transaction);
        return install(candidate).accepted;
      }
      this.writerShape = {
        rejects: [
          writerAttempt(tx => { tx.id = ''; }),
          writerAttempt(tx => { tx.actor = { kind: 'intruder', id: 'local' }; }),
          writerAttempt(tx => { tx.transport = 'unknown'; }),
          writerAttempt(tx => { tx.operation = ''; }),
          writerAttempt(tx => { tx.requestId = {}; }),
          writerAttempt(tx => { tx.sourceTransactionId = {}; }),
          writerAttempt(tx => { tx.createdAt = -1; }),
          writerAttempt(tx => { tx.reverts = {}; }),
        ].every(value => value === false),
        valid: install(simple()).accepted === true,
      };

      function freshHistory(text, rootId, revision) {
        globalThis.rapier = {
          identity: { authority: 'doc' }, revision: { settled: Number(revision || 0) },
          document: {
            docKind: 'text', projection: { wysiwyg: 'available' },
            source: sourceStore(String(text || ''), rootId || ''),
          },
          undo: { ledger: [], branch: [], cursor: 0, earliestRevision: 0,
            earliestHash: _rapierSpliceHash(''), trimReason: '', trimmedBytes: 0 },
          __actualIdentity: [],
        };
      }
      function navigate(redo) {
        const index = redo ? rapier.undo.cursor : rapier.undo.cursor - 1;
        const target = rapier.undo.branch[index];
        if (!target) return false;
        const splices = redo ? target.splices : target.splices.slice().reverse().map(row => ({
          pos: row.pos, removed: row.inserted, inserted: row.removed,
        }));
        const committed = _rapierCommitSplices(splices, {
          operation: redo ? 'history.redo' : 'history.undo',
          sourceTransactionId: target.transaction.id, affectedBlockIds: [0],
          navigation: false,
          ...(redo ? { reapplies: target.transaction.id } : { reverts: target.transaction.id }),
        });
        if (!committed) return false;
        const retainedIndex = rapier.undo.branch.indexOf(target);
        if (retainedIndex < 0) return false;
        rapier.undo.cursor = retainedIndex + (redo ? 1 : 0);
        return true;
      }

      freshHistory('', '', 0);
      const openingRoot = rapier.document.source.rootId;
      let material = true;
      for (let index = 0; index < 250; index++) {
        material = material && !!_rapierCommitSplices([{
          pos: rapier.document.source.read().length, removed: '', inserted: 'x',
        }], { operation: 'document.change', affectedBlockIds: [0] });
      }
      const materialExact = material && rapier.document.source.read() === 'x'.repeat(250)
        && rapier.undo.ledger.length === 250 && rapier.undo.cursor === 250;
      let undidAll = true;
      for (let index = 0; index < 250; index++) undidAll = navigate(false) && undidAll;
      const undoExact = undidAll && rapier.document.source.read() === '' &&
        rapier.undo.cursor === 0 && rapier.undo.ledger.length === 500;
      const redidOnce = navigate(true);
      const liveText = rapier.document.source.read();
      const liveRoot = rapier.document.source.rootId;
      const liveRevision = rapier.revision.settled;
      const last = rapier.undo.ledger[rapier.undo.ledger.length - 1];
      const trimmedExact = redidOnce && liveText === 'x' && rapier.undo.ledger.length <= 500
        && rapier.undo.cursor === 1 && rapier.undo.cursor <= rapier.undo.branch.length
        && last && last.transaction.revision === liveRevision && last.afterHash === liveRoot
        && rapier.undo.trimReason === 'ledger_count' && rapier.undo.trimmedBytes === 1;
      const wire = JSON.parse(JSON.stringify({
        schemaVersion: 4, documentAuthority: 'doc', documentRevision: liveRevision,
        sourceRootId: liveRoot, earliestRevision: rapier.undo.earliestRevision,
        earliestHash: rapier.undo.earliestHash, historyComplete: false,
        trimReason: rapier.undo.trimReason, trimmedBytes: rapier.undo.trimmedBytes,
        ledger: rapier.undo.ledger,
        branch: rapier.undo.branch.map(record => record.transaction.id),
        cursor: rapier.undo.cursor, segmentIdentity: [],
      }));
      freshHistory(liveText, liveRoot, liveRevision);
      const restoredV4 = _rapierInstallRestoredHistory(wire);
      const restoredExact = restoredV4 === true && rapier.undo.ledger.length === wire.ledger.length
        && rapier.undo.cursor === wire.cursor && rapier.undo.trimReason === 'ledger_count'
        && rapier.undo.trimmedBytes === 1 && rapier.document.source.read() === 'x';
      const nextUndo = navigate(false);
      const afterNextUndo = rapier.document.source.read();
      const nextRedo = navigate(true);
      const afterNextRedo = rapier.document.source.read();
      this.churn = {
        materialExact, undoExact, trimmedExact, restoredExact,
        nextExact: nextUndo && nextRedo && afterNextUndo === '' && afterNextRedo === 'x'
          && rapier.undo.cursor >= 0 && rapier.undo.cursor <= rapier.undo.branch.length,
        ledger: wire.ledger.length, cursor: wire.cursor, revision: liveRevision,
        trimReason: wire.trimReason, trimmedBytes: wire.trimmedBytes,
      };
      this.results = results;
    `, box);
    const rows = Array.isArray(box.results) ? Array.from(box.results) : [];
    const ids = rows.map(row => String(row.id));
    const affected = box.affected || {};
    const writerShape = box.writerShape || {};
    const churn = box.churn || {};
    return {
      ok: rows.length === expectedIds.length && new Set(ids).size === expectedIds.length
        && ids.every((id, index) => id === expectedIds[index])
        && rows.every(row => row.pass === true)
        && affected.rejects === true && affected.accepts === true
        && affected.clonedFrozen === true && affected.undoRedoExact === true
        && writerShape.rejects === true && writerShape.valid === true
        && churn.materialExact === true && churn.undoExact === true
        && churn.trimmedExact === true && churn.restoredExact === true
        && churn.nextExact === true,
      cases: rows, affected, writerShape, churn,
    };
  } catch (error) {
    return { ok: false, cases: [], affected: null, writerShape: null, churn: null,
      error: String((error && error.stack) || error) };
  }
}

function k3ProjectionProbe() {
  let compareHighlight = false;
  try {
    const box = { TextEncoder };
    vm.runInNewContext(`
      const _RAPIER_COMPARE_BYTE_LIMIT = 4 * 1024 * 1024;
      const _RAPIER_COMPARE_LINE_LIMIT = 120000;
      const _rapierSourceEncoder = new TextEncoder();
      const _RAPIER_HIGHLIGHT_SLAB_MAX_CHARS = 128 * 1024;
      const _RAPIER_HIGHLIGHT_LINE_MAX_CHARS = 8192;
      ${functionSource('_rapierCompareLineCount')}
      ${functionSource('_rapierCompareAdmission')}
      ${functionSource('_rapierHighlightLinesAdmitted')}
      ${functionSource('_rapierHighlightAdmitted')}
      this.compare = _rapierCompareAdmission;
      this.highlight = _rapierHighlightAdmitted;
    `, box);
    compareHighlight = box.compare('a'.repeat(4 * 1024 * 1024), 'x').reason === 'compare_byte_limit'
      && box.compare('x\n'.repeat(120001), '').reason === 'compare_line_limit'
      && box.compare('same', 'same').same === true
      && box.highlight('x'.repeat(8192)) === true
      && box.highlight('x'.repeat(8193)) === false;
  } catch (_) {}

  const markdown = (() => {
    try {
      const runtime = storedSources.get('lib-markdownit');
      const workerSource = functionSource('_parseWorkerBody');
      if (!runtime || !workerSource) throw new Error('Markdown Worker source unavailable');
      function run(source) {
        const packets = [];
        const box = {
          atob: value => Buffer.from(String(value), 'base64').toString('binary'),
          inlineCalls: 0,
        };
        box.self = box;
        box.postMessage = packet => packets.push(packet);
        vm.createContext(box);
        vm.runInContext(runtime, box, { filename: 'rapier.html#lib-markdownit' });
        vm.runInContext(`
          self.__rapierInstallMathBlockRule = function () {};
          self.__rapierApplyMarkdownSpec = function (parser) {
            const parse = parser.inline.parse;
            parser.inline.parse = function () {
              self.inlineCalls += 1;
              return parse.apply(this, arguments);
            };
          };
          self.__rapierSplitByTokenStream = function (src, parser) {
            const tokens = parser.parse(src, {});
            const blocks = src.trim()
              ? [{ type: 'paragraph', raw: src, _sourceStart: 0, _sourceEnd: src.length }]
              : [];
            blocks._rapierFacts = [];
            blocks._rapierProjectionMetrics = {
              blocks: (src.match(/x\\n\\n/g) || []).length || blocks.length,
              tokens: tokens.length, inlineCandidates: 0, nodes: tokens.length,
            };
            return blocks;
          };
          (${source})();
        `, box, { filename: 'rapier.html#parse-worker-probe' });
        const limits = {
          blocks: 4096, tokens: 65536,
          inlineCandidates: 131072, nodes: 160000,
        };
        box.onmessage({ data: {
          reqId: 1, markdown: 'x\n\n'.repeat(5000),
          limits,
        } });
        const firstInlineCalls = box.inlineCalls;
        box.onmessage({ data: {
          reqId: 2, markdown: 'hello',
          limits,
        } });
        const reuseInlineCalls = box.inlineCalls;
        return { packets, firstInlineCalls, reuseInlineCalls, finalInlineCalls: box.inlineCalls };
      }

      const live = run(workerSource);
      const first = live.packets[0] || {};
      const second = live.packets[1] || {};
      const registration = "parser.core.ruler.before('inline', 'rapier_projection_block_budget', function (state) {";
      const delayed = "parser.core.ruler.push('rapier_projection_block_budget', function (state) {";
      if (!workerSource.includes(registration)) throw new Error('pre-inline registration missing');
      const mutant = run(workerSource.replace(registration, delayed));
      const mutantFirst = mutant.packets[0] || {};
      return {
        ok: first.refusal && first.refusal.reason === 'wysiwyg_block_limit'
          && first.refusal.observed === 5000 && first.refusal.limit === 4096
          && live.firstInlineCalls === 0
          && !second.refusal && !second.error && second.reqId === 2
          && live.reuseInlineCalls === 1
          && mutantFirst.refusal && mutantFirst.refusal.reason === 'wysiwyg_block_limit'
          && mutant.firstInlineCalls > 0,
        oversized: first.refusal || null,
        inlineBeforeRefusal: live.firstInlineCalls,
        reuseInlineCalls: live.reuseInlineCalls,
        mutationInlineCalls: mutant.firstInlineCalls,
      };
    } catch (error) {
      return { ok: false, error: String((error && error.stack) || error) };
    }
  })();

  const structure = (() => {
    try {
      if (typeof shippedStructureAnalyse !== 'function' || !releasedStructureLimits) {
        throw new Error('released structure analyser unavailable');
      }
      const base = {
        ...releasedStructureLimits,
        tokens: 1000, nodes: 1000, depth: 100, units: 8,
        declarations: 100, occurrences: 100, bindings: 100, scopes: 100,
        entries: 100, matches: 100, strings: 100000, resultBytes: 100000,
      };
      const probes = [
        { dimension: 'tokens', reason: 'token_budget', limit: 1,
          source: 'const a = 1;' },
        { dimension: 'nodes', reason: 'node_budget', limit: 2,
          source: 'const a = { b: 1 };' },
        { dimension: 'depth', reason: 'depth_budget', limit: 1,
          source: 'const a = { b: 1 };' },
      ].map(row => {
        const limits = { ...base, [row.dimension]: row.limit };
        const result = shippedStructureAnalyse({ mode: 'audit', kind: 'javascript',
          source: row.source, dialect: 'script', limits });
        const named = (result.omissions || []).some(omission => omission.reason === row.reason);
        return { dimension: row.dimension, reason: row.reason,
          pass: result.ok === true && result.status === 'bounded' && result.complete === false
            && result.parse && result.parse.message === row.reason && named
            && result.budget && result.budget.used[row.dimension] === row.limit };
      });
      const reused = shippedStructureAnalyse({ mode: 'audit', kind: 'javascript',
        source: 'const ordinary = 1;', dialect: 'script', limits: base });
      return { ok: probes.every(row => row.pass) && reused.ok === true
        && reused.status === 'ok' && reused.complete === true
        && reused.parse && reused.parse.status === 'ok', probes,
      reuse: { status: reused.status, complete: reused.complete,
        parse: reused.parse && reused.parse.status } };
    } catch (error) {
      return { ok: false, error: String((error && error.stack) || error) };
    }
  })();

  return { ok: compareHighlight && markdown.ok === true && structure.ok === true,
    compareHighlight, markdown, structure };
}

/* Text counts can be satisfied by comments, dead duplicate owners, or an escaped method that
   happens to leave one direct call behind. Inventory the executable syntax instead: each live
   owner is one binding, every retired owner is no binding, and each protected mutator is one
   direct call from its named owner with no escaped method alias. */
function k3OwnerInventory() {
  const liveNames = Object.freeze([
    '_rapierApplySourceSplices', '_rapierCommitSplices', '_rapierRecordSplices',
  ]);
  const retiredNames = Object.freeze([
    '_rapierPushHistory', '_rapierReconcileSourceEols', '_rapierApplyHistoryEntry',
    '_rapierCanonicalFromSourceBuffer', 'splitMarkdownBlocks',
  ]);
  const watchedNames = new Set([...liveNames, ...retiredNames]);
  const bindings = Object.fromEntries([...watchedNames].map(name => [name, 0]));
  const protectedCalls = Object.freeze({
    'rapier.document.source.splice': '_rapierApplySourceSplices',
    'rapier.undo.ledger.push': '_rapierCommitSplices',
  });
  const protectedObjects = new Set(Object.keys(protectedCalls));
  const calls = Object.fromEntries(Object.keys(protectedCalls).map(name => [name, []]));
  const aliases = [];
  const errors = [];

  function staticProperty(node) {
    if (!node) return '';
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    return '';
  }
  function memberPath(node) {
    if (!node) return '';
    if (node.type === 'Identifier') return node.name;
    if (node.type !== 'MemberExpression') return '';
    const object = memberPath(node.object);
    const property = node.computed ? staticProperty(node.property)
      : (node.property && node.property.type === 'Identifier' ? node.property.name : '');
    return object && property ? `${object}.${property}` : '';
  }
  function bind(pattern) {
    if (!pattern || typeof pattern !== 'object') return;
    if (pattern.type === 'Identifier') {
      if (watchedNames.has(pattern.name)) bindings[pattern.name] += 1;
      return;
    }
    if (pattern.type === 'RestElement') return bind(pattern.argument);
    if (pattern.type === 'AssignmentPattern') return bind(pattern.left);
    if (pattern.type === 'ArrayPattern') {
      for (const item of pattern.elements || []) bind(item);
      return;
    }
    if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties || []) {
        bind(property.type === 'RestElement' ? property.argument : property.value);
      }
    }
  }
  function functionName(node, parent) {
    if (node.id && node.id.type === 'Identifier') return node.id.name;
    if (parent && parent.type === 'VariableDeclarator'
        && parent.id && parent.id.type === 'Identifier') return parent.id.name;
    return '<anonymous>';
  }
  function walk(node, parent, owner) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parent, owner);
      return;
    }

    let childOwner = owner;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
        || node.type === 'ArrowFunctionExpression') {
      if (node.id) bind(node.id);
      for (const parameter of node.params || []) bind(parameter);
      childOwner = functionName(node, parent);
    } else if (node.type === 'VariableDeclarator') {
      bind(node.id);
      const source = memberPath(node.init);
      if (protectedObjects.has(source)) aliases.push(`declaration:${source}`);
    } else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      if (node.id) bind(node.id);
    } else if (node.type === 'CatchClause') {
      bind(node.param);
    } else if (/^Import(?:Default|Namespace)?Specifier$/.test(node.type)) {
      bind(node.local);
    } else if (node.type === 'AssignmentExpression') {
      const source = memberPath(node.right);
      if (protectedObjects.has(source)) aliases.push(`assignment:${source}`);
    }

    if (node.type === 'MemberExpression') {
      const name = memberPath(node);
      if (Object.prototype.hasOwnProperty.call(protectedCalls, name)) {
        const direct = Boolean(parent && parent.type === 'CallExpression' && parent.callee === node);
        calls[name].push({ owner, direct });
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      if (value && typeof value === 'object') walk(value, node, childOwner);
    }
  }

  if (!shippedAcorn || typeof shippedAcorn.parse !== 'function') {
    errors.push('vendored parser unavailable');
  } else {
    const executed = executedScripts;
    for (const [index, script] of executed.entries()) {
      try {
        const sourceType = /\btype\s*=\s*["']module["']/.test(script.attrs) ? 'module' : 'script';
        const tree = shippedAcorn.parse(script.body, {
          ecmaVersion: 'latest', sourceType, allowHashBang: true,
        });
        walk(tree, null, '<program>');
      } catch (error) {
        errors.push(`script-${index + 1}:${String((error && error.message) || error)}`);
      }
    }
  }

  const liveExact = liveNames.every(name => bindings[name] === 1);
  const retiredAbsent = retiredNames.every(name => bindings[name] === 0);
  const callsExact = Object.entries(protectedCalls).every(([name, owner]) =>
    calls[name].length === 1 && calls[name][0].direct === true && calls[name][0].owner === owner);
  return {
    ok: errors.length === 0 && liveExact && retiredAbsent && callsExact && aliases.length === 0,
    bindings, calls, aliases, errors,
  };
}

const k3CommitSource = functionSource('_rapierCommitSplices');
const k3HistorySource = functionSource('_rapierHistoryFact');
const k3ProjectionSource = functionSource('_rapierProjectionFact');
const k3RecoverySource = functionSource('_rapierInstallRestoredHistory');
const k3LedgerValidationSource = functionSource('_rapierValidLedgerRecord');
const k3AsyncParseSource = functionSource('splitMarkdownBlocksAsync');
const k3FlatInputSource = sourceSlice('function _handleInput(event)',
  "ta.addEventListener('pointerdown'");
const k3WebContextSource = sourceSlice("operation: 'document.get_context'", "operation: 'document.get_outline'");
const k3WebMcpTest = fs.readFileSync(path.join(root, 'qualification', 'webmcp-test.js'), 'utf8');
const k3WebMcpShim = fs.readFileSync(path.join(root, 'qualification', 'webmcp-shim.js'), 'utf8');
const k3BrowserPath = path.join(root, 'qualification', 'k3-browser-test.js');
const k3BrowserTest = fs.readFileSync(k3BrowserPath, 'utf8');
const k3AuditSource = fs.readFileSync(__filename, 'utf8');
const k3Challenge = fs.readFileSync(path.join(root, 'WEBMCP-CHALLENGE.md'), 'utf8');
function k3NativeContractProbe() {
  try {
    const box = {};
    vm.runInNewContext(`${functionSourceFrom(k3WebMcpTest, 'nativeObservationStatus')}
      this.rows = [
        [{}, 'api_absent'],
        [{ modelContext: true, registerTool: true }, 'partial_api'],
        [{ modelContext: true, registerTool: true, getTools: true, executeTool: true,
          registration: 'InvalidStateError', executionAttempted: true }, 'registration_unavailable'],
        [{ modelContext: true, registerTool: true, getTools: true, executeTool: true,
          registration: 'registered', executionAttempted: false }, 'execution_unavailable'],
        [{ modelContext: true, registerTool: true, getTools: true, executeTool: true,
          registration: 'registered', executionAttempted: true }, 'observed'],
      ].map(([input, expected]) => ({ expected,
        actual: nativeObservationStatus(input) }));
    `, box);
    const rows = Array.from(box.rows || [], row => ({ expected: row.expected, actual: row.actual }));
    return { ok: rows.length === 5 && rows.every(row => row.actual === row.expected), rows };
  } catch (error) {
    return { ok: false, rows: [], error: String((error && error.stack) || error) };
  }
}
const k3KernelIds = [...k3AuditSource.matchAll(/\['(K3-Q[1-5])\b/g)].map(match => match[1]);
const k3BrowserIds = [...k3BrowserTest.matchAll(/async function k3([1-7])\s*\(/g)]
  .map(match => 'K3-' + match[1]);
let k3BrowserModule = null;
let k3BrowserModuleError = '';
try {
  const resolved = require.resolve(k3BrowserPath);
  delete require.cache[resolved];
  k3BrowserModule = require(resolved);
} catch (error) {
  k3BrowserModuleError = String((error && error.stack) || error);
}
const k3BrowserCases = k3BrowserModule && k3BrowserModule.K3_BROWSER_CASES;
const k3RegistryEvaluator = k3BrowserModule && k3BrowserModule.k3RegistryFacts;
const k3Registry = typeof k3RegistryEvaluator === 'function' ? k3RegistryEvaluator() : null;
const k3RegistryMutationsRejected = Boolean(k3Registry && Array.isArray(k3BrowserCases)
  && k3RegistryEvaluator(k3BrowserCases.slice(0, 6)).ok === false
  && k3RegistryEvaluator([...k3BrowserCases.slice(0, 6), {
    ...k3BrowserCases[6], id: 'K3-6',
  }]).ok === false
  && k3RegistryEvaluator(k3BrowserCases.map((row, index) => index === 6 ? {
    ...row, route: 'internal-shortcut',
  } : row)).ok === false);
const k3Owners = k3OwnerInventory();
const k3Recovery = k3RecoveryProbe();
const k3Projection = k3ProjectionProbe();
const k3NativeContract = k3NativeContractProbe();
const K3_ACCEPTANCE = [
  ['K3-Q1 one source, one splice entrance and one append owner',
    k3Owners.ok
      && /rapier\.document\.source\.capture\s*\(\s*\)/.test(functionSource('_rapierWithCompoundTransaction'))
      && /const burstOwnsCommit\s*=\s*_burstStartSel\s*!=\s*null/.test(k3FlatInputSource)
      && /deferLedger:\s*burstOwnsCommit/.test(k3FlatInputSource)
      && /if\s*\(burstOwnsCommit\)\s*_burstSplices\.push/.test(k3FlatInputSource)
      && !/\bflatText\b|undo\.past|undo\.future|transactions\.recent/.test(html),
    JSON.stringify(k3Owners)],
  ['K3-Q2 mixed-EOL source roots splice and restore exactly',
    k3SourceStoreProbe()
      && matchesAll(k3CommitSource, [
        /RapierTextCodec\.isDocumentFragment\s*\(\s*row\.inserted\s*\)/,
        /const checkpoint = rapier\.document\.source\.capture\s*\(\s*\)/,
        /checkpoint\.restore\s*\(\s*\)/,
        /rapier\.undo\.ledger\.push\s*\(\s*record\s*\)/,
      ])],
  ['K3-Q3 recovery admits only the exact replayed root chain',
    k3Recovery.ok
      && matchesAll(k3RecoverySource, [
        /_rapierSpliceHash\s*\(\s*source\s*\) !== earliestHash/,
        /_rapierSourceRootAfter\s*\(\s*provenRoot\s*,\s*row\s*\)/,
        /provenRoot !== rapier\.document\.source\.rootId/,
      ]),
    JSON.stringify(k3Recovery)],
  ['K3-Q4 every heavy projection refuses before unsafe work',
    k3Projection.ok
      && !/\bsplitMarkdownBlocks\s*\(/.test(k3AsyncParseSource)
      && /throw failure/.test(k3AsyncParseSource)
      && /blocks:\s*4096/.test(html) && /_RAPIER_BLOCK_RENDER_MAX_CHARS\s*=\s*8192/.test(html)
      && /nodes:\s*160000/.test(html)
      && includesInOrder(functionSource('_rapierCompareStart'), [
        '_rapierCompareAdmission', '_rapierCompareMakeWorker',
      ])
      && matchesAll(k3ProjectionSource, [/wysiwyg:\s*['"]unavailable['"]/, /observed:/, /limit:/]),
    JSON.stringify(k3Projection)],
  ['K3-Q5 history, validation and native reflection stay truthful',
    matchesAll(k3HistorySource, [
      /session:/, /durable:/, /pending_checkpoint/, /not_checkpointed/,
      /retainedBytes/, /trimmedBytes/,
    ])
      && getContext.result.required.includes('history')
      && getContext.result.properties.projection
      && /request:\s*\(\)\s*=>\s*\(\{\}\)/.test(k3WebContextSource)
      && /typeof tool\.inputSchema === ['"]string['"][\s\S]*JSON\.parse\s*\(\s*tool\.inputSchema\s*\)/.test(k3WebMcpTest)
      && /--native-contract/.test(k3WebMcpTest)
      && k3NativeContract.ok
      && /nativeObservationStatus\s*\(\s*observation\s*\)/.test(k3WebMcpTest)
      && /status !== ['"]observed['"]\) process\.exitCode = 2/.test(k3WebMcpTest)
      && /async function navigationResponseFact[\s\S]*response\.body\s*\(\s*\)[\s\S]*sha256 !== SUBJECT_SHA256/.test(k3WebMcpTest)
      && /executed native navigation response/.test(k3WebMcpTest)
      && /executed harness navigation response/.test(k3WebMcpTest)
      && /executeTool\(tool, inputJson, options\)/.test(k3WebMcpShim)
      && /JSON\.parse\(inputJson\)/.test(k3WebMcpShim)
      && /entry\.execute\(inputObject\)/.test(k3WebMcpShim)
      && /fn\(new Event\('toolchange'\)\)/.test(k3WebMcpShim)
      && /modelContext\.getTools\(\)[\s\S]*modelContext\.executeTool\(tool, JSON\.stringify/.test(k3WebMcpShim)
      && /registrationAbortRace/.test(k3WebMcpTest)
      && /executionAbort/.test(k3WebMcpTest)
      && /argumentFact\s*=/.test(k3WebMcpTest)
      && /\{ signal: callController\.signal \}/.test(k3WebMcpTest)
      && !/Chrome\s*15|Pre-153|before Chrome|exactly as Blink|The real API/.test(k3WebMcpShim)
      && !/timeout, abort/.test(k3Challenge)
      && !/aborting your signal ends that wait/i.test(html),
    JSON.stringify(k3NativeContract)],
  ['K3-Q6 the seven public-surface predicates are one positive-exit registry',
    k3Registry && k3Registry.ok === true && k3Registry.count === 7
      && k3RegistryMutationsRejected
      && /status: 'not_run'/.test(k3BrowserTest)
      && /process\.exitCode = 2/.test(k3BrowserTest)
      && /process\.exitCode = failed\.length \? 1 : 0/.test(k3BrowserTest)
      && /if \(require\.main === module\)/.test(k3BrowserTest)
      && k3KernelIds.length === 5 && new Set(k3KernelIds).size === 5
      && k3BrowserIds.length === 7 && new Set(k3BrowserIds).size === 7
      && k3KernelIds.length + k3BrowserIds.length === 12
      && !/expected[_ -]?failure|red[_ -]?proof/i.test(k3BrowserTest),
    JSON.stringify({ error: k3BrowserModuleError, registry: k3Registry,
      mutationsRejected: k3RegistryMutationsRejected,
      kernelIds: k3KernelIds, functionIds: k3BrowserIds })],
];
for (const [name, passed, detail] of K3_ACCEPTANCE) check(name, passed === true, detail);

function branchLaw(name) {
  const branch = getContext && getContext.result && getContext.result.properties
    && getContext.result.properties[name];
  const object = branch && branch.anyOf && branch.anyOf.find((entry) => entry.type === 'object');
  return object && object.properties && object.properties.law;
}
const expectedLaws = 'edit,append,keep';
check('selection law is in the SpeedRacer treaty',
  Boolean(branchLaw('selection') && branchLaw('selection').enum.join(',') === expectedLaws));
check('focus law is in the SpeedRacer treaty',
  Boolean(branchLaw('focus') && branchLaw('focus').enum.join(',') === expectedLaws));

/* Reviewed law: one suspended invocation, one exact Compare, no reusable grant. */
const applyEditsSource = functionSource('_rapierApplyEditsCore');
const applyEditsWrapperSource = functionSource('_rapierApplyEdits');
const reviewSource = sourceSlice(
  'const _RAPIER_WILL_REVIEW_MS',
  'function _rapierResolveOutlineReference(',
);
check('reviewed law has one review owner and no grant machinery',
  /_rapierWillReviewSlot\s*=\s*Object\.seal\s*\(\s*\{[^}]*pending\s*:\s*null[^}]*settling\s*:\s*null/.test(reviewSource)
    && !html.includes('_rapierWillGrantSlot')
    && !html.includes('_rapierWillGrantIdentity')
    && !html.includes('_rapierWillCanCountersign'));
/* Reviewability is now asked before the count so the refusal can say which of the two closed
   the door, so the guard is pinned by its disjunction rather than by the order of its terms. */
check('reviewed law is limited to one held edit',
  /_rapierWillCanReview\s*\(\s*governed\s*,\s*resolved\s*\)/.test(applyEditsSource)
    && /edits\.length\s*!==\s*1\s*\|\|\s*!reviewable/.test(applyEditsSource)
    && /_rapierWillReviewSlot\.settling[\s\S]*rapier\.compare\.active[\s\S]*rapier\.compare\.running/.test(
      functionSource('_rapierWillReviewOpen')));
check('review decisions require trusted browser activation',
  /_RAPIER_WILL_TRUSTED_DECISION\s*=\s*Symbol\s*\(/.test(reviewSource)
    && /event\.isTrusted\s*===\s*true/.test(functionSource('_rapierWillReviewActions'))
    && /proof\s*!==\s*_RAPIER_WILL_TRUSTED_DECISION/.test(reviewSource));

const compareRestoreSource = functionSource('_rapierCompareRestoreView');
const compareCloseSource = functionSource('rapierCompareClose');
const reviewSettleSource = functionSource('_rapierWillReviewSettle');
const awaitRestoreSource = functionSource('_rapierAwaitWillRestore');
check('Compare close owns and transfers the real reviewed restore promise',
  matchesAll(compareRestoreSource, [
    /new Promise\s*\(/,
    /setTimeout\s*\(/,
    /resolve\s*\(\s*restored\s*\)/,
    /restore\.cancel\s*=/,
    /_rapierCancelViewRestore\s*\(/,
  ])
    && includesInOrder(compareCloseSource, [
      '_rapierCompareRestoreView',
      '_rapierWillReviewSettle',
      'return restored',
    ])
    && matchesAll(reviewSettleSource, [
      /restoreOverride/,
      /pending\.restore\s*=\s*restoreOverride/,
      /!restoreOverride[\s\S]*rapierCompareClose/,
    ]));
check('reviewed restore is bounded and cancellation reaches its owner',
  matchesAll(awaitRestoreSource, [
    /_RAPIER_WILL_RESTORE_MS/,
    /signal\.addEventListener\s*\(\s*['"]abort['"]/,
    /pending\.restore\.cancel\s*\(/,
    /Promise\.resolve\s*\(\s*pending\.restore\s*\)/,
  ]));
/* The lapsed-restore branch is pinned by its disclosure, not only by its existence. A trusted
   allow that could not be proven restored refuses like every other unproven continuation, but
   it must not refuse in KEEP HELD's words: `document_law` there would report a human refusal
   that never happened. */
check('review continues the same call only after restored state is re-proved',
  includesInOrder(applyEditsSource, [
    '_rapierWillReviewOpen',
    '_rapierAwaitWillRestore',
    'if (!restored)',
    "reason: 'review_lapsed'",
    '_rapierLiveContexts.get',
    '_rapierResolveContext',
    '_rapierDocumentWill',
    '_rapierWillReviewStillCurrent',
  ])
    && matchesAll(applyEditsWrapperSource, [
      /try\s*\{/,
      /finally\s*\{/,
      /_rapierWillReviewRelease/,
      /_rapierWebMcpInvocation/,
    ]));

/* Proof-carrying yield: the schema and both delivery seams tell the same story. */
const applyEdits = operation('document.apply_edits');
const applyResultProperties = applyEdits && applyEdits.result && applyEdits.result.properties;
const continuationSchema = objectBranch(applyResultProperties && applyResultProperties.continuation);
const continuationProperties = continuationSchema && continuationSchema.properties;
check('proof yield is an explicit mutation outcome',
  Boolean(applyResultProperties && applyResultProperties.outcome
    && applyResultProperties.outcome.enum.includes('yielded')));
check('proof yield schema carries one exact bounded splice',
  Boolean(continuationSchema && continuationSchema.additionalProperties === false
    && ['at', 'removed', 'inserted', 'context_handle', 'law']
      .every((name) => continuationSchema.required.includes(name))
    && continuationProperties.removed.maxLength === 768
    && continuationProperties.inserted.maxLength === 768
    && continuationProperties.context_handle.maxLength === 128
    && continuationProperties.law.enum.join(',') === expectedLaws));
const proofYieldSource = functionSource('_rapierProofYield');
check('proof yield requires one delivered predecessor and proven human history',
  matchesAll(proofYieldSource, [
    /editCount\s*!==\s*1/,
    /record\.delivered\s*!==\s*true/,
    /record\.used/,
    /_rapierYieldHumanHistory\s*\(/,
  ]));
check('proof yield verifies the bounded splice reconstructs current bytes',
  /splice\.removed\.length\s*\+\s*splice\.inserted\.length\s*>\s*_RAPIER_YIELD_DELTA_LIMIT/.test(
    proofYieldSource)
    && includesInOrder(proofYieldSource, [
      '_rapierPrefixSuffixDiff',
      'inspected.slice(0, splice.pos)',
      'splice.inserted',
      'inspected.slice(splice.pos + splice.removed.length)',
      '!== current',
    ]));
const yieldDeliverySource = functionSource('_rapierYieldDeliver');
const webMcpDeliverySource = functionSource('_rapierWebMcpDeliver');
check('yield successor replaces its predecessor only at complete delivery',
  includesInOrder(yieldDeliverySource, [
    '_rapierLiveContexts.delete(pending.predecessor.id);',
    'pending.successor.delivered = true;',
    '_rapierLiveContexts.set(pending.successor.id, pending.successor);',
  ])
    && webMcpDeliverySource.includes('wire > _RAPIER_WEBMCP_RESULT_BUDGET')
    && webMcpDeliverySource.includes('yieldReceipt && !_rapierYieldDeliver(yieldReceipt)'));

const captureAnchorSource = functionSource('_rapierCaptureAnchor');
const contextDeliveredSource = functionSource('_rapierContextDelivered');
const canonicalDeliverySource = functionSource('_rapierDeliverCanonicalHandles');
const webMcpReadSource = functionSource('_rapierWebMcpReadResult');
check('cross-block pages can prove delivery without retaining authority text',
  matchesAll(captureAnchorSource, [
    /_rapierCrossBlockSelectionEvidence\s*\(/,
    /selected\s*:\s*null/,
    /selectedIntegrity\s*:\s*evidence\.integrity/,
  ])
    && /record\.anchor\.selected\s*==\s*null[\s\S]*record\.deliveryText\s*=\s*text/.test(
      functionSource('_rapierReadRegionPage'))
    && matchesAll(contextDeliveredSource, [
      /record\.anchor\?\.selected/,
      /record\.deliveryText/,
      /record\.delivered\s*=\s*true/,
      /delete\s+record\.deliveryText/,
    ])
    && canonicalDeliverySource.includes('_rapierContextDelivered')
    && webMcpReadSource.includes('_rapierContextDelivered'));
check('proof yield remains narrower than cross-block delivery',
  /record\.target\.startBlockId\s*!==\s*record\.target\.endBlockId/.test(proofYieldSource)
    && /typeof\s+record\.anchor\?\.selected\s*!==\s*['"]string['"]/.test(proofYieldSource)
    && !proofYieldSource.includes('deliveryText'));

/* Bounded reads: every page is both a disclosure and exactly matching authority. */
const readContext = operation('document.read_context');
const readResultProperties = readContext && readContext.result && readContext.result.properties;
const readTarget = objectBranch(readResultProperties && readResultProperties.target);
check('read_context is schema-bounded to 4096 disclosed characters',
  Boolean(readResultProperties
    && readResultProperties.text.maxLength === 4096
    && readResultProperties.disclosedChars.maximum === 4096
    && readTarget.properties.selectedLength.maximum === 4096
    && readTarget.properties.selectedIntegrity.properties.chars.maximum === 4096));
const readPageSource = functionSource('_rapierReadRegionPage');
check('bounded read mints authority only for the exact delivered page',
  html.includes('const _RAPIER_READ_CONTEXT_CHAR_LIMIT = 4096;')
    && includesInOrder(readPageSource, [
      '_rapierReadPageTarget(region, start, end)',
      '_rapierMintContextHandleFromTarget(target)',
      'const expected = region.text.slice(start, end);',
      '!_rapierIntegrityMatches(record.anchor.selectedIntegrity, text)',
    ])
    && readPageSource.includes('end < region.text.length ? _rapierMintReadCursor(region, end) : null'));

/* Continuations name server-held state, never caller-controlled coordinates. */
const getOutline = operation('document.get_outline');
const outlineCursorSource = functionSource('_rapierOutlineCursor');
const outlineCursorParseSource = functionSource('_rapierOutlineCursorParse');
const readCursorSource = functionSource('_rapierMintReadCursor');
const readCursorParseSource = functionSource('_rapierReadCursorStart');
/* One capture of the document-identity triple; every minted name spreads it. */
const documentIdentitySource = functionSource('_rapierDocumentIdentity');
const mintNameSource = functionSource('_rapierMintName');
const pruneNamesSource = functionSource('_rapierPruneNames');
/* The wire grammar of every name an agent can hold, pinned where the mint states it once. */
const nameGrammarsDeclared = [
  ["context: { rows: _rapierLiveContexts, prefix: 'rctx_', width: 32, limit: 64 }"],
  ["outline: { rows: _rapierOutlineTickets, prefix: 'rref_', width: 16, limit: 4 }"],
  ["ocursor: { rows: _rapierOutlineCursors, prefix: 'ocur_', width: 32, limit: 64, parent: 'outline' }"],
  ["rcursor: { rows: _rapierReadCursors, prefix: 'rwalk_', width: 32, limit: 64 }"],
  ["focus: { rows: _rapierFocusTickets, prefix: 'rfoc_', width: 16, limit: 8 }"],
].every(([row]) => nameTableSource.includes(row))
  && /new RegExp\('\^' \+ spec\.prefix \+ '\[0-9a-f\]\{' \+ spec\.width \+ '\}\$'\)/
    .test(nameTableSource);
/* ONE prune, executed against the shipped table for EVERY kind. Four hand-written copies of
   this loop each had to be proved separately and the fix one of them argued for reached only
   that one; a single loop is proved once and cannot diverge from itself. Each pool must survive
   a read at exactly its ceiling, leave a slot when the caller reserves one, and return to the
   ceiling after an insert. */
const reservedPools = /reserve\s*=\s*0/.test(pruneNamesSource)
  && pruneNamesSource.includes('spec.limit - reserve')
  && mintNameSource.includes('_rapierPruneNames(kind, 1)');
const reservedPoolsExecuted = (() => {
  try {
    /* The loop reads the product's transient clock, so the fixture hands it a real one and
       stamps its rows from the same source: a fixture that dated rows by the wall clock would
       be testing a mixture no shipped path can produce. */
    const box = { performance };
    vm.createContext(box);
    /* A table declared with `const` lives in the script's lexical scope, never on the context
       object, so the run's own value is how the fixture reaches the shipped rows. */
    const names = vm.runInContext(nameTableSource + functionSource('_rapierNow')
      + functionSource('_rapierRetireName') + functionSource('_rapierNameLapsed')
      + functionSource('_rapierPruneNames') + '\n_RAPIER_NAMES;', box);
    const kinds = Object.keys(names);
    if (kinds.length !== 5) return false;
    return kinds.every((kind) => {
      const spec = names[kind];
      const limit = spec.limit;
      if (!Number.isSafeInteger(limit) || limit < 1) return false;
      for (const other of kinds) names[other].rows.clear();
      if (spec.parent) names[spec.parent].rows.set('live', { createdAt: performance.now() });
      const row = () => ({ createdAt: performance.now(), parent: 'live' });
      for (let index = 0; index < limit; index++) spec.rows.set('row' + index, row());
      box._rapierPruneNames(kind);
      const exactSurvivesRead = spec.rows.size === limit;
      box._rapierPruneNames(kind, 1);
      const reserved = spec.rows.size === limit - 1;
      spec.rows.set('mint', row());
      spec.rows.set('overflow', row());
      box._rapierPruneNames(kind);
      return exactSurvivesRead && reserved && spec.rows.size === limit;
    });
  } catch (_) { return false; }
})();
check('opaque continuation names and every pre-insert pool stay inside their exact limits',
  Boolean(getOutline && getOutline.input.properties.cursor.maxLength === 128
    && readContext && readContext.input.properties.cursor.maxLength === 128)
    && reservedPools && reservedPoolsExecuted && nameGrammarsDeclared
    && matchesAll(outlineCursorSource, [
      /_rapierMintName\s*\(\s*['"]ocursor['"]/,
      /parent\s*:\s*ticketId/,
      /parentIndex/,
      /offset/,
    ])
    && matchesAll(outlineCursorParseSource, [
      /_rapierNameIs\s*\(\s*['"]ocursor['"]/,
      /_rapierOutlineCursors\.get\s*\(/,
    ])
    && /_rapierMintName\s*\(\s*['"]rcursor['"]/.test(readCursorSource)
    && /_rapierNameIs\s*\(\s*['"]rcursor['"]/.test(readCursorParseSource));
check('read cursor is bound to document, scope, representation, and anchored seam',
  matchesAll(readCursorSource, [
    /ref\s*:\s*region\.ref/,
    /realm\s*:\s*region\.realm/,
    /representation\s*:\s*region\.representation/,
    /kind\s*:\s*region\.kind/,
    /scopeIntegrity\s*:\s*_rapierTextIntegrity\s*\(\s*region\.text\s*\)/,
    /\.\.\._rapierDocumentIdentity\s*\(\s*\)/,
    /before\s*:/,
    /after\s*:/,
  ])
    && matchesAll(documentIdentitySource, [
      /documentEpoch\s*:\s*Number\s*\(\s*rapier\.identity\.epoch/,
      /documentAuthority\s*:\s*String\s*\(\s*rapier\.identity\.authority/,
      /filename\s*:\s*String\s*\(\s*rapier\.document\.filename/,
    ])
    && matchesAll(readCursorParseSource, [
      /cursor_mismatch/,
      /cursor_scope_changed/,
      /cursor_boundary_changed/,
      /_rapierResolveAnchoredRange\s*\(/,
    ]));

/* Compass: deliberate viewport loans have a small, evidence-bound route home. */
const travelSource = sourceSlice(
  'const _RAPIER_TRAVEL_LIMIT = 24;',
  '/* A deliberate user gesture after a transition owns the viewport. */',
);
const travelSliceSource = functionSource('_rapierTravelSourceSlice');
const travelViewportSource = functionSource('_rapierTravelWysiwygViewportAnchor');
const travelSelectionSource = functionSource('_rapierTravelSelectionRecord');
const travelCaptureSource = functionSource('_rapierCaptureTravelPosition');
const travelResolveSource = functionSource('_rapierTravelResolveTarget');
check('Compass captures bounded source and selection evidence',
  /_RAPIER_TRAVEL_LIMIT\s*=\s*24\b/.test(travelSource)
    && /_RAPIER_TRAVEL_SELECTION_LIMIT\s*=\s*512\b/.test(travelSource)
    && matchesAll(travelSliceSource, [
      /rapier\.document\.source\.length/,
      /rapier\.document\.source\.readSlice\s*\(\s*from\s*,\s*to\s*\)/,
    ])
    && !travelSliceSource.includes('_rapierFlatValue')
    && matchesAll(travelSelectionSource, [
      /end\s*-\s*start\s*>\s*_RAPIER_TRAVEL_SELECTION_LIMIT/,
      /_rapierTravelSourceSlice\s*\(/,
      /_rapierCaptureAnchoredTargetRecord\s*\(/,
    ])
    && includesInOrder(travelViewportSource, [
      "String(block.raw || '').length <= _RAPIER_TRAVEL_BLOCK_RESOLVE_LIMIT",
      "surface.textContent",
      "_rapierRenderedCharOffsetFromPoint",
    ])
    && includesInOrder(travelSelectionSource, [
      '_rapierBoundBlock(preflightStart)',
      "String(preflightBlock.raw || '').length > _RAPIER_TRAVEL_BLOCK_RESOLVE_LIMIT",
      '_rapierCurrentSelectionTarget()',
      '_rapierBlockLiveText(target.startBlockId)',
    ])
    && matchesAll(travelCaptureSource, [
      /_rapierCaptureAnchoredTargetRecord\s*\(/,
      /selected\s*:\s*['"]["']/,
      /before\s*:/,
      /after\s*:/,
    ]));
check('Compass source and rich-block rebases are bounded local proofs',
  /_RAPIER_TRAVEL_REBASE_RADIUS\s*=\s*32\s*\*\s*1024/.test(travelSource)
    && /_RAPIER_TRAVEL_BLOCK_RESOLVE_LIMIT\s*=/.test(travelSource)
    && matchesAll(travelResolveSource, [
      /end\s*-\s*start\s*>\s*_RAPIER_TRAVEL_SELECTION_LIMIT/,
      /windowStart\s*=\s*Math\.max\s*\(\s*0\s*,\s*start\s*-\s*_RAPIER_TRAVEL_REBASE_RADIUS/,
      /windowEnd\s*=\s*Math\.min\s*\([^,]+,\s*end\s*\+\s*_RAPIER_TRAVEL_REBASE_RADIUS/,
      /_rapierTravelSourceSlice\s*\(/,
      /_rapierResolveAnchoredRange\s*\(/,
      /target\.startBlockId\s*!==\s*target\.endBlockId/,
      /String\(block\.raw\s*\|\|\s*['"]['"]\)\.length\s*>\s*_RAPIER_TRAVEL_BLOCK_RESOLVE_LIMIT/,
      /_rapierBlockLiveText\s*\(\s*block\.id\s*\)/,
      /textValue\.length\s*>\s*_RAPIER_TRAVEL_BLOCK_RESOLVE_LIMIT/,
    ])
    && !travelResolveSource.includes('_rapierFlatValue'));
check('Compass stack is bounded and stores anchored viewport records',
  /stack\.length\s*>\s*_RAPIER_TRAVEL_LIMIT/.test(functionSource('_rapierTravelPush'))
    && /viewport\s*,/.test(travelCaptureSource)
    && /documentAuthority\s*:\s*authority/.test(travelCaptureSource));

const revealSource = functionSource('_rapierRevealContext');
const settleRevealSource = functionSource('_rapierSettleRevealScroll');
check('reveal owns one surface through cancellable scroll settlement',
  matchesAll(revealSource, [
    /revealMode\s*=\s*String\s*\(\s*rapier\.view\.mode/,
    /revealRealm\s*=\s*_rapierOutlineRealm\s*\(/,
    /ownsSurface\s*=/,
    /restoreToken\s*=\s*rapier\.view\.restoreToken/,
    /_rapierSettleRevealScroll\s*\([^)]*ctx\.signal[^)]*restoreToken/,
  ])
    && matchesAll(settleRevealSource, [
      /signal\.aborted\s*!==\s*true/,
      /restoreToken\s*===\s*rapier\.view\.restoreToken/,
      /_rapierAwaitScrollRest\s*\([^)]*signal/,
      /!owns\s*\(\s*\)/,
    ])
    && matchesAll(functionSource('_rapierCompareStart'), [
      /_rapierCancelViewRestore\s*\(/,
      /_rapierRetireRevealMarker\s*\(/,
    ]));
check('reveal commits Compass only after post-settle target proof',
  includesInOrder(revealSource, [
    '_rapierTravelBegin',
    '_rapierScrollResolvedIntoView',
    '_rapierSettleRevealScroll',
    '_rapierMutationStampIsCurrent',
    '_rapierResolveContext',
    '_rapierResolvedRevealText',
    '_rapierRevealMarker',
    '_rapierTravelCommit',
  ])
    && /current\.record\s*!==\s*resolved\.record/.test(revealSource)
    && /_rapierWillReviewIntervalKey\s*\(\s*current\s*\)\s*!==\s*interval/.test(revealSource));
check('Compass is reachable from document commands, Alt-Arrow, and native Back',
  html.includes("{ id: 'navigate.back', label: 'Back in document'")
    && html.includes("_rapierTravelGo(key === 'arrowleft' ? -1 : 1)")
    && /_rapierTravelGo\s*\(\s*-1\s*\)/.test(functionSource('rapierHandleBack')));

const readmePath = path.join(root, 'README.md');
const willPath = path.join(root, 'WILL-1.md');
const vectorsPath = path.join(root, 'VECTORS.md');
const demoPath = path.join(root, 'demo.md');
const publicSubmissionPath = path.join(root, 'PUBLIC-SUBMISSION.md');
const readme = fs.readFileSync(readmePath, 'utf8');
const will = fs.readFileSync(willPath, 'utf8');
const vectors = fs.readFileSync(vectorsPath, 'utf8');
const demo = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
const publicSubmission = fs.existsSync(publicSubmissionPath)
  ? fs.readFileSync(publicSubmissionPath, 'utf8') : '';

/* Audit edit 1 of 2 — receipt inputs. The release's own machine-readable record of what it
   claims, and the third prose document that states the same numbers. Read here beside the
   others so the coherence check below has all four readings of one release in hand. */
const challengePath = path.join(root, 'WEBMCP-CHALLENGE.md');
const challenge = fs.existsSync(challengePath) ? fs.readFileSync(challengePath, 'utf8') : '';
const receiptPath = path.join(root, 'qualification', 'RECEIPT.json');
let receipt = null;
try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (_) { receipt = null; }
const shippedSha = crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex');

/* ── ONE ORIGIN TEACHES THE WHOLE INSTRUMENT ────────────────────────────────────────────────
   The public surface is executable deployment state, not a list of files that happen to ride
   in an archive. Derive what Wrangler stages from its build command, derive what each public
   door serves from `_redirects`, then make the machine map and guide answer to those facts. A
   guide that exists but is never staged, or an `/agents` link that relies on clean-URL behavior
   disabled by `html_handling: "none"`, is not a public surface. */
const llmsPath = path.join(root, 'llms.txt');
const agentsPath = path.join(root, 'agents.md');
const wranglerPath = path.join(root, 'wrangler.jsonc');
const redirectsPath = path.join(root, '_redirects');
const llms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '';
const agentsGuide = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
const wranglerSource = fs.existsSync(wranglerPath) ? fs.readFileSync(wranglerPath, 'utf8') : '';
const redirectsSource = fs.existsSync(redirectsPath) ? fs.readFileSync(redirectsPath, 'utf8') : '';

function jsonStringField(source, field) {
  const escaped = String(field).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp('"' + escaped + '"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")')
    .exec(String(source));
  if (!found) return '';
  try { return JSON.parse(found[1]); } catch (_) { return ''; }
}

function shellWords(source) {
  return (String(source).match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) || []).map(word => {
    if (word[0] === '"') {
      try { return JSON.parse(word); } catch (_) { return ''; }
    }
    if (word[0] === "'") return word.slice(1, -1);
    return word;
  }).filter(Boolean);
}

function stagedAssetPaths(command) {
  const staged = new Set();
  const copies = /\bcp\s+([^;]+?)\s+"\$dest((?:\/[^"\s]*)?)\/"/g;
  let copy;
  while ((copy = copies.exec(String(command)))) {
    const destination = String(copy[2] || '').replace(/^\/+|\/+$/g, '');
    for (const source of shellWords(copy[1])) {
      staged.add(path.posix.join(destination, path.posix.basename(source)));
    }
  }
  return staged;
}

function redirectRules(source) {
  return String(source).split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const parts = line.split(/\s+/);
      return { from: parts[0] || '', to: parts[1] || '', status: Number(parts[2]) };
    });
}

const canonicalOrigin = 'https://rapier.website';
const deployCommand = jsonStringField(wranglerSource, 'command');
const stagedAssets = stagedAssetPaths(deployCommand);
const redirects = redirectRules(redirectsSource);
const routeAsset = route => {
  const url = new URL(route, canonicalOrigin);
  const proxy = redirects.find(rule => rule.from === url.pathname && rule.status === 200);
  const target = new URL(proxy ? proxy.to : url.pathname, canonicalOrigin);
  return target.pathname.replace(/^\/+/, '');
};
/* One table owns every public route/file relation. Both the extensionless guide door and its
   direct source are deliberate: `/agents` is the advertised route, while `/agents.md` remains
   a curlable repository asset. */
const ORIGIN_SURFACE = Object.freeze([
  { role: 'artifact door', route: '/', asset: 'rapier.html', mapped: true, proxyOrder: 0 },
  { role: 'artifact source', route: '/rapier.html', asset: 'rapier.html', mapped: true },
  { role: 'machine map', route: '/llms.txt', asset: 'llms.txt', mapped: false },
  { role: 'Will specification', route: '/WILL-1.md', asset: 'WILL-1.md', mapped: true },
  { role: 'agent guide', route: '/agents', asset: 'agents.md', mapped: true, proxyOrder: 1 },
  { role: 'agent guide source', route: '/agents.md', asset: 'agents.md', mapped: false },
  /* Browsers ask for /favicon.ico on their own; the origin answers with the app icon instead
     of a 404, so every page on the host (a 404 included) shows the same mark as the tab. */
  { role: 'tab icon', route: '/favicon.ico', asset: 'icon-192.png', mapped: false, proxyOrder: 2 },
  { role: 'integration record', route: '/WEBMCP-CHALLENGE.md', asset: 'WEBMCP-CHALLENGE.md', mapped: true },
  { role: 'release receipt', route: '/qualification/RECEIPT.json',
    asset: 'qualification/RECEIPT.json', mapped: true },
  /* The judge's door is the phone demo: the demo document inside Rapier's real phone layout. */
  { role: 'working demo', route: '/?demo=1&preview=phone', asset: 'rapier.html', mapped: true },
]);
const surfaceResolution = ORIGIN_SURFACE.map(entry => ({
  ...entry,
  resolved: routeAsset(entry.route),
  staged: stagedAssets.has(entry.asset),
  present: fs.existsSync(path.join(root, entry.asset)),
}));
const expectedRedirects = ORIGIN_SURFACE.filter(entry => Number.isInteger(entry.proxyOrder))
  .sort((left, right) => left.proxyOrder - right.proxyOrder)
  .map(entry => ({ from: new URL(entry.route, canonicalOrigin).pathname,
    to: '/' + entry.asset, status: 200 }));
const llmsLinks = [...llms.matchAll(/\]\(([^)\s]+)\)/g)].map(found => {
  try { return new URL(found[1], canonicalOrigin); } catch (_) { return null; }
}).filter(Boolean);
const sameOriginLinks = llmsLinks.filter(url => url.origin === canonicalOrigin);
const mappedDeployments = sameOriginLinks.map(url => {
  const route = url.pathname + url.search;
  const asset = routeAsset(route);
  return { route, asset, staged: stagedAssets.has(asset), present: fs.existsSync(path.join(root, asset)) };
});
check('Wrangler stages every unified-surface byte and each public door resolves explicitly',
  jsonStringField(wranglerSource, 'html_handling') === 'none'
    && stagedAssets.has('_redirects') && stagedAssets.has('llms.txt')
    && JSON.stringify(redirects) === JSON.stringify(expectedRedirects)
    && surfaceResolution.every(entry => entry.present && entry.staged && entry.resolved === entry.asset)
    && mappedDeployments.length > 0
    && mappedDeployments.every(entry => entry.staged && entry.present),
  JSON.stringify({ htmlHandling: jsonStringField(wranglerSource, 'html_handling'),
    staged: [...stagedAssets].sort(), redirects, expectedRedirects,
    routes: surfaceResolution, mappedDeployments }));

const mappedRoutes = new Set(llmsLinks.filter(url => url.origin === canonicalOrigin)
  .map(url => url.pathname + url.search));
const willMapParagraph = llms.split(/\n\s*\n/).find(paragraph => paragraph.includes('/WILL-1.md')) || '';
check('llms.txt maps every advertised door on one origin and explains Will at the seam',
  ORIGIN_SURFACE.filter(entry => entry.mapped).every(entry => mappedRoutes.has(entry.route))
    && /\bWill\b/.test(willMapParagraph)
    && /\b(?:durable\s+intent|law|edit|append|keep)\b/i.test(willMapParagraph)
    && !/[▢□]/.test(llms) && !/not yet (?:live|published)/i.test(llms),
  JSON.stringify({ mapped: [...mappedRoutes].sort(), willParagraph: willMapParagraph }));

const webMcpRegistryStart = html.indexOf('const RAPIER_WEBMCP_TOOLS = Object.freeze([');
const webMcpRegistryEnd = webMcpRegistryStart < 0 ? -1 : html.indexOf('\n]);', webMcpRegistryStart);
const webMcpRegistrySource = webMcpRegistryStart >= 0 && webMcpRegistryEnd > webMcpRegistryStart
  ? html.slice(webMcpRegistryStart, webMcpRegistryEnd) : '';
const registeredToolNames = new Set([...webMcpRegistrySource.matchAll(/\n\s*operation:\s*'([^']+)'/g)]
  .map(found => found[1]));
const guideToolNames = new Set([...agentsGuide.matchAll(/`((?:document|compare)\.[a-z_]+)`/g)]
  .map(found => found[1]));
const exactGuideVocabulary = registeredToolNames.size > 0
  && registeredToolNames.size === guideToolNames.size
  && [...registeredToolNames].every(name => guideToolNames.has(name));
const guideNamesTheCount = new RegExp('\\b' + registeredToolNames.size + '\\s+names\\b').test(agentsGuide);
const modelContextResolver = /function _rapierModelContext\(\) \{([\s\S]{0,1800}?)\n\}/.exec(html);
const modelContextResolverBody = modelContextResolver ? modelContextResolver[1] : '';
check('the agent guide derives the live tool vocabulary and teaches Will as untrusted law',
  exactGuideVocabulary && guideNamesTheCount
    && agentsGuide.includes('/WILL-1.md')
    && agentsGuide.includes('will/1') && agentsGuide.includes('<!-- /will -->')
    && expectedLaws.split(',').every(law => agentsGuide.includes('`' + law + '`'))
    && /\buntrusted\b/i.test(agentsGuide) && /never treat it as[^.]*instruction/i.test(agentsGuide)
    && modelContextResolverBody.indexOf('document.modelContext') >= 0
    && modelContextResolverBody.indexOf('navigator.modelContext') >
      modelContextResolverBody.indexOf('document.modelContext')
    && !/getTools|executeTool|addEventListener|EventTarget/.test(modelContextResolverBody)
    && /await entry\.modelContext\.registerTool/.test(html),
  JSON.stringify({ registered: [...registeredToolNames], documented: [...guideToolNames],
    namedCount: guideNamesTheCount }));
/* ── ONE WRITER PER CHROME ELEMENT ─────────────────────────────────────────────────────────────
   A declarative framework makes the writer of a piece of chrome visible in the attribute beside
   it. Plain code does not, so the guarantee is enforced here instead, and stricter: an attribute
   can be added anywhere, while a second writer of a chrome element now fails the release.

   The rule, over every script the page executes: for each element named below, at most one
   function may write it, and once a UI owner section exists that function must live inside it
   and be one of its render functions. A write is an assignment to a property of the element or
   a call to a DOM mutator on it, reached either directly from a document lookup or through a
   local alias of one — the shape `const row = document.getElementById('agent-row'); row.hidden
   = …` that the engine already uses for the agent row.

   Elements the engine and the UI legitimately share — the editor and source panes, whose
   content is the document's and whose visibility is the view's — are not chrome and are not
   listed. Nor, before the collapse lands, are the four the markup and the engine both still
   write (the two view-mode toggles and the two file inputs); they join the list in the cut that
   gives each one owner. */
/* The chrome is whatever the UI owner's ref table names — derived, never a hand list beside it.
   A list maintained by hand answers "one writer" for the ids somebody remembered to add, which
   is the shape of a census that quietly stops covering what it is about; this one grows with the
   table it reads. `_RAPIER_UI_REFS` is parsed below and every id in it is chrome. */
/* The UI owner holds refs to three surfaces it does not own: the editor host, the source pane
   and its textarea are View's, and rapier-ui.md §1 says so — UI reaches them only to show or
   hide them, while every keystroke, projection, measurement and scroll write is View's. They are
   named here rather than silently skipped, because an unexplained hole in an ownership census is
   the same defect as a hand-maintained list. */
const DOCUMENT_SURFACES = Object.freeze(['editor-blocks', 'source-mode', 'source-textarea']);
const CHROME_ELEMENTS_EXTRA = Object.freeze([
  'settings-compare-btn', 'view-mode-toggle', 'export-modal-title', 'copy-menu-title',
  'share-menu-title', 'licenses-title', 'restore-modal-title',
]);
const CLASS_MUTATORS = new Set(['add', 'remove', 'toggle', 'replace']);
const DOM_MUTATORS = new Set([
  'setAttribute', 'removeAttribute', 'toggleAttribute', 'replaceChildren', 'append', 'prepend',
  'insertAdjacentHTML', 'insertAdjacentElement', 'appendChild', 'removeChild', 'replaceWith',
  'setProperty', 'removeProperty',
]);
const UI_SECTION_MARK = '/* ── UI ────';

/* The UI owner finds its elements once, at mount, and writes them as `refs.<name>` — a lookup
   this census cannot see through unless it reads the same table. Parsing `_RAPIER_UI_REFS` is
   what makes the ownership law bite on the section that actually holds the chrome; without it
   the audit only sees the handful of writers that still name an id inline. */
function refsTableOf(tree, source) {
  const table = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' &&
        node.id.name === '_RAPIER_UI_REFS') {
      const literal = node.init && node.init.type === 'CallExpression' &&
        node.init.arguments[0] && node.init.arguments[0].type === 'ObjectExpression'
        ? node.init.arguments[0]
        : (node.init && node.init.type === 'ObjectExpression' ? node.init : null);
      for (const property of (literal ? literal.properties : [])) {
        const key = property.key && (property.key.name || property.key.value);
        if (key && property.value && property.value.type === 'Literal') table.set(key, property.value.value);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'loc' || key === 'range') continue;
      const value = node[key];
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(tree);
  return table;
}

function chromeWriterCensus(source) {
  const findings = { writers: new Map(), errors: [] };
  if (!shippedAcorn) { findings.errors.push('vendored parser unavailable'); return findings; }
  let tree;
  try { tree = shippedAcorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', ranges: true }); }
  catch (error) { findings.errors.push('unparsed: ' + error.message); return findings; }
  const sectionAt = source.indexOf(UI_SECTION_MARK);
  const refs = refsTableOf(tree, source);
  /* Every id the ref table names, plus the handful of chrome ids no ref names yet. */
  const chromeIds = new Set([...refs.values(), ...CHROME_ELEMENTS_EXTRA]);
  for (const owned of DOCUMENT_SURFACES) chromeIds.delete(owned);
  const namesRefs = (node) => !!node && (
    (node.type === 'Identifier' && node.name === 'refs') ||
    (node.type === 'MemberExpression' && !node.computed && node.property &&
     node.property.name === 'refs'));
  const chromeOf = (node, aliases) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'Identifier') return aliases.get(node.name) || null;
    if (node.type === 'MemberExpression') {
      if (node.computed || !node.property || !node.property.name) return null;
      if (!namesRefs(node.object)) return null;
      const id = refs.get(node.property.name);
      return id && chromeIds.has(id) ? id : null;
    }
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return null;
    const callee = node.callee;
    const method = callee.property && callee.property.name;
    /* FT.get() is a cached getElementById('format-toolbar') behind a zero-argument alias, not a
       chrome-id pattern getElementById/querySelector already cover — named here by hand because
       it is the one such alias in the engine, not a second general shape to detect. */
    if (method === 'get' && node.arguments.length === 0 &&
        callee.object.type === 'Identifier' && callee.object.name === 'FT') {
      return chromeIds.has('format-toolbar') ? 'format-toolbar' : null;
    }
    const argument = node.arguments[0];
    if (!argument || argument.type !== 'Literal' || typeof argument.value !== 'string') return null;
    if (method === 'getElementById') return chromeIds.has(argument.value) ? argument.value : null;
    if (method === 'querySelector' || method === 'querySelectorAll') {
      const id = /^#([A-Za-z0-9_-]+)$/.exec(argument.value.trim());
      return id && chromeIds.has(id[1]) ? id[1] : null;
    }
    return null;
  };
  /* Try each level of a member chain from the outside in, so `refs.findBar.hidden` is recognised
     at `refs.findBar` instead of collapsing to the bare `refs` identifier. */
  const chromeRootOf = (node, aliases) => {
    let root = node;
    while (root && root.type === 'MemberExpression') {
      const named = chromeOf(root, aliases);
      if (named) return named;
      root = root.object;
    }
    return chromeOf(root, aliases);
  };
  /* One pass per function body, so an alias never leaks past the scope that made it. */
  const visit = (node, owner, aliases) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item, owner, aliases); return; }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression') {
      const named = (node.id && node.id.name) || owner;
      visit(node.body, named, new Map(aliases));
      if (node.params) visit(node.params, named, aliases);
      return;
    }
    if (node.type === 'Property' && node.value &&
        /^(?:Function|Arrow)/.test(node.value.type) && node.key && (node.key.name || node.key.value)) {
      visit(node.value.body, String(node.key.name || node.key.value), new Map(aliases));
      return;
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      const named = chromeOf(node.init, aliases);
      if (named) aliases.set(node.id.name, named);
    }
    let target = null;
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
      target = chromeRootOf(node.left.object, aliases);
    } else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
               node.callee.property && DOM_MUTATORS.has(node.callee.property.name)) {
      target = chromeRootOf(node.callee.object, aliases);
    } else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
               node.callee.object && node.callee.object.type === 'MemberExpression' &&
               node.callee.object.property && node.callee.object.property.name === 'classList' &&
               CLASS_MUTATORS.has(node.callee.property && node.callee.property.name)) {
      /* `contains` is a question, not a write. Counting it made a reader look like a second
         owner, which is the way an ownership census loses the authority to accuse. */
      target = chromeRootOf(node.callee.object.object, aliases);
    }
    if (target) {
      const record = findings.writers.get(target) || new Map();
      record.set(owner, sectionAt >= 0 && node.range[0] > sectionAt);
      findings.writers.set(target, record);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'loc' || key === 'range') continue;
      const value = node[key];
      if (value && typeof value === 'object') visit(value, owner, aliases);
    }
  };
  visit(tree, '<top level>', new Map());
  return findings;
}

const chromeOffences = [];
for (const script of scripts) {
  if (!/data-rapier-owned/.test(script.attrs)) continue;
  const census = chromeWriterCensus(script.body);
  chromeOffences.push(...census.errors);
  const sectioned = script.body.indexOf(UI_SECTION_MARK) >= 0;
  /* ONE OWNER, not one function. Two render functions inside the UI section are the same owner
     writing the same surface twice, which is a shape the section is free to choose; a write from
     outside it is a second owner, and that is the law. Every id the ref table names is measured,
     so this says "the UI owner writes the chrome" about the whole chrome rather than about a
     list somebody kept by hand. */
  for (const [element, owners] of census.writers) {
    if (!sectioned) continue;
    const outside = [...owners].filter(([, insideSection]) => !insideSection).map(([owner]) => owner);
    if (outside.length) {
      chromeOffences.push(`${element} written outside the UI owner by ${outside.join(' + ')}`);
      continue;
    }
    const strangers = [...owners.keys()]
      .filter((owner) => !/^(?:render[A-Z]|_rapierUiMount$)/.test(owner));
    if (strangers.length) {
      chromeOffences.push(`${element} written by ${strangers.join(' + ')}, which is not a render function`);
    }
  }
}
check('chrome is written by the UI owner alone', chromeOffences.length === 0, chromeOffences.join('; '));

/* ── THE FRAMEWORK SURFACE IS EXACTLY WHAT THE ARTIFACT DECLARES ───────────────────────────────
   Four dimensions of the same fact, pinned together so none can drift from the others: the
   framework payloads aboard, the global names they publish, the directive attributes the markup
   spends on them, and the row the licenses dialog shows for them. A file that drops the bytes
   and keeps the licence row is lying to the reader; a file that keeps a directive and drops the
   runtime is broken. This constant moves only in the commit that moves the bytes. */
/* The framework is gone, so this pin stopped naming what must be aboard and names what must
   not be. The direction matters: a list checked for presence goes silent the moment it empties,
   and would have gone on passing over a page that quietly grew the payload back. Every name
   here is a literal that appears in the artifact if and only if some part of the framework —
   its payload, its startup global, its API, its directives, or the licence row for software the
   file no longer carries — has returned. */
const FRAMEWORK_SURFACE = Object.freeze({
  payloads: Object.freeze(['alpinejs-3.15.12.dist.cdn.min.js']),
  globals: Object.freeze(['deferLoadingAlpine', 'Alpine']),
  literals: Object.freeze(['Alpine.', '$store', '$persist', 'x-data', 'x-cloak', 'x-trap',
    'x-show', 'x-transition', '@alpinejs/', 'alpine:init', 'alpine:initialized']),
  directiveAttributes: 0,
  licenseRow: 'Alpine.js 3.15.12',
});
/* The body's markup is everything from <body> to the first script after it: the chrome is
   written before any code runs, and a boundary naming one particular script would follow that
   script out of the file rather than the markup it was standing in for. */
const bodyMarkup = (() => {
  const open = html.indexOf('\n<body');
  if (open < 0) return '';
  const close = html.indexOf('<script', open);
  return html.slice(open, close > open ? close : html.length);
})();
/* One counting rule, stated here so the pin above always means the same measurement: attribute
   names carried by body-markup tags that open with a directive sigil. The tag scan is
   quote-aware because the longest directive in this file closes over a `=>`, and a regex that
   ends a tag at the first `>` reads thirty of them as text. */
function markupTags(source) {
  const found = [];
  for (let at = 0; at < source.length; at += 1) {
    if (source[at] !== '<' || !/[a-zA-Z]/.test(source[at + 1] || '')) continue;
    let quote = '';
    let end = at + 1;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) { if (character === quote) quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '>') break;
    }
    found.push(source.slice(at, end));
    at = end;
  }
  return found;
}
const directiveNames = markupTags(bodyMarkup.replace(/<!--[\s\S]*?-->/g, ''))
  .flatMap((tag) => [...tag.matchAll(/(?:^|\s)((?:x-|@|:)[A-Za-z][\w.:-]*)/g)]);
const frameworkAboard = FRAMEWORK_SURFACE.payloads.filter((name) => html.includes(`RAPIER_VENDOR_BEGIN ${name}`));
const frameworkGlobals = FRAMEWORK_SURFACE.globals.filter((name) => html.includes(`window.${name}`));
const frameworkLiterals = FRAMEWORK_SURFACE.literals.filter((name) => html.includes(name));
check('no framework surface remains',
  frameworkAboard.length === 0 && frameworkGlobals.length === 0 && frameworkLiterals.length === 0
    && directiveNames.length === FRAMEWORK_SURFACE.directiveAttributes
    && !html.includes(FRAMEWORK_SURFACE.licenseRow),
  JSON.stringify({ payloads: frameworkAboard, globals: frameworkGlobals, literals: frameworkLiterals,
    directives: directiveNames.length, licenceRow: html.includes(FRAMEWORK_SURFACE.licenseRow) }));

/* ── THE PUBLISHED TREE IS A FROZEN, NAMED SET ────────────────────────────────────────────────
   Every published file's path, relative to root, found by walking the WHOLE tree recursively
   and compared against an exact allowlist. The old walk read root plus one level of
   qualification/ and counted what it found, so a third level, a stray directory, or a file
   nobody meant to publish rode out unremarked as long as the total happened to match. A release
   archive is a claim about exactly these bytes and no others:

   - every path is named here, so an EXTRA file fails and a MISSING file fails;
   - directories are walked, never counted, and only the directories named here are walked at
     all — an unauthorized directory is itself the failure, not a place to look for more;
   - symlinks are refused outright. A symlink publishes bytes from outside the tree while
     reading, hashing and counting as though it were inside it, which is the one shape that can
     make every other check here agree about a file that is not the file being shipped. */
const PUBLIC_TREE_ALLOWLIST = Object.freeze([
  '.gitignore',
  'LICENSE',
  'PUBLIC-SUBMISSION.md',
  'README.md',
  'VECTORS.md',
  'WEBMCP-CHALLENGE.md',
  'WILL-1.md',
  '_headers',
  '_redirects',
  'agents.md',
  'demo.md',
  'icon-192.png',
  'icon-512.png',
  'llms.txt',
  'manifest.json',
  'qualification/AGENT-EVALS.md',
  'qualification/RAPIER-HANDOFF-1.0.0.md',
  'qualification/RECEIPT.json',
  'qualification/k3-browser-test.js',
  'qualification/run-selftest-preview.js',
  'qualification/run-selftest2.js',
  'qualification/static-release-audit.js',
  'qualification/webmcp-shim.js',
  'qualification/webmcp-test.js',
  'rapier.html',
  'sw.js',
  'wrangler.jsonc',
]);
const PUBLIC_TREE_DIRECTORIES = Object.freeze(['qualification']);

/* Walk findings, computed once: the files actually present, plus every reason the tree is not
   the tree this audit is allowed to certify. */
function walkPublicTree() {
  const relPaths = [];
  const violations = [];
  const walk = (relDir) => {
    const absDir = relDir ? path.join(root, relDir) : root;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? path.posix.join(relDir, entry.name) : entry.name;
      if (entry.isSymbolicLink()) { violations.push(`symlink: ${rel}`); continue; }
      if (entry.isDirectory()) {
        if (!PUBLIC_TREE_DIRECTORIES.includes(rel)) {
          violations.push(`unauthorized directory: ${rel}/`);
          continue;
        }
        walk(rel);
        continue;
      }
      if (!entry.isFile()) { violations.push(`not a regular file: ${rel}`); continue; }
      relPaths.push(rel);
    }
  };
  walk('');
  const present = new Set(relPaths);
  for (const allowed of PUBLIC_TREE_ALLOWLIST) {
    if (!present.has(allowed)) violations.push(`missing: ${allowed}`);
  }
  for (const found of relPaths) {
    if (!PUBLIC_TREE_ALLOWLIST.includes(found)) violations.push(`unlisted: ${found}`);
  }
  return { relPaths, violations };
}

const publicTree = walkPublicTree();
check('the published tree is exactly the allowlisted set, with no symlink and no unlisted path',
  publicTree.violations.length === 0 &&
    publicTree.relPaths.length === PUBLIC_TREE_ALLOWLIST.length,
  JSON.stringify({
    violations: publicTree.violations,
    found: publicTree.relPaths.length,
    allowlisted: PUBLIC_TREE_ALLOWLIST.length,
  }));

function publicTreeFiles() {
  return publicTree.relPaths.slice();
}
function publicTreeFileCount() {
  return publicTreeFiles().length;
}

/* A literal NUL is the one byte the HTML tokenizer rewrites (U+FFFD in script data), so a source
   carrying it is not the source the browser runs, and text tools read the file as binary. The
   public tree's text files carry none; a NUL a program needs is spelled as an escape. */
const nulCarriers = publicTreeFiles().filter(rel =>
  !/\.png$/i.test(rel) && fs.readFileSync(path.join(root, rel)).includes(0));
check('no public text file carries a literal NUL byte', nulCarriers.length === 0,
  nulCarriers.join(', '));
/* A tree digest binds the WHOLE published set, not just rapier.html's own bytes: a file count
   alone still passes with the wrong 26 files. For every published file except the receipt
   itself (which cannot digest its own claim), hash path + byte length + sha256, in sorted
   relative-path order, then hash that canonical listing once. Any published byte changing
   without a re-receipt moves this number; the count alone cannot catch that. */
function publicTreeSha256() {
  const receiptRelPath = path.posix.join('qualification', 'RECEIPT.json');
  const listing = publicTreeFiles()
    .filter((relPath) => relPath !== receiptRelPath)
    .sort()
    .map((relPath) => {
      const bytes = fs.readFileSync(path.join(root, relPath));
      const sha = crypto.createHash('sha256').update(bytes).digest('hex');
      return `${relPath}\t${bytes.length}\t${sha}`;
    })
    .join('\n');
  return crypto.createHash('sha256').update(listing).digest('hex');
}

function sourceHeadingCount(source) {
  let fence = null;
  let headings = 0;
  for (const line of String(source).split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      const candidate = { character: marker[1][0], length: marker[1].length };
      if (!fence) fence = candidate;
      else if (candidate.character === fence.character &&
          candidate.length >= fence.length && marker[2].trim() === '') fence = null;
      continue;
    }
    if (!fence && /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)) headings += 1;
  }
  return headings;
}

const demoMetrics = {
  bytes: Buffer.byteLength(demo),
  codePoints: [...demo].length,
  sourceTokens: (demo.match(/\S+/gu) || []).length,
  sourceHeadings: sourceHeadingCount(demo),
};
/* The demo link exists to let a stranger drive the agent surface, so the document it opens has to
   lead with WebMCP and then get out of the way. Rapier's own welcome never leads with WebMCP —
   Rapier was finished before the protocol existed and stands without it — which is exactly why
   the demo needs its own head rather than a rewritten welcome. */
check('the demo document leads with the agent surface',
  demo.startsWith('# Your agent, in this document\n') && demo.includes('WebMCP'));
check('the demo carries a working will for a visitor to meet',
  (demo.match(/^<!-- will\/1 (edit|append|keep)(?:: .*)? -->$/gm) || []).length
    === (demo.match(/^<!-- \/will -->$/gm) || []).length
    && (demo.match(/^<!-- \/will -->$/gm) || []).length > 0);

/* The welcome is written once, in rapier.html, and carried into the demo beneath that head. Two
   copies of one document drift the moment someone improves the guide and forgets the file, and
   the visitor is then reading last month's Rapier. Bind them: the demo must END with exactly what
   the shipped welcome produces, byte for byte. */
const welcomeSource = functionSource('rapierWelcomeMarkdown');
const welcomeArray = welcomeSource.slice(welcomeSource.indexOf('['),
  welcomeSource.lastIndexOf(']') + 1);
let welcomeMarkdown = '';
try {
  welcomeMarkdown = new Function('return ' + welcomeArray)().join('\n');
} catch (_) { welcomeMarkdown = ''; }

/* First contact is a live Will, so qualify it through the parser that ships rather than count
   marker-looking lines with another grammar. The small VM below owns no editor state: it runs
   the canonical recognizer, disclosure law, intent rule, and document-fact producer over exact
   strings. `_rapierDocumentWill` is replaced only as the fact producer's input seam. */
let willKernel = null;
let willKernelError = '';
try {
  const willKernelSource = [
    sourceSlice('const _RAPIER_WILL_INTENT_LIMIT =', 'function _rapierWillMarkerOf'),
    functionSource('_rapierWillMarkerOf'),
    functionSource('_rapierWillParse'),
    functionSource('_rapierWillRegionsIn'),
    functionSource('_rapierWillTouchesMarker'),
    functionSource('_rapierWillGovern'),
    functionSource('_rapierWillIntentOf'),
    sourceSlice('const _RAPIER_WILL_TEACHING =', 'function _rapierWillDocumentFact'),
    'let __qualificationWill = null;',
    'function _rapierDocumentWill() { return __qualificationWill; }',
    functionSource('_rapierWillDocumentFact'),
    `globalThis.__willKernel = Object.freeze({
      parse: text => _rapierWillParse(text),
      fact: text => {
        __qualificationWill = _rapierWillParse(text);
        return _rapierWillDocumentFact();
      },
      inspect: (text, start, end) => {
        const will = _rapierWillParse(text);
        return {
          law: _rapierWillGovern(will, start, end),
          intent: _rapierWillIntentOf(will, start, end),
        };
      },
    });`,
  ].join('\n');
  const willBox = {};
  vm.createContext(willBox);
  vm.runInContext(willKernelSource, willBox, { filename: 'rapier-will-first-contact.js' });
  willKernel = willBox.__willKernel;
} catch (error) {
  willKernelError = String((error && error.stack) || error);
}

const welcomeWill = willKernel ? willKernel.parse(welcomeMarkdown) : null;
const welcomeLawFact = willKernel ? willKernel.fact(welcomeMarkdown) : null;
const malformedLawFact = willKernel
  ? willKernel.fact('<!-- will/1 KEEP -->\nheld\n<!-- /will -->') : null;
const manyWillSource = Array.from({ length: 1025 }, () =>
  '<!-- will/1 edit -->\nx\n<!-- /will -->').join('\n');
const manyWillFact = willKernel ? willKernel.fact(manyWillSource) : null;
const getContextResultSchema = objectBranch(getContext && getContext.result);
const getContextLawSchema = getContextResultSchema && getContextResultSchema.properties
  && getContextResultSchema.properties.law;
const exactLawSchemaKeys = ['default', 'reason', 'regions', 'laws', 'teaching'];
/* WILL-1 asks a host for the ordered fault LIST beside the single reason, so the declaration
   carries both and neither is optional-by-accident: `reason` is required because a document
   under no fault has an empty one, while `faults` and `faultCount` exist only where there is
   something to locate. The mode vocabulary is read off the two producers rather than retyped,
   because a sixth mode appearing in the parser and not in the declaration is exactly the drift
   a hand-kept enum hides. */
const exactLawSchemaProperties = exactLawSchemaKeys.slice(0, 4)
  .concat(['faults', 'faultCount', 'teaching']);
const producedFaultModes = [...new Set([
  ...[...functionSource('_rapierWillParse').matchAll(/mode: '([a-z_]+)'/g)].map(m => m[1]),
  ...[...functionSource('_rapierWillMarkerOf').matchAll(/near\('([a-z_]+)'\)/g)].map(m => m[1]),
  ...[...functionSource('_rapierWillMarkerOf').matchAll(/fault: '([a-z_]+)'/g)].map(m => m[1]),
])].sort();
check('the embedded welcome is a balanced two-region Will and first contact reports its exact fact',
  Boolean(welcomeWill && welcomeLawFact)
    && welcomeWill.present === true && welcomeWill.faults.length === 0
    && welcomeWill.regions.length === 2
    && JSON.stringify(welcomeWill.regions.map(region => region.law)) === JSON.stringify(['keep', 'append'])
    && JSON.stringify(welcomeLawFact) === JSON.stringify({
      default: 'edit', reason: '', regions: 2, laws: ['append', 'keep'],
      teaching: welcomeLawFact && welcomeLawFact.teaching,
    })
    && /\/WILL-1\.md/.test(welcomeLawFact.teaching)
    && /untrusted/i.test(welcomeLawFact.teaching)
    && /never instructions/i.test(welcomeLawFact.teaching)
    && /_rapierLoadBuiltInWelcome\s*\(\s*\)/.test(functionSource('_rapierRestoreBootDocument'))
    && includesInOrder(functionSource('_rapierPublishBootReady'), [
      '_rapierPublishBootFacts();', '_rapierWebMcpSync();',
    ]),
  JSON.stringify({ error: willKernelError, regions: welcomeWill && welcomeWill.regions,
    fact: welcomeLawFact }));

check('the get_context Will fact is presence-sensitive, fail-closed, exact-counted, and schema-bound',
  Boolean(willKernel && getContextResultSchema && getContextLawSchema)
    && willKernel.fact('ordinary document') === null
    && malformedLawFact && malformedLawFact.default === 'keep'
    && malformedLawFact.reason === 'unknown_law' && malformedLawFact.regions === 0
    && manyWillFact && manyWillFact.regions === 1025
    && !(getContextResultSchema.required || []).includes('law')
    && getContextLawSchema.type === 'object' && getContextLawSchema.additionalProperties === false
    && JSON.stringify(getContextLawSchema.required) === JSON.stringify(exactLawSchemaKeys)
    && JSON.stringify(Object.keys(getContextLawSchema.properties || {}))
      === JSON.stringify(exactLawSchemaProperties)
    /* The list is ordered by span, located, counted, and bounded — and the bound never reorders
       or summarises, so what leaves is always a true prefix of what the document carries. */
    && Array.isArray(malformedLawFact.faults) && malformedLawFact.faults.length === 2
    && malformedLawFact.faults[0].mode === 'unknown_law'
    && malformedLawFact.faults[1].mode === 'unpaired_marker'
    && malformedLawFact.faults[0].start < malformedLawFact.faults[1].start
    && malformedLawFact.faults.every(fault => Number.isInteger(fault.line)
      && Number.isInteger(fault.start) && fault.end > fault.start)
    && malformedLawFact.faultCount === 2
    && malformedLawFact.reason === malformedLawFact.faults[0].mode
    && !Object.prototype.hasOwnProperty.call(welcomeLawFact, 'faults')
    && getContextLawSchema.properties.faults.type === 'array'
    && Number.isInteger(getContextLawSchema.properties.faults.maxItems)
    && getContextLawSchema.properties.faults.items.additionalProperties === false
    && JSON.stringify(getContextLawSchema.properties.faults.items.required)
      === JSON.stringify(['mode', 'line', 'start', 'end'])
    && JSON.stringify(getContextLawSchema.properties.faults.items.properties.mode.enum
      .slice().sort()) === JSON.stringify(producedFaultModes)
    && getContextLawSchema.properties.faultCount.type === 'integer'
    && (getContextLawSchema.properties.regions.maximum == null
      || getContextLawSchema.properties.regions.maximum >= manyWillFact.regions)
    && getContextLawSchema.properties.laws.uniqueItems === true
    && getContextLawSchema.properties.laws.maxItems === 3
    && JSON.stringify(getContextLawSchema.properties.laws.items.enum)
      === JSON.stringify(['edit', 'append', 'keep'])
    && getContextLawSchema.properties.teaching.maxLength >= welcomeLawFact.teaching.length,
  JSON.stringify({ error: willKernelError, malformed: malformedLawFact, many: manyWillFact,
    producedFaultModes, schema: getContextLawSchema }));

const exactIntent = 'the whole intent survives projection';
const intentDocument = '<!-- will/1 keep: ' + exactIntent + ' -->\nheld bytes\n<!-- /will -->';
const intentWill = willKernel ? willKernel.parse(intentDocument) : null;
const intentRegion = intentWill && intentWill.regions[0];
const intentInspection = willKernel && intentRegion
  ? willKernel.inspect(intentDocument, intentRegion.start, intentRegion.end) : null;
const crossIntentDocument = [
  '<!-- will/1 keep: first -->', 'one', '<!-- /will -->',
  '<!-- will/1 append: second -->', 'two', '<!-- /will -->',
].join('\n');
const crossIntentWill = willKernel ? willKernel.parse(crossIntentDocument) : null;
const crossIntentInspection = willKernel && crossIntentWill && crossIntentWill.regions.length === 2
  ? willKernel.inspect(crossIntentDocument, crossIntentWill.regions[0].start,
    crossIntentWill.regions[1].end) : null;

function objectProperty(node, name) {
  return node && node.type === 'ObjectExpression' ? (node.properties || []).find(property => {
    if (!property || property.type !== 'Property') return false;
    const key = property.computed ? staticString(property.key)
      : (property.key && (property.key.name || property.key.value));
    return key === name;
  }) || null : null;
}

let webMcpRegistryParseSource = '';
let webMcpToolNodes = new Map();
let webMcpToolParseError = '';
try {
  webMcpRegistryParseSource = webMcpRegistrySource + '\n]);';
  const tree = shippedAcorn.parse(webMcpRegistryParseSource,
    { ecmaVersion: 'latest', sourceType: 'script' });
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { for (const item of node) stack.push(item); continue; }
    if (node.type === 'ObjectExpression') {
      const operationProperty = objectProperty(node, 'operation');
      const operationName = operationProperty && staticString(operationProperty.value);
      if (operationName) webMcpToolNodes.set(operationName, node);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      if (value && typeof value === 'object') stack.push(value);
    }
  }
} catch (error) {
  webMcpToolParseError = String((error && error.message) || error);
}

function webMcpToolPropertySource(operationName, propertyName) {
  const node = webMcpToolNodes.get(operationName);
  const property = objectProperty(node, propertyName);
  return property ? webMcpRegistryParseSource.slice(property.value.start, property.value.end) : '';
}

function evaluateArrow(source, prelude) {
  if (!source) return null;
  return vm.runInNewContext('(function(){\n' + String(prelude || '')
    + '\nreturn (' + source + ');\n})()');
}

let getContextProjection = null;
let readContextProjection = null;
let readContextResultProjection = null;
let webMcpDeliverProjection = null;
/* What the user agent serializes, read from the product's own owner rather than recomputed
   here: an audit that measures the inner object proves the same false thing the fitters did. */
let webMcpWireLength = null;
let webMcpAnnotations = null;
let willProjectionError = '';
function numericConstantValue(name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp('const\\s+' + escaped + '\\s*=\\s*(\\d+)\\s*;').exec(html);
  return found ? Number(found[1]) : NaN;
}
const webMcpResultBudget = numericConstantValue('_RAPIER_WEBMCP_RESULT_BUDGET');
const outlineLabelLimit = numericConstantValue('_RAPIER_OUTLINE_LABEL_LIMIT');
const focusPreviewLimit = numericConstantValue('_RAPIER_FOCUS_PREVIEW_LIMIT');
try {
  const projectionBox = { TextEncoder };
  vm.createContext(projectionBox);
  vm.runInContext(`
      const _RAPIER_WEBMCP_RESULT_BUDGET = ${JSON.stringify(webMcpResultBudget)};
      const _RAPIER_OUTLINE_LABEL_LIMIT = ${JSON.stringify(outlineLabelLimit)};
      const _RAPIER_FOCUS_PREVIEW_LIMIT = ${JSON.stringify(focusPreviewLimit)};
      const _RAPIER_NAME_TTL_MS = ${JSON.stringify(webMcpNameTtlMs)};
      function _rapierNameRemainingMs() { return ${JSON.stringify(webMcpNameTtlMs)}; }
      const _RAPIER_WILL_TEACHING = ${JSON.stringify(welcomeLawFact && welcomeLawFact.teaching || '')};
      const _RAPIER_WEBMCP_SCOPE = 'qualification:webmcp';
      const _rapierLiveContexts = new Map();
      function _rapierContextDelivered() { return true; }
      function _rapierWillLawOfTarget() { return ''; }
      function _rapierRetireReadPage() {}
      /* A synthetic page has no region to re-cut, so it comes back at the length asked for and
         the read loop's own attempt bound decides what an unshrinkable page becomes. */
      function _rapierRepaginateReadContext(page, length) {
        return { ...page, text: String(page.text == null ? '' : page.text).slice(0, length) };
      }
      function _rapierYieldDowngrade() {}
      function _rapierYieldDeliver() { return true; }
      ${sourceSlice('const _RAPIER_WEBMCP_REFUSAL_ARMS', 'function _rapierWebMcpCursorOffset')}
      ${functionSource('_rapierWebMcpClip')}
      ${functionSource('_rapierWebMcpFit')}
      ${functionSource('_rapierWebMcpReduce')}
      ${functionSource('_rapierWebMcpDiscloseWith')}
      ${functionSource('_rapierSourceCharEscaped')}
      ${functionSource('_rapierParseMarkdownImageDestination')}
      ${functionSource('_rapierScanMarkdownImages')}
      ${functionSource('_rapierImageAltSourceParts')}
      ${functionSource('_rapierPlainImageDestination')}
      ${functionSource('_rapierParseDataUrl')}
      ${functionSource('_rapierDataUrlByteFact')}
      ${functionSource('_rapierCollapseDataUriImages')}
      ${functionSource('_rapierWebMcpContextResult')}
      ${functionSource('_rapierWebMcpReadShape')}
      ${functionSource('_rapierWebMcpFitReadShape')}
      ${functionSource('_rapierWebMcpReadResult')}
      ${functionSource('_rapierWebMcpFocus')}
      ${functionSource('_rapierWebMcpDeliver')}
      const __getContextProjection = (${webMcpToolPropertySource('document.get_context', 'result')});
      globalThis.__wireProjections = Object.freeze({
        getContext: __getContextProjection,
        readShape: _rapierWebMcpReadShape,
        readResult: _rapierWebMcpReadResult,
        deliver: _rapierWebMcpDeliver,
        wire: _rapierWebMcpWire,
      });
    `, projectionBox, { filename: 'rapier-webmcp-wire-qualification.js' });
  getContextProjection = projectionBox.__wireProjections.getContext;
  readContextProjection = projectionBox.__wireProjections.readShape;
  readContextResultProjection = projectionBox.__wireProjections.readResult;
  webMcpDeliverProjection = projectionBox.__wireProjections.deliver;
  webMcpWireLength = projectionBox.__wireProjections.wire;
  webMcpAnnotations = vm.runInNewContext(`(function(){
      const _RAPIER_WEBMCP_EFFECTS = Object.freeze({ read: 1, view: 1, write: 1 });
      ${sourceSlice('function _rapierWebMcpAnnotations(', 'const RAPIER_WEBMCP_TOOLS')}
      return _rapierWebMcpAnnotations;
    })()`);
} catch (error) {
  willProjectionError = String((error && error.stack) || error);
}

const getContextReceiptBase = {
  filename: 'welcome.md', docKind: 'markdown', mode: 'read', dirty: false,
  structure: null, focus: null, selection: null, context_handle: null,
};
const projectedUnwilledContext = getContextProjection
  ? getContextProjection(getContextReceiptBase) : null;
const projectedWilledContext = getContextProjection
  ? getContextProjection({ ...getContextReceiptBase, law: welcomeLawFact }) : null;
const projectedIntentRead = readContextProjection ? readContextProjection({
  outcome: 'read', reason: '', label: 'Statement', depth: 2, representation: 'markdown',
  law: intentInspection && intentInspection.law,
  intent: intentInspection && intentInspection.intent,
  chars: 10, offset: 0, remaining: 0, next_cursor: null,
  context_handle: 'rctx_00000000000000000000000000000000', text: 'held bytes',
}) : null;
const getContextToolNode = webMcpToolNodes.get('document.get_context');
const readContextToolNode = webMcpToolNodes.get('document.read_context');
const getContextToolMeta = {
  effect: staticString(objectProperty(getContextToolNode, 'effect')?.value),
  content: staticString(objectProperty(getContextToolNode, 'content')?.value),
};
const readContextToolMeta = {
  effect: staticString(objectProperty(readContextToolNode, 'effect')?.value),
  content: staticString(objectProperty(readContextToolNode, 'content')?.value),
};
const getContextAnnotations = webMcpAnnotations ? webMcpAnnotations(getContextToolMeta) : null;
const readContextAnnotations = webMcpAnnotations ? webMcpAnnotations(readContextToolMeta) : null;
check('canonical and WebMCP disclosures preserve whole regional law and intent as untrusted evidence',
  intentInspection && intentInspection.law === 'keep' && intentInspection.intent === exactIntent
    && crossIntentInspection && crossIntentInspection.law === 'keep'
    && crossIntentInspection.intent === ''
    && matchesAll(functionSource('_rapierReadRegionPage'), [
      /law:\s*_rapierWillLawOfTarget\s*\(\s*target\s*\)/,
      /intent:\s*_rapierWillIntentOfTarget\s*\(\s*target\s*\)/,
    ])
    && projectedIntentRead && projectedIntentRead.law === 'keep'
    && projectedIntentRead.intent === exactIntent
    && JSON.stringify(projectedWilledContext && projectedWilledContext.law)
      === JSON.stringify(welcomeLawFact)
    && projectedUnwilledContext
    && !Object.prototype.hasOwnProperty.call(projectedUnwilledContext, 'law')
    && getContextAnnotations && getContextAnnotations.untrustedContentHint === true
    && readContextAnnotations && readContextAnnotations.untrustedContentHint === true
    && webMcpWireLength && webMcpWireLength(projectedIntentRead) <= 1500,
  JSON.stringify({ parserError: willKernelError, registryError: webMcpToolParseError,
    projectionError: willProjectionError, intentInspection, crossIntentInspection,
    projectedIntentRead, projectedWilledLaw: projectedWilledContext && projectedWilledContext.law,
    projectedUnwilledHasLaw: projectedUnwilledContext
      ? Object.prototype.hasOwnProperty.call(projectedUnwilledContext, 'law') : null,
    annotations: { getContext: getContextAnnotations, readContext: readContextAnnotations } }));

/* WILL-1 counts Unicode scalars while WebMCP spends JSON string length. Astral characters are
   therefore the hostile valid boundary: 512 scalars occupy 1,024 UTF-16 units before the result
   pays for a law, ref, structure, or preview. Run the real shipped projection, fitter and final
   delivery seam so a source-shaped test cannot miss the final `result_over_budget` reduction. */
const maxAstralIntent = String.fromCodePoint(0x1f5e1).repeat(512);
const maxIntentDocument = '<!-- will/1 keep: ' + maxAstralIntent
  + ' -->\nheld\n<!-- /will -->';
const maxIntentWill = willKernel ? willKernel.parse(maxIntentDocument) : null;
const maxIntentLawFact = willKernel ? willKernel.fact(maxIntentDocument) : null;
const focusRef = 'rfoc_0123456789abcdef0123456789abcdef';
const readHandle = 'rctx_0123456789abcdef0123456789abcdef';
const smallStructureFact = Object.freeze({
  engine: 'acorn@8.18.0', available: true,
  supports: ['outline', 'declaration', 'reference', 'call', 'construct', 'write', 'member',
    'import', 'export'],
});
const smallContextReceipt = {
  ...getContextReceiptBase,
  filename: 'welcome-with-a-long-name-that-must-survive-when-there-is-room.md',
  structure: smallStructureFact,
  law: welcomeLawFact,
  focus: {
    kind: 'paragraph', heading: 'Statement', preview: 'You edit everything, always.',
    chars: 29, law: 'keep', intent: exactIntent, ref: focusRef,
  },
};
const maximalContextReceipt = {
  ...getContextReceiptBase,
  filename: 'maximum-intent.md', structure: smallStructureFact, law: maxIntentLawFact,
  focus: {
    kind: 'paragraph', heading: 'Maximum intent', preview: 'held', chars: 4,
    law: 'keep', intent: maxAstralIntent, ref: focusRef,
  },
};
const smallContextWire = getContextProjection ? getContextProjection(smallContextReceipt) : null;
const maximalContextWire = getContextProjection ? getContextProjection(maximalContextReceipt) : null;

function deliveredWebMcpResult(operationName, value) {
  if (typeof webMcpDeliverProjection !== 'function') return null;
  const envelope = webMcpDeliverProjection(operationName, value);
  const text = envelope && envelope.content && envelope.content[0] && envelope.content[0].text;
  try { return JSON.parse(text); } catch (_) { return null; }
}

const deliveredSmallContext = deliveredWebMcpResult('document.get_context', smallContextWire);
const deliveredMaximalContext = deliveredWebMcpResult('document.get_context', maximalContextWire);
function exactMaximalContext(value) {
  return Boolean(value && value.outcome === 'read'
    && value.law && value.law.default === maxIntentLawFact.default
    && value.focus && value.focus.law === 'keep'
    && value.focus.intent === maxAstralIntent && value.focus.ref === focusRef
    && /^rfoc_[0-9a-f]{32}$/.test(value.focus.ref)
    && webMcpWireLength && webMcpWireLength(value) <= webMcpResultBudget);
}
function wireMutation(value, action) {
  const copy = JSON.parse(JSON.stringify(value));
  action(copy);
  return copy;
}
const maximalContextMutations = maximalContextWire ? [
  wireMutation(maximalContextWire, value => { delete value.law; }),
  wireMutation(maximalContextWire, value => { value.law.default = 'append'; }),
  wireMutation(maximalContextWire, value => { value.focus.intent = value.focus.intent.slice(2); }),
  wireMutation(maximalContextWire, value => { value.focus.ref = ''; }),
  wireMutation(maximalContextWire, value => { value.padding = 'x'.repeat(webMcpResultBudget); }),
] : [];
check('a 512-scalar astral Will survives get_context with its document law and actionable focus ref',
  Number.isSafeInteger(webMcpResultBudget) && webMcpResultBudget === 1500
    && maxIntentWill && maxIntentWill.faults.length === 0
    && maxIntentWill.regions.length === 1
    && maxIntentWill.regions[0].intent === maxAstralIntent
    && [...maxAstralIntent].length === 512 && maxAstralIntent.length === 1024
    && maxIntentLawFact && maxIntentLawFact.default === 'keep'
    && exactMaximalContext(maximalContextWire)
    && exactMaximalContext(deliveredMaximalContext)
    && maximalContextMutations.length === 5
    && maximalContextMutations.every(value => !exactMaximalContext(value))
    && smallContextWire && deliveredSmallContext
    && JSON.stringify(smallContextWire.structure) === JSON.stringify(smallStructureFact)
    && JSON.stringify(smallContextWire.law) === JSON.stringify(welcomeLawFact)
    && smallContextWire.focus.heading === smallContextReceipt.focus.heading
    && smallContextWire.focus.preview === smallContextReceipt.focus.preview
    && smallContextWire.focus.intent === exactIntent
    && JSON.stringify(deliveredSmallContext) === JSON.stringify(smallContextWire),
  JSON.stringify({ error: willProjectionError, budget: webMcpResultBudget,
    intent: { scalars: [...maxAstralIntent].length, units: maxAstralIntent.length },
    maximal: maximalContextWire && {
      bytes: JSON.stringify(maximalContextWire).length,
      keys: Object.keys(maximalContextWire),
      focusKeys: maximalContextWire.focus && Object.keys(maximalContextWire.focus),
      defaultLaw: maximalContextWire.law && maximalContextWire.law.default,
      intentUnits: maximalContextWire.focus && String(maximalContextWire.focus.intent || '').length,
      ref: maximalContextWire.focus && maximalContextWire.focus.ref,
    }, delivered: deliveredMaximalContext && {
      bytes: JSON.stringify(deliveredMaximalContext).length,
      keys: Object.keys(deliveredMaximalContext),
    }, smallBytes: smallContextWire && JSON.stringify(smallContextWire).length }));

const ordinaryStructuralLedger = Object.freeze({
  engine: 'acorn@8.18.0', kind: 'function', status: 'ok', complete: true,
  omissions: [],
  budget: {
    limits: { tokens: 120000, nodes: 90000, depth: 512, units: 64,
      declarations: 4096, occurrences: 24000, bindings: 12000, scopes: 8192,
      entries: 2048, matches: 100, strings: 1048576, resultBytes: 1048576 },
    used: { tokens: 28, nodes: 19, depth: 4, units: 1, declarations: 2,
      occurrences: 5, bindings: 3, scopes: 2, entries: 1, matches: 0,
      strings: 91, resultBytes: 742 },
  },
  omitted: 0, truncated: false,
  name: 'sum', container: 'module', exported: true,
  calls: ['normalize'], writes: ['total'], imports_used: ['input'],
});
const ordinaryReadReceipt = {
  outcome: 'read', reason: '', label: 'function sum', depth: 1,
  representation: 'text', law: 'keep', intent: exactIntent,
  chars: 13, offset: 0, remaining: 0, next_cursor: null,
  context_handle: readHandle, text: 'return total;',
  structure: ordinaryStructuralLedger, _readRegion: { qualification: true },
};
const maximalStructuralReadReceipt = {
  ...ordinaryReadReceipt, intent: maxAstralIntent, text: 'held', chars: 4,
};
const ordinaryReadWire = readContextResultProjection
  ? readContextResultProjection(ordinaryReadReceipt) : null;
const maximalReadWire = readContextResultProjection
  ? readContextResultProjection(maximalStructuralReadReceipt) : null;
const deliveredOrdinaryRead = deliveredWebMcpResult('document.read_context', ordinaryReadWire);
const deliveredMaximalRead = deliveredWebMcpResult('document.read_context', maximalReadWire);
function explicitResultBudgetSummary(structure) {
  const sentinel = structure && Array.isArray(structure.omissions)
    ? structure.omissions.find(row => row && row.domain === 'wire'
      && row.reason === 'result_budget') : null;
  return Boolean(structure && structure.status === 'bounded' && structure.complete === false
    && structure.truncated === true && sentinel);
}
function exactMaximalRead(value) {
  return Boolean(value && value.outcome === 'read' && value.law === 'keep'
    && value.intent === maxAstralIntent && value.handle === readHandle
    && value.text === 'held' && value.truncated === true
    && explicitResultBudgetSummary(value.structure)
    && webMcpWireLength && webMcpWireLength(value) <= webMcpResultBudget);
}
const maximalReadMutations = maximalReadWire ? [
  wireMutation(maximalReadWire, value => { value.intent = value.intent.slice(2); }),
  wireMutation(maximalReadWire, value => { delete value.law; }),
  wireMutation(maximalReadWire, value => {
    const sentinel = value.structure.omissions.find(row => row.reason === 'result_budget');
    sentinel.reason = 'projection_budget';
  }),
  wireMutation(maximalReadWire, value => { value.structure.truncated = false; }),
  wireMutation(maximalReadWire, value => { value.padding = 'x'.repeat(webMcpResultBudget); }),
] : [];
check('maximal governed structural reads preserve Will and expose any wire attenuation explicitly',
  exactMaximalRead(maximalReadWire) && exactMaximalRead(deliveredMaximalRead)
    && maximalReadMutations.length === 5
    && maximalReadMutations.every(value => !exactMaximalRead(value))
    && ordinaryReadWire && deliveredOrdinaryRead
    && ordinaryReadWire.label === ordinaryReadReceipt.label
    && ordinaryReadWire.text === ordinaryReadReceipt.text
    && ordinaryReadWire.law === ordinaryReadReceipt.law
    && ordinaryReadWire.intent === ordinaryReadReceipt.intent
    && ordinaryReadWire.handle === readHandle
    && JSON.stringify(ordinaryReadWire.structure) === JSON.stringify(ordinaryStructuralLedger)
    && ordinaryReadWire.truncated === false
    && JSON.stringify(ordinaryReadWire).length <= webMcpResultBudget
    && JSON.stringify(deliveredOrdinaryRead) === JSON.stringify(ordinaryReadWire),
  JSON.stringify({ error: willProjectionError, budget: webMcpResultBudget,
    maximal: maximalReadWire && {
      bytes: JSON.stringify(maximalReadWire).length,
      law: maximalReadWire.law, intentUnits: String(maximalReadWire.intent || '').length,
      handle: maximalReadWire.handle, text: maximalReadWire.text,
      truncated: maximalReadWire.truncated, structure: maximalReadWire.structure,
    }, delivered: deliveredMaximalRead && {
      bytes: JSON.stringify(deliveredMaximalRead).length,
      law: deliveredMaximalRead.law,
      intentUnits: String(deliveredMaximalRead.intent || '').length,
      structure: deliveredMaximalRead.structure,
    }, ordinary: ordinaryReadWire && {
      bytes: JSON.stringify(ordinaryReadWire).length,
      structureExact: JSON.stringify(ordinaryReadWire.structure)
        === JSON.stringify(ordinaryStructuralLedger),
      label: ordinaryReadWire.label, text: ordinaryReadWire.text,
    } }));

/* A local UTF-8 document and protocol-authored text are different boundaries. The former keeps
   deliberate VT, FF and ESC bytes; the latter admits only TAB/LF/CR from C0 so agent and wire
   payloads remain bounded and unambiguous. Both still refuse NUL and non-scalar UTF-16. Execute
   the shipped codec through each named entrance and the agent adapter that owns strict refusal. */
let textCodec = null;
let agentTextAdmission = null;
let textCodecError = '';
try {
  const codecBox = { TextEncoder, TextDecoder, Uint8Array, ArrayBuffer };
  vm.createContext(codecBox);
  vm.runInContext(
    sourceSlice('function _rapierTextHasDocumentScalars', '\n\n/* Cross-region providers')
      + '\n;globalThis.__textCodec = RapierTextCodec;',
    codecBox, { filename: 'rapier-text-admission-qualification.js' });
  textCodec = codecBox.__textCodec;
  agentTextAdmission = vm.runInNewContext(
    '(' + functionSource('_rapierAdmitAgentText') + ')',
    { RapierTextCodec: textCodec, _rapierDocumentNameIsAdmissible: () => true });
} catch (error) {
  textCodecError = String((error && error.stack) || error);
}

function codecVerdict(source) {
  const verdict = {
    documentFragment: null, protocolFragment: null,
    document: null, protocol: null, decoded: null, agent: null,
  };
  if (!textCodec) return verdict;
  verdict.documentFragment = textCodec.isDocumentFragment(source);
  verdict.protocolFragment = textCodec.isProtocolFragment(source);
  try { verdict.document = textCodec.normalizeDocument(source); }
  catch (error) { verdict.document = String((error && error.message) || error); }
  try { verdict.protocol = textCodec.normalizeProtocol(source); }
  catch (error) { verdict.protocol = String((error && error.message) || error); }
  try { verdict.decoded = textCodec.decodeDocumentUtf8(new TextEncoder().encode(source)); }
  catch (error) { verdict.decoded = String((error && error.message) || error); }
  if (agentTextAdmission) verdict.agent = agentTextAdmission('admission.md', source);
  return verdict;
}

const protocolOnlyC0 = [];
for (let code = 0; code < 32; code++) {
  if (code !== 0 && code !== 9 && code !== 10 && code !== 13) protocolOnlyC0.push(code);
}
const preservedDocumentC0 = protocolOnlyC0.map(code => {
  const source = 'before' + String.fromCharCode(code) + 'after';
  return { code, source, verdict: codecVerdict(source) };
});
const ordinaryC0 = [9, 10, 13].map(code => {
  const source = 'before' + String.fromCharCode(code) + 'after';
  return { code, source, verdict: codecVerdict(source) };
});
const nulVerdict = codecVerdict('before\u0000after');
const platformIntakeSource = functionSource('rapierOpenPlatformPayload');
const agentIntakeSource = functionSource('_rapierOpenAgentText');
const embedIntakeSource = functionSource('_rapierEmbedLoadRun');
const demoIntakeSource = functionSource('_rapierLoadDemoDocument');
check('local document controls survive while agent and wire text remain strict',
  Boolean(textCodec && agentTextAdmission)
    && protocolOnlyC0.length === 28
    && preservedDocumentC0.every(row => row.verdict.documentFragment === true
      && row.verdict.protocolFragment === false
      && row.verdict.document === row.source
      && row.verdict.protocol === 'document is not plain UTF-8 text'
      && row.verdict.decoded === row.source
      && row.verdict.agent === 'content_control_characters')
    && [11, 12, 27].every(code => preservedDocumentC0.some(row =>
      row.code === code && row.verdict.document === row.source))
    && ordinaryC0.every(row => row.verdict.documentFragment === true
      && row.verdict.protocolFragment === true && row.verdict.document === row.source
      && row.verdict.protocol === row.source && row.verdict.decoded === row.source
      && row.verdict.agent === '')
    && nulVerdict.documentFragment === false
    && nulVerdict.protocolFragment === false
    && nulVerdict.document === 'document is not plain UTF-8 text'
    && nulVerdict.protocol === 'document is not plain UTF-8 text'
    && nulVerdict.decoded === 'document is not plain UTF-8 text'
    && nulVerdict.agent === 'content_not_utf8_text'
    && includesInOrder(platformIntakeSource, [
      'RapierTextCodec.normalizeDocument(payload.text, payload.admittedBytes)',
      'rapierLoad(text, name',
    ])
    && includesInOrder(agentIntakeSource, [
      '_rapierAdmitAgentText(filename, content)',
      'rapierOpenPlatformPayload(',
    ])
    && includesInOrder(embedIntakeSource, [
      'RapierTextCodec.normalizeProtocol(payload.content)',
      'rapierLoad(content, filename',
    ])
    && includesInOrder(demoIntakeSource, [
      'RapierTextCodec.decodeDocumentUtf8(await response.arrayBuffer())',
      "rapierLoad(text, 'demo.md')",
    ]),
  JSON.stringify({ error: textCodecError,
    local: preservedDocumentC0.map(row => ({ code: row.code, verdict: row.verdict })),
    ordinary: ordinaryC0.map(row => ({ code: row.code, verdict: row.verdict })),
    nul: nulVerdict }));

let willPlateProvenance = null;
let willPlateProvenanceError = '';
try {
  const provenanceBox = {
    crypto: crypto.webcrypto,
    Uint32Array,
    document: { getElementById: () => null },
    rapier: { document: { blocks: [] } },
    _rapierWillPlateDecode: value => String(value || ''),
  };
  vm.createContext(provenanceBox);
  vm.runInContext(
    sourceSlice('const _RAPIER_WILL_PLATE_PROVENANCE_LIMIT',
      '\n\n/* ── Turndown instance') +
      '\n;globalThis.__mint = _rapierWillPlateMintProof;' +
      '\n;globalThis.__trusted = _rapierWillPlateTrustedSource;' +
      '\n;globalThis.__limit = _RAPIER_WILL_PLATE_PROVENANCE_LIMIT;',
    provenanceBox, { filename: 'rapier-will-plate-provenance-qualification.js' });
  const source = '<!-- will/1 keep: preserve this -->';
  const proof = provenanceBox.__mint(source);
  const plate = (encoded, receipt) => ({
    nodeType: 1,
    classList: { contains: name => name === 'will-plate' },
    getAttribute: name => name === 'data-will-b64' ? encoded :
      (name === 'data-will-proof' ? receipt : ''),
  });
  willPlateProvenance = {
    limit: provenanceBox.__limit,
    proof,
    exact: provenanceBox.__trusted(plate(source, proof)),
    forged: provenanceBox.__trusted(plate(source, 'author-supplied')),
    altered: provenanceBox.__trusted(plate('<!-- will/1 edit -->', proof)),
    absent: provenanceBox.__trusted(plate(source, '')),
  };
} catch (error) {
  willPlateProvenanceError = String((error && error.stack) || error);
}
const willPlateRenderSource = functionSource('_rapierWillRenderPlate');
const willPlateLiveTextSource = functionSource('_rapierBlockLiveText');
const willPlateTurndownSource = sourceSlice("turndown.addRule('rapierWillPlate'", '/* Preserve each authored ordinal');
check('only engine-minted Will plates can recover marker bytes',
  Boolean(willPlateProvenance)
    && willPlateProvenance.limit === 8192
    && /^rwp-[0-9a-f]{32}$/.test(willPlateProvenance.proof)
    && willPlateProvenance.exact === '<!-- will/1 keep: preserve this -->'
    && willPlateProvenance.forged === null
    && willPlateProvenance.altered === null
    && willPlateProvenance.absent === null
    && includesInOrder(willPlateRenderSource, [
      '_rapierWillPlateMintProof(source)',
      'data-will-proof=',
    ])
    && /_rapierWillPlateTrustedSource\s*\(\s*plate\s*\)/.test(willPlateLiveTextSource)
    && /filter:\s*node\s*=>\s*_rapierWillPlateTrustedSource\s*\(\s*node\s*\)\s*!==\s*null/.test(willPlateTurndownSource),
  JSON.stringify({ error: willPlateProvenanceError, evidence: willPlateProvenance }));

/* Quotes, backslashes and TAB are the largest JSON-escaped intents Rapier can admit. Each costs
   two JSON characters per scalar inside the result, and the envelope's nested string escapes the
   escape again: three wire characters per TAB, four per quote or backslash. A 512-scalar intent
   of quotes is 2,048 characters of a 1,500-character wire budget and cannot ride it at all.
   Exercise the canonical Will parser first, then the actual Rapier admission codec, both WebMCP
   fitters, and final delivery: the projection carries the person's exact words or the floor
   answers with the budget as its reason, and neither ever ships a shortened will or an
   over-budget envelope. The table is the one owner for all three boundaries, so adding a newly
   admitted escaping character necessarily adds its wire proof here too. */
const escapedIntentCases = Object.freeze([
  Object.freeze({ name: 'tab', intent: '\t'.repeat(512) }),
  Object.freeze({ name: 'quote', intent: '"'.repeat(512) }),
  Object.freeze({ name: 'backslash', intent: '\\'.repeat(512) }),
]);
function escapedIntentEvidence(entry) {
  const documentText = '<!-- will/1 keep: ' + entry.intent + ' -->\nheld\n<!-- /will -->';
  const readText = 'x';
  const parsed = willKernel ? willKernel.parse(documentText) : null;
  const fact = willKernel ? willKernel.fact(documentText) : null;
  const admitted = codecVerdict(documentText);
  let contextWire = null;
  let readWire = null;
  let error = '';
  try {
    contextWire = getContextProjection ? getContextProjection({
      ...maximalContextReceipt, filename: 'maximum-' + entry.name + '.md', law: fact,
      focus: { ...maximalContextReceipt.focus, intent: entry.intent },
    }) : null;
    readWire = readContextResultProjection ? readContextResultProjection({
      ...ordinaryReadReceipt, intent: entry.intent, text: readText, chars: readText.length,
      structure: ordinaryStructuralLedger,
      _readRegion: { qualification: true },
    }) : null;
  } catch (caught) {
    error = String((caught && caught.stack) || caught);
  }
  return {
    ...entry, documentText, readText, parsed, fact, admitted, contextWire, readWire, error,
    deliveredContext: deliveredWebMcpResult('document.get_context', contextWire),
    deliveredRead: deliveredWebMcpResult('document.read_context', readWire),
  };
}
function escapedIntentAdmitted(row) {
  return Boolean(row.parsed && row.parsed.faults.length === 0
    && row.parsed.regions.length === 1 && row.parsed.regions[0].intent === row.intent
    && row.fact && row.fact.default === 'keep'
    && row.admitted.documentFragment === true && row.admitted.protocolFragment === true
    && row.admitted.document === row.documentText && row.admitted.protocol === row.documentText
    && row.admitted.decoded === row.documentText && row.admitted.agent === '');
}
/* Either floor: the deliverer's reduction of a result that could not ride the wire, or the read
   path's own refusal after repagination. Both name the budget as the reason and both fit it. */
function boundedBudgetFloor(value) {
  return Boolean(value && value.reason === 'result_over_budget'
    && webMcpWireLength && webMcpWireLength(value) <= webMcpResultBudget);
}
function escapedIntentExact(row, contextWire, readWire) {
  const structureHonest = readWire && (
    JSON.stringify(readWire.structure) === JSON.stringify(ordinaryStructuralLedger)
    || (readWire.truncated === true && explicitResultBudgetSummary(readWire.structure)));
  return Boolean(contextWire && contextWire.law && contextWire.law.default === 'keep'
    && contextWire.focus && contextWire.focus.law === 'keep'
    && contextWire.focus.intent === row.intent && contextWire.focus.ref === focusRef
    && webMcpWireLength && webMcpWireLength(contextWire) <= webMcpResultBudget
    && readWire && readWire.law === 'keep' && readWire.intent === row.intent
    && readWire.handle === readHandle && readWire.text === row.readText
    && structureHonest && webMcpWireLength(readWire) <= webMcpResultBudget);
}
const escapedIntentEvidenceRows = escapedIntentCases.map(escapedIntentEvidence);
const escapedIntentMutations = escapedIntentEvidenceRows.flatMap(row =>
  row.contextWire && row.readWire ? [
  [row, wireMutation(row.contextWire, value => { value.focus.intent = value.focus.intent.slice(1); }),
    row.readWire],
  [row, row.contextWire, wireMutation(row.readWire,
    value => { value.intent = String(value.intent == null ? '' : value.intent).slice(1); })],
  [row, wireMutation(row.contextWire,
    value => { value.padding = 'x'.repeat(webMcpResultBudget); }), row.readWire],
] : []);
check('maximal TAB, quote and backslash Will intents ride the wire exactly or refuse in budget',
  escapedIntentEvidenceRows.length === 3
    && escapedIntentEvidenceRows.every(row => escapedIntentAdmitted(row)
      /* The projection may run out of wire; it may never run out of the person's words. */
      && row.contextWire && row.contextWire.focus.intent === row.intent
      && (escapedIntentExact(row, row.contextWire, row.readWire)
        ? JSON.stringify(row.deliveredContext) === JSON.stringify(row.contextWire)
          && JSON.stringify(row.deliveredRead) === JSON.stringify(row.readWire)
        : boundedBudgetFloor(row.deliveredContext) && boundedBudgetFloor(row.deliveredRead))
      && webMcpWireLength(row.deliveredContext) <= webMcpResultBudget
      && webMcpWireLength(row.deliveredRead) <= webMcpResultBudget)
    && escapedIntentMutations.length === 9
    && escapedIntentMutations.every(([row, contextWire, readWire]) =>
      !escapedIntentExact(row, contextWire, readWire)),
  JSON.stringify(escapedIntentEvidenceRows.map(row => ({ name: row.name,
    scalars: [...row.intent].length, admitted: {
      documentFragment: row.admitted.documentFragment,
      protocolFragment: row.admitted.protocolFragment,
      documentExact: row.admitted.document === row.documentText,
      protocolExact: row.admitted.protocol === row.documentText,
      decodedExact: row.admitted.decoded === row.documentText,
      agent: row.admitted.agent,
    },
    parserFaults: row.parsed && row.parsed.faults, error: row.error,
    contextWireChars: row.contextWire && webMcpWireLength && webMcpWireLength(row.contextWire),
    readWireChars: row.readWire && webMcpWireLength && webMcpWireLength(row.readWire),
    deliveredContextChars: webMcpWireLength && webMcpWireLength(row.deliveredContext),
    deliveredReadChars: webMcpWireLength && webMcpWireLength(row.deliveredRead),
    contextBytes: row.contextWire && JSON.stringify(row.contextWire).length,
    contextKeys: row.contextWire && Object.keys(row.contextWire),
    readBytes: row.readWire && JSON.stringify(row.readWire).length,
    readStructure: row.readWire && row.readWire.structure }))));

/* The tightest truthful structural packet is not the empty synthetic case above: it retains a
   real continuation and edit handle, append law, Markdown representation, a 512-scalar intent,
   one JSON-escaped source unit, and the exact aggregate omitted count at Rapier's 25 MiB
   admission ceiling. That count must not be zeroed or clipped merely to fit, and final delivery
   must not answer by erasing Will. */
const maximalReadCursor = 'rwalk_abcdef0123456789abcdef0123456789';
const maximalOmitted = textCodec ? textCodec.maxDocumentBytes : 25 * 1024 * 1024;
const maximalOmittedLedger = Object.freeze({
  ...ordinaryStructuralLedger,
  status: 'bounded', complete: false,
  omissions: [Object.freeze({
    domain: 'occurrences', reason: 'budget', observed: maximalOmitted,
    emitted: 0, omitted: maximalOmitted, exact: true, unit: null,
  })],
  omitted: maximalOmitted, truncated: true,
});
function maximalCursorReadEvidence(entry) {
  const receipt = {
    outcome: 'read', reason: '', label: 'maximum governed read', depth: 64,
    representation: 'markdown', law: 'append', intent: entry.intent,
    chars: 1, offset: 0, remaining: maximalOmitted,
    next_cursor: maximalReadCursor, context_handle: readHandle,
    text: '\r', structure: maximalOmittedLedger, _readRegion: { qualification: true },
  };
  let wire = null;
  let error = '';
  try { wire = readContextResultProjection ? readContextResultProjection(receipt) : null; }
  catch (caught) { error = String((caught && caught.stack) || caught); }
  return { ...entry, receipt, wire, error,
    delivered: deliveredWebMcpResult('document.read_context', wire) };
}
function exactMaximalCursorRead(row, value) {
  return Boolean(value && value.outcome === 'read'
    && value.representation === 'markdown' && value.law === 'append'
    && value.intent === row.intent && value.next_cursor === maximalReadCursor
    && /^rwalk_[0-9a-f]{32}$/.test(value.next_cursor)
    && value.handle === readHandle && /^rctx_[0-9a-f]{32}$/.test(value.handle)
    && value.text === '\r' && value.truncated === true
    && explicitResultBudgetSummary(value.structure)
    && value.structure.engine === 'acorn'
    && value.structure.omitted === maximalOmitted
    && webMcpWireLength && webMcpWireLength(value) <= webMcpResultBudget);
}
/* A 512-scalar escaping intent cannot ride beside a 25 MiB ledger, a cursor and a handle inside
   1,500 wire characters. The packet's exact proof therefore stands at the widest intent that does
   fit, found by asking the product's own projection rather than by a number written here that the
   next fitter change would quietly falsify; the 512-scalar row proves the boundary answers with
   the budget as its reason instead of erasing Will. */
const escapingCursorCases = escapedIntentCases.filter(entry =>
  entry.name === 'tab' || entry.name === 'quote');
function widestCursorReadRow(entry) {
  for (let scalars = [...entry.intent].length; scalars > 0; scalars -= 8) {
    const row = maximalCursorReadEvidence({ ...entry, intent: entry.intent.slice(0, scalars) });
    if (exactMaximalCursorRead(row, row.wire)) return row;
  }
  return maximalCursorReadEvidence({ ...entry, intent: '' });
}
const maximalCursorReadRows = escapingCursorCases.map(widestCursorReadRow);
const boundaryCursorReadRows = escapingCursorCases.map(maximalCursorReadEvidence);
const maximalCursorReadMutations = maximalCursorReadRows.flatMap(row => row.wire ? [
  wireMutation(row.wire, value => { value.structure.omitted = 0; }),
  wireMutation(row.wire, value => { value.structure.omissions[0].domain = 'projection'; }),
  wireMutation(row.wire, value => { value.law = 'keep'; }),
  wireMutation(row.wire, value => { value.intent = value.intent.slice(1); }),
  wireMutation(row.wire, value => { value.next_cursor = null; }),
  wireMutation(row.wire, value => { value.handle = null; }),
  wireMutation(row.wire, value => { value.representation = 'text'; }),
  wireMutation(row.wire, value => { value.text = ''; }),
  wireMutation(row.wire, value => { value.padding = 'x'.repeat(webMcpResultBudget); }),
].map(value => [row, value]) : []);
check('the 25 MiB append packet keeps its exact ledger, cursor, handle and escaped CR at delivery',
  maximalCursorReadRows.length === 2
    && maximalCursorReadRows.every(row => exactMaximalCursorRead(row, row.wire)
      && JSON.stringify(row.delivered) === JSON.stringify(row.wire))
    /* The same packet at the largest intent Rapier admits: never shortened, never over the wire,
       and never answered with a Will-erased read. */
    && boundaryCursorReadRows.length === 2
    && boundaryCursorReadRows.every(row => [...row.intent].length === 512
      && row.error === '' && !exactMaximalCursorRead(row, row.wire)
      && boundedBudgetFloor(row.delivered) && row.delivered.intent === undefined)
    && maximalCursorReadMutations.length === 18
    && maximalCursorReadMutations.every(([row, value]) => !exactMaximalCursorRead(row, value)),
  JSON.stringify(maximalCursorReadRows.concat(boundaryCursorReadRows).map(row => ({
    name: row.name, error: row.error, scalars: [...row.intent].length,
    bytes: row.wire && JSON.stringify(row.wire).length,
    wireChars: row.wire && webMcpWireLength && webMcpWireLength(row.wire),
    deliveredBytes: row.delivered && JSON.stringify(row.delivered).length,
    deliveredWireChars: webMcpWireLength && webMcpWireLength(row.delivered),
    keys: row.wire && Object.keys(row.wire), structure: row.wire && row.wire.structure,
    cursor: row.wire && row.wire.next_cursor, handle: row.wire && row.wire.handle }))));

/* VT and FF demonstrate the layer boundary directly: canonical Will and local document intake
   preserve them verbatim, while agent/wire admission refuses even one. */
const canonicalControlWillRows = [0x0b, 0x0c].map(code => {
  const intent = 'before' + String.fromCharCode(code) + 'after';
  const documentText = '<!-- will/1 keep: ' + intent + ' -->\nheld\n<!-- /will -->';
  return { code, intent, documentText,
    parsed: willKernel ? willKernel.parse(documentText) : null,
    admission: codecVerdict(documentText) };
});
check('Rapier preserves local VT and FF while agent protocol text refuses them',
  canonicalControlWillRows.every(row => row.parsed && row.parsed.faults.length === 0
    && row.parsed.regions.length === 1 && row.parsed.regions[0].intent === row.intent
    && row.admission.documentFragment === true
    && row.admission.protocolFragment === false
    && row.admission.document === row.documentText
    && row.admission.protocol === 'document is not plain UTF-8 text'
    && row.admission.decoded === row.documentText
    && row.admission.agent === 'content_control_characters'),
  JSON.stringify(canonicalControlWillRows.map(row => ({ code: row.code,
    parserFaults: row.parsed && row.parsed.faults,
    parserIntentExact: row.parsed && row.parsed.regions[0]
      ? row.parsed.regions[0].intent === row.intent : false,
    admission: row.admission }))));

check('the demo carries the shipped welcome verbatim beneath its head',
  welcomeMarkdown.length > 0 && demo.endsWith(welcomeMarkdown),
  'welcome ' + welcomeMarkdown.length + ' chars; demo tail differs');
/* The audit computes demoMetrics above from the shipped file itself; that computation is the
   only honest source for what the demo measures. Comparing three documents' prose against a
   fourth copy of hand-typed literals here would be a fifth copy of one fact. Compare the prose
   directly to the computation instead, so the demo can never drift from what is said about it
   and no future editor has to remember to update this file when the demo changes. */
check('the demo metrics stated in prose are the demo\'s measured metrics',
  publicSubmission.includes(
    `{ bytes: ${demoMetrics.bytes}, codePoints: ${demoMetrics.codePoints}, ` +
    `sourceTokens: ${demoMetrics.sourceTokens}, sourceHeadings: ${demoMetrics.sourceHeadings} }`)
    && readme.includes(
      `${demoMetrics.bytes.toLocaleString('en-US')} UTF-8 bytes with ${demoMetrics.sourceHeadings} source headings`)
    && challenge.includes(
      `${demoMetrics.bytes.toLocaleString('en-US')}-byte demo, all ${demoMetrics.sourceHeadings}`),
  JSON.stringify(demoMetrics));
check('README version agrees',
  readme.includes(`Current release: **${version}**`)
    || readme.includes(`Candidate version: **${version}`));
/* The vendored copies are byte-exact to the canonical repository (the pins below); the sentence that
   says they point home lives in README, never inside a generated projection (one document truth —
   an outside audit found the vendored VECTORS.md a paragraph adrift of its generator). */
check('the Will record and its vectors ship beside this hardened release',
  will.includes('reader ships in the canonical Will repository')
    && readme.replace(/\s+/g, ' ').includes('point home rather than claiming to be the executable suite of this tree'));
/* Rapier narrows its own document admission; it does not fork the portable standard to make a
   host wire budget easier. These independent pins are the canonical vendored bytes carried by
   A3.1, before the host-only C0 ruling. A change to either is a Will re-vendoring event, never a
   side effect of Rapier qualification. */
const WILL_REFERENCE_PINS = Object.freeze({
  'WILL-1.md': Object.freeze({ bytes: 28751,
    sha256: '6b26d2e9d08ea3b7e210e2de39f6c164bf365700623ab254eb74f50dc8471fd2' }),
  'VECTORS.md': Object.freeze({ bytes: 25486,
    sha256: 'f6d2d051a189f671e8f6e14bd97102929ce1a175aedcb9ab8ec835aa9a11323e' }),
});
const willReferenceFiles = { 'WILL-1.md': will, 'VECTORS.md': vectors };
const willReferenceObserved = Object.fromEntries(Object.entries(willReferenceFiles)
  .map(([name, source]) => [name, {
    bytes: Buffer.byteLength(source, 'utf8'),
    sha256: crypto.createHash('sha256').update(Buffer.from(source, 'utf8')).digest('hex'),
  }]));
check('Rapier carries the canonical Will spec and vector projection byte-exact',
  Object.entries(WILL_REFERENCE_PINS).every(([name, pin]) => {
    const observed = willReferenceObserved[name];
    return observed && observed.bytes === pin.bytes && observed.sha256 === pin.sha256;
  }),
  JSON.stringify({ pinned: WILL_REFERENCE_PINS, observed: willReferenceObserved }));

/* The line-lexical namespace means a documentation example at column zero is a LIVE will.
   Exactly two intentional carriers exist: the deployed demo and the embedded welcome every
   clean first visit opens. Parse both with the shipped recognizer; every other shipped Markdown
   file must be clean of the four reserved prefixes at column zero. */
const liveWillLeaks = [];
for (const dir of [root, path.join(root, 'qualification')]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.md') || entry.name === 'demo.md') continue;
    const body = fs.readFileSync(path.join(dir, entry.name), 'utf8');
    body.split('\n').forEach((line, i) => {
      if (/^<!--\s?\/?will[\/ ]/.test(line)) liveWillLeaks.push(`${entry.name}:${i + 1}`);
    });
  }
}
const intendedLiveWills = [
  { name: 'demo.md', source: demo },
  { name: 'embedded:welcome.md', source: welcomeMarkdown },
].map(entry => ({ ...entry, parsed: willKernel ? willKernel.parse(entry.source) : null }));
check('only the demo and embedded welcome carry intentional, valid live Will',
  liveWillLeaks.length === 0
    && intendedLiveWills.every(entry => entry.parsed && entry.parsed.present === true
      && entry.parsed.faults.length === 0 && entry.parsed.regions.length > 0),
  JSON.stringify({ leaks: liveWillLeaks,
    intended: intendedLiveWills.map(entry => ({ name: entry.name,
      present: entry.parsed && entry.parsed.present,
      regions: entry.parsed && entry.parsed.regions.length,
      faults: entry.parsed && entry.parsed.faults })) }));

/* One source, no prose drift: every line in a shipped document that names
   rapier.html and carries a 64-hex digest must carry the digest of the shipped
   bytes — and at least one document must make that claim. A digest on a line
   naming a different artifact is that artifact's own record. */
const rapierHashClaims = [];
for (const dir of [root, path.join(root, 'qualification')]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.md')) continue;
    const body = fs.readFileSync(path.join(dir, entry.name), 'utf8');
    for (const line of body.split('\n')) {
      const digest = /\b[0-9a-f]{64}\b/.exec(line);
      if (digest && /rapier\.html/i.test(line)) {
        rapierHashClaims.push({ file: entry.name, hash: digest[0] });
      }
    }
  }
}
check('every digest a document claims for rapier.html is the shipped bytes\' own',
  rapierHashClaims.length > 0 && rapierHashClaims.every(claim => claim.hash === shippedSha),
  JSON.stringify(rapierHashClaims));

/* The release receipt. A qualification bundle whose prose says one
   thing and whose receipt says another is worse than no receipt: the reader has no way to know
   which half is stale. So the receipt is bound to the bytes it ships beside — the SHA-256 is
   taken over the actual rapier.html, not copied from a run log — and its gate claims are read
   back out of the three documents that state them in prose. The comparison is deliberately
   coarse: punctuation and emphasis are stripped, so `**318 / 0 / 2**` and `318/0/2` are the same
   claim, and the check asks only that every document carries the number the receipt carries. It
   cannot prove a gate was run. It can prove a release does not ship saying two different things
   about itself, which is the failure a hand-updated version line actually makes. */
const receiptGates = (receipt && receipt.gates) || {};
const receiptFlat = text => String(text || '').replace(/[\s*`_|]/g, '').toLowerCase();
/* Every CURRENT evidence-claim document rides this list — a release must not
   ship saying two different things about itself in ANY of them. The handoff
   was the one that drifted (42/42 beside a 43/43 receipt) exactly because it
   was not on this list. */
const handoffDoc = fs.readFileSync(path.join(root, 'qualification', 'RAPIER-HANDOFF-1.0.0.md'), 'utf8');
const receiptDocs = [readme, publicSubmission, challenge, handoffDoc];
const receiptBase = Boolean(receipt)
  && receipt.release === version
  && receipt.rapierHtmlSha256 === shippedSha
  && receipt.publicTreeFileCount === publicTreeFileCount();
const receiptSuite = String(receiptGates.desktopSuite || '');
const receiptAudit = String(receiptGates.staticAudit || '');
const receiptWebMcp = String(receiptGates.webmcpHarness || '');
const receiptSays = probe => receiptDocs.every(doc => receiptFlat(doc).includes(receiptFlat(probe)));
const runtimeNotRun = ['desktopSuite', 'mobileSuite', 'previewSuite', 'webmcpHarness',
  'k3Browser', 'webmcpNativeContract', 'originSurface']
  .every(gate => String(receiptGates[gate] || '') === 'not_run');
/* Static asset staging proves only the package's deployment intent. It cannot prove a live
   origin's status, body, content type, response headers, WebMCP-capable registration, or honest
   404 behavior. This tranche has no live-origin observer, so `pass` is not an admitted value:
   changing this gate requires executable evidence for /, /rapier.html, every same-origin llms
   route (including /agents, Will, guide and receipt), /?demo=1, and an unknown path. */
const originSurfaceNotRun = String(receiptGates.originSurface || '') === 'not_run';
const originSurfaceProseExact = receiptSays('origin surface not_run');
check('static deployment wiring is never represented as live-origin evidence',
  originSurfaceNotRun && originSurfaceProseExact,
  JSON.stringify({ gate: receiptGates.originSurface || null,
    prose: receiptDocs.map((doc, index) => ({ index,
      namesOriginSurfaceNotRun: receiptFlat(doc).includes('originsurfacenotrun') })) }));
/* The real-agent route admits exactly two values: not run, or the model-chosen, script-hosted rung —
   a hosted language model choosing from the descriptors alone, the browser driven through its DevTools
   WebMCP domain with no chat host — scored as runs taken and bound to the twelve-hex digest of the
   transcript manifest (docs/evidence/hilt-model/MANIFEST.json), so the row cannot drift from its corpus. */
const REAL_AGENT_ROUTE_OK = /^(not_run|model_chosen_script_hosted \d+\/\d+ sha256:[0-9a-f]{12})$/;
const reviewCandidate = receipt.status === 'review-candidate'
  && runtimeNotRun && originSurfaceProseExact
  && REAL_AGENT_ROUTE_OK.test(String(receiptGates.realAgentRoute || ''))
  && receiptAudit
  && receiptSays(receiptAudit)
  && receiptDocs.every(doc => receiptFlat(doc).includes('notrun'));
const sourceQualified = receipt.status === 'source-qualified'
  && receiptSuite && receiptAudit && receiptWebMcp && originSurfaceNotRun && originSurfaceProseExact
  && String(receiptGates.mobileSuite || '') === receiptSuite
  && String(receiptGates.previewSuite || '') === receiptSuite
  && REAL_AGENT_ROUTE_OK.test(String(receiptGates.realAgentRoute || ''))
  && receiptSays(receiptSuite)
  && receiptSays(receiptAudit)
  && receiptDocs.every(doc => receiptFlat(doc).includes('notrun') || receiptFlat(doc).includes('humangates'))
  && [publicSubmission, challenge].every(doc =>
    receiptFlat(doc).includes(receiptFlat(receiptWebMcp.split('/')[0] + ' checks')));
const qualified = receiptBase && (reviewCandidate || sourceQualified);
check('release receipt agrees with the shipped bytes and stated evidence rung',
  qualified,
  receipt ? JSON.stringify({
    status: receipt.status,
    release: receipt.release, version,
    shaMatches: receipt.rapierHtmlSha256 === shippedSha,
    files: [receipt.publicTreeFileCount, publicTreeFileCount()],
    gates: receiptGates,
  }) : 'qualification/RECEIPT.json is missing or does not parse');

/* Size is release evidence now, not a number reconstructed from handoff prose after a drift.
   The historical measurements are independently pinned here; every later landing extends one
   continuous arithmetic chain whose last byte count must be the artifact this audit actually
   read. This makes a stale, reordered, or self-consistent-but-rewritten ledger fail. */
const SIZE_LEDGER_HISTORY = Object.freeze([
  Object.freeze({ landing: 'KERNEL-2', bytes: 4023351, deltaBytes: 156855 }),
  Object.freeze({ landing: 'A3', bytes: 4411195, deltaBytes: 387844 }),
  Object.freeze({ landing: 'K2.5', bytes: 4465748, deltaBytes: 54553 }),
  Object.freeze({ landing: 'A3.1', bytes: 4565586, deltaBytes: 99838 }),
  Object.freeze({ landing: 'Unified origin', bytes: 4565586, deltaBytes: 0 }),
  Object.freeze({ landing: 'S1 suite extraction', bytes: 3525362, deltaBytes: -1040224 }),
  Object.freeze({ landing: 'Will first-contact seam', bytes: 3530992, deltaBytes: 5630 }),
  Object.freeze({ landing: 'KERNEL-3', bytes: 3503865, deltaBytes: -27127 }),
  Object.freeze({ landing: 'BOUNDARY-1', bytes: 3485133, deltaBytes: -18732 }),
  Object.freeze({ landing: 'SIZE-2027', bytes: 3108009, deltaBytes: -377124 }),
  Object.freeze({ landing: 'SIZE-2027-R1', bytes: 3162127, deltaBytes: 54118 }),
  Object.freeze({ landing: 'SIZE-2027-R2', bytes: 3166923, deltaBytes: 4796 }),
  Object.freeze({ landing: 'SIZE-2027-R3', bytes: 3233725, deltaBytes: 66802 }),
  Object.freeze({ landing: 'SIZE-2027-R4', bytes: 3235240, deltaBytes: 1515 }),
  Object.freeze({ landing: 'SIZE-2027-R5', bytes: 3247155, deltaBytes: 11915 }),
  Object.freeze({ landing: 'SIZE-2027-R6', bytes: 3267121, deltaBytes: 19966 }),
  Object.freeze({ landing: 'SIZE-2027-R7', bytes: 2934277, deltaBytes: -332844 }),
  Object.freeze({ landing: 'SIZE-2027-R8', bytes: 2934224, deltaBytes: -53 }),
  Object.freeze({ landing: 'SIZE-2027-R9', bytes: 2937322, deltaBytes: 3098 }),
  Object.freeze({ landing: 'SIZE-2027-R10', bytes: 2937322, deltaBytes: 0 }),
  Object.freeze({ landing: 'SIZE-2027-R11', bytes: 2980671, deltaBytes: 43349 }),
  Object.freeze({ landing: 'SIZE-2027-R12', bytes: 2984169, deltaBytes: 3498 }),
  Object.freeze({ landing: 'SIZE-2027-R13', bytes: 2984525, deltaBytes: 356 }),
  Object.freeze({ landing: 'SIZE-2027-R14', bytes: 2986795, deltaBytes: 2270 }),
  Object.freeze({ landing: 'SIZE-2027-R15', bytes: 2988382, deltaBytes: 1587 }),
  Object.freeze({ landing: 'SIZE-2027-R16', bytes: 2996213, deltaBytes: 7831 }),
  Object.freeze({ landing: 'SIZE-2027-R17', bytes: 3004886, deltaBytes: 8673 }),
  Object.freeze({ landing: 'SIZE-2027-R18', bytes: 3005419, deltaBytes: 533 }),
]);
const sizeLedger = receipt && receipt.sizeLedger;
const sizeBaseline = sizeLedger && sizeLedger.baseline;
const sizeLandings = sizeLedger && Array.isArray(sizeLedger.landings)
  ? sizeLedger.landings : [];
const sizeNames = new Set(sizeLandings.map(row => row && row.landing));
let sizePrevious = sizeBaseline && sizeBaseline.bytes;
const sizeChainExact = sizeLandings.length >= SIZE_LEDGER_HISTORY.length + 1
  && sizeLandings.every(row => {
    const exact = row && typeof row.landing === 'string' && row.landing.length > 0
      && Number.isSafeInteger(row.bytes) && row.bytes > 0
      && Number.isSafeInteger(row.deltaBytes)
      && row.deltaBytes === row.bytes - sizePrevious;
    if (row && Number.isSafeInteger(row.bytes)) sizePrevious = row.bytes;
    return exact;
  });
const sizeHistoryExact = SIZE_LEDGER_HISTORY.every((expected, index) => {
  const observed = sizeLandings[index];
  return observed && expected.landing === observed.landing && expected.bytes === observed.bytes
    && expected.deltaBytes === observed.deltaBytes;
});
const lastSizeLanding = sizeLandings[sizeLandings.length - 1];
const shippedBytes = Buffer.byteLength(html, 'utf8');
check('receipt size ledger preserves measured history and ends at the shipped artifact bytes',
  Boolean(sizeLedger) && sizeLedger.unit === 'bytes'
    && sizeBaseline && sizeBaseline.name === 'SIZE mandate' && sizeBaseline.bytes === 3866496
    && sizeNames.size === sizeLandings.length && sizeChainExact && sizeHistoryExact
    && lastSizeLanding && lastSizeLanding.bytes === shippedBytes,
  JSON.stringify({ baseline: sizeBaseline, landings: sizeLandings,
    shippedBytes }));
const boundaryStartBytes = SIZE_LEDGER_HISTORY[SIZE_LEDGER_HISTORY.length - 1].bytes;
const boundaryShippedDelta = shippedBytes - boundaryStartBytes;
/* The net-bytes law (OPEN-COMMITMENTS, 2026-09-01): every landing states its bytes against the
   sealed one, and growth names its displacement or its founder-visible justification. A landing
   that shrinks needs no words; one that grows carries `growth` in its ledger row — the sentence
   that says what the bytes bought — or the audit refuses it. The delta itself is always printed. */
check('SIZE-2027-R19 is accounted against sealed SIZE-2027-R18',
  lastSizeLanding && lastSizeLanding.landing === 'SIZE-2027-R19'
    && lastSizeLanding.bytes === shippedBytes
    && lastSizeLanding.deltaBytes === boundaryShippedDelta
    && (shippedBytes < boundaryStartBytes
      || (typeof lastSizeLanding.growth === 'string' && lastSizeLanding.growth.trim().length >= 40)),
  JSON.stringify({ landing: lastSizeLanding, startBytes: boundaryStartBytes,
    shippedBytes, shippedDelta: boundaryShippedDelta }));

/* The suite census has one owner now: the exported primary runner. The preview gate delegates
   to it below rather than repeating these constants. Execute the owner's own evaluator against
   both its declared green shape and three hostile mutations; a regex that merely found the
   constants would not prove the gate spends them. */
const primaryRunnerModulePath = path.join(root, 'qualification', 'run-selftest2.js');
let primaryRunnerModule = null;
let primaryRunnerModuleError = '';
try {
  const resolved = require.resolve(primaryRunnerModulePath);
  delete require.cache[resolved];
  primaryRunnerModule = require(resolved);
} catch (error) {
  primaryRunnerModuleError = String((error && error.stack) || error);
}
const primaryCensus = {
  total: primaryRunnerModule && primaryRunnerModule.EXPECTED_TOTAL,
  skip: primaryRunnerModule && primaryRunnerModule.EXPECTED_SKIP,
  ceiling: primaryRunnerModule && primaryRunnerModule.SUITE_CEILING,
};
const censusDeclared = Number.isSafeInteger(primaryCensus.total)
  && Number.isSafeInteger(primaryCensus.skip) && Number.isSafeInteger(primaryCensus.ceiling);
const censusPinned = primaryCensus.total === 305
  && primaryCensus.skip === 0 && primaryCensus.ceiling === 305;
const censusEvaluator = primaryRunnerModule && primaryRunnerModule._evaluateCensus;
const censusGateOwnsNumbers = typeof censusEvaluator === 'function'
  && censusEvaluator(primaryCensus.total, 0, primaryCensus.skip).length === 0
  && censusEvaluator(primaryCensus.total + 1, 0, primaryCensus.skip).length > 0
  && censusEvaluator(primaryCensus.total, 0, primaryCensus.skip + 1).length > 0
  && censusEvaluator(primaryCensus.total - 1, 1, primaryCensus.skip).length > 0;
const suiteGates = ['desktopSuite', 'mobileSuite', 'previewSuite'].map((gate) => {
  const raw = String(receiptGates[gate] || '');
  const [pass, fail, skip] = raw.split('/').map(Number);
  return { gate, raw, pass, fail, skip };
});
check('the primary runner owns the suite census and the receipt is exact or explicitly not_run',
  censusDeclared && censusPinned && censusGateOwnsNumbers
    && (suiteGates.every((g) => g.raw === 'not_run') ||
      suiteGates.every((g) => g.pass === primaryCensus.total && g.skip === primaryCensus.skip && g.fail === 0)),
  JSON.stringify({ error: primaryRunnerModuleError, primary: primaryCensus,
    censusPinned, evaluatorOwnsNumbers: censusGateOwnsNumbers, gates: suiteGates }));

const qualificationMode = primaryRunnerModule && primaryRunnerModule._qualificationMode;
function modeRefuses(value) {
  try { qualificationMode(value); return false; } catch (_) { return true; }
}
check('the primary runner refuses unknown qualification modes before opening a browser',
  typeof qualificationMode === 'function'
    && qualificationMode(undefined) === 'desktop'
    && qualificationMode('') === 'desktop'
    && qualificationMode('desktop') === 'desktop'
    && qualificationMode('mobile') === 'mobile'
    && ['moblie', 'Mobile', 'phone', 'desktop ', '0'].every(modeRefuses),
  typeof qualificationMode === 'function'
    ? 'an unknown or misspelled mode was admitted'
    : 'run-selftest2.js does not export _qualificationMode');

/* ── THE PLATFORM CONTRACT NAMES EVERY LAUNCH SURFACE ─────────────────────────────────────────
   README states which query parameters the canonical URL reads and then says "No
   other query parameter is read." That is a closed claim, and it shipped omitting the live demo,
   phone-preview and local-embed routes — three surfaces a reader integrating against the
   contract would have found by accident or not at all. Both directions are pinned: every
   parameter the artifact actually reads must be named in the contract, and the contract may not
   name one the artifact does not read. */
const launchClaim = /- Launch surfaces on the canonical URL:[\s\S]{0,500}?No other query parameter is read(?: by the production artifact)?\./
  .exec(readme);
/* Parse query reads with the parser actually aboard the artifact. A textual search is both too
   broad (comments and suite fixtures used to mask the product) and too narrow: double-quoted
   arguments, computed `['get']` members and a direct query-string test are all equivalent ways
   to resurrect a production selftest door. `staticString` deliberately folds literal `+`
   expressions too, so splitting "self" + "test" does not turn the backdoor invisible. */
function staticString(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map(part => part.value.cooked == null ? part.value.raw : part.value.cooked).join('');
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left == null || right == null ? null : left + right;
  }
  return null;
}

function memberName(node) {
  if (!node || node.type !== 'MemberExpression') return '';
  if (!node.computed && node.property && node.property.type === 'Identifier') return node.property.name;
  return staticString(node.property) || '';
}

function isQueryParameterReceiver(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'NewExpression' && node.callee && node.callee.type === 'Identifier') {
    return node.callee.name === 'URLSearchParams';
  }
  if (node.type === 'MemberExpression') {
    return /^(?:params|qs|searchParams)$/.test(memberName(node));
  }
  return node.type === 'Identifier' && /^(?:params|qs|searchParams)$/.test(node.name);
}

function productionQueryFacts(source) {
  const parameters = new Set();
  const selftest = [];
  if (!shippedAcorn || typeof shippedAcorn.parse !== 'function') {
    return { parameters, selftest: ['vendored parser unavailable'], error: 'vendored parser unavailable' };
  }
  try {
    const tree = shippedAcorn.parse(String(source || ''), {
      ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true,
    });
    const stack = [tree];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        for (const item of node) stack.push(item);
        continue;
      }
      if (node.type === 'Identifier' && /selftest/i.test(node.name)) {
        selftest.push(`identifier:${node.name}`);
      }
      const literal = staticString(node);
      if (literal != null && /selftest/i.test(literal)) {
        selftest.push(`literal:${literal.slice(0, 96)}`);
      }
      if (node.type === 'CallExpression' && node.callee
          && node.callee.type === 'MemberExpression'
          && /^(?:get|has)$/.test(memberName(node.callee))
          && isQueryParameterReceiver(node.callee.object)) {
        const argument = staticString(node.arguments && node.arguments[0]);
        if (argument && /^[a-zA-Z-]+$/.test(argument)) parameters.add(argument);
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'start' || key === 'end' || key === 'loc') continue;
        if (value && typeof value === 'object') stack.push(value);
      }
    }
    return { parameters, selftest, error: '' };
  } catch (error) {
    return { parameters, selftest,
      error: String((error && error.message) || error) };
  }
}

const productionQuery = productionQueryFacts(executedScripts
  .map(script => script.body).join('\n'));
const readParameters = productionQuery.parameters;
const claimedParameters = new Set();
if (launchClaim) {
  for (const named of launchClaim[0].matchAll(/[?&]([a-zA-Z-]+)/g)) claimedParameters.add(named[1]);
}
const unclaimed = [...readParameters].filter((name) => !claimedParameters.has(name)).sort();
const overclaimed = [...claimedParameters].filter((name) => !readParameters.has(name)).sort();
check('the platform contract names exactly the query parameters the artifact reads',
  Boolean(launchClaim) && productionQuery.error === ''
    && unclaimed.length === 0 && overclaimed.length === 0,
  JSON.stringify({ claim: Boolean(launchClaim), unclaimed, overclaimed,
    read: [...readParameters].sort(), parseError: productionQuery.error }));

/* ── AN ORIGIN CHECK PARSES ─────────────────────────────────────────────────────────────────
   The off-origin observer is the only thing standing between "nothing off-origin unless you ask"
   and a claim nobody measures, so the shape of its comparison is part of the receipt. A prefix
   test is not an origin test: `http://127.0.0.1:8199.evil.example/x` begins with the admitted
   origin's own text. This pins the desktop/mobile runner to parsing both sides and comparing
   `.origin` exactly. (run-selftest-preview.js carries the same observer and is the steward's
   file; it is deliberately not read here.) */
const desktopRunnerPath = path.join(root, 'qualification', 'run-selftest2.js');
const previewRunnerPath = path.join(root, 'qualification', 'run-selftest-preview.js');
const desktopRunner = fs.readFileSync(desktopRunnerPath, 'utf8');
const previewRunner = fs.readFileSync(previewRunnerPath, 'utf8');

/* Preview is one thin policy wrapper around the primary runner, not a second implementation of
   injection, origin observation, suite census, or browser execution. Execute it with a fake
   child process so the exact target, forced preview environment and exit/error propagation are
   behavior rather than source-shaped promises. */
function previewDelegationProbe(args, env, childResult) {
  const observed = { calls: [], errors: [], exit: null, exception: '' };
  const exitSignal = Object.freeze({ previewExit: true });
  const fakeProcess = {
    argv: ['/runtime/node', '/repo/qualification/run-selftest-preview.js', ...(args || [])],
    execPath: '/runtime/node',
    env: { ...(env || {}) },
    exit(code) { observed.exit = code; throw exitSignal; },
  };
  const box = {
    __dirname: '/repo/qualification',
    process: fakeProcess,
    console: { error(...values) { observed.errors.push(values.map(String).join(' ')); } },
    require(name) {
      if (name === 'child_process') {
        return { spawnSync(command, childArgs, options) {
          observed.calls.push({ command, args: [...childArgs], options: {
            ...options, env: { ...options.env },
          } });
          return childResult;
        } };
      }
      if (name === 'path') return { join: path.join };
      throw new Error('preview wrapper required unexpected module ' + name);
    },
  };
  try {
    vm.runInNewContext(previewRunner, box, { filename: 'run-selftest-preview.js' });
  } catch (error) {
    if (error !== exitSignal) observed.exception = String((error && error.stack) || error);
  }
  return observed;
}

const previewDefault = previewDelegationProbe([], {}, { status: 7 });
const previewCustom = previewDelegationProbe(['mobile'], {
  RAPIER_URL: 'https://preview.example/rapier.html?preview=phone',
  SURVIVES: 'yes', RAPIER_REQUIRE_PREVIEW_PHONE: '0',
}, { status: 0 });
const previewError = previewDelegationProbe([], {}, { status: 0, error: new Error('probe failure') });
function exactPreviewCall(probe, mode, url) {
  if (!probe || probe.exception || probe.calls.length !== 1) return false;
  const call = probe.calls[0];
  return call.command === '/runtime/node'
    && JSON.stringify(call.args) === JSON.stringify([
      path.join('/repo/qualification', 'run-selftest2.js'), mode,
    ])
    && call.options.stdio === 'inherit'
    && call.options.env.RAPIER_URL === url
    && call.options.env.RAPIER_REQUIRE_PREVIEW_PHONE === '1';
}
check('preview qualification delegates to the primary runner with one forced policy seam',
  exactPreviewCall(previewDefault, 'desktop',
    'http://127.0.0.1:8199/rapier.html?preview=phone')
    && previewDefault.exit === 7
    && exactPreviewCall(previewCustom, 'mobile',
      'https://preview.example/rapier.html?preview=phone')
    && previewCustom.calls[0].options.env.SURVIVES === 'yes'
    && previewCustom.exit === 0
    && previewError.calls.length === 1 && previewError.exit === 1
    && previewError.errors.some(line => line.includes('HARNESS FAILURE'))
    && !/(?:EXPECTED_TOTAL|EXPECTED_SKIP|SUITE_CEILING|SELFTEST_SOURCE|page\.route|playwright|chromium|selftest=1)/
      .test(previewRunner),
  JSON.stringify({ default: previewDefault, custom: previewCustom,
    error: { calls: previewError.calls.length, errors: previewError.errors,
      exit: previewError.exit, exception: previewError.exception } }));

/* ── S1: QUALIFICATION RIDES BESIDE THE BLADE ───────────────────────────────────────────────
   `rapier.html` contains one inert lexical seam and no test bootstrap. The runner owns the
   suite, transforms the exact raw artifact once, and can remove its payload back to byte-for-
   byte production. Execute that transform here: source-shape recognition alone could bless an
   injector that corrupts `$&` fixtures, hashes the transformed response, or silently accepts a
   second suite. */
let selftestRunner = null;
let selftestInjection = null;
let selftestRunnerError = '';
try {
  const resolvedRunner = require.resolve(desktopRunnerPath);
  delete require.cache[resolvedRunner];
  selftestRunner = require(resolvedRunner);
  selftestInjection = selftestRunner.injectSelftest(fs.readFileSync(htmlPath));
} catch (error) {
  selftestRunnerError = String((error && error.stack) || error);
}
const qualificationSeam = selftestRunner && selftestRunner.QUALIFICATION_INJECTION_POINT;
const payloadBegin = selftestRunner && selftestRunner.QUALIFICATION_PAYLOAD_BEGIN;
const payloadEnd = selftestRunner && selftestRunner.QUALIFICATION_PAYLOAD_END;
const suiteSource = selftestRunner && String(selftestRunner.SELFTEST_SOURCE || '');
const suiteRuntimeSentinels = Object.freeze([
  'data-rapier-selftest-state',
  'data-rapier-selftest-production-sha256',
  'data-rapier-selftest-suite-sha256',
  'rapier-selftest-report',
]);
const productionSuiteDeclarations = [...html.matchAll(
  /\b(?:async\s+)?function\s+(_(?:selftest|rapierSelftest)[\w$]*)|\b(?:const|let|var)\s+(_selftest[\w$]*)/g)]
  .map(found => found[1] || found[2]);
const suiteCaseRegistrations = (suiteSource.match(/\bresults\.push\s*\(/g) || []).length;
const selftestBackdoorMutations = Object.freeze([
  'new URLSearchParams(location.search).get("selftest");',
  'new URLSearchParams(location.search)["has"]("selftest");',
  'const params = new URLSearchParams(location.search); params["get"]("selftest");',
  'location["search"].includes("?selftest=1");',
  'new URL(location.href + ("?" + "self" + "test=1"));',
]);
const selftestBackdoorResults = selftestBackdoorMutations.map(source => ({
  source, evidence: productionQueryFacts(source).selftest,
}));
check('production has one inert qualification seam and no embedded suite or query bootstrap',
  Boolean(selftestRunner) && typeof qualificationSeam === 'string'
    && html.split(qualificationSeam).length - 1 === 1
    && !html.includes(payloadBegin) && !html.includes(payloadEnd)
    && !html.includes('_RAPIER_QUALIFICATION_BINDING')
    && productionSuiteDeclarations.length === 0
    && suiteRuntimeSentinels.every(marker => suiteSource.includes(marker) && !html.includes(marker))
    && !html.includes(suiteSource)
    && !readParameters.has('selftest')
    && productionQuery.selftest.length === 0
    && selftestBackdoorResults.every(row => row.evidence.length > 0)
    && suiteCaseRegistrations === selftestRunner.EXPECTED_TOTAL + selftestRunner.EXPECTED_SKIP
    && selftestRunner._qualificationTarget(
      'https://rapier.website/rapier.html?selftest=1&preview=phone#qualification')
      === 'https://rapier.website/rapier.html?preview=phone',
  JSON.stringify({ error: selftestRunnerError, seamCount: qualificationSeam
    ? html.split(qualificationSeam).length - 1 : 0,
  productionSuiteDeclarations, suiteCaseRegistrations,
  expectedCases: selftestRunner
    ? selftestRunner.EXPECTED_TOTAL + selftestRunner.EXPECTED_SKIP : null,
  sentinelsInProduction: suiteRuntimeSentinels.filter(marker => html.includes(marker)),
  selftestQueryRead: readParameters.has('selftest'),
  selftestEvidence: productionQuery.selftest,
  hostileScanner: selftestBackdoorResults }));

const webMcpHarnessSource = fs.readFileSync(path.join(root, 'qualification', 'webmcp-test.js'), 'utf8');
const suiteTopologyClaims = [
  ['WEBMCP-CHALLENGE.md', challenge],
  ['qualification/webmcp-test.js', webMcpHarnessSource],
];
const staleSuiteTopology = suiteTopologyClaims.filter(([, source]) =>
  /\bembedded\s+(?:browser\s+)?suite\b|\bsuite(?:'s)?[^.\n]{0,80}\binside\s+the\s+engine\b/i.test(source));
check('release evidence names the qualification-injected suite, never an embedded product suite',
  staleSuiteTopology.length === 0
    && suiteTopologyClaims.every(([, source]) => /\bqualification[- ]injected\s+suite\b/i.test(source)),
  JSON.stringify({ stale: staleSuiteTopology.map(([name]) => name),
    missingInjectedName: suiteTopologyClaims
      .filter(([, source]) => !/\bqualification[- ]injected\s+suite\b/i.test(source))
      .map(([name]) => name) }));

let willRefusal = null;
let normalizeMutation = null;
let applyEditsProjection = null;
let willRefusalProbeError = '';
try {
  willRefusal = vm.runInNewContext(functionSource('_rapierWillRefusal')
    + '\n;_rapierWillRefusal;');
  normalizeMutation = vm.runInNewContext(`(function(){
      const rapier = { identity: { authority: 'doc' },
        revision: { settled: 7, generation: 8 } };
      ${functionSource('_rapierNormalizeMutationResult')}
      return _rapierNormalizeMutationResult;
    })()`);
  applyEditsProjection = evaluateArrow(
    webMcpToolPropertySource('document.apply_edits', 'result'));
} catch (error) {
  willRefusalProbeError = String((error && error.stack) || error);
}
const rawMissingLaw = { outcome: 'refused', reason: 'document_law', editIndex: 0 };
const normalizedMissingLaw = normalizeMutation ? normalizeMutation(rawMissingLaw) : null;
const normalizedKeepLaw = normalizeMutation
  ? normalizeMutation({ ...rawMissingLaw, law: 'keep' }) : null;
const projectedMissingLaw = applyEditsProjection ? applyEditsProjection(rawMissingLaw) : null;
const projectedKeepLaw = applyEditsProjection
  ? applyEditsProjection({ ...rawMissingLaw, law: 'keep' }) : null;
const refusalSamples = willRefusal ? [
  willRefusal(0, 'edit'), willRefusal(1, 'append'),
  willRefusal(2, 'keep'), willRefusal(3, 'invented'),
] : [];
const documentLawReasonLiterals = [...html.matchAll(/reason:\s*['"]document_law['"]/g)];
const applyToolNode = webMcpToolNodes.get('document.apply_edits');
const applyDescription = staticString(objectProperty(applyToolNode, 'description')?.value) || '';
const applyOperation = operation('document.apply_edits');
const applyResultSchema = objectBranch(applyOperation && applyOperation.result);
check('document_law has one law-bearing producer and no adapter invents a missing law',
  willRefusalProbeError === '' && refusalSamples.length === 4
    && refusalSamples.every((sample, index) => sample.outcome === 'refused'
      && sample.reason === 'document_law' && sample.editIndex === index
      && sample.law === ['edit', 'append', 'keep', 'keep'][index])
    && documentLawReasonLiterals.length === 1
    && functionSource('_rapierWillRefusal').includes("reason: 'document_law'")
    && a31CallCount(html, '_rapierWillRefusal') > 1
    && !html.includes('_rapierWillDocumentLaw')
    && !suiteSource.includes('_rapierWillDocumentLaw')
    && normalizedMissingLaw && normalizedMissingLaw.reason === 'document_law'
    && !Object.prototype.hasOwnProperty.call(normalizedMissingLaw, 'law')
    && normalizedKeepLaw && normalizedKeepLaw.law === 'keep'
    && projectedMissingLaw && projectedMissingLaw.reason === 'document_law'
    && !Object.prototype.hasOwnProperty.call(projectedMissingLaw, 'law')
    && projectedKeepLaw && projectedKeepLaw.law === 'keep'
    && applyResultSchema && applyResultSchema.properties && applyResultSchema.properties.law
    && JSON.stringify(applyResultSchema.properties.law.enum)
      === JSON.stringify(['edit', 'append', 'keep'])
    && !((applyResultSchema.required || []).includes('law'))
    && applyDescription.length > 0 && applyDescription.length <= 460
    && applyDescription.includes('/WILL-1.md')
    && webMcpWireLength && webMcpWireLength(projectedKeepLaw) <= 1500,
  JSON.stringify({ error: willRefusalProbeError, reasonLiterals: documentLawReasonLiterals.length,
    helperCalls: a31CallCount(html, '_rapierWillRefusal'), refusalSamples,
    normalizedMissingLaw, normalizedKeepLaw, projectedMissingLaw, projectedKeepLaw,
    descriptorLength: applyDescription.length,
    staleSuiteSymbol: suiteSource.includes('_rapierWillDocumentLaw') }));

/* One code stood for four facts, and a reader could not tell a human refusal from a batch that
   never reached one. The split is only real while the producer, the canonical receipt, the
   declared schema, the descriptor and the agent guide all name the same closed words — five
   owners of one vocabulary is exactly how the next drift starts, so they are compared here. */
const WILL_RULES = ['law_violated', 'marker_span_touched', 'marker_sequence_mismatch',
  'before_faulted', 'result_faulted'];
const WILL_REVIEWS = ['allowed', 'batched', 'unavailable', 'unanswered', 'declined', 'expired'];
/* The map's KEY set, not only its values: an honest default protects an ending nobody listed,
   and protects nothing at all against a listed one. `unattended` is a live settle reason, so one
   line mapping it to `declined` would report a person's refusal for a hold nobody was at — the
   defect this vocabulary exists to remove — while every value stayed inside the enum. A new
   reason must therefore be judged here, in the open, rather than absorbed. */
const WILL_REVIEW_ENDINGS = { kept: 'declined', closed: 'declined',
  timeout: 'unanswered', abandoned: 'unanswered',
  invalidated: 'expired', document_changed: 'expired' };
/* The other direction of the coherence check. Every word the kernel produces is spoken below;
   this is the census that no word is spoken which the kernel cannot produce. Membership is
   decided by the artifact's own data — the registered operations, the law enum, the two closed
   vocabularies — never by a hand-kept list of blessed strings; only the result's own field names
   are named here, because they exist nowhere else as data. */
const WILL_RESULT_FIELDS = ['document_law', 'rule', 'law', 'region', 'faults', 'review',
  'yielded', 'continuation', 'read_context', 'before', 'after', 'outcome', 'reason', 'intent',
  'isError'];
/* Every outcome word this artifact declares, read out of the manifest: the union of the
   operations' own result enums. Membership is the artifact's data, never a blessed list. */
const declaredOutcomeWords = [...new Set(operations.flatMap(entry => {
  const shape = objectBranch(entry && entry.result);
  const outcome = shape && shape.properties && shape.properties.outcome;
  return (outcome && outcome.enum) || [];
}))].sort();
/* Every refusal reason the kernel actually produces, read out of the kernel. A guide may name
   a reason only where a producer of it exists; a word no arm can emit is a branch a model spends
   on nothing. */
const producedReasons = [...new Set([
  ...[...html.matchAll(/reason: '([a-z0-9_]+)'/g)].map(match => match[1]),
  /* The two text-admission adapters answer WITH the reason rather than through a `reason` key,
     so their own returns are read the same way — out of the artifact. They are twins by design:
     one door hands text to the editor, the other hands it to a comparison, and both name the
     same two facts apart. A third door of this shape belongs on this line, not in a guide the
     census would then have to be widened by hand to admit. */
  ...['_rapierAdmitAgentText', '_rapierCompareAdmitAgentText'].flatMap(adapter =>
    [...functionSource(adapter).matchAll(/'([a-z0-9_]{4,})'/g)].map(match => match[1])),
  ...[...html.matchAll(/_rapierAgentTextResult\('[a-z_]+', '([a-z0-9_]+)'\)/g)]
    .map(match => match[1]),
])];
/* THE SECOND CLOSED VOCABULARY THE GUIDE SPEAKS. The document's chain and the person's chain are
   two chains of three, and the guide teaches both, so a census that knew only the first would
   read every word of the second as a stray. The words themselves come from the artifact's own
   `_RAPIER_POSTURES`, never from a list beside this one; only the refusal reasons, the field and
   the wait event it introduces are named here, for the same reason the law's result fields are —
   they exist nowhere else as data. */
let POSTURE_WORDS = [];
try {
  POSTURE_WORDS = vm.runInNewContext(
    (html.match(/const _RAPIER_POSTURES = Object\.freeze\(\[[\s\S]*?\]\);/) || [''])[0]
      + '\n;_RAPIER_POSTURES;') || [];
} catch (_) { POSTURE_WORDS = []; }
const POSTURE_RESULT_FIELDS = ['posture', 'changes_not_shown', 'yourChangesNotShown',
  'posture_ask', 'delivery', 'event: "delivery"', 'review: "unavailable"'];
/* THE FIELDS THE DOORS DECLARE, read out of the manifest rather than blessed beside this line.
   A guide may name an input field only where an operation declares one by that name, which is the
   same rule the outcome words and the reason literals already keep: membership is the artifact's
   own data, so a field the guide teaches and no door takes fails the release. */
const declaredInputFields = [...new Set(operations.flatMap(entry =>
  Object.keys((entry && entry.input && entry.input.properties) || {})))].sort();
/* THE PERSON'S LINE, READ OUT OF THE DOOR THAT DECLARES IT. A line the person spoke with no call
   parked is held in session memory and reported by one door, so the guide's right to name the two
   fields is derived from that door's own declaration rather than blessed beside this line: the two
   names are pinned here, but they are admitted only while `document.get_context` still declares
   them, and the nested record's keys come from the declaration alone. A field the guide teaches and
   this door does not declare fails the release, which is the same rule the input fields keep. */
const messageResultFields = (() => {
  const shape = ((operations.find(entry => entry && entry.name === 'document.get_context') || {})
    .result || {}).properties || {};
  return [...new Set(['pendingMessages', 'latestMessage'].filter(key => shape[key])
    .concat(Object.keys((shape.latestMessage || {}).properties || {})))];
})();
const strayVocabulary = text => [...new Set([...String(text).matchAll(/`([^`\n]+)`/g)]
  .map(match => match[1]))].filter(word =>
  !WILL_RULES.includes(word) && !WILL_REVIEWS.includes(word)
    && !['edit', 'append', 'keep'].includes(word)
    && !WILL_RESULT_FIELDS.includes(word)
    && !declaredOutcomeWords.includes(word)
    && !producedReasons.includes(word)
    && !POSTURE_WORDS.includes(word)
    && !POSTURE_RESULT_FIELDS.includes(word)
    && !declaredInputFields.includes(word)
    && !messageResultFields.includes(word)
    && !webMcpToolNodes.has(word)
    && !word.startsWith('<!--')
    && !/^[A-Z_/]/.test(word));
/* The word for a hold nobody saw is chosen by one closed map with an honest default, so a new
   settle reason cannot silently report a human refusal that never happened. */
let willReviewEnd = null;
try {
  willReviewEnd = vm.runInNewContext(
    (html.match(/const _RAPIER_WILL_REVIEW_END = Object\.freeze\(\{[\s\S]*?\}\);/) || [''])[0]
      + '\n;_RAPIER_WILL_REVIEW_END;');
} catch (_) { willReviewEnd = null; }
/* Every call of the identity commit except its own definition, and whether the replacement
   surfaces — which close the Compare a live review always holds — are committed just before it. */
const reviewOpenSource = functionSource('_rapierWillReviewOpen');
const identityCommitCalls = [...html.matchAll(/_rapierCommitDocumentIdentity\(/g)].slice(1)
  .map(match => html.slice(Math.max(0, match.index - 900), match.index)
    .includes('_rapierCommitDocumentReplacementSurfaces()'));
const detailedRefusal = willRefusal
  ? willRefusal(4, 'keep', { rule: 'law_violated', region: 2, review: 'declined' }) : null;
const projectedDetail = applyEditsProjection && detailedRefusal
  ? applyEditsProjection(normalizeMutation(detailedRefusal)) : null;
const undoResultSchema = objectBranch(
  operation('document.undo_agent_change') && operation('document.undo_agent_change').result);
const normalizeSource = functionSource('_rapierNormalizeMutationResult');
const schemaWords = schema => schema && schema.properties
  ? { rule: schema.properties.rule && schema.properties.rule.enum,
    review: schema.properties.review && schema.properties.review.enum,
    region: schema.properties.region && schema.properties.region.type }
  : null;
const applyWords = schemaWords(applyResultSchema);
const undoWords = schemaWords(undoResultSchema);
check('the law refusal names one closed vocabulary everywhere it is spoken',
  detailedRefusal && detailedRefusal.rule === 'law_violated' && detailedRefusal.region === 2
    && detailedRefusal.review === 'declined' && detailedRefusal.law === 'keep'
    /* Absent, never null: a field spelling out "not applicable" is one the agent learns to skip. */
    && normalizedMissingLaw
    && !['rule', 'region', 'review'].some(key =>
      Object.prototype.hasOwnProperty.call(normalizedMissingLaw, key))
    && projectedDetail && projectedDetail.rule === 'law_violated'
    && projectedDetail.region === 2 && projectedDetail.review === 'declined'
    && webMcpWireLength && webMcpWireLength(projectedDetail) <= 1500
    && WILL_RULES.every(word => normalizeSource.includes("'" + word + "'"))
    && WILL_REVIEWS.every(word => normalizeSource.includes("'" + word + "'"))
    && applyWords && JSON.stringify(applyWords.rule) === JSON.stringify(WILL_RULES)
    && JSON.stringify(applyWords.review) === JSON.stringify(WILL_REVIEWS)
    && applyWords.region === 'integer'
    && undoWords && JSON.stringify(undoWords.rule) === JSON.stringify(WILL_RULES)
    && JSON.stringify(undoWords.review) === JSON.stringify(WILL_REVIEWS)
    && !['rule', 'region', 'review'].some(key =>
      (applyResultSchema.required || []).includes(key)
        || (undoResultSchema.required || []).includes(key))
    /* The words reach the model twice: in the descriptor it always reads, and in the guide the
       descriptor's own link sends it to. Neither may name a word the kernel cannot produce —
       asserted both ways, because a subset test in one direction lets an invented word through
       exactly where a model would spend a branch on it. */
    && applyDescription.includes('`rule`') && applyDescription.includes('`review`')
    && WILL_REVIEWS.every(word => applyDescription.includes('`' + word + '`'))
    && WILL_RULES.every(word => agentsGuide.includes('`' + word + '`'))
    && WILL_REVIEWS.every(word => agentsGuide.includes('`' + word + '`'))
    && strayVocabulary(applyDescription).length === 0
    && strayVocabulary(agentsGuide).length === 0
    /* The person's chain is exactly three words and the guide teaches every one of them: a
       fourth posture, or a word the artifact stopped producing, fails here rather than reaching
       a model as an option that does not exist. */
    && POSTURE_WORDS.length === 3
    && POSTURE_WORDS.every(word => agentsGuide.includes('`' + word + '`'))
    /* The queued line is two fields and one record of three, and the guide teaches every one of
       them: a field the door stops declaring, or one the guide stops naming, fails here. */
    && messageResultFields.length === 5
    && messageResultFields.every(word => agentsGuide.includes('`' + word + '`'))
    /* An honest default protects an ending nobody listed, and nothing at all against a listed
       one, so the map is pinned key for key rather than by its value set alone. */
    && willReviewEnd
    && JSON.stringify(willReviewEnd) === JSON.stringify(WILL_REVIEW_ENDINGS)
    && Object.values(willReviewEnd).every(word => WILL_REVIEWS.includes(word))
    && !Object.values(willReviewEnd).includes('unavailable')
    && /_RAPIER_WILL_REVIEW_END\[decision\.reason\] \|\| 'unavailable'/.test(applyEditsSource)
    && !/review: 'declined'/.test(applyEditsSource)
    /* One settle for a document that moved was deleted rather than mapped, because every caller
       of the identity commit closes the surface a live review always holds open before reaching
       it. The deletion is only true while that remains so, so the guard is what is pinned — a
       new, unguarded caller has to be judged instead of quietly reviving a dead branch. */
    && identityCommitCalls.length >= 4 && identityCommitCalls.every(guarded => guarded)
    && !/_rapierWillReviewSettle/.test(functionSource('_rapierCommitDocumentIdentity'))
    /* A hidden document ends a hold two ways and they are not one fact: refusing to open reached
       nobody, abandoning an open one left a proposal shown and unanswered. One reason word for
       both is how a wire starts lying again, so the two producers are pinned apart. */
    && /reason: 'unattended'/.test(reviewOpenSource)
    && /_rapierWillReviewSettle\(pending, false, 'abandoned'/.test(reviewOpenSource)
    && !/_rapierWillReviewSettle\(pending, false, 'unattended'/.test(html),
  JSON.stringify({ detailedRefusal, projectedDetail, applyWords, undoWords,
    descriptorLength: applyDescription.length, willReviewEnd, identityCommitCalls,
    strayInDescriptor: strayVocabulary(applyDescription),
    strayInGuide: strayVocabulary(agentsGuide), messageResultFields,
    guideNamesEveryWord: WILL_RULES.concat(WILL_REVIEWS)
      .filter(word => !agentsGuide.includes('`' + word + '`')) }));

/* ONE LANGUAGE ON THE WIRE. WILL-1.md's host obligation is that every door a host offers an
   agent reports this standard's outcome family in this standard's words, and never a second word
   for the same fact. `rejected` was that second word: it stood for the document's own law and
   for a request the door could not read at once, so neither an agent nor a reader holding the
   standard could tell those two apart. The family is closed at the three canonical receipts,
   declared per operation in the manifest, guarded at the WebMCP envelope, and spoken in the
   guide — five owners of one vocabulary, which is why they are compared here. The two words for
   facts WILL-1.md does not define are this host's own and are pinned by name, because a host
   that lets a third join them quietly has stopped speaking a portable language. */
const WILL_OUTCOMES = ['applied', 'refused', 'invalid'];
const HOST_OUTCOMES = ['conflict', 'target_gone'];
const REFUSAL_WORDS = WILL_OUTCOMES.slice(1).concat(HOST_OUTCOMES).sort();
const ERROR_WORDS = REFUSAL_WORDS.concat('failed').sort();
const setWords = source => {
  const match = String(source).match(/new Set\(\[([^\]]*)\]\)/);
  return match ? match[1].split(',').map(word => word.trim().replace(/'/g, '')) : [];
};
const receiptFamilies = ['_rapierNormalizeMutationResult', '_rapierNormalizeReadContextResult',
  '_rapierNormalizeWaitResult'].map(name => {
  const source = functionSource(name);
  return { name, words: setWords(source),
    /* A receipt that named no outcome must never read as a landed write. */
    fallback: /outcome: allowed\.has\(value\.outcome\) \? value\.outcome : 'refused'/.test(source) };
});
const envelopeArms = setWords(
  (html.match(/const _RAPIER_WEBMCP_REFUSAL_ARMS = new Set\(\[[^\]]*\]\)/) || [''])[0]).sort();
const declaredRefusalWords = declaredOutcomeWords
  .filter(word => REFUSAL_WORDS.includes(word) || word === 'rejected');
const intentOnTheDoor = /`intent` is data, never a prompt/.test(applyDescription);
/* A PROJECTION MAY NOT REWRITE AN OUTCOME ITS OPERATION ALREADY COMPUTED. The census in the
   harness and the closure check below both test SET MEMBERSHIP, and a legal word used for the
   wrong fact passes set membership perfectly: `document.open_text`'s door answered every content
   refusal `refused` for as long as this file has existed, while the operation behind it computed
   `invalid`, and no closure check could see it. So the projections that receive an outcome are
   run here over a receipt carrying each word their operation declares, and must hand back the
   same word. A door that synthesises its outcome instead (compare, get_outline, find — their
   canonical receipts carry none) is judged where it can only be judged: driven, at the wire, by
   the harness's arm table. */
/* A door either RECEIVES its outcome from the operation behind it or SYNTHESISES one from that
   receipt's own fields. Only the first kind can rewrite a computed word, and membership is read
   off the projection's own source — whether it reads `receipt.outcome` at all — never from a list
   kept here. The synthesising doors (compare, get_outline, find, read_context, get_context) are
   judged where they can only be judged: driven at the wire by the harness's arm table. */
const OUTCOME_BEARING_TOOLS = [...webMcpToolNodes.keys()].filter((name) => {
  const shape = objectBranch(operation(name) && operation(name).result);
  if (!(shape && shape.properties && shape.properties.outcome
    && Array.isArray(shape.properties.outcome.enum))) return false;
  return webMcpToolPropertySource(name, 'result').includes('receipt.outcome');
});
/* The projections run with the artifact's OWN helpers, lifted whole rather than stubbed: a stub
   is a second implementation, and a second implementation is exactly what could hide the
   substitution this check exists to catch. The closure is resolved by asking the failure which
   name it wanted and lifting that one too, so the set is discovered from the code rather than
   kept by hand and left behind by the next projection that needs one more. */
function liftedDeclaration(identifier) {
  const asFunction = functionSource(identifier);
  if (asFunction) return asFunction;
  const asConst = html.match(new RegExp('\\nconst ' + identifier + ' = [^\\n]*;'));
  return asConst ? asConst[0] : '';
}
function projectionOf(name) {
  let prelude = '';
  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      const built = evaluateArrow(webMcpToolPropertySource(name, 'result'), prelude);
      built({ outcome: 'probe', reason: 'probe' }, {});
      return { built, prelude };
    } catch (error) {
      const missing = /^([A-Za-z_$][\w$]*) is not defined$/.exec(String(error && error.message || ''));
      if (!missing) {
        /* It ran and threw on the receipt's own shape, not on a missing name: that is the
           projection's business, and the word test below decides it. */
        return { built: evaluateArrow(webMcpToolPropertySource(name, 'result'), prelude), prelude };
      }
      const lifted = liftedDeclaration(missing[1]);
      if (!lifted) return { built: null, missing: missing[1] };
      prelude += '\n' + lifted;
    }
  }
  return { built: null, missing: 'unresolved closure' };
}
const rewrittenOutcomes = [];
for (const name of OUTCOME_BEARING_TOOLS) {
  const shape = objectBranch(operation(name).result);
  const resolved = projectionOf(name);
  const projection = resolved.built;
  if (!projection) { rewrittenOutcomes.push(name + ': ' + (resolved.missing || 'no result projection')); continue; }
  for (const word of shape.properties.outcome.enum) {
    /* A receipt shaped only enough to carry the word: every projection reads `outcome` off its
       own receipt, and one that cannot keep it without more is the defect this looks for. */
    let spoke;
    try { spoke = projection({ outcome: word, reason: 'probe', opened: word === 'opened' }, {}); }
    catch (error) { rewrittenOutcomes.push(name + ' ' + word + ': threw ' + String(error && error.message)); continue; }
    if (!spoke || spoke.outcome !== word) {
      rewrittenOutcomes.push(name + ': ' + word + ' left as ' + JSON.stringify(spoke && spoke.outcome));
    }
  }
}
check('no WebMCP projection rewrites an outcome its own operation computed',
  OUTCOME_BEARING_TOOLS.length >= 8 && rewrittenOutcomes.length === 0,
  JSON.stringify({ tools: OUTCOME_BEARING_TOOLS, rewritten: rewrittenOutcomes }));

check('cut 1: one outcome family on every door, and never a second word for one fact',
  !html.includes("outcome: 'rejected'")
    && JSON.stringify(envelopeArms) === JSON.stringify(ERROR_WORDS)
    && JSON.stringify(declaredRefusalWords) === JSON.stringify(REFUSAL_WORDS)
    && receiptFamilies.every(entry => entry.fallback && !entry.words.includes('rejected')
      && REFUSAL_WORDS.every(word => entry.words.includes(word)))
    && WILL_OUTCOMES.concat(HOST_OUTCOMES).every(word => agentsGuide.includes('`' + word + '`'))
    && !agentsGuide.includes('`rejected`')
    /* Intent is the person writing to whoever reads the document, so the door that spends it
       says once that it is data. The guide says it at length; a model reads the door always. */
    && intentOnTheDoor && agentsGuide.includes('untrusted document data'),
  JSON.stringify({ shippedRejected: html.includes("outcome: 'rejected'"), envelopeArms,
    declaredRefusalWords, declaredOutcomeWords, receiptFamilies, intentOnTheDoor,
    guideMissing: WILL_OUTCOMES.concat(HOST_OUTCOMES)
      .filter(word => !agentsGuide.includes('`' + word + '`')) }));

function refusesQualification(action) {
  try { action(); return false; } catch (_) { return true; }
}
const injectionBody = selftestInjection && selftestInjection.body;
const injectedHtml = selftestInjection && selftestInjection.html || '';
const injectedBinding = selftestInjection
  ? 'const _RAPIER_QUALIFICATION_BINDING = Object.freeze(' + JSON.stringify({
    productionSha256: selftestInjection.productionSha256,
    suiteSha256: selftestInjection.suiteSha256,
  }) + ');' : '';
const directSuiteSha = suiteSource
  ? crypto.createHash('sha256').update(Buffer.from(suiteSource, 'utf8')).digest('hex') : '';
const cleanBinding = selftestRunner && selftestInjection
  ? selftestRunner._evaluateBinding({
    productionSha256: selftestInjection.productionSha256,
    suiteSha256: selftestInjection.suiteSha256,
  }, selftestInjection) : ['runner unavailable'];
const badBinding = selftestRunner && selftestInjection
  ? selftestRunner._evaluateBinding({
    productionSha256: '0'.repeat(64), suiteSha256: 'f'.repeat(64),
  }, selftestInjection) : [];
check('runner injection is one-shot, reversible, and bound to both exact source digests',
  Boolean(selftestRunner && selftestInjection && injectionBody)
    && Buffer.isBuffer(injectionBody)
    && selftestInjection.productionBytes === Buffer.byteLength(html, 'utf8')
    && selftestInjection.productionSha256 === shippedSha
    && selftestInjection.suiteBytes === Buffer.byteLength(suiteSource, 'utf8')
    && selftestInjection.suiteSha256 === selftestRunner.SELFTEST_SHA256
    && selftestInjection.suiteSha256 === directSuiteSha
    && selftestInjection.injectedBytes === injectionBody.length
    && selftestRunner.removeSelftest(injectionBody).equals(fs.readFileSync(htmlPath))
    && injectedHtml.split(payloadBegin).length - 1 === 1
    && injectedHtml.split(payloadEnd).length - 1 === 1
    && includesInOrder(injectedHtml, [qualificationSeam, payloadBegin,
      injectedBinding, suiteSource, payloadEnd])
    && cleanBinding.length === 0 && badBinding.length === 2
    && refusesQualification(() => selftestRunner.injectSelftest(injectionBody))
    && refusesQualification(() => selftestRunner.injectSelftest(html.replace(qualificationSeam, '')))
    && refusesQualification(() => selftestRunner.injectSelftest(
      html.replace(qualificationSeam, qualificationSeam + qualificationSeam)))
    && refusesQualification(() => selftestRunner.injectSelftest(Buffer.from([0xc3, 0x28]))),
  JSON.stringify({ error: selftestRunnerError,
    production: selftestInjection && selftestInjection.productionSha256,
    shippedSha, suite: selftestInjection && selftestInjection.suiteSha256,
    directSuiteSha, bytes: selftestInjection && {
      production: selftestInjection.productionBytes,
      suite: selftestInjection.suiteBytes,
      injected: selftestInjection.injectedBytes,
    }, cleanBinding, badBinding }));

const injectedScripts = [];
const injectedScriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let injectedScriptMatch;
while ((injectedScriptMatch = injectedScriptPattern.exec(injectedHtml))) {
  injectedScripts.push({ attrs: injectedScriptMatch[1], body: injectedScriptMatch[2] });
}
const injectedTokenizerBlocks = tokenizerClosure(injectedHtml);
const injectedParseFailures = [];
let injectedManifestCount = 0;
for (const [index, script] of injectedScripts.entries()) {
  try {
    if (/type="application\/speedracer-app\+json"/.test(script.attrs)) {
      JSON.parse(script.body);
      injectedManifestCount += 1;
    } else if (storedVendor(script)) {
      // gzip+base64 at rest — not JavaScript text; verified elsewhere by digest, not by parsing.
    } else {
      new vm.Script(script.body, { filename: `injected-rapier.html#script-${index + 1}` });
    }
  } catch (error) {
    injectedParseFailures.push(`script ${index + 1}: ${String(error && error.message || error)}`);
  }
}
check('the transformed response remains browser-tokenizer closed and every injected script parses',
  injectedScripts.length === scripts.length && injectedManifestCount === 1
    && injectedTokenizerBlocks.length === injectedScripts.length
    && injectedTokenizerBlocks.every(block => block.closed)
    && injectedParseFailures.length === 0,
  JSON.stringify({ productionScripts: scripts.length, injectedScripts: injectedScripts.length,
    tokenizerBlocks: injectedTokenizerBlocks.length,
    unclosed: injectedTokenizerBlocks.filter(block => !block.closed),
    manifestCount: injectedManifestCount, parseFailures: injectedParseFailures }));

const qualificationHeaderInput = {
    'Content-Encoding': 'gzip', 'content-length': '17', 'Content-MD5': 'old',
    Digest: 'sha-256=old', ETag: '"old"', 'CONTENT-DIGEST': 'sha-256=:old:',
    'Repr-Digest': 'sha-256=:old:', 'content-range': 'bytes 0-16/17',
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=60', 'Content-Security-Policy': "default-src 'self'",
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1', 'Permissions-Policy': 'camera=()', 'X-Trace': 'kept',
};
const qualificationHeaders = selftestRunner && selftestRunner.qualificationResponseHeaders
  ? selftestRunner.qualificationResponseHeaders(qualificationHeaderInput) : {};
const strippedHeaders = ['content-encoding', 'content-length', 'content-md5', 'digest', 'etag',
  'content-digest', 'repr-digest', 'content-range'];
const preservedHeaders = ['Content-Type', 'Cache-Control', 'Content-Security-Policy',
  'Cross-Origin-Embedder-Policy', 'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy', 'Origin-Agent-Cluster', 'Permissions-Policy', 'X-Trace'];
check('runner transforms only the main document and preserves non-representation response headers',
  strippedHeaders.every(name => !Object.keys(qualificationHeaders)
    .some(actual => actual.toLowerCase() === name))
    && preservedHeaders.every(name => Object.prototype.hasOwnProperty.call(qualificationHeaders, name))
    && Object.keys(qualificationHeaderInput).length === strippedHeaders.length + preservedHeaders.length
    && matchesAll(desktopRunner, [
      /request\.isNavigationRequest\s*\(\s*\)/,
      /request\.resourceType\s*\(\s*\)\s*!==\s*['"]document['"]/,
      /request\.frame\s*\(\s*\)\s*!==\s*page\.mainFrame\s*\(\s*\)/,
      /responseBody\.equals\s*\(\s*localProduction\s*\)/,
      /qualificationResponseHeaders\s*\(\s*response\.headers\s*\(\s*\)\s*\)/,
      /route\.fulfill\s*\(\s*\{\s*response\s*,\s*headers\s*,\s*body:\s*injection\.body\s*\}\s*\)/,
    ])
    && includesInOrder(desktopRunner, [
      'const responseBody = await response.body();',
      'if (!responseBody.equals(localProduction))',
      'injection = injectSelftest(responseBody);',
      'await route.fulfill({ response, headers, body: injection.body });',
    ]),
  JSON.stringify({ headers: qualificationHeaders }));

/* The origin's explicit `/agents` route must stay a real route after a service worker controls
   the page. Execute the guard expression from the shipped function itself: duplicating its
   pathname rule in this audit would only prove two copies agree. The probe replaces only the
   asynchronous cache tail with a success sentinel, leaving the production origin/path guard
   byte-for-byte in charge of every case. */
const serviceWorkerPath = path.join(root, 'sw.js');
const serviceWorkerSource = fs.readFileSync(serviceWorkerPath, 'utf8');
const shellUrlsLiteral = /const\s+SHELL_URLS\s*=\s*(\[[\s\S]*?\]);/.exec(serviceWorkerSource);
let shellUrls = [];
let shellReleaseRows = [];
let shellReleaseDigest = '';
let shellReleaseError = '';
try {
  if (!shellUrlsLiteral) throw new Error('SHELL_URLS literal is missing');
  shellUrls = vm.runInNewContext(shellUrlsLiteral[1]);
  if (!Array.isArray(shellUrls) || shellUrls.length === 0) throw new Error('SHELL_URLS is empty');
  if (new Set(shellUrls).size !== shellUrls.length) throw new Error('SHELL_URLS has duplicates');
  shellReleaseRows = shellUrls.map(relative => {
    if (typeof relative !== 'string' || !/^\.\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(relative)
        || relative.includes('..') || relative.includes('\\')) {
      throw new Error('unsafe shell member ' + JSON.stringify(relative));
    }
    const member = fs.readFileSync(path.join(root, relative.slice(2)));
    return `${relative}\t${member.length}\t${crypto.createHash('sha256').update(member).digest('hex')}`;
  });
  shellReleaseDigest = crypto.createHash('sha256')
    .update(shellReleaseRows.join('\n')).digest('hex');
} catch (error) {
  shellReleaseError = String((error && error.message) || error);
}
const shellReleasePins = [...serviceWorkerSource.matchAll(
  /const\s+SHELL_RELEASE_SHA256\s*=\s*['"]([0-9a-f]{64})['"]\s*;/g)];
check('service-worker shell membership is pinned to the exact released bytes',
  shellReleaseError === '' && shellReleasePins.length === 1
    && shellReleasePins[0][1] === shellReleaseDigest,
  JSON.stringify({ error: shellReleaseError, shellUrls, rows: shellReleaseRows,
    declared: shellReleasePins.map(match => match[1]), computed: shellReleaseDigest }));

const cachedNavigationSource = functionSourceFrom(serviceWorkerSource, 'cachedNavigationResponse');
const cacheTail = cachedNavigationSource.indexOf('const cache = await shellCache();');
let shellDoorProbe = null;
let serviceWorkerProbeError = '';
try {
  new vm.Script(serviceWorkerSource, { filename: 'sw.js' });
  if (cacheTail < 0) throw new Error('cachedNavigationResponse has no cache tail');
  const executableGuard = cachedNavigationSource.slice(0, cacheTail)
    .replace(/^async\s+function/, 'function') + 'return true;\n}';
  shellDoorProbe = vm.runInNewContext(executableGuard + '\n;cachedNavigationResponse;', {
    URL,
    SHELL_ROOT_URL: 'https://rapier.website/sub/',
    SHELL_PAGE_URL: 'https://rapier.website/sub/rapier.html',
  });
} catch (error) {
  serviceWorkerProbeError = String((error && error.stack) || error);
}
const shellDoorCases = [
  ['https://rapier.website/sub/', true],
  ['https://rapier.website/sub/?demo=1', true],
  ['https://rapier.website/sub/rapier.html', true],
  ['https://rapier.website/sub/rapier.html?welcome=1', true],
  ['https://rapier.website/sub/agents', false],
  ['https://rapier.website/sub/agents.md', false],
  ['https://rapier.website/sub/typo', false],
  ['https://rapier.website/sub/private/file', false],
  ['https://rapier.website/submarine/', false],
  ['https://other.example/sub/', false],
];
const shellDoorResults = shellDoorCases.map(([url, expected]) => ({
  url, expected, observed: typeof shellDoorProbe === 'function'
    ? shellDoorProbe({ url }) === true : null,
}));
check('service-worker offline fallback accepts only the root and exact artifact doors',
  serviceWorkerProbeError === ''
    && shellDoorResults.every(row => row.expected === row.observed)
    && matchesAll(cachedNavigationSource, [
      /requested\.origin\s*!==\s*root\.origin/,
      /requested\.pathname\s*!==\s*root\.pathname/,
      /requested\.pathname\s*!==\s*page\.pathname/,
      /return\s+null/,
    ]),
  JSON.stringify({ error: serviceWorkerProbeError, cases: shellDoorResults }));

check('the off-origin observer compares parsed origins, never a URL prefix',
  /url\.origin\s*===\s*SELF_ORIGIN/.test(desktopRunner)
    && !/\bstartsWith\(\s*(?:origin|SELF_ORIGIN)\b/.test(desktopRunner)
    && !/startsWith\('blob:'\s*\+/.test(desktopRunner),
  'qualification/run-selftest2.js still admits requests by URL prefix');

const computedTreeSha = publicTreeSha256();
check('release receipt binds the exact published tree, not just rapier.html',
  Boolean(receipt) && receipt.publicTreeSha256 === computedTreeSha,
  receipt ? JSON.stringify({ receipt: receipt.publicTreeSha256, computed: computedTreeSha })
    : 'qualification/RECEIPT.json is missing or does not parse');

process.stdout.write(`\n${checks - failures.length} pass / ${failures.length} fail\n`);
if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
}
