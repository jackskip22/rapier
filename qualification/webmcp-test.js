/* Drives Rapier through a competition-informed test double by default. --native-contract
   installs no shim and records substrate behavior without decreeing an expected browser shape. */
const fs = require('fs');
const crypto = require('crypto');
let chromium = null;
let playwrightLoadError = '';
try { ({ chromium } = require('playwright')); }
catch (error) { playwrightLoadError = String((error && error.message) || error); }
const URL_BASE = process.env.RAPIER_URL || 'http://127.0.0.1:8199/rapier.html';
const SHIM = fs.readFileSync(__dirname + '/webmcp-shim.js', 'utf8');
const modeArgs = process.argv.slice(2);
if (modeArgs.length > 1 || (modeArgs[0] && modeArgs[0] !== '--native-contract')) {
  throw new Error('usage: node qualification/webmcp-test.js [--native-contract]');
}
const NATIVE_CONTRACT = modeArgs[0] === '--native-contract';
const SUBJECT_SHA256 = crypto.createHash('sha256')
  .update(fs.readFileSync(__dirname + '/../rapier.html')).digest('hex');
const SOURCE_TEXT = fs.readFileSync(__dirname + '/../rapier.html', 'utf8');
const AGENTS_MD = fs.readFileSync(__dirname + '/../agents.md', 'utf8');

/* The host's own reason words — every literal `reason: '...'` the source pairs with outcome
   'conflict' or 'target_gone' (the two facts Will/1 does not define; WEBMCP-CHALLENGE.md
   ~172-189 names them Rapier's own, beside Will's three), in the same small object. The
   handful of sites where `reason` forwards a helper's own return value are not a literal at
   that site, so — exactly as static-release-audit.js's own `producedReasons` census already
   only recognizes a literal `reason: '...'` as produced — they name no new word here either;
   one definition of "produced," not two. `host_revision_conflict` lives in the embed
   postMessage protocol, a different wire from WebMCP's, excluded by its own banner comments. */
function censusHostReasons(source) {
  function objectAround(pos) {
    let depth = 0, start = -1;
    for (let i = pos; i >= 0; i--) {
      if (source[i] === '}') depth++;
      else if (source[i] === '{') { if (depth === 0) { start = i; break; } depth--; }
    }
    if (start < 0) return null;
    depth = 0;
    for (let i = start; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
    return null;
  }
  const embedStart = source.indexOf('/* ── Rapier Embed');
  const embedEnd = source.indexOf('/* ── Boot sequence');
  if (embedStart < 0 || embedEnd < 0) throw new Error('censusHostReasons: embed boundary banners not found');
  const wireSource = source.slice(0, embedStart) + source.slice(embedEnd);
  const offset = i => i < embedStart ? i : i + (embedEnd - embedStart);
  const found = { conflict: new Set(), target_gone: new Set() };
  const outcomeRe = /outcome:\s*'(conflict|target_gone)'/g;
  let m;
  while ((m = outcomeRe.exec(wireSource))) {
    const obj = objectAround(offset(m.index));
    if (!obj) continue;
    const lit = /reason:\s*'([a-z_]+)'/.exec(obj);
    if (lit) found[m[1]].add(lit[1]);
  }
  return found;
}

async function navigationResponseFact(response, label) {
  if (!response) throw new Error(label + ' returned no main-document response');
  const body = await response.body();
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  if (sha256 !== SUBJECT_SHA256) {
    throw Object.assign(new Error(label + ' differs from the qualified disk bytes'), {
      code: 'subject_mismatch', observedSha256: sha256,
    });
  }
  return { sha256, bytes: body.length, status: response.status(), url: response.url() };
}

/* Every result this run observes, kept until the end so one gate can adjudicate the whole
   surface at once: the Manifest describes what a registered agent receives, and nothing in the
   product proves the runtime returns it. Two owners of one fact drift; this is the witness. */
const observed = [];
function witness(name, value, isError, meta) {
  observed.push({ name, value, isError,
    payload: meta ? meta.payload : null, wire: meta ? meta.chars : null });
  return value;
}

const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };
let failures = 0;
function check(label, ok, detail) {
  if (ok) log('  PASS  ' + label);
  else { failures++; log('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}

/* Two numbers, never one. `payload` is the text Rapier composed; `chars` is what the user agent
   serializes — this envelope, its framing, and the escapes the payload pays to sit inside a JSON
   string. Proven in Chrome 152 with WebMCP enabled: WebMCP.toolResponded carries the whole
   envelope, so the contract is on the second number, and recording both is what keeps the
   distinction from collapsing back into the first. */
function unpack(raw) {
  const envelope = JSON.parse(raw);
  const block = (envelope.content || []).find(item => item && item.type === 'text');
  if (!block || typeof block.text !== 'string') throw new Error('WebMCP result had no text block');
  return { value: JSON.parse(block.text), payload: block.text.length,
    chars: JSON.stringify(envelope).length, envelope };
}


/* GoogleChromeLabs webmcp-evals, smokeEvaluator.ts:229-255, copied rather than paraphrased: this
   is the whole of how the ecosystem's own evaluator decides a tool call failed. A refusal it
   does not recognise is a refusal it scores as a pass. */
function explicitToolFailure(value) {
  if (value && typeof value === 'object') {
    if (value.success === false) return true;
    if (value.isError === true) return true;
    if (value.error) return true;
  }
  return typeof value === 'string' && value.startsWith('Error:');
}
function nativeObservationStatus(observation) {
  const value = observation || {};
  const completeApi = value.modelContext && value.registerTool && value.getTools && value.executeTool;
  if (!value.modelContext) return 'api_absent';
  if (!completeApi) return 'partial_api';
  if (value.registration !== 'registered') return 'registration_unavailable';
  if (!value.executionAttempted) return 'execution_unavailable';
  return 'observed';
}

async function invoke(page, name, input = {}) {
  const raw = await page.evaluate(({ name, input }) => window.__webmcp.call(name, input),
    { name, input });
  const result = unpack(raw);
  witness(name, result.value, result.envelope.isError === true, result);
  return result;
}

/* A host payload replacing one already open with nowhere to save asks the person first, in the
   glass's own alertdialog — never a private seam — exactly as document.open_text does above.
   Fire-and-forget rather than awaited: most callers replace the built-in welcome document, which
   asks nothing, so a watcher that only clicks the button if it shows up costs nothing when it
   never appears and never itself becomes the hang it exists to clear. */
async function openPayloadSafely(page, payload) {
  const pending = page.evaluate(p => window.Rapier.document.openPayload(p), payload);
  const discardButton = page.locator('[role="alertdialog"] button', { hasText: 'discard' });
  discardButton.waitFor({ state: 'visible', timeout: 8000 })
    .then(() => discardButton.click()).catch(() => {});
  return pending;
}

/* Chrome's own guidance is 500 characters of tool description and an overrun is truncated in
   silence — no error, no shortened result, just a sentence the model never sees
   (webmachinelearning/webmcp issue 266). A ceiling that is also the cliff edge is one the next
   sentence walks off, so the published surface is held below it with room to write, measured
   where the browser actually receives it rather than where it was authored. The longest is
   named on the PASS line too: a distance nobody can see is a distance nobody keeps. */
const DESCRIPTION_CHARS = 460;
/* Three more cliffs the same issue names, none of them a distance anyone was watching: a tool
   name over 30 characters, or any one input-schema property's own description over 150. Measured
   from the same fetch as the buffer above — one census, both witnesses — never from memory. */
const NAME_CHARS = 30;
const TOOL_DESCRIPTION_CHARS = 500;
const PARAM_DESCRIPTION_CHARS = 150;
async function checkDescriptionCeiling(page, vocabulary) {
  const published = await page.evaluate(() => window.__webmcp.names().map(name => {
    const entry = window.__webmcp.entry(name);
    const schema = entry && entry.inputSchema;
    const properties = (schema && schema.properties) || {};
    return {
      name, descriptionChars: String((entry && entry.description) || '').length,
      params: Object.entries(properties).map(([key, value]) =>
        [key, String((value && value.description) || '').length]),
    };
  }));
  const longest = published.slice().sort((a, b) => b.descriptionChars - a.descriptionChars)[0]
    || { name: '(none published)', descriptionChars: 0 };
  check('every published ' + vocabulary + ' description clears the ' + DESCRIPTION_CHARS
    + '-character ceiling — longest ' + longest.name + ' at ' + longest.descriptionChars,
    published.length > 0 && longest.descriptionChars <= DESCRIPTION_CHARS,
    JSON.stringify(published.filter(row => row.descriptionChars > DESCRIPTION_CHARS)
      .map(row => row.name)));
  const overName = published.filter(row => row.name.length > NAME_CHARS);
  const overDescription = published.filter(row => row.descriptionChars > TOOL_DESCRIPTION_CHARS);
  const overParam = published.flatMap(row => row.params
    .filter(([, chars]) => chars > PARAM_DESCRIPTION_CHARS)
    .map(([key]) => row.name + '.' + key));
  check('every published ' + vocabulary + " tool clears Chrome's registered ceilings — name "
    + NAME_CHARS + ', description ' + TOOL_DESCRIPTION_CHARS + ', each parameter description '
    + PARAM_DESCRIPTION_CHARS,
    published.length > 0 && overName.length === 0 && overDescription.length === 0
      && overParam.length === 0,
    JSON.stringify({
      overName: overName.map(row => row.name),
      overDescription: overDescription.map(row => row.name),
      overParam,
    }));
}

async function beginPendingApply(page, slotName, handle, text, label) {
  await page.evaluate(({ slotName, handle, text, label }) => {
    const slot = { settled: false, value: null, error: null, isError: null, promise: null };
    slot.promise = window.__webmcp.call('document.apply_edits', {
      edits: [{ context_handle: handle, text }], label,
    }).then(raw => {
      const envelope = JSON.parse(raw);
      slot.value = JSON.parse(envelope.content[0].text);
      slot.isError = envelope.isError === true;
      slot.settled = true;
      return { value: slot.value, isError: slot.isError };
    }, error => {
      slot.error = String(error && error.message || error);
      slot.settled = true;
      throw error;
    });
    window[slotName] = slot;
  }, { slotName, handle, text, label });
}

async function pendingState(page, slotName) {
  return page.evaluate(slotName => {
    const slot = window[slotName];
    return slot && { settled: slot.settled, value: slot.value, error: slot.error };
  }, slotName);
}

async function finishPending(page, slotName) {
  const settled = await page.evaluate(slotName => window[slotName].promise, slotName);
  return witness('document.apply_edits', settled.value, settled.isError === true);
}

/* Page 1's fixture has no real save destination, so its document is honestly dirty
   (acceptOpened answered bound:false) and shared recovery raises the app's own
   dirty-transition confirm on any later page that restores it. Answer it the way a person
   abandoning a scratch fixture would: press discard on the surface the question is asked
   on, so a page that never asks costs nothing and a page that does is answered by a
   gesture rather than by privileged knowledge of the request. */
async function discardDirtyConfirms(page) {
  await page.evaluate(() => {
    setInterval(() => {
      const overlay = document.getElementById('confirm-overlay');
      if (!overlay || !overlay.classList.contains('open')) return;
      const secondary = document.getElementById('confirm-secondary');
      const answer = secondary && !secondary.hidden ? secondary : document.getElementById('confirm-accept');
      if (answer) answer.click();
    }, 50);
  });
}

async function readSection(page, label, representation = 'text') {
  const outline = (await invoke(page, 'document.get_outline', {})).value;
  const section = (outline.sections || []).find(candidate => candidate.label === label);
  if (!section) return { error: label + ' missing', outline };
  const read = (await invoke(page, 'document.read_context', {
    ref: section.ref, representation,
  })).value;
  return { section, read };
}

async function runNativeContract() {
  const executablePath = process.env.RAPIER_CHROME_BIN || process.env.CHROME_BIN || '';
  const options = {
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--enable-webmcp-testing',
      '--enable-features=WebMCP,WebMCPTesting,DeclarativeWebmcp',
      '--enable-blink-features=WebMCP,WebMCPTesting',
    ],
    ...(executablePath ? { executablePath } : {}),
  };
  let browser;
  try { browser = await chromium.launch(options); }
  catch (error) {
    console.log(JSON.stringify({ status: 'not_run', reason: 'chromium_unavailable',
      subjectSha256: SUBJECT_SHA256, detail: String(error.message || error).slice(0, 240) }));
    process.exitCode = 2;
    return;
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const response = await page.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
    const navigation = await navigationResponseFact(response, 'executed native navigation response');
    await page.waitForTimeout(1200);
    const observation = await page.evaluate(async () => {
      let documentContext = null;
      let navigatorContext = null;
      try { documentContext = document.modelContext; } catch (_) {}
      try { navigatorContext = navigator.modelContext; } catch (_) {}
      const modelContext = documentContext || navigatorContext;
      const base = {
        userAgent: navigator.userAgent,
        secureContext: isSecureContext,
        accessor: documentContext ? 'document' : (navigatorContext ? 'navigator' : 'none'),
        documentModelContext: !!documentContext,
        navigatorModelContext: !!navigatorContext,
        modelContext: !!modelContext,
        registerTool: !!(modelContext && typeof modelContext.registerTool === 'function'),
        getTools: !!(modelContext && typeof modelContext.getTools === 'function'),
        executeTool: !!(modelContext && typeof modelContext.executeTool === 'function'),
        eventTarget: !!(modelContext && typeof modelContext.addEventListener === 'function'),
      };
      if (!base.registerTool) return base;
      const summarize = value => {
        const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
        try {
          const json = JSON.stringify(value);
          return { type, jsonChars: typeof json === 'string' ? json.length : null,
            preview: typeof json === 'string' ? json.slice(0, 4000) : '' };
        } catch (error) {
          return { type, error: String(error && error.name || error) };
        }
      };
      const argumentFact = args => ({
        argumentCount: args.length,
        firstType: args[0] === null ? 'null' : typeof args[0],
        secondType: args[1] === null ? 'null' : typeof args[1],
        secondHasSignal: !!(args[1] && args[1].signal),
      });
      const name = 'rapier.substrate_probe_' + Date.now();
      const controller = new AbortController();
      const events = [];
      const calls = [];
      if (base.eventTarget) {
        try {
          modelContext.addEventListener('toolchange', event => {
            events.push({ type: String(event && event.type || ''),
              keys: Object.keys(event || {}).sort() });
          });
        } catch (error) {
          events.push({ listenerError: String(error && error.name || error) });
        }
      }
      const descriptor = {
        name,
        description: 'Observation-only Rapier substrate contract probe.',
        inputSchema: {
          type: 'object', additionalProperties: false,
          required: ['value'], properties: { value: { type: 'string' } },
        },
        execute: function () {
          const args = Array.from(arguments);
          calls.push(argumentFact(args));
          return { content: [{ type: 'text', text: 'observed' }] };
        },
      };
      let registration = 'registered';
      try { await modelContext.registerTool(descriptor, { signal: controller.signal }); }
      catch (error) { registration = String(error && error.name || error); }
      let duplicate = 'not_attempted';
      if (registration === 'registered') {
        try { await modelContext.registerTool(descriptor); duplicate = 'accepted'; }
        catch (error) { duplicate = String(error && error.name || error); }
      }
      let reflected = null;
      let validWire = null;
      let invalidWire = null;
      let tools = null;
      let getToolsObservation = null;
      if (registration === 'registered' && base.getTools) {
        try {
          const value = await modelContext.getTools();
          getToolsObservation = { type: Array.isArray(value) ? 'array' : typeof value,
            length: Array.isArray(value) ? value.length : null };
          if (Array.isArray(value)) tools = value;
        } catch (error) {
          getToolsObservation = { error: String(error && error.name || error) };
        }
        const tool = tools && tools.find(candidate => candidate && candidate.name === name);
        reflected = tool ? {
          inputSchemaType: typeof tool.inputSchema,
          inputSchema: summarize(tool.inputSchema),
          annotations: summarize(tool.annotations),
        } : null;
        if (tool && base.executeTool) {
          try {
            const value = await modelContext.executeTool(tool, JSON.stringify({ value: 'valid' }));
            validWire = summarize(value);
          } catch (error) { validWire = { error: String(error && error.name || error) }; }
          try {
            const value = await modelContext.executeTool(tool, JSON.stringify({ value: 7 }));
            invalidWire = summarize(value);
          } catch (error) { invalidWire = { error: String(error && error.name || error) }; }
        }
      }
      let registrationAbortRace = null;
      if (tools && base.executeTool) {
        const raceName = name + '_race';
        const raceController = new AbortController();
        try {
          await modelContext.registerTool({
            name: raceName,
            description: 'Observation-only in-flight registration abort probe.',
            inputSchema: { type: 'object', additionalProperties: false },
            execute: function () {
              return new Promise(resolve => setTimeout(() => resolve({
                content: [{ type: 'text', text: 'late result' }],
              }), 250));
            },
          }, { signal: raceController.signal });
          const value = await modelContext.getTools();
          const raceTool = Array.isArray(value)
            ? value.find(candidate => candidate && candidate.name === raceName) : null;
          if (raceTool) {
            const pending = Promise.resolve(
              modelContext.executeTool(raceTool, JSON.stringify({})),
            ).then(result => ({ settlement: 'resolved', type: typeof result }),
              error => ({ settlement: 'rejected', error: String(error && error.name || error) }));
            raceController.abort();
            registrationAbortRace = await Promise.race([
              pending,
              new Promise(resolve => setTimeout(() => resolve({ settlement: 'pending' }), 1000)),
            ]);
          } else registrationAbortRace = { settlement: 'tool_not_reflected' };
        } catch (error) {
          registrationAbortRace = { error: String(error && error.name || error) };
          raceController.abort();
        }
      }
      let executionAbort = null;
      let executionAttempted = false;
      if (base.getTools && base.executeTool) {
        const abortName = name + '_call_abort';
        const executionCalls = [];
        try {
          await modelContext.registerTool({
            name: abortName,
            description: 'Observation-only per-call abort probe.',
            inputSchema: { type: 'object', additionalProperties: false },
            execute: function () {
              executionCalls.push(argumentFact(Array.from(arguments)));
              return new Promise(resolve => setTimeout(() => resolve({
                content: [{ type: 'text', text: 'late call result' }],
              }), 250));
            },
          });
          const value = await modelContext.getTools();
          const abortTool = Array.isArray(value)
            ? value.find(candidate => candidate && candidate.name === abortName) : null;
          if (abortTool) {
            executionAttempted = true;
            const callController = new AbortController();
            const pending = Promise.resolve(modelContext.executeTool(
              abortTool, JSON.stringify({}), { signal: callController.signal },
            )).then(result => ({ settlement: 'resolved', result: summarize(result) }),
              error => ({ settlement: 'rejected', error: String(error && error.name || error) }));
            await Promise.resolve();
            callController.abort();
            const settlement = await Promise.race([
              pending,
              new Promise(resolve => setTimeout(() => resolve({ settlement: 'pending' }), 1000)),
            ]);
            executionAbort = { ...settlement, callbackCalls: executionCalls };
          } else executionAbort = { settlement: 'tool_not_reflected', callbackCalls: executionCalls };
        } catch (error) {
          executionAbort = { error: String(error && error.name || error),
            callbackCalls: executionCalls };
        }
      }
      controller.abort();
      await new Promise(resolve => setTimeout(resolve, 50));
      let removed = null;
      if (base.getTools) {
        try {
          const value = await modelContext.getTools();
          removed = Array.isArray(value) ? !value.some(tool => tool && tool.name === name) : null;
        } catch (_) {}
      }
      return { ...base, registration, duplicate, reflected, validWire, invalidWire,
        getToolsObservation, callbackCalls: calls, registrationAbortRemoved: removed,
        registrationAbortRace, executionAbort, executionAttempted, toolchange: events };
    });
    const status = nativeObservationStatus(observation);
    console.log(JSON.stringify({ status, subjectSha256: SUBJECT_SHA256,
      browserVersion: browser.version(), url: URL_BASE, navigation, observation }, null, 2));
    if (status !== 'observed') process.exitCode = 2;
    await context.close();
  } finally { await browser.close(); }
}

async function runHarness() {
  let browser;
  try { browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] }); }
  catch (error) {
    console.log(JSON.stringify({ status: 'not_run', reason: 'chromium_unavailable',
      subjectSha256: SUBJECT_SHA256, detail: String(error.message || error).slice(0, 240) }));
    process.exitCode = 2;
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  /* On the context, not the page: the lifecycle check opens a second page and needs the shim. */
  await context.addInitScript(SHIM + '\nwindow.__installWebMcpShim();');
  /* Helper pages open in their own storage partition: boot takes the recovery writer lease with
     `steal`, so a helper in this partition would take this page's lease and narrow it to read
     tools — the law the lifecycle section proves on purpose with its second page. */
  const side = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await side.addInitScript(SHIM + '\nwindow.__installWebMcpShim();');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.stack || e).slice(0, 600)));
  /* Hostile-document network witness (an outside audit's judge challenge 3): held for one gate at the end of
     the run rather than scoped to the fixture below, so the guarantee covers this session's whole
     shape — registration, every tool call, and the hostile document together. Parsed origins,
     never a prefix: `http://127.0.0.1:8199.evil.example/x` starts with an admitted origin's text
     and is still somebody else's server. data: and about: never leave the process; blob:'s inner
     origin is what `.origin` already reports, so neither needs a special case. */
  const SELF_ORIGIN = new URL(URL_BASE).origin;
  const offOriginRequests = [];
  const isOffOrigin = raw => {
    let url;
    try { url = new URL(raw); } catch (_) { return true; }
    const scheme = url.protocol.toLowerCase();
    if (scheme === 'data:' || scheme === 'about:') return false;
    return url.origin !== SELF_ORIGIN;
  };
  page.on('request', r => {
    if (isOffOrigin(r.url())) offOriginRequests.push(r.method() + ' ' + r.url().slice(0, 200));
  });

  const navigationResponse = await page.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
  await navigationResponseFact(navigationResponse, 'executed harness navigation response');
  await page.waitForFunction(() => !!window.Rapier, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  log('### registration is truthful for the current document');
  const names = await page.evaluate(() => window.__webmcp.names());
  log('  registered: ' + JSON.stringify(names));
  check('tools were registered', names.length > 0, 'none registered');
  check('get_context registered', names.includes('document.get_context'));
  check('apply_edits registered', names.includes('document.apply_edits'));
  check('find registered', names.includes('document.find'));
  check('save is withheld before the person authorizes a destination',
    !names.includes('document.save'), JSON.stringify(names));
  check('selective undo is withheld before an agent change exists',
    !names.includes('document.undo_agent_change'), JSON.stringify(names));

  log('### descriptors are well formed and current');
  const descriptors = await page.evaluate(() =>
    window.__webmcp.names().map(n => {
      const e = window.__webmcp.entry(n);
      return {
        name: e.name, title: e.title, description: e.description,
        annotations: e.annotations, schema: e.inputSchema,
      };
    }));
  for (const d of descriptors) {
    check('has title: ' + d.name, typeof d.title === 'string' && d.title.length > 0);
    check('has description: ' + d.name,
      typeof d.description === 'string' && d.description.length > 40);
    check('schema closed: ' + d.name, d.schema && d.schema.additionalProperties === false,
      JSON.stringify(d.schema));
    check('annotations present: ' + d.name,
      d.annotations && typeof d.annotations.readOnlyHint === 'boolean'
      && typeof d.annotations.untrustedContentHint === 'boolean');
  }
  await checkDescriptionCeiling(page, 'document');
  const readers = descriptors.filter(d => d.annotations.readOnlyHint);
  check('every read-only tool marks content untrusted',
    readers.every(d => d.annotations.untrustedContentHint === true),
    JSON.stringify(readers.filter(d => !d.annotations.untrustedContentHint).map(d => d.name)));
  const findDescriptor = descriptors.find(d => d.name === 'document.find');
  const findProperties = findDescriptor && findDescriptor.schema && findDescriptor.schema.properties;
  check('find exposes query plus opaque cursor, not a caller-controlled limit',
    !!findProperties && !!findProperties.query && !!findProperties.cursor &&
      findProperties.limit === undefined,
    JSON.stringify(findDescriptor && findDescriptor.schema));

  /* THE getTools() GATE. Everything above reads Rapier's own registration bookkeeping; this
     leg asks the browser-facing API what it actually publishes and compares the two with exact
     equality — names, titles, descriptions, schemas, BOTH annotations, instrument membership —
     then drives an invocation through executeTool(). Platform honesty: where an API is absent
     the gate names the leg that ran instead of going green over something that was never
     there. */
  log('### the published surface equals the canonical manifest');
  const surface = await page.evaluate(async () => {
    const declared = document.querySelector('script[type="application/speedracer-app+json"]');
    const manifest = declared ? JSON.parse(declared.textContent) : null;
    const context = document.modelContext;
    const api = !!(context && typeof context.getTools === 'function');
    const published = api ? await context.getTools() : null;
    /* This fixture deliberately serializes inputSchema to exercise the competition-reported
       shape. Native mode records whatever the actual substrate returns. */
    const shape = tool => ({
      name: tool.name, title: tool.title, description: tool.description,
      inputSchema: typeof tool.inputSchema === 'string'
        ? JSON.parse(tool.inputSchema) : tool.inputSchema,
      annotations: tool.annotations,
    });
    return {
      api,
      executes: !!(context && typeof context.executeTool === 'function'),
      manifest: manifest ? manifest.operations.map(o => o.name) : null,
      published: published ? published.map(shape) : null,
      registered: window.__webmcp.names().map(n => shape(window.__webmcp.entry(n))),
    };
  });
  log('  getTools(): ' + (surface.api
    ? 'present — the published surface is compared'
    : 'absent — the registration seam is pinned instead'));
  log('  executeTool(): ' + (surface.executes ? 'present — one invocation is driven through it'
    : 'absent — the direct projection leg ran'));
  const declaredOperations = new Set(surface.manifest || []);
  check('the canonical manifest was readable from the shipped page',
    declaredOperations.size > 0, String(declaredOperations.size));
  const reported = surface.published || surface.registered;
  check('every published tool is declared by the canonical manifest',
    reported.every(tool => declaredOperations.has(tool.name)),
    JSON.stringify(reported.filter(t => !declaredOperations.has(t.name)).map(t => t.name)));
  if (surface.api) {
    const registeredByName = new Map(surface.registered.map(tool => [tool.name, tool]));
    const drift = reported.filter(tool => {
      const mine = registeredByName.get(tool.name);
      return !mine || JSON.stringify(mine) !== JSON.stringify(tool);
    }).map(tool => tool.name);
    check('the browser-reported surface equals the registration exactly',
      drift.length === 0 && reported.length === surface.registered.length,
      JSON.stringify({ drift, published: reported.length, registered: surface.registered.length }));
  } else {
    check('the registration seam is pinned where getTools() is absent',
      surface.registered.length > 0, String(surface.registered.length));
  }
  check('both annotations are published for every tool',
    reported.every(tool => tool.annotations
      && typeof tool.annotations.readOnlyHint === 'boolean'
      && typeof tool.annotations.untrustedContentHint === 'boolean'),
    JSON.stringify(reported.filter(t => !t.annotations).map(t => t.name)));
  const instruments = new Set(reported.map(tool => tool.name.split('.')[0]));
  check('one instrument is published at a time', instruments.size === 1,
    JSON.stringify([...instruments]));
  if (surface.executes) {
    const throughApi = await page.evaluate(async () => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find(candidate => candidate.name === 'document.get_context');
      return document.modelContext.executeTool(tool, JSON.stringify({}));
    });
    const viaApi = unpack(throughApi);
    witness('document.get_context', viaApi.value, viaApi.envelope.isError === true, viaApi);
    check('executeTool() drives the operation to the same bounded result',
      viaApi.value.outcome === 'read' && viaApi.chars <= 1500,
      JSON.stringify(viaApi.value).slice(0, 200));
  }

  log('### get_context returns the live document without dumping it');
  await page.evaluate(async () => {
    await window.Rapier.document.openPayload({
      text: [
        '# Title', '', 'alpha paragraph one', '', 'beta paragraph two', '',
        'The gamma draft belongs here.', '',
        /* The founder runbook's Prompt 1 sentence, verbatim, so the collision that is NOT one
           is staged in the words the product is demonstrated with. */
        'In a browser with WebMCP, the agent you already talk to can work in this document ' +
          'beside you.', '',
        '<!-- will/1 keep: quoted verbatim, leave it -->', '',
        '## Quoted', '', 'the quoted sentence.', '',
        '<!-- /will -->', '',
        '<!-- will/1 keep -->', '',
        '## Secret', '', 'another held sentence.', '',
        '<!-- /will -->', '',
        /* Headingless on purpose: the outline the paging cases measure stays exactly as it
           was, and the append law is still reachable by search. */
        '<!-- will/1 append -->', '', 'the logged line.', '',
        '<!-- /will -->', '',
      ].join('\n'),
      name: 'webmcp-test.md',
    });
  });
  await page.waitForTimeout(600);
  const ctxMeta = await invoke(page, 'document.get_context', {});
  const ctx = ctxMeta.value;
  log('  ' + JSON.stringify(ctx).slice(0, 400));
  check('reports the filename', ctx.filename === 'webmcp-test.md', ctx.filename);
  check('does not return the document body', ctx.text === undefined,
    'body was disclosed: ' + String(ctx.text).slice(0, 80));
  check('context result stays inside the 1,500-character contract', ctxMeta.chars <= 1500,
    String(ctxMeta.chars));

  log('### find returns bounded snippets plus handles');
  const foundMeta = await invoke(page, 'document.find', { query: 'beta' });
  const found = foundMeta.value;
  log('  ' + JSON.stringify(found).slice(0, 400));
  const match = (found.matches || [])[0];
  check('found the passage', !!match, JSON.stringify(found).slice(0, 200));
  check('match carries a context handle',
    !!(match && (match.handle || '').startsWith('rctx_')), JSON.stringify(match));
  check('find result stays inside the 1,500-character contract', foundMeta.chars <= 1500,
    String(foundMeta.chars));

  /* THE AUTHORITY FOOTPRINT. Two strings arrive on one match and only one of them is the
     handle's. Prose alone was not enough — agents replaced the wider one and reported success,
     and only exact final bytes caught them — so the result names the field its handle covers,
     and the field it names is the one that must come back byte for byte. */
  const matches = found.matches || [];
  check('a handled match names the scope of its own handle',
    matches.every(row => (row.handle ? row.handle_scope === 'matched' : !('handle_scope' in row))),
    JSON.stringify(matches.map(row => ({ handle: !!row.handle, scope: row.handle_scope }))));
  check('the named scope is a field the match actually carries',
    matches.every(row => !row.handle || typeof row[row.handle_scope] === 'string'),
    JSON.stringify(matches.map(row => row.handle_scope)));
  check('the snippet is strictly wider than the bytes the handle owns',
    !!match && match.snippet.includes(match.matched)
      && match.snippet.length > match.matched.length,
    JSON.stringify({ matched: match && match.matched, snippet: match && match.snippet }));

  /* THE PLACE, NOT ONLY THE BYTES. A match names the section it fell under in the outline's own
     vocabulary, so match → section → bounded read is one call and not three. */
  check('a match names the section it fell under',
    !!(match && match.section_ref && match.section === 'Title'),
    JSON.stringify({ section_ref: match && match.section_ref, section: match && match.section }));
  if (match && match.section_ref) {
    const around = (await invoke(page, 'document.read_context',
      { ref: match.section_ref })).value;
    check('the section reference reads the section the match fell in',
      around.outcome === 'read' && around.label === match.section
        && String(around.text || '').includes(match.matched),
      JSON.stringify({ outcome: around.outcome, reason: around.reason,
        label: around.label, section: match.section }));
  }

  log('### apply_edits commits through a handle obtained by reading');
  if (match && match.handle) {
    const edit = (await invoke(page, 'document.apply_edits', {
      edits: [{ context_handle: match.handle, text: 'BETA REPLACED' }], label: 'test edit',
    })).value;
    log('  ' + JSON.stringify(edit).slice(0, 300));
    const text = await page.evaluate(() => document.body.innerText);
    check('edit landed in the document', text.includes('BETA REPLACED'), text.slice(0, 200));
    check('edit did not disturb the rest', text.includes('alpha paragraph one'));
    /* The extent, in final bytes: spending the handle moved exactly `matched` and left every
       byte of the surrounding snippet where it stood. */
    check('the handle reached exactly the bytes it said it owned',
      text.includes(match.snippet.replace(match.matched, 'BETA REPLACED')),
      JSON.stringify({ snippet: match.snippet, matched: match.matched }));
    check('mutation reports an applied outcome',
      edit.outcome === 'applied' || edit.outcome === 'rebased', JSON.stringify(edit));
  }
  /* ONE LINE FOR THE PERSON, ON THE WIRE. The note rides an admitted write and nothing else: it
     reaches the glass beside the circle wearing the agent's own mark, as TEXT — the agent's words
     are data — and a newer act retires it, because the line always belongs to the latest act. A
     write that never lands never leaves one. The bound is driven by name in the hostile-argument
     table below, beside every other declared bound. */
  log('### the agent leaves the person one line, and only with a write that lands');
  const noteLine = () => page.evaluate(() => {
    const line = document.getElementById('agent-note');
    const said = line && line.querySelector('.agent-note__said');
    const circle = document.getElementById('scroll-fab');
    return {
      hidden: !line || line.hidden,
      visible: !!(line && line.classList.contains('visible')),
      who: line ? line.querySelector('.agent-note__who').textContent : '',
      said: said ? said.textContent : '',
      markup: said ? said.querySelectorAll('*').length : -1,
      row: (document.getElementById('agent-row-said') || {}).textContent,
      rowHidden: !!(document.getElementById('agent-row-said') || {}).hidden,
      circleOnScreen: !!(circle && circle.classList.contains('visible')),
    };
  });
  const noteHandle = async query => {
    const found = (await invoke(page, 'document.find', { query })).value;
    const first = (found.matches || [])[0];
    return first ? first.handle : null;
  };
  const firstNote = 'Replaced the second paragraph so the two claims stop disagreeing.';
  /* Appended rather than replaced: later sections read this same passage by name, and a witness
     that consumes the fixture other witnesses stand on is a witness that breaks them. */
  const noteTarget = await noteHandle('BETA REPLACED');
  if (noteTarget) {
    const withNote = (await invoke(page, 'document.apply_edits', {
      edits: [{ context_handle: noteTarget, text: ' N1', placement: 'after' }], note: firstNote,
    })).value;
    await page.waitForTimeout(250);
    const born = await noteLine();
    check('an admitted write carries its note to the line beside the circle',
      (withNote.outcome === 'applied' || withNote.outcome === 'rebased') &&
      !born.hidden && born.said === firstNote && born.who === '',
      JSON.stringify({ withNote, born }).slice(0, 300));
    check('the line stands on the glass only while the circle it belongs to does',
      born.visible === born.circleOnScreen, JSON.stringify(born).slice(0, 200));
    check('the whole note reads in the agent row the tap opens',
      !born.rowHidden && born.row === firstNote, JSON.stringify(born).slice(0, 200));
    const hostileTarget = await noteHandle('BETA REPLACED');
    const hostileNote = '<img src=x onerror=alert(1)>';
    if (hostileTarget) {
      await invoke(page, 'document.apply_edits', {
        edits: [{ context_handle: hostileTarget, text: ' N2', placement: 'after' }], note: hostileNote,
      });
      await page.waitForTimeout(250);
      const second = await noteLine();
      check('a newer act retires the older line, and an agent word is never markup',
        second.said === hostileNote && second.markup === 0,
        JSON.stringify(second).slice(0, 250));
    }
    const dead = (await invoke(page, 'document.apply_edits', {
      edits: [{ context_handle: 'rctx_' + 'd'.repeat(32), text: 'x' }],
      note: 'A line about a write that never happened.',
    })).value;
    await page.waitForTimeout(250);
    const afterDead = await noteLine();
    check('a note on a write that never lands never reaches the person',
      dead.outcome !== 'applied' && dead.outcome !== 'rebased' &&
      afterDead.said === hostileNote,
      JSON.stringify({ dead, afterDead }).slice(0, 250));
  } else {
    check('an admitted write carries its note to the line beside the circle', false,
      'the fixture minted no handle to leave a note with');
  }

  await page.waitForFunction(() =>
    window.__webmcp.names().includes('document.undo_agent_change'), null,
    { timeout: 5000 }).catch(() => {});
  check('selective undo appears after an agent change exists',
    await page.evaluate(() => window.__webmcp.names().includes('document.undo_agent_change')));

  /* The one fact about the person's attention that crosses the membrane, and the whole of it:
     how many of THIS channel's own changes Rapier has not yet put in front of them. */
  log('### the channel is told what it owes the person, and nothing else');
  await page.waitForTimeout(700);
  const owedMeta = await invoke(page, 'document.get_context', {});
  const owed = owedMeta.value;
  check('the channel reads back its own undelivered count',
    owed.yourChangesNotShown === 1, JSON.stringify(owed.yourChangesNotShown));
  /* The cap, read off the wire: one integer and nothing beside it. Anything this artifact ever
     learns about where a person looked stays on the person's side of the membrane. */
  const CONTEXT_FIELDS = new Set(['outcome', 'filename', 'kind', 'surface', 'dirty', 'history',
    'projection', 'structure', 'yourChangesNotShown', 'focus', 'law', 'selectedLaw', 'handle',
    'posture', 'selectedChars', 'selected', 'truncated']);
  const strayFields = Object.keys(owed).filter(key => !CONTEXT_FIELDS.has(key));
  check('no second fact about the person’s attention crosses with it',
    strayFields.length === 0, JSON.stringify(strayFields));
  check('the number is one integer, never a place or a duration',
    Number.isInteger(owed.yourChangesNotShown) &&
      !Object.keys(owed).some(key => /scroll|dwell|viewport|position|region|when|at$/i.test(key)),
    JSON.stringify(Object.keys(owed)));

  /* THE WORD ON THE GLASS IS THE WORD ON THE WIRE. Both are read at the same moment, through
     the surfaces a person and an agent actually use: the row's own `aria-pressed`, and the tool
     result a browser hands the model. This document carries a will, so it is where the sibling
     law is provable in the direction that matters here — the posture stands beside `law` and
     never inside it. (The other direction, `law` absent while the posture is not, is the
     unwilled fixture's to prove, and the desktop suite proves it there.) */
  log('### the person’s posture reaches the agent as one word beside the law');
  for (const word of ['check', 'ask', 'free']) {
    /* This harness holds the shipped bytes and no engine handle, so it reaches the row the only
       way anything outside the engine can: the row's own listener, which is the same one a
       finger reaches. The sheet it lives in is raised by a finger in the suite and in the phone
       driver; what is being read here is the wire. */
    const glass = await page.evaluate(chosen => {
      document.querySelector('#posture-row [data-posture="' + chosen + '"]').click();
      return [...document.querySelectorAll('#posture-row [data-posture]')]
        .filter(node => node.getAttribute('aria-pressed') === 'true')
        .map(node => node.dataset.posture).join(',');
    }, word);
    const wire = (await invoke(page, 'document.get_context', {})).value;
    check('posture ' + word + ': the marked word equals the wire word, beside the law and not inside it',
      glass === word && wire.posture === word && typeof wire.posture === 'string'
        && !!wire.law && !Object.prototype.hasOwnProperty.call(wire.law, 'posture'),
      JSON.stringify({ glass, wire: wire.posture, law: wire.law }));
  }

  log('### a real human UI edit yields exact evidence and one successor handle');
  const gamma = (await invoke(page, 'document.find', { query: 'gamma draft' })).value;
  const gammaMatch = (gamma.matches || [])[0];
  check('the predecessor was fully disclosed',
    !!(gammaMatch && gammaMatch.handle && gammaMatch.matched === 'gamma draft'),
    JSON.stringify(gammaMatch));
  if (gammaMatch && gammaMatch.handle) {
    const gammaRead = page.locator('#editor-blocks .block-read')
      .filter({ hasText: 'The gamma draft belongs here.' }).first();
    check('the human target is rendered', await gammaRead.count() === 1);
    const owedBeforeHuman = (await invoke(page, 'document.get_context', {}))
      .value.yourChangesNotShown;
    await gammaRead.click();
    const gammaEdit = page.locator('#editor-blocks .block-wrapper--editing .block-edit').first();
    await gammaEdit.waitFor({ state: 'visible', timeout: 5000 });
    /* Browser keyboard input, through the same rendered editor a thumb uses. Home/Shift+End
       selects only this short visual line; Control+A would select the whole contenteditable. */
    await gammaEdit.press('Home');
    await gammaEdit.press('Shift+End');
    await page.keyboard.type('The person-written gamma belongs here.');
    /* A trusted click into another block closes and attributes the human transaction. */
    await page.locator('#editor-blocks .block-read')
      .filter({ hasText: 'alpha paragraph one' }).first().click();
    await page.waitForTimeout(900);
    const humanText = await page.evaluate(() => document.body.innerText);
    check('the UI edit settled as document reality',
      humanText.includes('The person-written gamma belongs here.') &&
        !humanText.includes('The gamma draft belongs here.'), humanText.slice(0, 240));

    /* A change this channel did not make never reaches its number. The WebMCP door authenticates
       exactly one channel, so the other principal a browser agent can actually meet is the
       person: their own hand, in the rendered editor, on a passage of their own. Their hand can
       only ever LOWER this number — while they worked, their own eye held the block this channel
       had changed, which is delivery — and can never raise it, because their work is never this
       channel's. A number that rose here would be one principal's work reported to another. */
    await page.waitForTimeout(700);
    const afterHuman = (await invoke(page, 'document.get_context', {})).value;
    check('another principal’s change never raises this channel’s number',
      Number.isInteger(afterHuman.yourChangesNotShown) &&
        afterHuman.yourChangesNotShown <= owedBeforeHuman,
      JSON.stringify({ before: owedBeforeHuman, after: afterHuman.yourChangesNotShown }));

    const yielded = (await invoke(page, 'document.apply_edits', {
      edits: [{ context_handle: gammaMatch.handle, text: 'AGENT STALE GAMMA' }],
      label: 'stale gamma proposal',
    })).value;
    log('  yielded: ' + JSON.stringify(yielded).slice(0, 500));
    const continuation = yielded.continuation;
    check('the stale intention yielded instead of overwriting the person',
      yielded.outcome === 'yielded' && yielded.reason === 'person_changed_target' &&
        !!continuation && continuation.law === 'edit' &&
        /^rctx_[0-9a-f]{32}$/.test(String(continuation.handle || '')),
      JSON.stringify(yielded));
    if (continuation) {
      const reconstructed = gammaMatch.matched.slice(0, continuation.at) +
        continuation.inserted +
        gammaMatch.matched.slice(continuation.at + continuation.removed.length);
      check('the splice reconstructs exactly what the person wrote',
        reconstructed === 'person-written gamma', reconstructed);
      const beforeSuccessor = await page.evaluate(() => document.body.innerText);
      check('the stale bytes never landed', !beforeSuccessor.includes('AGENT STALE GAMMA'),
        beforeSuccessor.slice(0, 240));

      const continued = (await invoke(page, 'document.apply_edits', {
        edits: [{
          context_handle: continuation.handle,
          text: 'person-written gamma, tightened by the agent',
        }],
        label: 'continue from human edit',
      })).value;
      const afterSuccessor = await page.evaluate(() => document.body.innerText);
      check('the delivered successor is immediately spendable once',
        (continued.outcome === 'applied' || continued.outcome === 'rebased') &&
          afterSuccessor.includes(
            'The person-written gamma, tightened by the agent belongs here.'),
        JSON.stringify({ continued, text: afterSuccessor.slice(0, 260) }));
    }
  }

  /* THE FOUNDER RUNBOOK'S PROMPT 1, staged in its own words. The person's three words land
     earlier in the same sentence — inside the neighbourhood the handle captured ahead of its
     target — while the target's own bytes stand untouched. A collision is the person writing
     over what the agent was shown, never near it, so this one relocates onto its own bytes and
     both hands keep their words instead of the model being sent back to read the document. */
  log('### a person editing beside the target leaves the agent’s handle exact');
  const beside = ((await invoke(page, 'document.find', { query: 'beside you' })).value.matches || [])[0];
  check('the agent holds exactly the bytes the prompt names',
    !!(beside && beside.handle && beside.matched === 'beside you'), JSON.stringify(beside));
  if (beside && beside.handle) {
    await page.locator('#editor-blocks .block-read')
      .filter({ hasText: 'the agent you already talk to' }).first().click();
    await page.locator('#editor-blocks .block-wrapper--editing .block-edit').first()
      .waitFor({ state: 'visible', timeout: 5000 });
    /* The selection a drag leaves, then real keystrokes through the editor a thumb uses. */
    const selected = await page.evaluate(needle => {
      const walker = document.createTreeWalker(
        document.querySelector('#editor-blocks .block-wrapper--editing .block-edit'),
        NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const at = node.nodeValue.indexOf(needle);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        return true;
      }
      return false;
    }, 'already talk to');
    check('the person’s own words are selected in the rendered editor', selected);
    await page.keyboard.type('already trust');
    await page.locator('#editor-blocks .block-read')
      .filter({ hasText: 'alpha paragraph one' }).first().click();
    await page.waitForTimeout(900);
    const settled = await page.evaluate(() => document.body.innerText);
    check('the person’s edit settled as document reality',
      settled.includes('the agent you already trust'), settled.slice(0, 200));
    const relocated = (await invoke(page, 'document.apply_edits', {
      edits: [{ context_handle: beside.handle, text: 'with you' }],
      label: 'Two hands: beside you -> with you',
    })).value;
    const both = await page.evaluate(() => document.body.innerText);
    check('a handle whose neighbourhood moved relocates onto its own bytes and both hands stand',
      relocated.outcome === 'rebased' && relocated.continuation == null &&
        both.includes('the agent you already trust can work in this document with you.'),
      JSON.stringify(relocated));
  }

  log('### safe read results survive the user agent JSON round trip');
  const held = await readSection(page, 'Quoted');
  log('  held read: ' + JSON.stringify(held).slice(0, 420));
  check('kept text reports its law', held.read && held.read.law === 'keep', JSON.stringify(held));
  check('held text carries a bounded intention handle',
    !!(held.read && /^rctx_[0-9a-f]{32}$/.test(String(held.read.handle || ''))),
    JSON.stringify(held));
  /* The maxima the app manifest declares for a read, checked on a real one. The wire has a
     result budget of its own; these are the CONTRACT's numbers, and `intent` is counted in
     characters because that is the unit `maxLength` names and the unit the will parser admits. */
  const readMaxima = read => (read.text || '').length <= 4096
    && Number.isSafeInteger(read.depth) && read.depth >= 0 && read.depth <= 64
    && [...String(read.intent || '')].length <= 512
    && String(read.reason || '').length <= 160 && String(read.label || '').length <= 64
    && (read.handle == null || String(read.handle).length <= 128);
  check('a read receipt is inside every maximum the manifest declares for it',
    !!(held.read && readMaxima(held.read)),
    JSON.stringify({ text: (held.read.text || '').length, depth: held.read.depth,
      intent: [...String(held.read.intent || '')].length }));
  const serializable = {};
  const safeProbes = [
    ['document.get_context', {}],
    ['document.get_outline', {}],
    ['document.find', { query: 'alpha' }],
    ['document.list_changes', {}],
    ...(held.section ? [['document.read_context', { ref: held.section.ref }]] : []),
  ];
  for (const [name, input] of safeProbes) {
    if (!await page.evaluate(name => window.__webmcp.names().includes(name), name)) continue;
    try {
      const result = await invoke(page, name, input);
      serializable[name] = { ok: true, chars: result.chars };
    } catch (error) {
      serializable[name] = { ok: false, error: String(error && error.message || error) };
    }
  }
  serializable['document.wait_for_user'] = { skipped: 'intentionally pending until a person acts' };
  log('  ' + JSON.stringify(serializable));
  const attempted = Object.entries(serializable)
    .filter(([name]) => name !== 'document.wait_for_user').map(([, value]) => value);
  check('every finite read probe returned serialized JSON',
    attempted.length > 0 && attempted.every(value => value.ok === true), JSON.stringify(serializable));
  check('every finite read probe respected the result budget',
    attempted.every(value => value.chars <= 1500), JSON.stringify(serializable));

  log('### held law: ALLOW continues the original call inside the foreground Compare');
  const ALLOW_TEXT = 'Quoted\n\nthe reviewed sentence.';
  if (held.read && held.read.handle) {
    /* What this channel owes the person before it proposes anything, so the trusted decision
       below can be read against it on the wire. */
    await page.waitForTimeout(700);
    const owedBeforeHeld = (await invoke(page, 'document.get_context', {})).value.yourChangesNotShown;
    await beginPendingApply(page, '__rapierAllowCall', held.read.handle, ALLOW_TEXT,
      'held review allow');
    await page.waitForFunction(() => {
      const allow = document.querySelector('.compare-law-review__action--allow');
      return !!(allow && !allow.disabled);
    }, null, { timeout: 10000 });

    /* This probe runs in page scope, where the engine IIFE's own bindings — `rapier`,
       `_rapierCompareRuntime`, `_rapierWebMcpAdmitted` — do not exist; `rapier` there resolves
       to the document's <h1 id="rapier">, so reading `rapier.compare.currentText` silently
       yielded undefined and turned three proven properties into false negatives. The engine
       cannot be asked directly from here by design, so each property is observed on the
       surface an agent and a person can actually see. The engine-internal identities are
       proved inside the engine by the qualification-injected suite's "one held edit stays pending in
       exact human-owned Compare and ALLOW THIS ONCE continues that call". */
    const review = await page.evaluate(() => {
      const rows = document.querySelectorAll('#compare-content .compare-row');
      /* A diff row carries one line of one side. Context rows belong to both sides, remove
         rows only to what stands now, add rows only to what is proposed; meta rows are the
         renderer's own "no newline at end of file" note and belong to neither. */
      const side = keep => Array.from(rows)
        .filter(row => row.classList.contains('compare-row--context') ||
          row.classList.contains('compare-row--' + keep))
        .map(row => String((row.querySelector('.compare-row__text') || {}).textContent || ''))
        .join('\n');
      const holder = document.getElementById('compare-law-review');
      const names = window.__webmcp.names();
      return {
        /* Only _rapierWillReviewActions ever raises this group, and only for a held edit the
           person owns; an agent-opened comparison never carries it. */
        humanOwned: !!(holder && holder.dataset.visible === 'true' &&
          holder.getAttribute('role') === 'group'),
        /* Empty admission is observable as: discovery offers the agent no name it may call.
           The single retained name is the person's own in-flight call, and the next check
           proves it is inert. */
        admitted: names.filter(name => name !== 'document.apply_edits'),
        registered: names,
        current: side('remove'),
        incoming: side('add'),
        /* Positive control for the identical expression the batch check reads as false: a
           held review must show the comparison instrument, or that later reading proves
           nothing. */
        compareActive: (() => {
          const mode = document.getElementById('compare-mode');
          return !!(mode && getComputedStyle(mode).display !== 'none');
        })(),
        labels: Array.from(document.querySelectorAll('#compare-law-review button'))
          .map(node => String(node.textContent || '').trim()),
      };
    });
    log('  decision state: ' + JSON.stringify(review));
    const openState = await pendingState(page, '__rapierAllowCall');
    check('the original call is still pending while the person decides',
      openState && openState.settled === false, JSON.stringify(openState));
    check('Compare carries the exact current bytes and exact proposal',
      review.current === held.read.text && review.incoming === ALLOW_TEXT,
      JSON.stringify({ current: review.current, incoming: review.incoming }));
    check('the law review is the foreground Compare, not a tool',
      review.humanOwned === true && review.compareActive === true, JSON.stringify(review));
    check('semantic admission is exactly empty during the decision',
      Array.isArray(review.admitted) && review.admitted.length === 0, JSON.stringify(review));
    check('the only decision verbs are KEEP HELD and ALLOW THIS ONCE',
      review.labels.join('|') === 'KEEP HELD|ALLOW THIS ONCE', JSON.stringify(review.labels));
    check('any physical registration retained for the running call exposes no second vocabulary',
      review.registered.every(name => name === 'document.apply_edits'),
      JSON.stringify(review.registered));

    const retainedIsInert = await page.evaluate(async () => {
      if (!window.__webmcp.names().includes('document.apply_edits')) return { state: 'absent' };
      try {
        const raw = await window.__webmcp.call('document.apply_edits', {});
        const envelope = JSON.parse(raw);
        const value = JSON.parse(envelope.content[0].text);
        return { state: 'answered', outcome: value.outcome, reason: value.reason,
          isError: envelope.isError === true };
      } catch (error) { return { state: 'threw', message: String(error && error.message || error) }; }
    });
    check('a retained pre-153 registration answers in vocabulary rather than running or throwing',
      retainedIsInert.state === 'absent' || (retainedIsInert.state === 'answered' &&
        retainedIsInert.outcome === 'refused' && retainedIsInert.reason === 'tool_withdrawn' &&
        retainedIsInert.isError === true),
      JSON.stringify(retainedIsInert));

    await page.evaluate(() =>
      document.querySelector('.compare-law-review__action--allow')?.click());
    await page.waitForTimeout(120);
    const afterSynthetic = await pendingState(page, '__rapierAllowCall');
    check('direct page script click() is not the trusted activation the review requires',
      afterSynthetic && afterSynthetic.settled === false, JSON.stringify(afterSynthetic));

    /* Playwright's input path emits the trusted activation a real finger supplies. */
    await page.locator('.compare-law-review__action--allow').click();
    const allowed = await finishPending(page, '__rapierAllowCall');
    log('  original call after ALLOW: ' + JSON.stringify(allowed));
    check('trusted ALLOW finishes that same call, applies once, and the wire carries the review word',
      (allowed.outcome === 'applied' || allowed.outcome === 'rebased') &&
        allowed.review === 'allowed' && allowed.law === 'keep' &&
        allowed.rule === 'law_violated' && Number.isInteger(allowed.region),
      JSON.stringify(allowed));
    await page.waitForFunction(() =>
      window.__webmcp.names().includes('document.get_context'), null, { timeout: 5000 });
    const afterAllow = await page.evaluate(() => document.body.innerText);
    check('the reviewed proposal, and only that proposal, landed',
      afterAllow.includes('the reviewed sentence.') &&
        !afterAllow.includes('the quoted sentence.'), afterAllow.slice(0, 260));
    /* A trusted decision on a held edit IS a look at the segments it decided — the person was
       shown those exact bytes beside the current ones before they touched anything — and it
       lands at once, with no second in the viewport asked of them. So a write they allowed
       arrives already seen: the count this channel owes them does not move for it, where an
       ordinary agent write would have added one. */
    await page.waitForTimeout(900);
    const owedAfterAllow = (await invoke(page, 'document.get_context', {})).value.yourChangesNotShown;
    check('a write the person allowed arrives already seen',
      Number.isInteger(owedBeforeHeld) && owedAfterAllow === owedBeforeHeld,
      JSON.stringify({ owedBeforeHeld, owedAfterAllow }));
  }

  log('### held law: a proposal no person can be shown, then KEEP HELD on one they can');
  const keepRead = await readSection(page, 'Quoted');
  const KEEP_TEXT = 'Quoted\n\nthe sentence KEEP must refuse.';
  /* The same law, the same rule and the same region as the KEEP refusal below, differing only
     in a terminal newline Compare would have to normalise away. The person cannot be shown the
     exact bytes, so the door never opens and nobody decides — and a wire calling that
     `declined` would report a refusal by someone who was never asked. */
  const unshown = keepRead.read && keepRead.read.handle
    ? await page.evaluate(async a => JSON.parse(JSON.parse(await window.__webmcp.call(
      'document.apply_edits',
      { label: 'a proposal Compare cannot show', edits: [{ context_handle: a.handle, text: a.text }] },
    )).content[0].text), { handle: keepRead.read.handle, text: KEEP_TEXT + '\n' })
    : null;
  log('  proposal Compare cannot show exactly: ' + JSON.stringify(unshown));
  check('a proposal no person can be shown says so, never that a person refused it',
    unshown && unshown.outcome === 'refused' && unshown.reason === 'document_law' &&
      unshown.review === 'unavailable' && unshown.rule === 'law_violated' &&
      unshown.law === 'keep' && Number.isInteger(unshown.region), JSON.stringify(unshown));
  check('no decision surface opened for the proposal nobody was shown',
    await page.evaluate(() => !document.querySelector('.compare-law-review__action--allow')));
  if (keepRead.read && keepRead.read.handle) {
    await beginPendingApply(page, '__rapierKeepCall', keepRead.read.handle, KEEP_TEXT,
      'held review keep');
    await page.waitForFunction(() => {
      const allow = document.querySelector('.compare-law-review__action--allow');
      return !!(allow && !allow.disabled);
    }, null, { timeout: 10000 });
    /* The recovery `unavailable` names, taken: the same handle and the same bytes, shaped so
       Compare can show them exactly, reach the person the refusal above never reached. */
    check('the exactly-shaped proposal the refusal left open does reach the person',
      (await pendingState(page, '__rapierKeepCall')).settled === false);
    await page.getByRole('button', { name: 'KEEP HELD', exact: true }).click();
    const kept = await finishPending(page, '__rapierKeepCall');
    log('  original call after KEEP: ' + JSON.stringify(kept));
    check('trusted KEEP refuses that same call by document law',
      kept.outcome === 'refused' && kept.reason === 'document_law', JSON.stringify(kept));
    /* A refusal the person authored and one they were never shown carry the same law and the
       same rule. Only `review` tells them apart, and only that distinction tells an agent
       whether a lone retry has anywhere left to go. */
    check('a declined proposal says the person saw it and refused it',
      kept.rule === 'law_violated' && kept.law === 'keep' && Number.isInteger(kept.region) &&
        kept.review === 'declined', JSON.stringify(kept));
    await page.waitForFunction(() =>
      window.__webmcp.names().includes('document.get_context'), null, { timeout: 5000 });
    const afterKeep = await page.evaluate(() => document.body.innerText);
    check('KEEP leaves the governed bytes unchanged',
      afterKeep.includes('the reviewed sentence.') &&
        !afterKeep.includes('the sentence KEEP must refuse.'), afterKeep.slice(0, 260));
  }

  log('### held law: a batch is refused without opening a decision surface');
  const bulk = await page.evaluate(async () => {
    const unpack = raw => JSON.parse(JSON.parse(raw).content[0].text);
    const outline = unpack(await window.__webmcp.call('document.get_outline', {}));
    const byLabel = label => (outline.sections || []).find(section => section.label === label);
    const quoted = unpack(await window.__webmcp.call('document.read_context', {
      ref: byLabel('Quoted').ref,
    }));
    const secret = unpack(await window.__webmcp.call('document.read_context', {
      ref: byLabel('Secret').ref,
    }));
    const rawApply = await window.__webmcp.call('document.apply_edits', {
      edits: [
        { context_handle: quoted.handle, text: 'Quoted\n\nbulk rewrite one.' },
        { context_handle: secret.handle, text: 'Secret\n\nbulk rewrite two.' },
      ],
    });
    const result = unpack(rawApply);
    return {
      result,
      isError: JSON.parse(rawApply).isError,
      decisionButtons: document.querySelectorAll('#compare-law-review button').length,
      /* Page scope has no engine `rapier` binding. Worse than absent: it is whatever the open
         document names. On a document carrying a heading slugged `rapier` the identifier
         resolves to that <h1> and `rapier.compare.active` throws, aborting this whole probe;
         on every other document it is undefined and the guard short-circuits false, so this
         reported "Compare is closed" no matter what Compare was doing. Ask the surface: the
         comparison instrument is shown, or it is not. */
      compareActive: (() => {
        const mode = document.getElementById('compare-mode');
        return !!(mode && getComputedStyle(mode).display !== 'none');
      })(),
    };
  });
  log('  multi-edit refusal: ' + JSON.stringify(bulk));
  check('a held multi-edit transaction is refused without review',
    bulk.result.outcome === 'refused' && bulk.result.reason === 'document_law' &&
      bulk.decisionButtons === 0 && bulk.compareActive === false, JSON.stringify(bulk));
  check('the batch says the person was never shown it, so a lone edit still can be',
    bulk.result.review === 'batched' && bulk.result.rule === 'law_violated' &&
      bulk.result.law === 'keep', JSON.stringify(bulk.result));
  /* The document-law arm through the envelope: the word the document speaks is a refusal the
     ecosystem's evaluator has to see, exactly like the three the arm table below drives. */
  check('the document speaking is a refusal the evaluator sees',
    bulk.isError === true, JSON.stringify({ isError: bulk.isError }));

  log('### held law: each rule names itself, and the one it leaves open still lands');
  const rules = await page.evaluate(async () => {
    const unpack = raw => JSON.parse(JSON.parse(raw).content[0].text);
    const handleFor = async query => {
      const found = unpack(await window.__webmcp.call('document.find', { query }));
      return (found.matches || [])[0] ? found.matches[0].handle : null;
    };
    const apply = async (handle, text, label) => unpack(await window.__webmcp.call(
      'document.apply_edits', { label, edits: [{ context_handle: handle, text }] }));
    const interior = await apply(await handleFor('the logged line'),
      'REWRITTEN line.', 'append interior');
    /* The refusal above named a tail append; this is that same edit taking it, so the
       descriptor's recovery is witnessed working rather than asserted to. */
    const tail = await apply(await handleFor('the logged line'),
      'the logged line.\nand one appended after it.', 'append at the tail');
    /* A section-wide handle carrying one changed word is narrowed to the bytes it moves and
       lands on unmarked ground, so this path reaches no marker and the law never answers.
       `marker_span_touched` is witnessed where a handle can be minted over marker bytes
       exactly: the desktop suite's will fixtures. */
    const outline = unpack(await window.__webmcp.call('document.get_outline', {}));
    const first = (outline.sections || [])[0];
    const read = first ? unpack(await window.__webmcp.call(
      'document.read_context', { ref: first.ref })) : null;
    const narrowed = read && read.handle && String(read.text || '').includes('alpha')
      ? await apply(read.handle, String(read.text).replace('alpha', 'ALPHA'),
        'one word inside a section-wide handle')
      : { note: 'section text unavailable', read };
    return { interior, tail, narrowed, body: document.body.innerText };
  });
  log('  append interior: ' + JSON.stringify(rules.interior));
  log('  append at tail:  ' + JSON.stringify(rules.tail));
  log('  narrowed word:   ' + JSON.stringify(rules.narrowed));
  check('an append region refuses a rewrite by naming its own law and region',
    rules.interior.outcome === 'refused' && rules.interior.reason === 'document_law' &&
      rules.interior.rule === 'law_violated' && rules.interior.law === 'append' &&
      Number.isInteger(rules.interior.region) && rules.interior.review === undefined,
    JSON.stringify(rules.interior));
  check('the tail append the refusal named actually lands',
    (rules.tail.outcome === 'applied' || rules.tail.outcome === 'rebased') &&
      rules.body.includes('and one appended after it.'), JSON.stringify(rules.tail));
  /* The narrowing is why an `append` refusal above is trustworthy: the law answers for the
     bytes an edit moves, so a broad handle is not itself a refusal and this result carries no
     law vocabulary at all. */
  check('a section-wide handle moving one unmarked word is never answered by the law',
    rules.narrowed && rules.narrowed.reason !== 'document_law' &&
      rules.narrowed.rule === undefined, JSON.stringify(rules.narrowed));

  log('### lifecycle: the tab you open is the writer; the tab that lost the lease is narrowed to read-only tools');
  const page2 = await context.newPage();
  const errors2 = [];
  page2.on('pageerror', e => errors2.push(String(e && e.message || e).slice(0, 300)));
  await page2.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
  await discardDirtyConfirms(page2);
  await page2.waitForTimeout(1800);
  const codeTools = await page2.evaluate(async () => {
    await window.Rapier.document.openPayload({ text: 'def go():\n    return 1\n', name: 'x.py' });
    await new Promise(resolve => setTimeout(resolve, 900));
    return window.__webmcp.names();
  });
  log('  tools on the second page: ' + JSON.stringify(codeTools));
  check('tools registered on the second page', codeTools.length > 0, 'none');
  /* Boot takes the recovery writer lease with `steal`: the page just opened is the writer and
     the first page hears it on its own request promise, so the narrowing is read there. */
  const narrowedTools = await page.evaluate(() => window.__webmcp.names());
  log('  tools on the page that lost the lease: ' + JSON.stringify(narrowedTools));
  check('mutating tools withheld from the page that lost the write lease',
    !narrowedTools.includes('document.apply_edits') &&
      !narrowedTools.includes('document.undo_agent_change') &&
      !narrowedTools.includes('document.save'), JSON.stringify(narrowedTools));
  check('read tools still offered', narrowedTools.includes('document.get_context'),
    JSON.stringify(narrowedTools));
  /* The honest limit. A code document has no surface that can draw a change as a change, so
     there is no delivery channel and no number — absent, which is a different answer from zero
     and is what an omitted fact already means here. */
  const codeContext = unpack(await page2.evaluate(() =>
    window.__webmcp.call('document.get_context', {}))).value;
  check('a document with no delivery channel reports the count absent, not zero',
    !Object.prototype.hasOwnProperty.call(codeContext, 'yourChangesNotShown'),
    JSON.stringify(codeContext.yourChangesNotShown));
  /* THE SAME ABSENCE, READ THROUGH THE WAIT DOOR — the wire shape a null CHECK-blind integer
     changed. document.wait_for_user's event:"delivery" used to read this identical absence and
     answer the opposite way, resolving outcome:"delivery" in the same tick: a claim that a look
     happened on the one surface with no eye to have looked. It now waits the silence out
     honestly and times out instead, driven end-to-end through the real WebMCP wire on this
     second page's own no-lease code document — no engine handle, the same door an agent uses. */
  const blindWait = await page2.evaluate(async () => {
    const startedAt = Date.now();
    const raw = await window.__webmcp.call('document.wait_for_user',
      { event: 'delivery', timeout_ms: 2000 });
    return { raw, waitedMs: Date.now() - startedAt };
  });
  const blindWaitValue = unpack(blindWait.raw).value;
  check('a delivery wait on a document with no delivery channel never claims delivery, and times out quietly',
    blindWaitValue.outcome === 'timeout' && blindWait.waitedMs >= 1900,
    JSON.stringify({ outcome: blindWaitValue, waitedMs: blindWait.waitedMs }));
  /* THE SAME DOOR, NO timeout_ms AT ALL — the field finding that moved the default: a host that
     abandons a pending tool call around 23-30s (ChatGPT's desktop browser) never sees a wait
     built on the old two-minute default return, so the default has to live inside that window.
     Witnessed for real, on the wire, not read off the constant. */
  const defaultWait = await page2.evaluate(async () => {
    const startedAt = Date.now();
    const raw = await window.__webmcp.call('document.wait_for_user', { event: 'delivery' });
    return { raw, waitedMs: Date.now() - startedAt };
  });
  const defaultWaitValue = unpack(defaultWait.raw).value;
  check('an unspecified wait_for_user times out at the twenty-second default, inside every known host\'s patience',
    defaultWaitValue.outcome === 'timeout' && defaultWait.waitedMs >= 19500 && defaultWait.waitedMs < 30000,
    JSON.stringify({ outcome: defaultWaitValue, waitedMs: defaultWait.waitedMs }));
  /* Instrument-sensitivity, not a Markdown privilege: Python is a language this artifact
     highlights and does not parse, so the verb that maps a document's shape is absent. */
  check('the outline is withheld for a language this artifact does not parse',
    !codeTools.includes('document.get_outline'), JSON.stringify(codeTools));
  check('no duplicate-name rejection on re-registration',
    errors2.filter(e => /duplicate tool name/i.test(e)).length === 0,
    errors2.join(' | '));
  /* READ ONLY → OFF on the page that lost the lease takes it back (a second steal) before the
     second page closes, so no retry promotes this page through a reload. */
  const takenBack = await page.evaluate(async () => {
    const off = document.getElementById('switch-read-only-off');
    const state = () => {
      const active = document.querySelector('#switch-read-only [data-active="true"]');
      return { active: active ? active.textContent.trim() : null, offDisabled: off.disabled,
        renameDisabled: document.getElementById('filename-btn').disabled };
    };
    const before = state();
    off.click();
    for (let i = 0; i < 80; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (window.__webmcp.names().includes('document.apply_edits')) break;
    }
    return { before, after: state(), names: window.__webmcp.names() };
  });
  log('  take-back: ' + JSON.stringify(takenBack));
  check('READ ONLY → OFF takes the write lease back and the mutating tools return',
    takenBack.names.includes('document.apply_edits') && takenBack.names.includes('document.open_text'),
    JSON.stringify(takenBack));
  await page2.close();

  /* HOSTILE ARGUMENTS. No user agent validates a published inputSchema before calling, and a
     Speedracer host is under no obligation to either, so each operation's own handler is the
     only enforcer either transport has. Every tool registered here is given, for each field its
     schema declares, the shapes that schema forbids — wrong type, over-length string,
     out-of-range number, unknown enum — and one field the schema does not declare. A `refused`
     row must answer with the reason named beside it. An `unreachable` row is one whose
     projection builds the canonical request from named fields, so the hostile value never
     reaches the operation at all and the answer must equal the clean call's, byte for byte
     except the handles a read mints fresh each time. The document the agent can read is walked
     through the published surface before and after: no refusal may cost a byte. */
  /* THE MAP NAMES ITS OWN ENTRANCE. A heading the outline discloses is a place the agent was
     told about, so every one of them — across every page of the walk, not just the first —
     has to be reachable by the reference it was disclosed with. A label with no route to its
     bytes is the guess-and-bulk-read the authority model exists to prevent. */
  log('### every heading the outline discloses is reachable by the reference it carries');
  const walked = [];
  const unreachable = [];
  let walkCursor = '';
  for (let leg = 0; leg < 8; leg++) {
    const map = (await invoke(page, 'document.get_outline',
      walkCursor ? { cursor: walkCursor } : {})).value;
    for (const section of map.sections || []) {
      walked.push(section.label);
      const reached = (await invoke(page, 'document.read_context', { ref: section.ref })).value;
      if (reached.outcome !== 'read') {
        unreachable.push(section.label + '=' + reached.outcome + '/' + reached.reason);
      }
    }
    walkCursor = map.next_cursor || '';
    if (!walkCursor) break;
  }
  log('  walked ' + walked.length + ' headings across the whole outline');
  check('every disclosed heading resolves to its own bytes through read_context',
    walked.length > 0 && unreachable.length === 0,
    JSON.stringify({ walked: walked.length, unreachable }).slice(0, 400));

  /* THE CLOCK RIDES THE NAME. A handle, a section ref and a walk cursor all stop working after
     the same span, and the moment an agent is holding one is the moment it needs that fact —
     not a sentence in prose it never reads, and not a number frozen into a description that
     would be wrong the day the span moved. One surface, one clock, stated where minted. */
  log('### every minted name states its own clock');
  const clockOutline = (await invoke(page, 'document.get_outline', {})).value;
  const clockSection = (clockOutline.sections || [])[0];
  const clockRead = clockSection
    ? (await invoke(page, 'document.read_context', { ref: clockSection.ref })).value : {};
  const clockFind = (await invoke(page, 'document.find', { query: 'paragraph' })).value;
  /* get_context names the passage the person is in, so there has to be a person in one: put
     the caret where a thumb would, through the rendered surface, before asking. */
  await page.locator('#editor-blocks .block-read').first().click();
  await page.waitForTimeout(300);
  const clockContext = (await invoke(page, 'document.get_context', {})).value;
  await page.keyboard.press('Escape');
  const minted = [
    ['get_outline section ref', clockSection && clockSection.ref, clockOutline.expires_in_ms],
    ['read_context page handle', clockRead.handle, clockRead.expires_in_ms],
    ['find match handle', ((clockFind.matches || [])[0] || {}).handle, clockFind.expires_in_ms],
    ['get_context focus ref or selection handle',
      (clockContext.focus && clockContext.focus.ref) || clockContext.handle,
      clockContext.expires_in_ms],
  ];
  log('  ' + JSON.stringify(minted.map(row => [row[0], row[2]])));
  check('every result that hands over a name states when that name dies',
    minted.every(row => !!row[1] && Number.isSafeInteger(row[2]) && row[2] > 0),
    JSON.stringify(minted));
  /* One clock, and it counts down: every kind is inside the same life and none of them is the
     constant restated — a name minted a moment ago has a little less than the whole of it. */
  /* ONE UNIT FOR EVERY DECLARED BOUND, and the declaration says what it depends on. A bound
     written as `maxLength` is characters — the door clips in characters — so a value inside its
     bound in that unit may not be refused for being longer in UTF-16 code units, and a field the
     handler will only accept beside another says so where it is declared rather than only in its
     own description. */
  /* THE POSITIVE CONTROL for the shape gate: a door that refuses everything passes every
     refusal test. Every call the harness has made up to this line is a legal one, across every
     tool it drove, and not one of them may have been refused for its shape. The line sits here
     because everything below it deliberately malforms something; the one legal call below is the
     astral query, and its own check asserts it searched. */
  const legalCallsBeforeHostility = observed.length;
  log('### a declared bound means what the declaration says it means');
  const astral = '🙂'.repeat(2400);
  const astralFind = (await invoke(page, 'document.find', { query: astral })).value;
  check('a query inside its bound in characters is not refused for its code units',
    astralFind.outcome === 'searched',
    JSON.stringify({ characters: [...astral].length, units: astral.length, astralFind }).slice(0, 220));
  const findSchema = await page.evaluate(() => {
    const entry = window.__webmcp.entry('document.find');
    return entry ? entry.inputSchema : null;
  });
  check('the schema declares that within is only legal beside a kind',
    !!findSchema && !!findSchema.dependentRequired &&
      JSON.stringify(findSchema.dependentRequired.within) === JSON.stringify(['kind']),
    JSON.stringify(findSchema && findSchema.dependentRequired));
  /* And the door EXECUTES that declaration, which is the half a schema alone never proves. The
     handler used to answer this question too; with the door answering first, the handler's copy
     was a second executor of one sentence and is gone. */
  const orphanWithin = (await invoke(page, 'document.find',
    { query: 'alpha', within: 'sec_nope' })).value;
  check('a dependent field without the field it depends on is refused at the door, by name',
    orphanWithin.reason === 'invalid_arguments' &&
    /within needs .*kind/.test(String(orphanWithin.message || '')),
    JSON.stringify(orphanWithin).slice(0, 200));
  /* The positive half: beside its kind the same field is admitted, so the dependency refuses a
     shape rather than a capability. */
  const pairedWithin = (await invoke(page, 'document.find',
    { query: 'alpha', kind: 'declaration', within: 'sec_nope' })).value;
  check('the same field beside the one it depends on is admitted',
    pairedWithin.reason !== 'invalid_arguments', JSON.stringify(pairedWithin).slice(0, 200));
  /* The other side of the unit question: one character past the declared bound, in the unit the
     declaration names, is refused — and refused at the door, which is now the only place that
     counts it. */
  const overBound = (await invoke(page, 'document.find', { query: 'q'.repeat(4097) })).value;
  check('a query one character past its declared bound is refused at the door',
    overBound.reason === 'invalid_arguments' &&
    /input\.query is longer than 4096 characters/.test(String(overBound.message || '')),
    JSON.stringify(overBound).slice(0, 200));

  const emptyQuery = (await invoke(page, 'document.find', { query: '' })).value;
  check('an explicit empty query is refused before it can mint or return a match',
    emptyQuery.outcome === 'invalid' && emptyQuery.reason === 'invalid_query' &&
      (emptyQuery.matches || []).length === 0 && emptyQuery.next_cursor == null &&
      !Object.prototype.hasOwnProperty.call(emptyQuery, 'expires_in_ms'),
    JSON.stringify(emptyQuery).slice(0, 240));

  check('one surface, one clock: every minted kind is inside the same life',
    minted.every(row => row[2] > 0 && row[2] <= 300000),
    JSON.stringify(minted.map(row => row[2])));
  /* And it counts DOWN: an outline walked twice over an unchanged document shares one ticket,
     so the same row is older the second time and says so. A name minted in this very millisecond
     may honestly report the whole life; a name asked about twice may not report the same. */
  await page.waitForTimeout(1200);
  const laterOutline = (await invoke(page, 'document.get_outline', {})).value;
  check('the clock is the name\'s remaining life, never the policy restated',
    laterOutline.expires_in_ms < clockOutline.expires_in_ms,
    JSON.stringify({ first: clockOutline.expires_in_ms, later: laterOutline.expires_in_ms }));
  /* The other half: a clock over nothing is noise, so a result that mints no name carries none. */
  const clockless = (await invoke(page, 'document.show_changes', {})).value;
  check('a result that hands over no name states no clock',
    !Object.prototype.hasOwnProperty.call(clockless, 'expires_in_ms'),
    JSON.stringify(clockless).slice(0, 200));

  const changeSelectorSchemas = await page.evaluate(() => {
    const operations = JSON.parse(document.querySelector(
      'script[type="application/speedracer-app+json"]').textContent).operations;
    return ['document.compare', 'document.undo_agent_change'].map(name => ({
      name,
      canonical: operations.find(operation => operation.name === name)
        ?.input?.properties?.change_id?.minLength,
      web: window.__webmcp.entry(name)?.inputSchema?.properties?.change_id?.minLength,
    }));
  });
  const emptyUndoSelector = (await invoke(page,
    'document.undo_agent_change', { change_id: '' })).value;
  const emptyCompareSelector = (await invoke(page,
    'document.compare', { change_id: '' })).value;
  check('an explicit empty change_id is invalid at both operations while omission stays the latest selector',
    changeSelectorSchemas.every(schema => schema.canonical === 1 && schema.web === 1) &&
      [emptyUndoSelector, emptyCompareSelector].every(result =>
        result.outcome === 'invalid' && result.reason === 'invalid_change_id') &&
      await page.evaluate(() => window.__webmcp.names().includes('document.find')),
    JSON.stringify({ changeSelectorSchemas, emptyUndoSelector, emptyCompareSelector }).slice(0, 500));

  const contradictoryComparisons = [];
  for (const input of [
    { text: 'an alternative', change_id: 'no-such-change' },
    { name: 'a name without alternative text' },
  ]) {
    contradictoryComparisons.push((await invoke(page, 'document.compare', input)).value);
  }
  check('contradictory compare selectors are invalid and never open the comparison surface',
    contradictoryComparisons.every(result =>
      result.outcome === 'invalid' && result.reason === 'conflicting_selectors') &&
      await page.evaluate(() => window.__webmcp.names().includes('document.find')),
    JSON.stringify(contradictoryComparisons).slice(0, 400));

  /* A REFUSAL THE ECOSYSTEM CAN SEE. Rapier's four arms live in the body and always have; nothing
     outside this page reads them. The evaluator every entrant runs — and a judge running smoke
     mode against the live site — decides a call failed only through the predicate copied above,
     so before this the deliberate refusals scored as passes and every refusal case in every eval
     suite passed vacuously. The envelope now says the one word the protocol has, and the body
     still says which refusal it was. */
  log('### a refusal is legible to the evaluator the field actually runs');
  const refusalArms = [
    ['document.read_context', { ref: 'rref_ffffffffffffffff_ffffffffffffffff' }, 'target_gone'],
    ['document.reveal', { context_handle: 'rctx_' + 'f'.repeat(32) }, 'target_gone'],
    /* The declared-input door could not READ a wrong-typed query and consulted no law, so the
       arm here is `invalid` — a different word for a different refusal, which is the point. */
    ['document.find', { query: 7 }, 'invalid'],
    ['document.apply_edits', { edits: [{ context_handle: 'rctx_' + 'f'.repeat(32), text: 'x' }] }, 'target_gone'],
  ];
  const armRows = [];
  for (const [operation, input, expected] of refusalArms) {
    const meta = await invoke(page, operation, input);
    armRows.push({
      operation, outcome: meta.value.outcome, expected,
      isError: meta.envelope.isError,
      seenByTheEvaluator: explicitToolFailure(meta.envelope),
      reasonStillInTheBody: String(meta.value.reason || ''),
    });
  }
  log('  ' + JSON.stringify(armRows));
  check('every refusal arm carries isError on the envelope',
    armRows.every(row => row.isError === true), JSON.stringify(armRows));
  check('and the evaluator the ecosystem ships now scores each of them as a failure',
    armRows.every(row => row.seenByTheEvaluator === true), JSON.stringify(armRows));
  check('while the exact reason stays in the body, so an agent reformulates rather than retries',
    armRows.every(row => row.reasonStillInTheBody.length > 0 && row.outcome === row.expected),
    JSON.stringify(armRows));
  const successMeta = await invoke(page, 'document.get_context', {});
  check('a success carries no isError and is not scored as a failure',
    successMeta.envelope.isError === undefined &&
      explicitToolFailure(successMeta.envelope) === false,
    JSON.stringify({ isError: successMeta.envelope.isError, outcome: successMeta.value.outcome }));
  /* An answer that is not a refusal must not be dressed as one: a document with no structure to
     map, and a person who simply did not act, are both true answers to the question asked. This
     operation reports that as `outcome: 'unavailable'` (`_RAPIER_WEBMCP_REFUSAL_ARMS` deliberately
     excludes it, beside `timeout`) — never as `'rejected'`, which this same tool reserves for a
     cursor the door itself calls malformed. The old predicate compared against `'rejected'`, a
     member of the refusal set that this exact input never produces, so `!== 'rejected'` held no
     matter what `isError` carried and the check passed on every input, including a hypothetical
     bug that set `isError` here too. The premise is asserted first so a fixture that stopped
     being quiet fails loudly instead of the check quietly stopping being a test of anything. */
  const quietMeta = await invoke(page, 'document.get_outline', { cursor: 'ocur_' + '0'.repeat(32) });
  check('an expired outline cursor is answered quietly, as unavailable, not one of the four refusal arms',
    quietMeta.value.outcome === 'unavailable' && quietMeta.value.reason === 'outline_expired',
    JSON.stringify({ outcome: quietMeta.value.outcome, reason: quietMeta.value.reason }));
  check('a quiet answer is not dressed as a failure',
    quietMeta.value.outcome !== 'unavailable' || quietMeta.envelope.isError !== true,
    JSON.stringify({ outcome: quietMeta.value.outcome, isError: quietMeta.envelope.isError }));

  log('### hostile arguments are refused by name and cost the document nothing');
  const HOSTILE_LONG = 'x'.repeat(600);
  /* Names are minted fresh on every call — a focus ref and a page handle are new objects for
     identical questions — so two answers are compared as everything except the names in them. */
  const stable = value => JSON.stringify(value,
    (key, item) => (key === 'handle' || key === 'ref' ? null : item));
  async function agentVisibleDocument() {
    const map = (await invoke(page, 'document.get_outline', {})).value;
    const pages = [];
    for (const section of map.sections || []) {
      const read = (await invoke(page, 'document.read_context', { ref: section.ref })).value;
      pages.push([section.label, section.chars, read.outcome, read.text].join(''));
    }
    return JSON.stringify({ total: map.total, pages });
  }
  const documentBeforeHostility = await agentVisibleDocument();
  const hostileRef = ((await invoke(page, 'document.get_outline', {})).value.sections || [])[0];
  const HOSTILE = [
    ['document.get_context', '(undeclared)', 'unknown extra field', { nonesuch: 1 }, 'invalid_arguments'],

    ['document.get_outline', 'parent_ref', 'wrong type', { parent_ref: 7 }, 'invalid_arguments'],
    ['document.get_outline', 'parent_ref', 'over-length string', { parent_ref: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.get_outline', 'cursor', 'wrong type', { cursor: 7 }, 'invalid_arguments'],
    ['document.get_outline', 'cursor', 'over-length string', { cursor: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.get_outline', '(undeclared)', 'unknown extra field', { nonesuch: 1 }, 'invalid_arguments'],

    ['document.read_context', 'ref', 'wrong type', { ref: 7 }, 'invalid_arguments'],
    ['document.read_context', 'ref', 'over-length string', { ref: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.read_context', 'representation', 'unknown enum',
      { ref: hostileRef.ref, representation: 'braille' }, 'invalid_arguments'],
    ['document.read_context', 'cursor', 'over-length string',
      { ref: hostileRef.ref, cursor: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.read_context', '(undeclared)', 'unknown extra field',
      { ref: hostileRef.ref, nonesuch: 1 }, 'invalid_arguments'],

    ['document.find', 'query', 'wrong type', { query: 7 }, 'invalid_arguments'],
    ['document.find', 'query', 'over-length string', { query: 'y'.repeat(5000) }, 'invalid_arguments'],
    ['document.find', 'cursor', 'out-of-range number', { query: 'a', cursor: 'rcur_9999' }, 'invalid_cursor'],
    ['document.find', 'kind', 'unknown enum', { query: 'a', kind: 'sideways' }, 'invalid_arguments'],
    ['document.find', 'within', 'over-length string',
      { query: 'a', kind: 'declaration', within: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.find', '(undeclared)', 'unknown extra field',
      { query: 'alpha', nonesuch: 1 }, 'invalid_arguments'],

    ['document.apply_edits', 'edits', 'wrong type', { edits: 'nope' }, 'invalid_arguments'],
    ['document.apply_edits', 'edits', 'out-of-range count',
      { edits: new Array(17).fill({ context_handle: 'rctx_nope', text: 'a' }) }, 'invalid_arguments'],
    ['document.apply_edits', 'edits[].context_handle', 'over-length string',
      { edits: [{ context_handle: HOSTILE_LONG, text: 'a' }] }, 'invalid_arguments'],
    ['document.apply_edits', 'edits[].text', 'wrong type',
      { edits: [{ context_handle: 'rctx_nope', text: 7 }] }, 'invalid_arguments'],
    ['document.apply_edits', 'note', 'one character past its declared bound',
      { edits: [{ context_handle: 'rctx_' + 'f'.repeat(32), text: 'x' }], note: 'n'.repeat(241) },
      'invalid_arguments'],
    ['document.apply_edits', 'edits[].placement', 'unknown enum',
      { edits: [{ context_handle: 'rctx_nope', text: 'a', placement: 'sideways' }] }, 'invalid_arguments'],
    ['document.apply_edits', 'label', 'over-length string',
      { edits: [{ context_handle: 'rctx_nope', text: 'a' }], label: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.apply_edits', '(undeclared)', 'unknown extra field',
      { edits: [{ context_handle: 'rctx_nope', text: 'a' }], nonesuch: 1 }, 'invalid_arguments'],

    ['document.undo_agent_change', 'change_id', 'wrong type', { change_id: 7 }, 'invalid_arguments'],
    ['document.undo_agent_change', 'change_id', 'over-length string', { change_id: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.undo_agent_change', '(undeclared)', 'unknown extra field',
      { change_id: 'no-such-change', nonesuch: 1 }, 'invalid_arguments'],

    ['document.reveal', 'context_handle', 'wrong type', { context_handle: 7 }, 'invalid_arguments'],
    ['document.reveal', 'context_handle', 'over-length string', { context_handle: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.reveal', '(undeclared)', 'unknown extra field',
      { context_handle: 'rctx_nope', nonesuch: 1 }, 'invalid_arguments'],

    ['document.compare', 'change_id', 'over-length string', { change_id: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.compare', 'text', 'wrong type', { text: 7 }, 'invalid_arguments'],
    ['document.compare', 'text', 'over-length string', { text: 'z'.repeat(65537) }, 'invalid_arguments'],
    ['document.compare', 'name', 'wrong type', { text: 'an alternative', name: 7 }, 'invalid_arguments'],
    ['document.compare', 'name', 'over-length string',
      { text: 'an alternative', name: 'n'.repeat(513) }, 'invalid_arguments'],
    ['document.compare', '(undeclared)', 'unknown extra field',
      { change_id: 'no-such-change', nonesuch: 1 }, 'invalid_arguments'],

    ['document.wait_for_user', 'event', 'wrong type', { event: 7 }, 'invalid_arguments'],
    ['document.wait_for_user', 'event', 'unknown enum', { event: 'sideways' }, 'invalid_arguments'],
    ['document.wait_for_user', 'context_handle', 'over-length string',
      { event: 'edit', context_handle: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.wait_for_user', 'prompt', 'over-length string',
      { event: 'message', prompt: HOSTILE_LONG }, 'invalid_arguments'],
    ['document.wait_for_user', 'timeout_ms', 'out-of-range number',
      { event: 'edit', context_handle: 'rctx_nope', timeout_ms: 999999999 }, 'invalid_timeout'],
    ['document.wait_for_user', '(undeclared)', 'unknown extra field',
      { event: 'edit', context_handle: 'rctx_nope', nonesuch: 1 }, 'invalid_arguments'],

    ['document.open_text', 'filename', 'wrong type', { filename: 7, content: 'a' }, 'invalid_arguments'],
    ['document.open_text', 'filename', 'over-length string',
      { filename: HOSTILE_LONG + '.md', content: 'a' }, 'invalid_arguments'],
    ['document.open_text', 'content', 'wrong type', { filename: 'a.md', content: 7 }, 'invalid_arguments'],
    ['document.open_text', '(undeclared)', 'unknown extra field',
      { filename: '', content: 'a', nonesuch: 1 }, 'invalid_arguments'],

    ['document.show_changes', '(undeclared)', 'unknown extra field', { nonesuch: 1 }, 'invalid_arguments'],
  ];
  const hostileFailures = [];
  const hostileCovered = new Set();
  for (const [operation, field, shape, input, expectation] of HOSTILE) {
    hostileCovered.add(operation);
    const answer = (await invoke(page, operation, input)).value;
    const where = operation + ' ' + field + ' (' + shape + ')';
    if (String(answer && answer.reason || '') !== expectation) {
      hostileFailures.push(where + ' answered ' + JSON.stringify(answer).slice(0, 140));
    }
    /* The door names the path that failed, because an agent told only "invalid" retries the
       same typo. A refusal that does not say where is half a refusal. */
    if (expectation === 'invalid_arguments' &&
        !/\binput\b/.test(String(answer && answer.message || ''))) {
      hostileFailures.push(where + ' refused without naming the path: ' +
        JSON.stringify(answer).slice(0, 140));
    }
  }
  const documentAfterHostility = await agentVisibleDocument();
  log('  ' + HOSTILE.length + ' hostile shapes across ' + hostileCovered.size + ' operations');
  /* Two owners, one division: a shape the contract does not describe is refused at the door with
     the path that failed, and a value the contract does describe but the document cannot honour
     is refused by the operation with its own reason. Nothing is ignored, which is what the
     `unreachable` expectation this table used to carry asserted — an unknown field reaching the
     handler and being dropped on the floor was the defect, not the contract. */
  check('every hostile argument is refused, by the door for its shape and its operation for its meaning',
    hostileFailures.length === 0, JSON.stringify(hostileFailures).slice(0, 600));
  check('no refusal changed a byte the agent can read',
    documentBeforeHostility === documentAfterHostility,
    documentAfterHostility.slice(0, 200));
  /* A tool left out of the table above is a tool whose published bounds nothing enforces.
     compare.* is covered inside the comparison it needs; document.save is not published here. */
  const offeredNow = (await page.evaluate(() => window.__webmcp.names()))
    .filter(name => !hostileCovered.has(name));
  check('every document tool the agent is offered was given hostile arguments',
    offeredNow.length === 0, JSON.stringify(offeredNow));

  /* ── A TYPO MUST NEVER SELECT A MORE DESTRUCTIVE DEFAULT ────────
     The whole reason the door exists, driven on a REAL delivered handle rather than a refused
     one: `placment` is silently absent, `placement` falls back to `replace`, and an agent that
     meant to insert before the text it had inspected deletes it instead. So the misspelling must
     refuse and leave the bytes alone, and the correct spelling must then do the thing it names. */
  /* A match handle, not a section handle: a section's target is its whole page, which admits no
     `before`, and this witness has to reach the insertion the typo would have turned into a
     replacement. */
  const typoMatch = ((await invoke(page, 'document.find', { query: 'alpha' })).value.matches || [])
    .find(match => match.handle);
  const typoRead = { handle: typoMatch && typoMatch.handle };
  const beforeTypo = await agentVisibleDocument();
  const typoAnswer = (await invoke(page, 'document.apply_edits', {
    edits: [{ context_handle: typoRead.handle, text: 'INSERTED ', placment: 'before' }],
  })).value;
  const afterTypo = await agentVisibleDocument();
  check('a misspelled placement refuses on a live handle and moves no byte',
    typoAnswer.reason === 'invalid_arguments' &&
    /placment/.test(String(typoAnswer.message || '')) && beforeTypo === afterTypo,
    JSON.stringify({ answer: typoAnswer, moved: beforeTypo !== afterTypo }).slice(0, 260));
  /* The same handle is still spendable, because a refusal at the door consumed nothing. */
  const spelledAnswer = (await invoke(page, 'document.apply_edits', {
    edits: [{ context_handle: typoRead.handle, text: 'INSERTED ', placement: 'before' }],
  })).value;
  const afterSpelled = await agentVisibleDocument();
  check('the correctly spelled placement then inserts, on the handle the refusal did not spend',
    spelledAnswer.outcome === 'applied' && afterSpelled !== afterTypo &&
    afterSpelled.includes('INSERTED '),
    JSON.stringify(spelledAnswer).slice(0, 200));
  /* Every optional field of the mutation, misspelled in turn: not one may fall through to a
     default. `label` is the other one, and a dropped label mislabels a change in the person's
     own history. */
  const typoFallthrough = [];
  for (const [field, row] of [
    ['placement', { context_handle: typoRead.handle, text: 'x', placment: 'after' }],
    ['label', { context_handle: typoRead.handle, text: 'x' }],
  ]) {
    const request = field === 'label'
      ? { edits: [row], labl: 'a mislabelled change' } : { edits: [row] };
    const answer = (await invoke(page, 'document.apply_edits', request)).value;
    if (answer.reason !== 'invalid_arguments') {
      typoFallthrough.push(field + ' fell through: ' + JSON.stringify(answer).slice(0, 120));
    }
  }
  check('no misspelled optional field of a mutation selects a default instead of refusing',
    typoFallthrough.length === 0, JSON.stringify(typoFallthrough));

  /* AN INHERITED NAME IS NOT A DECLARED ONE. Every JSON object inherits `constructor`,
     `toString` and `valueOf`, and JSON.parse gives `__proto__` as an ordinary own key — so a
     declaration indexed by a caller's key answers "declared" for names nobody declared. The
     attack that makes it concrete is a row carrying `constructor: "before"` where `placement`
     belongs: admitted, the placement is absent and the destructive default replaces the very
     text the agent meant to insert before.
     Delivered as RAW JSON TEXT through executeTool, the way a user agent delivers a model's
     arguments — `__proto__` does not survive being passed as a live object across a debugging
     protocol, so an object argument would have quietly tested three names instead of four. */
  const inheritedFaults = [];
  for (const key of ['constructor', 'toString', 'valueOf', '__proto__']) {
    const answers = await page.evaluate(async ({ key, handle }) => {
      const call = async (name, raw) => {
        const tool = (await document.modelContext.getTools()).find(t => t.name === name);
        if (!tool) return { missing: true };
        try {
          const envelope = await document.modelContext.executeTool(tool, raw, {});
          return JSON.parse(JSON.parse(envelope).content[0].text);
        } catch (error) { return { threw: String(error && error.message || error) }; }
      };
      return {
        root: await call('document.get_outline', '{"' + key + '":1}'),
        nested: await call('document.apply_edits', '{"edits":[{"context_handle":"' + handle +
          '","text":"INSERTED ","' + key + '":"before"}]}'),
      };
    }, { key, handle: typoRead.handle });
    for (const [where, answer] of Object.entries(answers)) {
      if (answer.reason !== 'invalid_arguments' ||
          String(answer.message || '').indexOf(key) < 0) {
        inheritedFaults.push(where + ' ' + key + ' -> ' + JSON.stringify(answer).slice(0, 110));
      }
    }
  }
  const afterInherited = await agentVisibleDocument();
  check('an inherited name is refused at every closed object, root and nested, and moves no byte',
    inheritedFaults.length === 0 && afterInherited === afterSpelled,
    JSON.stringify(inheritedFaults).slice(0, 400));

  /* A batch the declaration already refuses must cost nothing to refuse: the count is decided
     before any row is walked. Built and timed INSIDE the page, because two hundred thousand rows
     handed across a debugging protocol would measure the protocol and call it the walker. */
  const batch = await page.evaluate(async (rows) => {
    const tool = (await document.modelContext.getTools())
      .find(t => t.name === 'document.apply_edits');
    const time = async count => {
      const edits = new Array(count).fill({ context_handle: 'rctx_nope', text: 'x' });
      const raw = JSON.stringify({ edits });
      const started = performance.now();
      const envelope = await document.modelContext.executeTool(tool, raw, {});
      return { ms: performance.now() - started,
        answer: JSON.parse(JSON.parse(envelope).content[0].text) };
    };
    const huge = await time(rows);
    const small = await time(17);
    return { huge, small, rows };
  }, 200000);
  log('  ' + batch.rows + ' rows refused in ' + batch.huge.ms.toFixed(2) +
    'ms; 17 rows in ' + batch.small.ms.toFixed(2) + 'ms');
  check('an over-limit batch is refused by its count, before any row is walked',
    batch.huge.answer.reason === 'invalid_arguments' &&
    /edits has 200000, more than the 16 declared/.test(String(batch.huge.answer.message || '')) &&
    batch.huge.ms < 250,
    JSON.stringify({ answer: batch.huge.answer, hugeMs: batch.huge.ms, smallMs: batch.small.ms })
      .slice(0, 240));

  /* An unknown field at every closed object the contract nests, not only at the top. */
  const nestedFaults = [];
  for (const [where, request] of [
    ['edits[]', { edits: [{ context_handle: typoRead.handle, text: 'x', nonesuch: 1 }] }],
    ['top level', { edits: [{ context_handle: typoRead.handle, text: 'x' }], nonesuch: 1 }],
  ]) {
    const answer = (await invoke(page, 'document.apply_edits', request)).value;
    if (answer.reason !== 'invalid_arguments' || !/nonesuch/.test(String(answer.message || ''))) {
      nestedFaults.push(where + ' answered ' + JSON.stringify(answer).slice(0, 120));
    }
  }
  const afterNested = await agentVisibleDocument();
  check('an undeclared field is refused at every nested closed object, naming its path',
    nestedFaults.length === 0 && afterNested === afterSpelled, JSON.stringify(nestedFaults));

  /* A request that is not an object at all. Driven through executeTool with the RAW JSON text a
     user agent hands over, because the harness's own `call` helper rounds a null to `{}` and
     would test its own convenience instead of the door. `undefined` is a call with no arguments
     and stays legal; an array, a scalar and an explicit null name nothing and must reach nothing. */
  const shapeFaults = [];
  const shapeDriven = [];
  for (const operation of ['document.show_changes', 'document.list_changes', 'document.get_context']) {
    for (const raw of ['[]', '7', '"go"', 'null']) {
      const answer = await page.evaluate(async ({ operation, raw }) => {
        const tool = (await document.modelContext.getTools())
          .find(candidate => candidate.name === operation);
        if (!tool) return { missing: true };
        try {
          const envelope = await document.modelContext.executeTool(tool, raw, {});
          /* executeTool answers with the envelope as JSON TEXT, exactly as a user agent
             delivers it; unpacking it here is what makes this the real door. */
          return JSON.parse(JSON.parse(envelope).content[0].text);
        } catch (error) { return { threw: String(error && error.message || error) }; }
      }, { operation, raw });
      if (answer.missing) continue;
      shapeDriven.push(operation + ' ' + raw);
      /* A scalar, an array or an explicit null is a request the door could not read, so it
         leaves by the one word for that — never silently rounded to an empty object and run. */
      if (answer.reason !== 'invalid_arguments' || answer.outcome !== 'invalid') {
        shapeFaults.push(operation + ' ' + raw + ' answered ' +
          JSON.stringify(answer).slice(0, 110));
      }
    }
  }
  const afterShapes = await agentVisibleDocument();
  /* The review surface is `#compare-law-review`; the guard reads the element that exists, so a
     hold is proven by the glass and never by a selector that matches nothing. */
  const compareOpened = await page.evaluate(() =>
    !!document.querySelector('#compare-law-review[data-visible="true"]'));
  log('  ' + shapeDriven.length + ' non-object requests driven as raw JSON');
  check('a request that is not an object answers `invalid` before any surface or byte moves',
    shapeDriven.length > 0 && shapeFaults.length === 0 && afterShapes === afterNested &&
    !compareOpened,
    JSON.stringify(shapeFaults).slice(0, 300));

  const wronglyRefused = observed.slice(0, legalCallsBeforeHostility)
    .filter(entry => entry.value && entry.value.reason === 'invalid_arguments');
  log('  ' + legalCallsBeforeHostility + ' legal calls were driven before anything was malformed');
  check('no legal request was refused for its shape',
    legalCallsBeforeHostility > 0 && wronglyRefused.length === 0,
    JSON.stringify(wronglyRefused.map(entry => entry.name + ' ' +
      String(entry.value.message || '')).slice(0, 4)));

  /* Rapier offers these three to every browser agent and the harness had never called one of
     them, so nothing proved they answer at all. Driven last: open_text replaces the document. */
  /* THE WORD A DOOR SPEAKS IS THE WORD ITS OPERATION COMPUTED. The census below is a closure
     check: it catches a word nobody declared. It cannot catch a DECLARED word used for the wrong
     fact — a projection that quietly answers `refused` where its own operation already computed
     `invalid` satisfies "spoke only from its declared enum" perfectly, and that is exactly how
     `document.open_text` shipped every content refusal under the word for a request it had
     understood. So this drives the arms directly, on a fresh page, with the request shapes that
     reach each one, and reads the word back off the wire. Each row is a fact the door computes
     and a word WILL-1 fixes for it: content the codec could not read, a name it could not read,
     a lens the contract does not name, a continuation that names no position — all `invalid`,
     none of them a state this host chose. */
  log('### every door speaks the word its own operation computed');
  /* Driven here, on the page that has provably published the write tools — every row below is a
     refusal, so none of them moves a byte, opens a comparison, or replaces the document the
     sections after this one still read. */
  const wordTools = await page.evaluate(() => window.__webmcp.names());
  check('this page published every tool the arms spend',
    ['document.open_text', 'document.compare', 'document.get_outline', 'document.find']
      .every(name => wordTools.includes(name)), JSON.stringify(wordTools));
  const ARMS = [
    /* the door this lane exists to fix, and the two facts commit 086c788 named apart */
    ['document.open_text', { filename: 'brief.md', content: 'vertical\u000btab' },
      'invalid', 'content_control_characters'],
    /* NUL rather than an unpaired surrogate: the fact under test is that the two reasons arrive
       APART on the wire, and a lone surrogate cannot cross the driver's own serialisation intact
       to prove it. The surrogate pair is pinned at the kernel by the desktop suite. */
    ['document.open_text', { filename: 'brief.md', content: 'chapter one\u0000chapter two' },
      'invalid', 'content_not_utf8_text'],
    ['document.open_text', { filename: 'docs/brief.md', content: '# Brief' },
      'invalid', 'filename_invalid'],
    /* its structural twin: the same codec, the same shape of fact, the same words */
    ['document.compare', { text: '' }, 'invalid', 'text_invalid'],
    ['document.compare', { text: 'an alternative', name: 'a\u000bname' }, 'invalid', 'name_invalid'],
    ['document.compare', { text: 'vertical\u000btab' }, 'invalid', 'text_control_characters'],
    /* The declared-input door reads this one first — the lens enum is published — so the reason
       is the door's, not the handler's. The word is the same either way, which is the point:
       `unknown_lens` is reachable only through the host seam, where no schema closes the set. */
    ['document.compare', { text: 'an alternative', lens: 'sideways' }, 'invalid', 'invalid_arguments'],
    ['document.compare', { change_id: 'no-such-change' }, 'refused', 'baseline_unavailable'],
    /* the two doors whose refusal word the manifest did not declare */
    /* A cursor that names no position at all, not one that named one and expired: an `ocur_`
       shaped name Rapier no longer holds is `unavailable`/`outline_expired`, a true answer
       rather than a refusal, and asserting `invalid` there would be the same wrong-word defect
       in the other direction. */
    ['document.get_outline', { cursor: 'not-a-cursor' }, 'invalid', 'invalid_cursor'],
    ['document.find', { query: 'a', cursor: 'rcur_9999' }, 'invalid', 'invalid_cursor'],
  ];
  const wordRows = [];
  for (const [operation, input, expectedOutcome, expectedReason] of ARMS) {
    const meta = await invoke(page, operation, input);
    wordRows.push({
      operation, expectedOutcome, expectedReason,
      outcome: String(meta.value.outcome || ''), reason: String(meta.value.reason || ''),
      isError: meta.envelope.isError === true,
    });
  }
  const wrongWord = wordRows.filter(row =>
    row.outcome !== row.expectedOutcome || row.reason !== row.expectedReason);
  log('  ' + wordRows.length + ' arms driven: '
    + JSON.stringify(wordRows.map(row => row.operation + ' ' + row.outcome + '/' + row.reason)));
  check('every arm answers the word its own operation computed, with its own reason',
    wordRows.length === ARMS.length && wrongWord.length === 0, JSON.stringify(wrongWord));
  check('and each of those refusals carries isError',
    wordRows.every(row => row.isError === true),
    JSON.stringify(wordRows.filter(row => !row.isError)));
  /* And the declaration covers them: a word a door emits and its manifest does not name is a
     door the census cannot judge, which is how two operations answered a Will refusal word with
     no enum to check it against. */
  const armDeclarations = await page.evaluate(() => {
    const manifest = JSON.parse(document.querySelector(
      'script[type="application/speedracer-app+json"]').textContent);
    const declared = {};
    for (const operation of manifest.operations || []) {
      const outcome = (operation.result && operation.result.properties || {}).outcome;
      if (outcome && outcome.enum) declared[operation.name] = outcome.enum;
    }
    return declared;
  });
  const undeclaredArms = wordRows.filter(row => !(armDeclarations[row.operation] || [])
    .includes(row.outcome)).map(row => row.operation + ' ' + row.outcome);
  check('every word these arms spoke is declared for the operation that spoke it',
    undeclaredArms.length === 0, JSON.stringify({ undeclaredArms, armDeclarations }));
  log('### every tool the agent is offered answers');
  const tailOutline = (await invoke(page, 'document.get_outline', {})).value;
  const tailSection = (tailOutline.sections || [])[0];
  const tailRead = tailSection
    ? (await invoke(page, 'document.read_context', { ref: tailSection.ref })).value : null;
  const revealed = tailRead && tailRead.handle
    ? (await invoke(page, 'document.reveal', { context_handle: tailRead.handle })).value : null;
  check('reveal answers for a handle the agent already holds',
    !!revealed && revealed.outcome === 'revealed', JSON.stringify(revealed).slice(0, 240));

  /* Compare before open_text, on the edited document, where this channel's own change exists to
     compare against. Escape is the person's own way out of the surface. */
  const compared = (await invoke(page, 'document.compare', {})).value;
  check('compare opens this channel’s own change over the edited document',
    compared.outcome === 'opened', JSON.stringify(compared).slice(0, 240));

  /* The comparison vocabulary's own hostile arguments, here because this is the only place the
     surface they address exists. compare.close is absent by construction, not by omission: its
     handler takes no request object at all, so an undeclared field has nothing to reach, and
     succeeding at it would take away the surface the rows above are about. */
  await page.waitForFunction(() => window.__webmcp.names().includes('compare.read_change'),
    null, { timeout: 15000 }).catch(() => {});
  /* A comparison still being computed answers every one of these with its own status, which
     would prove nothing about an argument. Ask through the published verb until it is ready. */
  for (let settle = 0; settle < 60; settle++) {
    if ((await invoke(page, 'compare.get_context', {})).value.outcome !== 'comparing') break;
    await page.waitForTimeout(100);
  }
  await checkDescriptionCeiling(page, 'comparison');
  const COMPARE_HOSTILE = [
    ['compare.get_context', '(undeclared)', 'unknown extra field', { nonesuch: 1 }, 'invalid_arguments'],
    ['compare.find_change', 'query', 'wrong type', { query: 7 }, 'invalid_arguments'],
    ['compare.find_change', 'query', 'over-length string', { query: HOSTILE_LONG }, 'invalid_arguments'],
    ['compare.find_change', 'limit', 'out-of-range number', { query: 'a', limit: 900 }, 'invalid_limit'],
    ['compare.find_change', '(undeclared)', 'unknown extra field',
      { query: 'a', nonesuch: 1 }, 'invalid_arguments'],
    ['compare.read_change', 'index', 'wrong type', { index: 'two' }, 'invalid_arguments'],
    ['compare.read_change', 'index', 'out-of-range number', { index: 99999 }, 'change_out_of_range'],
    ['compare.read_change', '(undeclared)', 'unknown extra field',
      { index: 1, nonesuch: 1 }, 'invalid_arguments'],
    ['compare.reveal_change', 'index', 'wrong type', { index: 'two' }, 'invalid_arguments'],
    ['compare.reveal_change', 'index', 'out-of-range number', { index: 99999 }, 'change_out_of_range'],
    ['compare.reveal_change', '(undeclared)', 'unknown extra field',
      { index: 1, nonesuch: 1 }, 'invalid_arguments'],
  ];
  const compareHostileFailures = [];
  for (const [operation, field, shape, input, expectation] of COMPARE_HOSTILE) {
    const answer = (await invoke(page, operation, input)).value;
    const where = operation + ' ' + field + ' (' + shape + ')';
    if (String(answer && answer.reason || '') !== expectation) {
      compareHostileFailures.push(where + ' answered ' + JSON.stringify(answer).slice(0, 140));
    }
  }
  check('every comparison tool refuses a shape at the door and a value by its own name',
    compareHostileFailures.length === 0, JSON.stringify(compareHostileFailures).slice(0, 600));

  /* THE RETRACTION ROUTE, DRIVEN. The agent is told to close Compare and spend
     undo_agent_change rather than to write the old text back with a second apply_edits. The
     first half of that route is that the document verbs really are gone while the comparison
     stands, so the instruction is about a door and not about taste. */
  const insideCompare = await page.evaluate(() => window.__webmcp.names());
  check('the document vocabulary is gone while the comparison stands',
    insideCompare.length > 0 && !insideCompare.some(name => name.startsWith('document.')),
    JSON.stringify(insideCompare));

  /* The tool that ENDS the surface, refused twice while the surface is open: once by a name
     nobody declared and once by a name every object inherits. A refusal must leave the person
     exactly where they were — the comparison still open, still theirs, focus untouched — and the
     legal call with the empty object the contract does declare must then close it. Without this,
     the sentence above is a claim about a tool the harness never exercised. */
  const compareShowing = () => page.evaluate(() => {
    const mode = document.getElementById('compare-mode');
    return !!(mode && getComputedStyle(mode).display !== 'none');
  });
  const compareOpenBefore = await compareShowing();
  const focusBefore = await page.evaluate(() =>
    (document.activeElement && document.activeElement.className) || '');
  const closeRefusals = [];
  for (const raw of ['{"nonesuch":1}', '{"constructor":1}']) {
    const answer = await page.evaluate(async (text) => {
      const tool = (await document.modelContext.getTools()).find(t => t.name === 'compare.close');
      if (!tool) return { missing: true };
      const envelope = await document.modelContext.executeTool(tool, text, {});
      return JSON.parse(JSON.parse(envelope).content[0].text);
    }, raw);
    const stillOpen = await compareShowing();
    const focusNow = await page.evaluate(() =>
      (document.activeElement && document.activeElement.className) || '');
    if (answer.reason !== 'invalid_arguments' || !stillOpen || focusNow !== focusBefore) {
      closeRefusals.push(raw + ' -> ' + JSON.stringify({ answer, stillOpen, focusNow }).slice(0, 140));
    }
  }
  const closed = (await invoke(page, 'compare.close', {})).value;
  const compareOpenAfter = await compareShowing();
  check('compare.close refuses an undeclared and an inherited name with the surface intact, then closes on the legal call',
    compareOpenBefore && closeRefusals.length === 0 &&
    closed.outcome === 'closed' && !compareOpenAfter,
    JSON.stringify({ compareOpenBefore, closeRefusals, closed, compareOpenAfter }).slice(0, 400));

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__webmcp.names().includes('document.open_text'),
    null, { timeout: 15000 });
  /* The second half of the route: the verbs come back, selective undo among them. */
  const afterClose = await page.evaluate(() => window.__webmcp.names());
  check('closing it returns the document verbs, selective undo among them',
    afterClose.includes('document.undo_agent_change') && afterClose.includes('document.apply_edits'),
    JSON.stringify(afterClose));

  /* A REDACTED READ MINTS NOTHING THAT OUTLIVES IT. The wire handle was already null — the agent
     was shown less than the record covers — but the record itself stayed in a pool of sixty-four
     under a name only Rapier knew, so sixty-five redacted reads evicted a handle that had
     genuinely been delivered. Withheld and retired are now one act, and the proof is that one
     delivered handle survives more redacted reads than the pool has room for. */
  log('### redacted reads leave no invisible record behind');
  const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const survivorFind = (await invoke(page, 'document.find', { query: 'alpha paragraph one' })).value;
  const survivorHandle = ((survivorFind.matches || [])[0] || {}).handle;
  const pictureTarget = (await invoke(page, 'document.find', { query: 'BETA REPLACED' })).value;
  const pictureHandle = ((pictureTarget.matches || [])[0] || {}).handle;
  let redactedReads = 0;
  let redactedHandles = 0;
  if (pictureHandle) {
    /* An agent may write a picture — it is only text — and reading it back is where the door
       closes. This is the cheapest way to make a genuinely redacted read, repeatedly. */
    await invoke(page, 'document.apply_edits', {
      edits: [{ context_handle: pictureHandle,
        text: 'beta ![p](data:image/png;base64,' + TINY_PNG + ') two' }],
      label: 'picture for the redaction pool',
    });
    const map = (await invoke(page, 'document.get_outline', {})).value;
    const ref = ((map.sections || [])[0] || {}).ref;
    for (let attempt = 0; attempt < 70 && ref; attempt++) {
      const read = (await invoke(page, 'document.read_context', { ref })).value;
      if ((read.omissions || []).length) redactedReads++;
      if (read.handle) redactedHandles++;
    }
  }
  log('  ' + redactedReads + ' redacted reads, ' + redactedHandles + ' of them minting a wire handle');
  check('a redacted read hands back no authority at all',
    redactedReads > 64 && redactedHandles === 0,
    JSON.stringify({ redactedReads, redactedHandles }));
  const survived = survivorHandle
    ? (await invoke(page, 'document.reveal', { context_handle: survivorHandle })).value : null;
  check('a delivered handle outlives more redacted reads than the pool has room for',
    !!survived && survived.outcome === 'revealed',
    JSON.stringify({ survivorHandle, survived }).slice(0, 240));

  /* THE ENGINE'S OWN HAND STILL WRITES. Retraction mints a capability over bytes Rapier holds
     and disclosed to nobody, so it carries the engine's stamp rather than a delivery — and the
     gate that refuses every undelivered handle must not have refused this one too. Putting the
     picture back is the proof, and it leaves the document as the rest of this run expects it. */
  const retracted = (await invoke(page, 'document.undo_agent_change', {})).value;
  /* Read the same section back rather than reading the page: what has to be gone is the
     redaction, which is the document's own state, not a strip that may still name the change. */
  const afterMap = (await invoke(page, 'document.get_outline', {})).value;
  const afterRef = ((afterMap.sections || [])[0] || {}).ref;
  const afterRead = afterRef
    ? (await invoke(page, 'document.read_context', { ref: afterRef })).value : {};
  check('selective undo still writes through the engine-stamped path',
    (retracted.outcome === 'applied' || retracted.outcome === 'rebased') &&
      !(afterRead.omissions || []).length,
    JSON.stringify({ retracted, omissions: afterRead.omissions || [] }).slice(0, 260));

  /* The document is dirty from the edits above, so open_text rightly asks the person before
     discarding their work and the call stays pending until someone answers. The harness answers
     the way a person does — the dialog's own discard button, never a private seam — and a
     dialog that fails to appear is a loud failure, not a hang. */
  const openTextPending = page.evaluate(() => window.__webmcp.call('document.open_text', JSON.parse(
    '{"filename":"webmcp-open-text.md","content":"# Opened\\n\\nby the agent, through the tool.\\n"}')));
  const discardButton = page.locator('[role="alertdialog"] button', { hasText: 'discard' });
  let confirmSeen = true;
  try {
    await discardButton.waitFor({ state: 'visible', timeout: 15000 });
    await discardButton.click();
  } catch (_) { confirmSeen = false; }
  const openedEnvelope = confirmSeen ? unpack(await openTextPending) : null;
  const openedText = openedEnvelope ? openedEnvelope.value
    : { outcome: 'harness_timeout', reason: 'the dirty-document confirm never appeared' };
  if (confirmSeen) {
    witness('document.open_text', openedText, openedEnvelope.envelope.isError === true);
  }
  check('open_text asks the person over a dirty document, then opens what it was handed',
    openedText.outcome === 'opened' && openedText.filename === 'webmcp-open-text.md',
    JSON.stringify(openedText).slice(0, 240));


  /* The Manifest declares the canonical receipt a Speedracer host receives; what a browser agent
     receives is a deliberate narrowing of it, and the whole point of the narrowing is that host
     bookkeeping never crosses into an agent's context. rapier.html proves that for get_context
     alone. Every disclosure this run produced is held to it here, because the way over-disclosure
     ships is through the one operation nobody thought to check. */
  log('### disclosure discipline');
  const HOST_BOOKKEEPING = [
    'documentAuthority', 'generation', 'documentRevision', 'fileGeneration', 'lastTransaction',
  ];
  const leaked = observed.flatMap(({ name, value }) => (value && typeof value === 'object'
    ? HOST_BOOKKEEPING.filter(key => Object.prototype.hasOwnProperty.call(value, key))
      .map(key => name + '.' + key)
    : []));
  const exercised = new Set(observed.map(entry => entry.name));
  log('  ' + observed.length + ' disclosures observed across ' + exercised.size + ' operations');
  check('no disclosure carries host bookkeeping into an agent context',
    leaked.length === 0, JSON.stringify([...new Set(leaked)]));

  /* The contract is on what the user agent serializes, and the one place that can be measured
     over every result at once is here. A per-call assertion catches the call it was written for;
     this catches the operation nobody thought to bound. The widest pair is named on the PASS line
     because the distance between the two numbers is the whole subject: a payload inside 1,500
     proves nothing about the envelope carrying it. */
  const measured = observed.filter(entry => Number.isFinite(entry.wire));
  const overBudget = measured.filter(entry => entry.wire > 1500);
  const widest = measured.reduce((a, b) => (a && a.wire >= b.wire ? a : b), null);
  check('every result this run returned fits the 1,500-character wire budget — widest '
    + (widest ? widest.name + ' at ' + widest.wire + ' from a ' + widest.payload
      + '-character payload' : '(none measured)'),
    measured.length > 0 && overBudget.length === 0,
    JSON.stringify(overBudget.map(entry => [entry.name, entry.payload, entry.wire])));

  /* A cut landing between the two code units of an astral scalar hands over half a character —
     and, where a handle names the delivered bytes, a claim about half a character. Every string
     this run received is held to it, because the fitter's bisection is the only thing standing
     between a 1,500-character ceiling and a broken scalar. */
  const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const everyString = value => (value && typeof value === 'object'
    ? Object.values(value).flatMap(everyString)
    : typeof value === 'string' ? [value] : []);
  const halved = measured.filter(entry => everyString(entry.value).some(text =>
    LONE_SURROGATE.test(text)));
  check('no disclosure hands over half of an astral scalar',
    halved.length === 0, JSON.stringify([...new Set(halved.map(entry => entry.name))]));

  /* A maximum cannot catch a foreign property: it passes every bound ever written. So every read
     receipt this harness saw is checked against the property set the manifest declares, read out
     of the page rather than copied here. The manifest declares the CANONICAL receipt, which the
     seam itself now holds to that set; the wire is a second projection and owns two deliberate
     differences from it — `handle`, its rename of `context_handle`, and `expires_in_ms`, the
     handle's remaining life, which exists only where a handle is spent; and `message`, which the
     refusal envelope carries so a refused caller is told the path that failed. Naming them is the
     point: a fourth one appearing unnamed is exactly what this check is for. */
  const WIRE_OWNED = ['handle', 'expires_in_ms', 'message'];
  const declaredReadProperties = await page.evaluate(() => {
    const manifest = JSON.parse(document.querySelector(
      'script[type="application/speedracer-app+json"]').textContent);
    const operation = (manifest.operations || [])
      .find(entry => entry.name === 'document.read_context');
    return Object.keys(operation.result.properties);
  });
  /* TWO SURFACES, TWO DECLARATIONS, AND NOTHING ADMITTED THAT NEITHER STATES.
     A tool's own `inputSchema` is what the WebMCP door executes and the app manifest's `input` is
     what the host door executes, so the safety property is not that they are identical — it is
     that each is a CLOSED set, which is what makes "declared where it is executed" true at both.
     Where they differ they are pinned by name, because a difference nobody wrote down is the one
     that grows: a new wire field appearing here fails this check rather than passing unnoticed. */
  const contracts = await page.evaluate(() => {
    const manifest = JSON.parse(document.querySelector(
      'script[type="application/speedracer-app+json"]').textContent);
    const declared = new Map((manifest.operations || []).map(op => [op.name, op.input || {}]));
    const open = [];
    const differ = [];
    for (const name of window.__webmcp.names()) {
      const entry = window.__webmcp.entry(name);
      let schema = entry && entry.inputSchema;
      if (typeof schema === 'string') { try { schema = JSON.parse(schema); } catch (_) { schema = null; } }
      const canonical = declared.get(name) || {};
      if (!schema || schema.additionalProperties !== false) open.push(name + ' (tool)');
      if (canonical.additionalProperties !== false) open.push(name + ' (manifest)');
      const wire = Object.keys((schema && schema.properties) || {}).sort();
      const host = Object.keys(canonical.properties || {}).sort();
      const wireOnly = wire.filter(key => !host.includes(key));
      const hostOnly = host.filter(key => !wire.includes(key));
      if (wireOnly.length || hostOnly.length) differ.push({ name, wireOnly, hostOnly });
    }
    return { open, differ, tools: window.__webmcp.names().length };
  });
  /* The pinned set, measured. `document.find` is the only tool that offers a model a field the
     canonical operation does not take — its opaque `cursor`, which the tool's own request builder
     resolves to the canonical `offset` before any handler sees it. The other one differs the other
     way: the operation takes a field the tool does not offer, which admits nothing anywhere. */
  const PINNED_DIVERGENCE = [
    { name: 'document.find', wireOnly: ['cursor'], hostOnly: ['limit', 'offset'] },
    { name: 'document.compare', wireOnly: [], hostOnly: ['lens'] },
  ];
  const divergenceDrift = JSON.stringify(contracts.differ.slice().sort((a, b) =>
    a.name.localeCompare(b.name))) !== JSON.stringify(PINNED_DIVERGENCE.slice().sort((a, b) =>
    a.name.localeCompare(b.name)));
  log('  ' + contracts.tools + ' published tools; ' + contracts.differ.length +
    ' differ from the manifest: ' + JSON.stringify(contracts.differ));
  check('every input declaration a door executes is a closed set, and the ones that differ are the pinned two',
    contracts.tools > 0 && contracts.open.length === 0 && !divergenceDrift,
    JSON.stringify({ open: contracts.open, differ: contracts.differ }).slice(0, 500));

  const readReceipts = observed.filter(entry => entry.name === 'document.read_context' &&
    entry.value && typeof entry.value === 'object');
  const foreign = [...new Set(readReceipts.flatMap(entry => Object.keys(entry.value)
    .filter(key => !WIRE_OWNED.includes(key) && !declaredReadProperties.includes(key))))];
  check('no read receipt carries a property the manifest does not declare',
    declaredReadProperties.length > 0 && readReceipts.length > 0 && foreign.length === 0,
    JSON.stringify({ foreign, receipts: readReceipts.length, declared: declaredReadProperties.length }));

  /* A harness that leaves a registered tool undriven certifies the tools it found convenient.
     wait_for_user used to be the standing exception — it resolves when a person acts — and is
     now driven by the hostile-argument rows, which reach its bounds without parking a turn. */
  const undriven = names.filter(name => !exercised.has(name));
  check('every registered tool was driven at least once',
    undriven.length === 0, JSON.stringify(undriven));

  /* THE PICTURE DOOR, driven end to end: an embedded image's bytes must never reach an agent
     through any seam that hands document text back — Markdown image syntax in a heading, a
     search snippet, a source-view selection, a code file's own string literal, a diff line —
     and the text surrounding an image must still work normally. A dedicated page, the same
     reason the structural page below is one: no write lease on the harness's own dirty
     fixture. */
  log('### the picture door: no seam hands back an embedded picture\'s bytes');
  const picturePage = await side.newPage();
  const pictureErrors = [];
  picturePage.on('pageerror', e => pictureErrors.push(String(e && e.stack || e).slice(0, 400)));
  await picturePage.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
  await picturePage.waitForFunction(() => !!window.Rapier, null, { timeout: 30000 }).catch(() => {});
  await discardDirtyConfirms(picturePage);
  await picturePage.waitForTimeout(1800);
  // A real, tiny, valid PNG — printed whole in checks below, so a failure shows the exact bytes
  // that leaked rather than a length.
  const PICTURE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const PICTURE_URI = 'data:image/png;base64,' + PICTURE_PNG;
  await picturePage.evaluate(async (dataUri) => {
    await window.Rapier.document.openPayload({
      text: [
        '# ![A red barn at dusk](' + dataUri + ')',
        '',
        'Before the picture.',
        '',
        '![A second picture](' + dataUri + ') has a caption right here.',
        '',
        'After the picture, findable text right here.',
        '',
      ].join('\n'),
      name: 'webmcp-picture-door.md',
    });
  }, PICTURE_URI);
  await picturePage.waitForTimeout(800);

  // Source view is where the raw characters ARE the surface — the one place every seam this
  // lane fixed had a raw-text path to defend (the rendered surface was already safe: an <img>
  // has no text content).
  /* Reached by the person's own route — the view row inside the settings sheet — rather than by
     a port verb, so this also witnesses the door a reader actually opens to see raw characters. */
  await picturePage.evaluate(() => document.getElementById('btn-overflow').click());
  await picturePage.waitForTimeout(400);
  await picturePage.evaluate(() => document.getElementById('view-btn-source').click());
  await picturePage.waitForTimeout(500);
  await picturePage.keyboard.press('Escape');
  await picturePage.waitForTimeout(300);

  const pictureOutline = (await invoke(picturePage, 'document.get_outline', {})).value;
  check('get_outline names a picture-bearing heading and never its bytes',
    (pictureOutline.sections || []).some(s => s.label.includes('A red barn at dusk')) &&
    !JSON.stringify(pictureOutline).includes(PICTURE_PNG),
    JSON.stringify(pictureOutline).slice(0, 400));

  const pictureFind = (await invoke(picturePage, 'document.find', { query: 'findable text' })).value;
  check('find still answers a query in the text surrounding an embedded picture',
    pictureFind.outcome === 'searched' && pictureFind.total === 1 &&
    (pictureFind.matches || []).some(m => m.matched === 'findable text'),
    JSON.stringify(pictureFind).slice(0, 300));

  const pictureImageFind = (await invoke(picturePage, 'document.find', { query: 'red barn' })).value;
  check('a query landing beside an embedded picture never returns its bytes',
    pictureImageFind.outcome === 'searched' && !JSON.stringify(pictureImageFind).includes(PICTURE_PNG),
    JSON.stringify(pictureImageFind).slice(0, 400));

  // A real selection spanning the second picture, set the way a person's own drag would leave
  // it — get_context reads the live textarea selection fresh on every call.
  await picturePage.evaluate(() => {
    const ta = document.getElementById('source-textarea');
    const full = ta.value;
    const start = full.indexOf('![A second picture]');
    const end = full.indexOf('has a caption', start) + 'has a caption'.length;
    ta.focus();
    ta.setSelectionRange(start, end);
  });
  await picturePage.waitForTimeout(300);
  const pictureContext = (await invoke(picturePage, 'document.get_context', {})).value;
  check('get_context never discloses a source-view selection\'s embedded picture bytes',
    pictureContext.selectedChars > 0 && !JSON.stringify(pictureContext).includes(PICTURE_PNG),
    JSON.stringify(pictureContext).slice(0, 400));
  check('a redacted selection mints no edit handle over the picture it did not disclose',
    pictureContext.handle == null, JSON.stringify({ handle: pictureContext.handle }));

  /* compare.find_change and compare.read_change carry the same picture-door law (verified in
     docs/evidence/lane-w2/compare-picture-door-probe.js, executed against a standalone page):
     picturePage lives in its own storage partition with its own document, so the apply_edits
     handle a real change on this page's document requires is never minted there. */

  check('the picture-door page raised no uncaught error', pictureErrors.length === 0,
    JSON.stringify(pictureErrors.slice(0, 2)));
  await picturePage.close();

  /* The structural sense, driven end to end on a code document — on its OWN page, because the
     document this battery has been editing is dirty and replacing it would ask the person a
     question no harness can answer. It lives in its own storage partition, so it holds its own
     writer lease and never takes this page's; every verb below is an observation. */
  log('### the structural sense reaches a code document');
  const codePage = await side.newPage();
  const codeErrors = [];
  codePage.on('pageerror', e => codeErrors.push(String(e && e.stack || e).slice(0, 400)));
  await codePage.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
  await codePage.waitForFunction(() => !!window.Rapier, null, { timeout: 30000 }).catch(() => {});
  await discardDirtyConfirms(codePage);
  await codePage.waitForTimeout(1800);
  // THE PICTURE DOOR has no Markdown wrapper to key on in a code file — a data: URI here is a
  // bare string literal, the shape read_context's collapse has to catch without one.
  await codePage.evaluate(async (dataUri) => {
    await window.Rapier.document.openPayload({
      text: [
        "import { readFile } from './io.js';",
        '',
        'export function reconcileSession(session) {',
        '  const badge = "' + dataUri + '";',
        '  const merged = { ...session, badge };',
        '  notifyAll(merged);',
        '  return merged;',
        '}',
        '',
      ].join('\n'),
      name: 'webmcp-structure.js',
    });
  }, PICTURE_URI);
  await codePage.waitForTimeout(800);
  const codeNames = await codePage.evaluate(() => window.__webmcp.names());
  check('a code document publishes the verb that maps it',
    codeNames.includes('document.get_outline'), JSON.stringify(codeNames));
  const codeTitle = await codePage.evaluate(() => {
    const entry = window.__webmcp.entry('document.get_outline');
    return entry ? entry.title : '';
  });
  check('the descriptor tells the truth about the artifact it senses',
    codeTitle === 'Map code structure', String(codeTitle));
  await checkDescriptionCeiling(codePage, 'structural');
  const codeOutline = (await invoke(codePage, 'document.get_outline', {})).value;
  const codeSection = (codeOutline.sections || [])
    .find(section => section.label === 'reconcileSession()');
  check('the outline maps the module by its declarations',
    !!codeSection && codeSection.kind === 'function' && codeSection.exported === true &&
    codeSection.depth === 0,
    JSON.stringify(codeOutline).slice(0, 300));
  /* One contract, two senses: a heading and a declaration land in the same shape. */
  check('every entry carries the generalised structural contract',
    (codeOutline.sections || []).every(section => typeof section.kind === 'string'
      && Number.isSafeInteger(section.depth) && typeof section.ref === 'string'
      && typeof section.label === 'string' && typeof section.expandable === 'boolean'),
    JSON.stringify(codeOutline.sections));
  if (codeSection) {
    const unitMeta = await invoke(codePage, 'document.read_context', { ref: codeSection.ref });
    const unit = unitMeta.value;
    check('a structural reference lands the unit with its packet',
      unit.outcome === 'read' && !!unit.structure &&
      unit.structure.name === 'reconcileSession' &&
      (unit.structure.calls || []).includes('notifyAll'),
      JSON.stringify(unit).slice(0, 300));
    check('the structural read stays inside the 1,500-character contract',
      unitMeta.chars <= 1500, String(unitMeta.chars));
    check('a structural read never carries a code file\'s own bare data: URI whole',
      !JSON.stringify(unit).includes(PICTURE_PNG), JSON.stringify(unit).slice(0, 400));
  }
  const emptyWithinSchema = await codePage.evaluate(() => {
    const operation = JSON.parse(document.querySelector(
      'script[type="application/speedracer-app+json"]').textContent).operations
      .find(entry => entry.name === 'document.find');
    return {
      canonical: operation?.input?.properties?.within?.minLength,
      web: window.__webmcp.entry('document.find')?.inputSchema?.properties?.within?.minLength,
    };
  });
  const emptyWithin = (await invoke(codePage, 'document.find',
    { query: 'notifyAll', kind: 'call', within: '' })).value;
  /* The mint is observed where the agent would spend it, not in the engine's own map: a handle
     an agent never receives is authority it never has. `rctx_` is the context prefix, so its
     absence from the whole refusal is the proof that this door handed back nothing to spend. */
  check('an explicit empty within is invalid and mints no authority over a global structural match',
    emptyWithinSchema.canonical === 1 && emptyWithinSchema.web === 1 &&
      emptyWithin.outcome === 'invalid' && emptyWithin.reason === 'invalid_within' &&
      (emptyWithin.matches || []).length === 0 &&
      !JSON.stringify(emptyWithin).includes('rctx_'),
    JSON.stringify({ emptyWithinSchema, emptyWithin }).slice(0, 400));
  const structuralFind = (await invoke(codePage, 'document.find',
    { query: 'notifyAll', kind: 'call' })).value;
  check('find answers a syntactic kind on the code document',
    structuralFind.outcome === 'searched' && structuralFind.total === 1,
    JSON.stringify(structuralFind).slice(0, 300));
  /* The same law in the structural sense: a call site falls inside a declaration, and the name
     the search hands back for it is the one the map already handed back — one naming of a
     document's shape, whichever verb asked for it, so the two never compete for the pool. */
  const structuralMatch = (structuralFind.matches || [])[0];
  check('a code match names the declaration it fell in, by the map\'s own reference',
    !!structuralMatch && structuralMatch.section === 'reconcileSession()'
      && !!codeSection && structuralMatch.section_ref === codeSection.ref,
    JSON.stringify({ section: structuralMatch && structuralMatch.section,
      fromFind: structuralMatch && structuralMatch.section_ref,
      fromOutline: codeSection && codeSection.ref }));

  /* A match too long for the snippet room is still a place. It authorises nothing, because it
     was not shown whole — but it says how much it withheld, and it names the passage it fell
     in with a reference from the same pool the caret's own comes from, so read_context can be
     asked for the bytes. Silence here left an agent told about a match with no way back to it
     but guessing, which is the bulk read this whole surface exists to make unnecessary. */
  const oversized = (await invoke(codePage, 'document.find',
    { query: 'reconcileSession', kind: 'declaration' })).value;
  const oversizedMatch = (oversized.matches || [])[0];
  const lengthRow = ((oversizedMatch || {}).omissions || [])
    .find(row => row.domain === 'matched' && row.reason === 'field_length');
  check('a match longer than its snippet room counts exactly what it withheld',
    !!lengthRow && lengthRow.exact === true && lengthRow.omitted > 0 &&
      lengthRow.emitted === (oversizedMatch.matched || '').length &&
      lengthRow.observed === lengthRow.emitted + lengthRow.omitted,
    JSON.stringify(oversizedMatch).slice(0, 400));
  check('a match it could not show whole authorises nothing and names where it is',
    !!oversizedMatch && oversizedMatch.handle === null &&
      typeof oversizedMatch.ref === 'string' && oversizedMatch.ref.startsWith('rfoc_'),
    JSON.stringify(oversizedMatch).slice(0, 300));
  const reached = oversizedMatch && oversizedMatch.ref
    ? (await invoke(codePage, 'document.read_context', { ref: oversizedMatch.ref })).value : null;
  check('the reference an oversized match carries reads the bytes it stood for',
    !!reached && reached.outcome === 'read' && String(reached.text || '').includes('reconcileSession'),
    JSON.stringify(reached).slice(0, 300));
  const staleMatchRef = (await invoke(codePage, 'document.read_context',
    { ref: 'rfoc_' + 'f'.repeat(16) })).value;
  check('a reference of that shape naming nothing refuses by the reason already in use',
    staleMatchRef.outcome === 'target_gone' && staleMatchRef.reason === 'focus_expired',
    JSON.stringify(staleMatchRef).slice(0, 200));
  const unparsed = await codePage.evaluate(async () => {
    await window.Rapier.document.openPayload({
      text: 'const total: number = 1;\n', name: 'webmcp-structure.ts',
    });
    await new Promise(resolve => setTimeout(resolve, 700));
    return window.__webmcp.names();
  });
  check('a language this parser does not reach is not offered structure',
    !unparsed.includes('document.get_outline'), JSON.stringify(unparsed));
  /* A document boundary took the shape the reference named with it, and the boundary sweep
     retires the ticket before any resolver can compare identities — so the honest answer is
     that the naming is gone, in the word already used for exactly that, never a section
     not_found in a file that never had one. */
  const staleSection = structuralMatch && structuralMatch.section_ref
    ? (await invoke(codePage, 'document.read_context',
      { ref: structuralMatch.section_ref })).value : null;
  check('a section reference from before a document boundary refuses instead of answering',
    !!staleSection && staleSection.outcome === 'target_gone'
      && staleSection.reason === 'outline_expired' && staleSection.text === '',
    JSON.stringify(staleSection).slice(0, 200));
  check('the structural page raised no uncaught error', codeErrors.length === 0,
    JSON.stringify(codeErrors.slice(0, 2)));
  await codePage.close();

  /* An outside audit's round 3.6: the picture door's structural recognition covered only the canonical form,
     data:TYPE/SUBTYPE;base64,PAYLOAD — a parameter before the flag, an upper-cased flag, or no
     flag at all with a percent-encoded (non-base64) payload instead, an SVG's usual bare form,
     all survived whole in a code file's own string literal. Driven bare (no Markdown wrapper to
     bound them), the harder case, on its own page for the same reason codePage above is one: no
     write lease on the harness's own dirty fixture. document.wait_for_user and document.compare
     cannot be reached from a second page either (the write lease again, and wait_for_user's
     message reply needs live UI); both are driven and witnessed instead by a standalone probe,
     the variants probe under `docs/evidence/lane-w2/`, executed against the real tool surface. */
  log('### the picture door: data: URL variants a base64-only pattern missed');
  const variantsPage = await side.newPage();
  const variantErrors = [];
  variantsPage.on('pageerror', e => variantErrors.push(String(e && e.stack || e).slice(0, 400)));
  await variantsPage.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
  await variantsPage.waitForFunction(() => !!window.Rapier, null, { timeout: 30000 }).catch(() => {});
  await discardDirtyConfirms(variantsPage);
  await variantsPage.waitForTimeout(1800);
  const VARIANT_SVG_C = encodeURIComponent('<svg id="variant-c"></svg>');
  const VARIANT_SVG_D = encodeURIComponent('<svg id="variant-d"></svg>');
  await variantsPage.evaluate(async ({ png, svgC, svgD }) => {
    await window.Rapier.document.openPayload({
      text: [
        'export function variantBadges() {',
        '  const params = "data:image/png;charset=utf-8;base64,' + png + '";',
        '  const upper = "data:image/png;BASE64,' + png + '";',
        '  const svg = "data:image/svg+xml,' + svgC + '";',
        '  const svgParams = "data:image/svg+xml;charset=utf-8,' + svgD + '";',
        '  return { params, upper, svg, svgParams };',
        '}',
        '',
      ].join('\n'),
      name: 'webmcp-variants.js',
    });
  }, { png: PICTURE_PNG, svgC: VARIANT_SVG_C, svgD: VARIANT_SVG_D });
  await variantsPage.waitForTimeout(800);
  const variantOutline = (await invoke(variantsPage, 'document.get_outline', {})).value;
  const variantSection = (variantOutline.sections || [])
    .find(section => section.label === 'variantBadges()');
  check('a code document holding every data: URL variant still maps by its declarations',
    !!variantSection, JSON.stringify(variantOutline).slice(0, 300));
  const variantRead = variantSection
    ? (await invoke(variantsPage, 'document.read_context', { ref: variantSection.ref })).value
    : null;
  const variantText = variantRead ? String(variantRead.text || '') : '';
  check('a parameter before the base64 flag is recognized, reporting decoded bytes, not the destination length',
    !!variantRead && !variantText.includes(PICTURE_PNG) &&
      variantText.includes('image: image/png, 68 bytes'),
    variantText.slice(0, 500));
  check('an upper-cased ;BASE64 flag is recognized the same as lower case',
    !!variantRead && !variantText.includes(PICTURE_PNG) &&
      (variantText.match(/image: image\/png, 68 bytes/g) || []).length === 2,
    variantText.slice(0, 500));
  check('a non-base64, percent-encoded payload with no flag at all is recognized, reporting percent-decoded bytes',
    !!variantRead && !variantText.includes(VARIANT_SVG_C) &&
      variantText.includes('image: image/svg+xml, 26 bytes'),
    variantText.slice(0, 500));
  check('a percent-encoded payload with parameters before the comma is recognized the same way',
    !!variantRead && !variantText.includes(VARIANT_SVG_D) &&
      (variantText.match(/image: image\/svg\+xml, 26 bytes/g) || []).length === 2,
    variantText.slice(0, 500));
  const variantFind = (await invoke(variantsPage, 'document.find', { query: 'variantBadges' })).value;
  check('find still answers a query beside every data: URL variant without leaking any of them',
    variantFind.outcome === 'searched' && !JSON.stringify(variantFind).includes(PICTURE_PNG) &&
      !JSON.stringify(variantFind).includes(VARIANT_SVG_C) &&
      !JSON.stringify(variantFind).includes(VARIANT_SVG_D),
    JSON.stringify(variantFind).slice(0, 400));
  check('the data: URL variants page raised no uncaught error', variantErrors.length === 0,
    JSON.stringify(variantErrors.slice(0, 2)));
  await variantsPage.close();

  /* THE PICTURE DOOR, gated over the WHOLE run: every disclosure every page above produced —
     main document, picture-door page, code page, variants page — held to the one law
     read_context, find, get_context, get_outline and compare all now keep. Not "the picture-door
     page's own checks passed"; no result field, on any tool, anywhere this run looked, carries
     the original picture's bytes or either percent-encoded variant's raw payload. */
  const LEAK_MARKERS = [PICTURE_PNG, VARIANT_SVG_C, VARIANT_SVG_D];
  const pictureLeaks = observed.filter(({ value }) => {
    const json = JSON.stringify(value);
    return LEAK_MARKERS.some(marker => json.includes(marker));
  });
  check('no result field on any tool carries the embedded picture\'s raw bytes, across every operation this run drove',
    pictureLeaks.length === 0, JSON.stringify(pictureLeaks.map(entry => entry.name)));

  log('### engine authority is call-scoped: a retraction that fails costs a caller nothing');
  {
    /* Selective undo mints a capability over bytes this engine wrote and still holds. No caller
       was ever shown them, so there is no delivery to prove and the row carries the engine's own
       stamp instead — the one thing the resolver admits without one. Those rows are minted before
       the inverse batch is known to apply, and every way it can end without spending them left
       them standing in the one bounded pool. Authority nobody can spend still takes a seat, and
       the seat it takes belongs to a caller holding a real one. The suite watches the pool; from
       out here only the consequence is visible, which is the half that matters to an agent: a
       handle delivered before seventy engine mints is still a handle afterwards. Each round
       stages a five-edit change, moves the same five regions past that change's own evidence,
       and asks for the change back — so every retraction here is refused after minting. */
    const ROUNDS = 14;
    const poolLines = ['# Retraction pool', '', 'The survivor sentence stands apart.', ''];
    for (let i = 0; i < 100; i++) poolLines.push('sentinel' + i + ' stands here.', '');
    /* A document opened from handed-in text has no file behind it, so it is dirty from its first
       breath and a person is rightly asked before it is replaced. The harness answers the way a
       person does — the dialog's own button — and only from here, after the case above has had
       its own dialog to itself. */
    await discardDirtyConfirms(page);
    await page.evaluate(async text => {
      await window.Rapier.document.openPayload({ text, name: 'webmcp-retraction-pool.md' });
    }, poolLines.join('\n'));
    await page.waitForTimeout(900);

    /* Every edit below republishes the surface: Rapier retires and re-registers each tool whose
       descriptor moved, and the catalogue is briefly short of the one being asked for. That is
       what a toolchange event is for, and an agent answers it by re-reading the catalogue rather
       than by treating the gap as a refusal. So does this — it is registration, not an answer. */
    const published = async name => {
      try {
        await page.waitForFunction(
          toolName => window.__webmcp.names().includes(toolName), name, { timeout: 20000 });
      } catch (error) {
        /* The catalogue itself, which is all an agent can see from here and all this needs:
           whichever vocabulary is published names the surface the channel is speaking. */
        log('  the surface never republished ' + name + ': ' +
          JSON.stringify(await page.evaluate(() => window.__webmcp.names())));
        throw error;
      }
    };
    const settled = async (name, input) => { await published(name); return invoke(page, name, input); };
    /* Replacing a document that carries unsaved agent work rightly opens the comparison a person
       would want to see, and while it is open this channel speaks the comparison's vocabulary
       rather than the document's. An agent reads its catalogue and answers in the language it is
       offered; so does this, through the same door, before asking the document anything. */
    const closeAnyLens = async () => {
      const names = await page.evaluate(() => window.__webmcp.names());
      if (!names.includes('compare.close') || names.includes('document.find')) return null;
      const outcome = (await invoke(page, 'compare.close', {})).value.outcome;
      await page.waitForFunction(() => window.__webmcp.names().includes('document.find'),
        null, { timeout: 20000 });
      return outcome;
    };
    log('  the surface after the fixture arrived: ' + JSON.stringify(await closeAnyLens()));

    const survivorFound = (await settled('document.find',
      { query: 'The survivor sentence' })).value;
    const survivorHandle = ((survivorFound.matches || [])[0] || {}).handle;
    check('the retraction fixture offers a delivered handle for the pool to evict',
      !!survivorHandle, JSON.stringify(survivorFound).slice(0, 240));

    const retractions = [];
    let minted = 0;
    for (let round = 0; round < ROUNDS && survivorHandle; round++) {
      await closeAnyLens();
      const first = (await settled('document.find', { query: 'sentinel' })).value;
      const firstHandles = (first.matches || []).map(match => match.handle).filter(Boolean);
      if (firstHandles.length < 4) { retractions.push({ round, undo: 'unstaged' }); break; }
      const staged = (await settled('document.apply_edits', {
        edits: firstHandles.map(handle => ({ context_handle: handle, text: 'alpha' })),
        label: 'harness retraction pool stage',
      })).value;
      const second = (await settled('document.find', { query: 'alpha' })).value;
      const secondHandles = (second.matches || []).map(match => match.handle).filter(Boolean);
      const moved = (await settled('document.apply_edits', {
        edits: secondHandles.map(handle => ({ context_handle: handle, text: 'omega' })),
        label: 'harness retraction pool move',
      })).value;
      const undone = (await settled('document.undo_agent_change',
        { change_id: staged.changeId })).value;
      minted += firstHandles.length;
      retractions.push({
        round, edits: firstHandles.length, staged: staged.outcome, moved: moved.outcome,
        undo: undone.outcome, reason: String(undone.reason || ''),
      });
    }
    const drove = retractions.filter(row => row.undo && row.undo !== 'unstaged');
    const refused = drove.filter(row => row.undo !== 'applied' && row.undo !== 'rebased');
    log('  ' + drove.length + ' retractions refused after minting ' + minted +
      ' engine-stamped rows, over a pool that seats 64');
    log('  ' + JSON.stringify(retractions.slice(0, 2)));
    check('every retraction in the run was driven past the point where its inverse could resolve',
      drove.length === ROUNDS && refused.length === ROUNDS,
      JSON.stringify(retractions.map(row => [row.undo, row.reason])).slice(0, 400));
    check('and it minted more engine authority than the whole pool has room for',
      minted > 64, String(minted));
    await closeAnyLens();
    const survived = survivorHandle
      ? (await settled('document.reveal', { context_handle: survivorHandle })).value : null;
    check('a handle delivered before all of it still spends afterwards',
      !!survived && survived.outcome === 'revealed',
      JSON.stringify(survived).slice(0, 240));
    /* The brand is engine-internal — one classic script, one realm, never a module boundary —
       so what has to be true out here is that nothing carrying it ever crossed a seam. */
    const brandLeaks = observed.filter(({ value }) =>
      JSON.stringify(value).includes('rapier.capability.internal'));
    check('no result field on any tool, across every operation this run drove, names the engine brand',
      brandLeaks.length === 0, JSON.stringify(brandLeaks.map(entry => entry.name)));
  }

  log('### retracting a section-level edit on a document that carries Will');
  /* A section handle's edit crosses block boundaries, so no single block's text is what it
     replaced and the pre-commit draft records none — the commit also normalises what it
     inserts. The transaction records exactly what it moved, which is what the retraction
     rewinds. Driven on the demo document because that is the Will-bearing document a person
     actually meets. */
  {
    /* This page, not a helper: the navigation below boots it again as the writer of its own
       partition, and this needs to write. Runs last, so the navigation disturbs nothing. */
    const willPage = page;
    willPage.on('dialog', dialog => dialog.accept().catch(() => {}));
    await willPage.goto(URL_BASE + '?demo=1', { waitUntil: 'load', timeout: 60000 });
    /* R6-P0-1's boot-time reconciliation classifies this lease page's own accumulated dirty
       work against the incoming demo document before the shortcut is allowed to retire it;
       the earlier sections above can easily leave it dirty. This section replaces whatever
       is here with the demo document unconditionally — the same intent the native
       dialog.accept() above already states for a browser-level prompt — so proceed past
       Rapier's own confirm surface exactly as that line does past a native one. */
    const demoIntakeConfirmOpen = await willPage.waitForSelector('#confirm-overlay.open', {
      timeout: 4000, state: 'visible',
    }).then(() => true, () => false);
    if (demoIntakeConfirmOpen) {
      await willPage.click('#confirm-accept').catch(() => {});
      await willPage.waitForTimeout(500);
    }
    await willPage.waitForFunction(() => !!window.Rapier, null, { timeout: 30000 }).catch(() => {});
    await willPage.waitForTimeout(1500);
    /* Read back through the same door the agent used, so what is compared is what an agent
       can actually see: the section's own disclosed bytes. */
    const sectionText = async ref =>
      String((await invoke(willPage, 'document.read_context', { ref })).value.text || '');

    const outline = (await invoke(willPage, 'document.get_outline', {})).value;
    /* A section the will leaves editable, spanning several blocks, whose prose a text
       replacement can express — the shape a rewrite is actually asked for, chosen by that
       property rather than by name so the row survives the document being reworded. */
    const prose = text => String(text || '').split('\n')
      .every(line => !/^\s*(?:[-*+>#]|\d+\.|```|\|)/.test(line));
    let section = null;
    let read = null;
    for (const row of (outline.sections || [])) {
      if (String(row.law || '') !== 'edit' || Number(row.chars || 0) < 400) continue;
      const candidate = (await invoke(willPage, 'document.read_context', { ref: row.ref })).value;
      if (candidate.outcome !== 'read' || candidate.truncated || !prose(candidate.text) ||
          String(candidate.text || '').split('\n\n').length < 3) continue;
      section = row;
      read = candidate;
      break;
    }
    check('the Will document offers a multi-block section the will leaves editable',
      !!section, JSON.stringify((outline.sections || []).map(row => [row.label, row.law, row.chars])));
    log('  chosen: ' + JSON.stringify(section && { label: section.label, chars: section.chars,
      representation: read.representation, law: read.law, truncated: read.truncated,
      handle: String(read.handle || '').slice(0, 12) }));

    if (section) {
      const opened = String(read.text || '');
      /* A rendered replacement may rewrite the blocks it covers but not how many there are, so
         this rewrites each one in place and leaves the heading alone. It still crosses every
         block boundary the section has, which is the shape under test. */
      const parts = String(read.text || '').split('\n\n');
      const rewrite = parts
        .map((part, index) => (index === 0 || !part.trim() ? part : part + ' Revised by the harness.'))
        .join('\n\n');
      const applied = (await invoke(willPage, 'document.apply_edits', {
        edits: [{ context_handle: read.handle, text: rewrite }], label: 'harness section rewrite',
      })).value;
      check('a section-level rewrite commits on a Will document',
        applied.outcome === 'applied', JSON.stringify(applied).slice(0, 300));
      check('the section rewrite moved the section',
        applied.outcome !== 'applied' || await sectionText(section.ref) !== opened);
    if (applied.outcome === 'applied') {
      await willPage.waitForTimeout(400);
      const undoneMeta = await invoke(willPage, 'document.undo_agent_change', {});
      const undone = undoneMeta.value;
      check('a section-level edit is retractable on a document that carries Will',
        undone.outcome === 'rebased' && undone.undoneChangeId === applied.changeId,
        JSON.stringify({ outcome: undone.outcome, reason: undone.reason }));
      check('the retraction restores the exact bytes the section held',
        await sectionText(section.ref) === opened, 'the section did not return to its opened bytes');
      check('a successful retraction carries no isError',
        undoneMeta.envelope.isError !== true,
        JSON.stringify({ outcome: undone.outcome, isError: undoneMeta.envelope.isError }));
      /* The `rejected` arm, over the same call this section already exercises: the change this
         page just retracted is no longer `applied`, so asking for it again by the same id is a
         refusal in the fourth of the four words, not a repeat of the first. */
      const restagedMeta = await invoke(willPage, 'document.undo_agent_change',
        { change_id: applied.changeId });
      const restaged = restagedMeta.value;
      check('retracting an already-retracted change is refused, in the fourth arm',
        restaged.outcome === 'refused' && restaged.reason === 'change_not_applied',
        JSON.stringify({ outcome: restaged.outcome, reason: restaged.reason }));
      check('the rejected arm carries isError on the envelope',
        restagedMeta.envelope.isError === true,
        JSON.stringify({ outcome: restaged.outcome, isError: restagedMeta.envelope.isError }));

      /* A replacement that differs from the disclosed bytes only by a carriage return IS the
         disclosed bytes: the rendered projection carries no CR, and the document's newline
         convention erases one on the way in. So it must answer like handing the text back
         unchanged — never as an engine fault, which is what a caller branches on. */
      const withCr = (await invoke(willPage, 'document.apply_edits', {
        edits: [{ context_handle: (await invoke(willPage, 'document.read_context',
          { ref: section.ref })).value.handle, text: opened.replace('\n\n', '\r\n\n') }],
        label: 'harness carriage return at a seam',
      })).value;
      check('an edit differing only by a carriage return is not reported as a missing transaction',
        withCr.outcome !== 'refused' && withCr.reason !== 'transaction_missing',
        JSON.stringify({ outcome: withCr.outcome, reason: withCr.reason }));
      check('a carriage-return-only edit leaves the section exactly as it stood',
        await sectionText(section.ref) === opened, 'the section moved for an edit that changed nothing');

      /* The control: a retraction whose recorded bytes are no longer where the transaction
         left them IS interleaved, and must keep saying so. A second edit inside the first
         edit's own span is that interleaving. */
      const first = (await invoke(willPage, 'document.apply_edits', {
        edits: [{ context_handle: (await invoke(willPage, 'document.read_context',
          { ref: section.ref })).value.handle, text: rewrite }],
        label: 'harness section rewrite again',
      })).value;
      await willPage.waitForTimeout(400);
      const overlap = (await invoke(willPage, 'document.find', { query: 'Revised by the harness.' })).value;
      const hit = (overlap.matches || [])[0];
      check('the interleaving control found the bytes the first edit left', !!hit,
        JSON.stringify(overlap).slice(0, 160));
      if (hit && first.outcome === 'applied') {
        await invoke(willPage, 'document.apply_edits', {
          edits: [{ context_handle: hit.handle, text: 'A sentence another hand replaced.' }],
          label: 'harness interleaving',
        });
        const refusedMeta = await invoke(willPage, 'document.undo_agent_change',
          { change_id: first.changeId });
        const refused = refusedMeta.value;
        check('a retraction over bytes that moved under it still says structural_change_interleaved',
          refused.outcome === 'conflict' && refused.reason === 'structural_change_interleaved',
          JSON.stringify({ outcome: refused.outcome, reason: refused.reason }));
        check('the conflict arm carries isError on the envelope',
          refusedMeta.envelope.isError === true,
          JSON.stringify({ outcome: refused.outcome, isError: refusedMeta.envelope.isError }));
      }
    }
    }
  }

  /* THE PERSON'S LINE, WHEN NO CALL IS PARKED. A host cuts a parked call at about twenty-four
     seconds, so a reply field live only while a wait was parked was a channel the person could
     almost never reach: their line died with the call that was listening for it. The field is now
     open whenever the agent's row is; a line spoken with nobody parked is held in session memory
     against {authority, epoch} — never in the document, never in undo, never in recovery — and is
     spent by the next message wait. Driven on its own page for the same reason the pages above
     are: this witness ends by replacing the document, and no fixture the rest of the run stands
     on may be the one replaced. */
  log('### the person\u2019s line reaches the agent with no call parked');
  const inboxPage = await side.newPage();
  await inboxPage.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
  await inboxPage.waitForFunction(() => !!window.Rapier, null, { timeout: 30000 }).catch(() => {});
  await discardDirtyConfirms(inboxPage);
  await inboxPage.waitForTimeout(1800);
  const inboxRow = () => inboxPage.evaluate(() => {
    const el = id => document.getElementById(id);
    return {
      hidden: el('agent-row').hidden,
      state: el('agent-row-state').textContent,
      queued: el('agent-row-queued').hidden ? null : el('agent-row-queued').textContent,
      placeholder: el('agent-row-note-input').placeholder,
      disabled: el('agent-row-note-input').disabled,
    };
  });
  /* The person's own gesture, through the form they actually use — not a call into the engine.
     Sent on the Enter the field's own `enterkeyhint` advertises, which is the gesture on a phone
     and needs no panel geometry to be reachable on a desktop. */
  const inboxSpeak = async line => {
    await inboxPage.fill('#agent-row-note-input', line);
    await inboxPage.press('#agent-row-note-input', 'Enter');
    await inboxPage.waitForTimeout(150);
  };
  const inboxBefore = await inboxRow();
  await invoke(inboxPage, 'document.get_context', {});
  await inboxPage.waitForTimeout(300);
  /* The panel the circle carries is where the row and the field live; the person opens it the
     one way there is to, and every gesture below is made inside it. */
  await inboxPage.click('#scroll-fab');
  await inboxPage.waitForTimeout(700);
  const inboxOpen = await inboxRow();
  check('the reply field is live whenever the agent row is, with no wait parked',
    inboxBefore.hidden && inboxBefore.disabled && !inboxOpen.hidden && !inboxOpen.disabled &&
    inboxOpen.placeholder === 'message' && inboxOpen.queued === null,
    JSON.stringify({ inboxBefore, inboxOpen }));

  await inboxSpeak('make the intro half as long');
  const inboxQueuedRow = await inboxRow();
  const inboxQueued = (await invoke(inboxPage, 'document.get_context', {})).value;
  check('a line spoken with nobody parked is queued, counted on the row, and read by get_context',
    inboxQueuedRow.queued === '1 MESSAGE QUEUED' &&
    inboxQueuedRow.placeholder === 'message queued' &&
    inboxQueued.pendingMessages === 1 &&
    inboxQueued.latestMessage.text === 'make the intro half as long' &&
    typeof inboxQueued.latestMessage.id === 'string' &&
    inboxQueued.latestMessage.id.length > 0 &&
    Number.isSafeInteger(inboxQueued.latestMessage.createdAt),
    JSON.stringify({ inboxQueuedRow, latest: inboxQueued.latestMessage }));
  /* The same closure the undelivered count keeps, asserted where the two new fields appear: a
     waiting line adds exactly those two facts to this read and nothing beside them. */
  const inboxStray = Object.keys(inboxQueued).filter(key => !CONTEXT_FIELDS.has(key) &&
    !WIRE_OWNED.includes(key) && key !== 'pendingMessages' && key !== 'latestMessage');
  check('a waiting line adds those two facts to the read and no third',
    inboxStray.length === 0, JSON.stringify(inboxStray));

  /* Five is the whole depth: this is steering, not a mailbox. */
  for (const line of ['second', 'third', 'fourth', 'fifth', 'sixth']) await inboxSpeak(line);
  const inboxCapRow = await inboxRow();
  const inboxToast = await inboxPage.evaluate(() =>
    [...document.querySelectorAll('.toast__msg')].map(node => node.textContent));
  const inboxCapped = (await invoke(inboxPage, 'document.get_context', {})).value;
  check('the queue caps at five, the sixth line replaces the oldest, and the person is told so',
    inboxCapRow.queued === '5 MESSAGES QUEUED' && inboxCapped.pendingMessages === 5 &&
    inboxCapped.latestMessage.text === 'sixth' &&
    inboxToast.some(text => /oldest message replaced/.test(text)),
    JSON.stringify({ inboxCapRow, count: inboxCapped.pendingMessages, inboxToast }));

  /* THE WAIT SPENDS WHAT IS ALREADY THERE. Measured on the wall clock outside the browser: a
     question already answered must come back in the outcome a live reply returns, not after a
     turn spent parked on it. */
  const inboxSpentAt = Date.now();
  const inboxSpent = (await invoke(inboxPage, 'document.wait_for_user',
    { event: 'message', timeout_ms: 20000 })).value;
  const inboxSpentMs = Date.now() - inboxSpentAt;
  const inboxAfterSpend = (await invoke(inboxPage, 'document.get_context', {})).value;
  check('a message wait takes the oldest queued line at once, and taking it removes it',
    inboxSpent.outcome === 'message' && inboxSpent.text === 'second' && inboxSpentMs < 5000 &&
    inboxAfterSpend.pendingMessages === 4 && inboxAfterSpend.latestMessage.text === 'sixth',
    JSON.stringify({ inboxSpent, inboxSpentMs, count: inboxAfterSpend.pendingMessages }));

  const inboxDrained = [];
  for (let index = 0; index < 4; index++) {
    inboxDrained.push((await invoke(inboxPage, 'document.wait_for_user',
      { event: 'message', timeout_ms: 20000 })).value.text);
  }
  const inboxEmptied = (await invoke(inboxPage, 'document.get_context', {})).value;
  const inboxEmptyRow = await inboxRow();
  check('the queue drains oldest first and then reports absent, never a false zero',
    JSON.stringify(inboxDrained) === JSON.stringify(['third', 'fourth', 'fifth', 'sixth']) &&
    !('pendingMessages' in inboxEmptied) && !('latestMessage' in inboxEmptied) &&
    inboxEmptyRow.queued === null && inboxEmptyRow.placeholder === 'message',
    JSON.stringify({ inboxDrained, emptied: inboxEmptied.pendingMessages, inboxEmptyRow }));

  /* The path that already worked still works, unchanged: a parked listener owns the field, and
     the line it takes is spent there rather than also left behind in the queue. */
  const inboxParked = inboxPage.evaluate(() => window.__webmcp.call('document.wait_for_user',
    { event: 'message', prompt: 'shorter, or sharper?', timeout_ms: 20000 }));
  await inboxPage.waitForTimeout(500);
  const inboxParkedRow = await inboxRow();
  await inboxSpeak('sharper');
  const inboxLive = unpack(await inboxParked).value;
  const inboxAfterLive = (await invoke(inboxPage, 'document.get_context', {})).value;
  check('a parked listener still takes the line, and a live reply is never also queued',
    inboxParkedRow.state === 'WAITING FOR YOU' &&
    inboxParkedRow.placeholder === 'shorter, or sharper?' && !inboxParkedRow.disabled &&
    inboxLive.outcome === 'message' && inboxLive.text === 'sharper' &&
    !('pendingMessages' in inboxAfterLive),
    JSON.stringify({ inboxParkedRow, inboxLive }));

  /* A REPLACED DOCUMENT IS A WORLD THE LINE WAS NEVER SPOKEN TO. The queue is bound to the epoch
     it was spoken against, so the successor document inherits nothing — the same law the wait
     slot, the agent's note and the connected window already keep. */
  await inboxSpeak('a line for the document that is open now');
  const inboxBeforeReplace = await inboxRow();
  await openPayloadSafely(inboxPage,
    { text: '# Another document\n\nA second world.\n', name: 'second.md' });
  await inboxPage.waitForTimeout(1500);
  const inboxReplaced = (await invoke(inboxPage, 'document.get_context', {})).value;
  const inboxReplacedRow = await inboxRow();
  check('replacing the document drops the queue with the epoch that held it',
    inboxBeforeReplace.queued === '1 MESSAGE QUEUED' && inboxReplaced.filename === 'second.md' &&
    !('pendingMessages' in inboxReplaced) && !('latestMessage' in inboxReplaced) &&
    inboxReplacedRow.queued === null,
    JSON.stringify({ inboxBeforeReplace, inboxReplacedRow, filename: inboxReplaced.filename }));
  await inboxPage.close();

  /* THE FIELD'S HOSTS ARE NOT THE FIXTURE'S. Three things the WebMCP Challenge entries measured
     on real hosts, driven here against one deliberately hostile model context:
       - a member that is PRESENT AND THROWS (Career Compass found `requestUserInteraction` on
         ChatGPT's client object throwing "not supported by the Codex WebMCP shim"), so a
         presence check is not a capability check. Rapier calls exactly one host method —
         registerTool — and unregisters through AbortController, which is the platform's own;
         this proves the optional members can all throw and change nothing;
       - a registration that REJECTS for one tool must not take the other eight with it
         (build-arena's own history fixed a loop that discarded every already-registered tool);
       - an unregister that DOES NOT TAKE EFFECT, which is every Chromium below 153 (Keydler
         hard-codes DYNAMIC_UNREGISTER_MIN_CHROMIUM = 153 after trials on Brave/Edge 151-152) —
         the retained registration must refuse honestly rather than answer for a vocabulary that
         is no longer admitted. */
  log('### a hostile host: throwing optional members, one rejected registration, an inert unregister');
  const fieldPage = await side.newPage();
  const fieldErrors = [];
  fieldPage.on('pageerror', e => fieldErrors.push(String(e && e.stack || e).slice(0, 300)));
  await fieldPage.addInitScript(() => {
    const owner = Object.getOwnPropertyDescriptor(Document.prototype, 'modelContext');
    Object.defineProperty(Document.prototype, 'modelContext', {
      configurable: true,
      get() {
        const live = owner.get.call(this);
        if (!live || live.__hostile) return live;
        const throwing = name => () => {
          throw new Error(name + ' is not supported by this host shim');
        };
        const hostile = Object.create(live);
        hostile.__hostile = true;
        /* Present, and every one of them throws. */
        hostile.provideContext = throwing('provideContext');
        hostile.requestUserInteraction = throwing('requestUserInteraction');
        hostile.unregisterTool = throwing('unregisterTool');
        hostile.registerTool = (tool, options) => {
          if (tool && tool.name === 'document.reveal') {
            return Promise.reject(new Error('this host refuses one descriptor'));
          }
          /* The abort that would unregister is swallowed, exactly as it is below Chromium 153:
             the registration stays, and what the page believes about it is all it has. */
          return live.registerTool.call(live, tool,
            options && options.signal ? {} : options);
        };
        return hostile;
      },
    });
  });
  await fieldPage.goto(URL_BASE, { waitUntil: 'load', timeout: 60000 });
  await fieldPage.waitForFunction(() => !!window.Rapier, null, { timeout: 30000 });
  await fieldPage.waitForTimeout(1500);
  const fieldNames = await fieldPage.evaluate(() => window.__webmcp.names());
  log('  published against the hostile host: ' + JSON.stringify(fieldNames));
  check('one rejected registration does not take the rest of the surface with it',
    fieldNames.length > 0 && !fieldNames.includes('document.reveal'),
    JSON.stringify(fieldNames));
  check('a host whose optional members all throw is still fully published',
    fieldNames.includes('document.get_context') && fieldNames.includes('document.find'),
    JSON.stringify(fieldNames));
  const fieldAnswer = (await invoke(fieldPage, 'document.get_context', {})).value;
  check('and it answers: the only host method Rapier calls is registerTool',
    fieldAnswer.outcome === 'read', JSON.stringify(fieldAnswer).slice(0, 200));
  /* Every published tool states its effect class on the wire, writes included — ChatGPT's
     desktop app derives its "N read / M write" badge from the hint's PRESENCE, and a write tool
     without one vanishes from the count (rotaproof, webmcp.ts:186-195). */
  const fieldHints = await fieldPage.evaluate(() => window.__webmcp.names().map(name => {
    const entry = window.__webmcp.entry(name);
    return [name, entry.annotations && typeof entry.annotations.readOnlyHint];
  }));
  check('every published tool carries readOnlyHint on the wire, writes included',
    fieldHints.every(row => row[1] === 'boolean'), JSON.stringify(fieldHints));
  /* The vocabulary swap, against a host that keeps the registration anyway. */
  const fieldStale = await fieldPage.evaluate(async () => {
    const opened = await window.__webmcp.call('document.compare',
      JSON.parse('{"text":"# Other\\n\\nan alternative."}'));
    await new Promise(resolve => setTimeout(resolve, 1200));
    const names = window.__webmcp.names();
    let stale = { state: 'absent' };
    if (names.includes('document.find')) {
      try {
        const raw = await window.__webmcp.call('document.find', { query: 'the' });
        const envelope = JSON.parse(raw);
        const value = JSON.parse(envelope.content[0].text);
        stale = { state: 'answered', outcome: value.outcome, reason: value.reason,
          isError: envelope.isError === true };
      } catch (error) { stale = { state: 'threw', message: String(error && error.message || error) }; }
    }
    return { opened: JSON.parse(JSON.parse(opened).content[0].text).outcome, names, stale };
  });
  log('  after the swap on an inert-unregister host: ' + JSON.stringify(fieldStale).slice(0, 200));
  check('a registration the host would not withdraw answers in vocabulary for a retired tool',
    fieldStale.stale.state === 'absent' || (fieldStale.stale.state === 'answered' &&
      fieldStale.stale.outcome === 'refused' && fieldStale.stale.reason === 'tool_withdrawn' &&
      fieldStale.stale.isError === true),
    JSON.stringify(fieldStale).slice(0, 260));
  check('the hostile-host page raised no uncaught error', fieldErrors.length === 0,
    JSON.stringify(fieldErrors.slice(0, 2)));
  await fieldPage.close();

  /* ONE FAMILY, EVERY DOOR, MEASURED OVER THE WHOLE RUN. Will/1's three words plus this host's
     two are the entire outcome vocabulary a refusal may leave by; the answer words are each
     operation's own and are declared beside them in the manifest, which is where membership is
     read from rather than from a list kept here. A word the artifact never declared is a word
     some projection invented, and a refusal word that reached an agent without `isError` is a
     refusal the ecosystem's evaluator scores as a pass. The `rule` census is the other half:
     Will/1's set is closed, so a sixth rule on the wire is a rule no reader can look up. */
  log('### one outcome family across every door this run drove');
  const WILL_WORDS = ['applied', 'refused', 'invalid'];
  const HOST_WORDS = ['conflict', 'target_gone'];
  const WILL_RULE_ENUM = ['before_faulted', 'marker_span_touched', 'law_violated',
    'marker_sequence_mismatch', 'result_faulted'];
  const declaredOutcomes = await page.evaluate(() => {
    const manifest = JSON.parse(document.querySelector(
      'script[type="application/speedracer-app+json"]').textContent);
    const words = new Set();
    const rules = new Set();
    const perOperation = {};
    for (const operation of manifest.operations || []) {
      const properties = (operation.result && operation.result.properties) || {};
      const enumerated = (properties.outcome && properties.outcome.enum) || null;
      if (enumerated) perOperation[operation.name] = enumerated;
      for (const word of enumerated || []) words.add(word);
      for (const rule of (properties.rule && properties.rule.enum) || []) rules.add(rule);
    }
    return { words: [...words].sort(), rules: [...rules].sort(), perOperation };
  });
  const spoken = observed.filter(entry => entry.value && typeof entry.value === 'object'
    && typeof entry.value.outcome === 'string' && entry.value.outcome.length);
  /* Judged where a declaration exists to judge against. Five read operations declare no outcome
     enum at all (`document.get_context`, `get_outline`, `find`, `compare`,
     `compare.get_context`), so their answer words — outline, unavailable, comparing, ready —
     are undeclared today. None of them is a refusal, so nothing is mis-scored by it; it is a
     declaration gap named here rather than covered over by a check that skips the question. */
  const undeclared = [...new Set(spoken
    .filter(entry => declaredOutcomes.perOperation[entry.name])
    .map(entry => entry.name + '.' + entry.value.outcome))]
    .filter(row => !declaredOutcomes.perOperation[row.slice(0, row.lastIndexOf('.'))]
      .includes(row.slice(row.lastIndexOf('.') + 1)));
  const refusals = spoken.filter(entry =>
    WILL_WORDS.slice(1).concat(HOST_WORDS).includes(entry.value.outcome));
  const silentRefusals = refusals.filter(entry => entry.isError !== true)
    .map(entry => entry.name + ' ' + entry.value.outcome + '/' + String(entry.value.reason || ''));
  const armsDriven = [...new Set(refusals.map(entry => entry.value.outcome))].sort();
  const rulesSpoken = [...new Set(spoken.map(entry => String(entry.value.rule || ''))
    .filter(Boolean))].sort();
  log('  refusal words driven: ' + JSON.stringify(armsDriven)
    + '  rules spoken: ' + JSON.stringify(rulesSpoken)
    + '  over ' + spoken.length + ' results');
  check('every operation that declares an outcome enum spoke only from it',
    spoken.length > 0 && undeclared.length === 0, JSON.stringify(undeclared));
  check('the declared family is Will/1\'s three words and this host\'s two, and no sixth',
    WILL_WORDS.concat(HOST_WORDS).every(word => declaredOutcomes.words.includes(word)) &&
      !declaredOutcomes.words.includes('rejected'),
    JSON.stringify(declaredOutcomes.words));
  check('all four refusal words were driven through the wire this run',
    JSON.stringify(armsDriven) === JSON.stringify(['conflict', 'invalid', 'refused', 'target_gone']),
    JSON.stringify(armsDriven));
  check('and every one of them carried isError to the evaluator the field runs',
    silentRefusals.length === 0, JSON.stringify(silentRefusals));
  check('the declared rule enum is Will/1\'s closed set, and the wire spoke only from it',
    JSON.stringify(declaredOutcomes.rules) === JSON.stringify(WILL_RULE_ENUM.slice().sort()) &&
      rulesSpoken.every(rule => WILL_RULE_ENUM.includes(rule)) && rulesSpoken.length > 0,
    JSON.stringify({ declared: declaredOutcomes.rules, spoken: rulesSpoken }));

  /* THE MESSAGE IS THE TEACHING. `reason` names the fact; `message` is where the wire spends
     nothing extra to name the verb that resolves it, at the exact moment the model needs it —
     see docs/evidence/lane-messages-report.md. A refusal with no message, or one that names
     neither a tool this door registers nor a plain next-step cue, has taught the caller only
     what went wrong and nothing about what to do next. */
  const TOOL_VERBS = ['get_context', 'get_outline', 'read_context', 'find_change', 'find',
    'wait_for_user', 'reveal_change', 'reveal', 'show_changes', 'compare', 'apply_edits',
    'undo_agent_change', 'open_text', 'read_change', 'close'];
  /* `input.<field>` is admitted as its own cue: agents.md's own promise for `invalid` is that
     the reason names the exact path that failed, which is a next step in itself. */
  const NEXT_STEP_CUES = [/\bcall\b/i, /\bwait\b/i, /\bpropose\b/i, /\bsplit\b/i,
    /\btell them\b/i, /\bgive each\b/i, /\bstrip\b/i, /\bre-encode\b/i, /\binclude\b/i,
    /\bdo not\b/i, /\bread around\b/i, /\bomit\b/i, /\bno write can land\b/i,
    /\binput\.[a-z_]/i];
  const messageOf = entry => entry.value && typeof entry.value.message === 'string'
    ? entry.value.message : '';
  const emptyMessages = refusals.filter(entry => !messageOf(entry).trim().length)
    .map(entry => entry.name + ' ' + entry.value.outcome + '/' + String(entry.value.reason || ''));
  const noNextStep = refusals.filter(entry => messageOf(entry).trim().length > 0).filter(entry => {
    const msg = messageOf(entry);
    return !TOOL_VERBS.some(verb => msg.includes(verb)) && !NEXT_STEP_CUES.some(rx => rx.test(msg));
  }).map(entry => entry.name + ' ' + entry.value.reason + ': ' + messageOf(entry));
  log('  refusals this run: ' + refusals.length + '  every one carries a message: '
    + (emptyMessages.length === 0));
  check('every emitted refusal message is non-empty and names a tool verb or a plain next step',
    emptyMessages.length === 0 && noNextStep.length === 0,
    JSON.stringify({ emptyMessages, noNextStep }).slice(0, 600));

  log('### the hostile-document network witness: zero off-origin requests across this run');
  /* Every remote-fetch vector Markdown and HTML admit into a document, aimed at one refused
     host: a markdown image, every bare and CSS image form, video/audio/track, iframe,
     object/embed, an <input type=image>, four link relations, a <base> plus a relative URL that
     resolves through it, a meta refresh, inline and imported CSS (background, @font-face), a
     table background, a ping-carrying anchor, a form action, a classic script tag, and an SVG
     image/use — copied from the steward's standalone witness (hostile-network.js) rather than
     re-invented, because a second hand-picked vector list is a second place to fall behind.
     Routed only for this fixture, and unrouted the moment it is read: the recording above already
     covers the whole run, so this closing check is the one gate that speaks for load,
     registration, and every tool call this session drove, not only this document. Aborting every
     vector here keeps the proof fast and deterministic regardless of what a real off-origin host
     would do, without adding routing overhead to the rest of the run. */
  await page.route('**/*', route =>
    isOffOrigin(route.request().url()) ? route.abort('blockedbyclient') : route.continue());
  await openPayloadSafely(page, {
    text: [
      '# Hostile document', '',
      '![md image](https://leak.invalid/md-image.png)', '![ref image][r1]', '',
      '[r1]: https://leak.invalid/ref-image.png', '',
      '<img src="https://leak.invalid/img-src.png" srcset="https://leak.invalid/srcset-1x.png 1x">',
      '<img src="//leak.invalid/protocol-relative.png">',
      '<picture><source srcset="https://leak.invalid/picture-source.webp"><img src="https://leak.invalid/picture-img.png"></picture>',
      '<video src="https://leak.invalid/video.mp4" poster="https://leak.invalid/poster.png" autoplay muted><track src="https://leak.invalid/track.vtt"></video>',
      '<audio src="https://leak.invalid/audio.mp3" autoplay></audio>',
      '<iframe src="https://leak.invalid/frame.html"></iframe>',
      '<object data="https://leak.invalid/object.svg"></object>',
      '<embed src="https://leak.invalid/embed.svg">',
      '<input type="image" src="https://leak.invalid/input-image.png">',
      '<link rel="stylesheet" href="https://leak.invalid/style.css">',
      '<link rel="preload" as="image" href="https://leak.invalid/preload.png">',
      '<link rel="prefetch" href="https://leak.invalid/prefetch.bin">',
      '<link rel="icon" href="https://leak.invalid/icon.png">',
      '<base href="https://leak.invalid/base/">',
      '<img src="relative-after-base.png">',
      '<meta http-equiv="refresh" content="0;url=https://leak.invalid/refresh">',
      '<svg width="10" height="10"><image href="https://leak.invalid/svg-image.png"/><use href="https://leak.invalid/sprite.svg#x"/></svg>',
      '<div style="background:url(https://leak.invalid/css-bg.png)">styled</div>',
      '<style>@import url("https://leak.invalid/import.css"); @font-face{font-family:L;src:url(https://leak.invalid/font.woff2)} .x{font-family:L}</style>',
      '<span class="x">font</span>',
      '<table background="https://leak.invalid/table-bg.png"><tr><td>cell</td></tr></table>',
      '<a href="https://leak.invalid/link" ping="https://leak.invalid/ping">link</a>',
      '<form action="https://leak.invalid/form"><button>go</button></form>',
      '<script src="https://leak.invalid/script.js"></script>',
    ].join('\n\n'),
    name: 'webmcp-hostile.md',
  });
  await page.waitForTimeout(1200);
  /* A tool call or two over the fixture itself, not just a page load: get_context and find are
     what an agent would actually spend on a hostile file, and both have to keep answering
     through it — a fixture that silently breaks Rapier would prove nothing about its network. */
  const hostileCtx = (await invoke(page, 'document.get_context', {})).value;
  const hostileFind = (await invoke(page, 'document.find', { query: 'styled' })).value;
  await page.unroute('**/*');
  check('zero requests left the served origin across load, registration, every tool call above, '
    + 'and this hostile document, which the tool surface still read correctly',
    offOriginRequests.length === 0
      && hostileCtx.filename === 'webmcp-hostile.md'
      && hostileFind.outcome === 'searched' && (hostileFind.matches || []).length > 0,
    JSON.stringify({ offOriginRequests, hostileCtx, hostileFind }).slice(0, 500));

  const hostReasons = censusHostReasons(SOURCE_TEXT);
  const allHostReasons = [...hostReasons.conflict, ...hostReasons.target_gone];
  const undocumented = allHostReasons.filter(r => !AGENTS_MD.includes('`' + r + '`'));
  check('every host reason source pairs with conflict/target_gone (' + allHostReasons.length
    + ') is named in agents.md’s vocabulary', undocumented.length === 0,
    JSON.stringify(undocumented));

  log('### page errors');
  if (errors.length) errors.slice(0, 6).forEach(e => log('  ' + e.split('\n')[0]));
  else log('  (none)');
  check('no uncaught page errors', errors.length === 0, String(errors.length) + ' errors');

  log('');
  log(failures === 0 ? '### RESULT: all WebMCP checks passed'
    : '### RESULT: ' + failures + ' WebMCP checks FAILED');
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
}

async function main() {
  if (!chromium) {
    console.log(JSON.stringify({ status: 'not_run', reason: 'playwright_unavailable',
      subjectSha256: SUBJECT_SHA256, detail: playwrightLoadError.slice(0, 240) }));
    process.exitCode = 2;
    return;
  }
  await (NATIVE_CONTRACT ? runNativeContract() : runHarness());
}

module.exports = Object.freeze({ nativeObservationStatus });

if (require.main === module) {
  main().catch(error => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}
