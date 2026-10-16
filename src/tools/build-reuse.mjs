// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import childProcess from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import http2 from 'node:http2';
import workerThreads from 'node:worker_threads';
import {AsyncLocalStorage} from 'node:async_hooks';
import crypto, {createHash} from 'node:crypto';
import {registerHooks, syncBuiltinESMExports, builtinModules} from 'node:module';
import {dirname, relative, resolve, isAbsolute} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const BUILD_PROFILES = Object.freeze({reader: 'rapier-reader.html', full: 'rapier.html'});
const HERE = fileURLToPath(import.meta.url), ROOT = resolve(dirname(HERE), '..');
const SCHEMA = 'rapier-build-reuse/1';
const ownImport = value => typeof value === 'string' && (value.startsWith('file:') ? value === pathToFileURL(HERE).href : resolve(value) === HERE);
const stateKey = Symbol.for('rapier.build-observation');
const internalIO = new AsyncLocalStorage();
const NativeDate = globalThis.Date, nativeNow = NativeDate.now;
const original = {readFileSync: fs.readFileSync, readdirSync: fs.readdirSync, statSync: fs.statSync, existsSync: fs.existsSync,
  realpathSync: fs.realpathSync,
  readFile: fsp.readFile, writeFile: fsp.writeFile, mkdir: fsp.mkdir, rename: fsp.rename, spawnSync: childProcess.spawnSync};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value);
const localPath = path => path instanceof URL ? fileURLToPath(path) : typeof path === 'string' || Buffer.isBuffer(path) ? resolve(String(path)) : null;
const portable = (root, path) => relative(root, path).split('\\').join('/');
const state = () => globalThis[stateKey];
const active = () => state() && !state().muted && !internalIO.getStore() && ['imports', 'assembly'].includes(state().phase);
const quiet = fn => internalIO.run(true, () => { const current = state(); if (current) current.muted++; try { return fn(); } finally { if (current) current.muted--; } });
function originalCall(fn, receiver, args) {
  const callback = args.at(-1);
  if (typeof callback === 'function') {
    const caller = AsyncLocalStorage.snapshot();
    args[args.length - 1] = function (...values) { return caller(() => Reflect.apply(callback, this, values)); };
  }
  return quiet(() => Reflect.apply(fn, receiver, args));
}
const unknown = (reason, module = false) => { if (active() || module && state() && state().phase !== 'receipt') state().unknown.add(reason); };
const assemblyAmbient = reason => { if (state() && !state().muted && !internalIO.getStore() && state().phase !== 'receipt') state().unknown.add(reason); };

// clocks. A builder's other clock or random reads cannot license reuse.
export const buildReceiptTimestamp = () => new NativeDate().toISOString();
export const buildTimingNow = () => Reflect.apply(nativeNow, NativeDate, []);

export function buildShellSource(source) {
  let text = source;
  for (const name of ['JXL', 'BACKUP_WORKER', 'SHARED_AGENT', 'APPS_BRIDGE', 'RUNTIME', 'PAINT'])
    text = text.replace(new RegExp('<!-- RAPIER_' + name + '_BEGIN -->[\\s\\S]*?<!-- RAPIER_' + name + '_END -->\\s*', 'g'), '');
  text = text.replace(/<!-- RAPIER_PLATFORM_BEGIN -->[\s\S]*?<!-- RAPIER_PLATFORM_END -->\n?/g, '<!-- RAPIER_PLATFORM_BEGIN -->\n<!-- RAPIER_PLATFORM_END -->\n');
  for (const id of ['lib-dompurify', 'lib-turndown', 'lib-markdownit', 'lib-gpu-lexer', 'lib-acorn'])
    text = text.replace(new RegExp('(<script (?:id="' + id + '" type="text/rapier-vendor"|type="text/rapier-vendor" id="' + id + '")>)\\n[\\s\\S]*?</script>\\n', 'g'), '$1\n</script>\n');
  for (const id of ['lib-gpu-lexer', 'lib-acorn'])
    text = text.replace(new RegExp('[\\t\\r\\n]*(<script (?:id="' + id + '" type="text/rapier-vendor"|type="text/rapier-vendor" id="' + id + '")>)\\n</script>[\\t\\r\\n]*', 'g'), '\n$1\n</script>\n');
  text = text.replace(/(<meta name="rapier-version" content=")[^"]+(">)/, '$1template$2');
  text = text.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/g, '$1$2');
  text = text.replace(/<link rel="(?:describedby|ai-catalog)"[^>]*>\n?/g, '');
  text = text.replace(/\n<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@graph":[\s\S]*?<\/script>/, '');
  text = text.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (all, open, body, close) => {
    const data = JSON.parse(body);
    for (const [name, value] of Object.entries({description: '', operatingSystem: [], softwareHelp: {}, featureList: [],
      '@id': '', softwareVersion: '', sameAs: [], publisher: {'@id': ''}})) data[name] = value;
    return open + json(data) + close;
  });
  let region = 0;
  text = text.replace(/<!-- RAPIER_SEO_BEGIN -->[\s\S]*?<!-- RAPIER_SEO_END -->\n?/g, value => ++region === 2 ? '<!-- RAPIER_SEO_BEGIN -->\n<!-- RAPIER_SEO_END -->\n' : value);
  text = text.replace(/(<script[^>]*type="application\/speedracer-app\+json"[^>]*>)[\s\S]*?(<\/script>)/, '$1$2');
  return text;
}

function record(observation, module = false) {
  if (!active() && !(module && state() && !state().muted && !internalIO.getStore() && state().phase !== 'receipt')) return;
  const current = state(), path = observation.path;
  if (!path) { unknown('non-path filesystem input', module); return; }
  if (path === resolve(ROOT, 'dist/BUILD.json')) return;
  if (current.written.has(path)) return;
  if (portable(ROOT, path).startsWith('../')) { unknown('input outside the source tree: ' + path, module); return; }
  const key = observation.kind + '\0' + path + '\0' + (observation.encoding || '');
  const prior = current.inputs.get(key);
  if (prior && json(prior) !== json(observation)) unknown('input changed while assembling: ' + portable(ROOT, path), module);
  current.inputs.set(key, observation);
}

function fileObservation(path, bytes, encoding = null, kind = 'file') {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, encoding || 'utf8') : Buffer.from(bytes);
  return {kind, path, encoding, bytes: buffer.length, sha256: sha256(buffer)};
}
function directoryObservation(path, options, result) {
  const settings = typeof options === 'string' ? {encoding: options} : options || {};
  const rows = (result || original.readdirSync(path, settings)).map(row => typeof row === 'string' ? row : Buffer.isBuffer(row) ? {buffer: row.toString('base64')} :
    {name: row.name, parentPath: row.parentPath, path: row.path, type: row.isDirectory() ? 'directory' : row.isFile() ? 'file' : row.isSymbolicLink() ? 'symlink' :
      row.isBlockDevice() ? 'block' : row.isCharacterDevice() ? 'character' : row.isFIFO() ? 'fifo' : row.isSocket() ? 'socket' : 'other'});
  return {kind: 'directory', path, options: settings, entries: rows};
}
function statObservation(path) {
  const row = original.statSync(path, {bigint: true});
  return {kind: 'stat', path, fields: Object.fromEntries(['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'rdev', 'size', 'blksize', 'blocks', 'atimeNs', 'mtimeNs', 'ctimeNs', 'birthtimeNs'].map(key => [key, String(row[key])]))};
}
function scopeObservation(path, root = ROOT) {
  for (let at = dirname(path); ; at = dirname(at)) {
    const scope = resolve(at, 'package.json');
    try {
      const bytes = original.readFileSync(scope);
      return {kind: 'scope', path, scope: portable(root, scope), bytes: bytes.length, sha256: sha256(bytes)};
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(at) === at) return {kind: 'scope', path, scope: null};
  }
}
function encoding(options) { return typeof options === 'string' ? options : options?.encoding || null; }
function failure(path, error) { if (error?.code === 'ENOENT') record({kind: 'absent', path}); else unknown('filesystem read failed: ' + String(error?.code || error)); }

function install() {
  if (state()) return;
  void process.stdout; void process.stderr; void process.stdin;
  globalThis[stateKey] = {phase: 'imports', muted: 0, inputs: new Map(), written: new Set(), unknown: new Set(), started: performance.now()};
  if (/(?:^|\s)(?:--(?:require|import|(?:experimental-)?loader)(?:[=\s]|$)|-r(?:[=\s]|$))/.test(process.env.NODE_OPTIONS || '')) unknown('ambient executable preload or loader');
  for (let at = 0; at < process.execArgv.length; at++) {
    const flag = process.execArgv[at];
    if (flag === '--import' && ownImport(process.execArgv[at + 1])) { at++; continue; }
    if (/^(?:--(?:require|import|(?:experimental-)?loader)(?:=|$)|-r(?:=|$))/.test(flag)) unknown('executable preload or loader: ' + flag);
  }
  record(fileObservation(HERE, original.readFileSync(HERE)));
  const supported = new Set(['readFileSync', 'readFile', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'stat', 'writeFileSync', 'writeFile', 'mkdirSync', 'mkdir', 'renameSync', 'rename', 'cpSync', 'cp', 'copyFileSync', 'copyFile']);
  for (const owner of [fs, fsp]) for (const name of Object.keys(owner)) {
    const fn = owner[name];
    if (typeof fn !== 'function' || /^[A-Z]/.test(name) || ['promises', 'constants'].includes(name)) continue;
    if (!supported.has(name)) {
      owner[name] = function (...args) { unknown('unobserved filesystem operation: ' + name); return originalCall(fn, this, args); };
      continue;
    }
    if (/^(?:writeFile|mkdir|rename|cp|copyFile)/.test(name)) {
      owner[name] = function (...args) {
        const output = localPath(args[/^(?:rename|cp|copyFile)/.test(name) ? 1 : 0]);
        if (!output) unknown('non-path filesystem output: ' + name);
        if (name.startsWith('writeFile') && args[2]?.flag != null && args[2].flag !== 'w') unknown('unsupported write flag: ' + args[2].flag);
        if (name.startsWith('cp') && args[2]?.filter) unknown('unobserved copy filter');
        if (output && active() && !/^mkdir/.test(name)) state().written.add(output);
        if (/^(?:cp|copyFile|rename)/.test(name) && active()) {
          try { const input = localPath(args[0]); if (!state().written.has(input)) record(fileObservation(input, quiet(() => original.readFileSync(input)))); }
          catch (error) { unknown('copy or rename source is not one file'); }
        }
        return originalCall(fn, this, args);
      };
      continue;
    }
    owner[name] = function (...args) {
      const path = localPath(args[0]), observed = active();
      const capture = result => {
        if (!observed) return result;
        if (name.startsWith('readFile')) record(fileObservation(path, result, encoding(args[1])));
        else if (name.startsWith('readdir')) record(quiet(() => directoryObservation(path, args[1], result)));
        else if (name === 'existsSync') record({kind: 'exists', path, value: result});
        else record(quiet(() => statObservation(path)));
        return result;
      };
      const callback = args.at(-1);
      if (owner === fs && !name.endsWith('Sync') && typeof callback === 'function') args[args.length - 1] = (error, result) => {
        if (error) { if (observed) failure(path, error); return callback(error); }
        try { capture(result); } catch (captureError) { unknown('unreadable filesystem observation: ' + name); }
        callback(null, result);
      };
      try {
        const result = originalCall(fn, this, args);
        if (result?.then) return result.then(capture, error => { if (observed) failure(path, error); throw error; });
        return owner === fs && !name.endsWith('Sync') && typeof callback === 'function' ? result : capture(result);
      } catch (error) { if (observed) failure(path, error); throw error; }
    };
  }
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    const fn = childProcess[name];
    childProcess[name] = function (...args) { unknown('subprocess during assembly: ' + name); return Reflect.apply(fn, this, args); };
  }
  const unobserved = (owner, name, reason) => {
    if (typeof owner?.[name] !== 'function') return;
    owner[name] = new Proxy(owner[name], {
      apply(target, receiver, args) { unknown(reason); return Reflect.apply(target, receiver, args); },
      construct(target, args, targetClass) { unknown(reason); return Reflect.construct(target, args, targetClass); },
    });
  };
  const ambient = (owner, name, reason) => {
    if (typeof owner?.[name] !== 'function') return;
    const observed = new Proxy(owner[name], {
      apply(target, receiver, args) { assemblyAmbient(reason); return Reflect.apply(target, receiver, args); },
    });
    Object.defineProperty(owner, name, {value: observed, writable: true, configurable: true,
      enumerable: Object.getOwnPropertyDescriptor(owner, name)?.enumerable ?? false});
  };
  globalThis.Date = new Proxy(NativeDate, {
    apply(target, receiver, args) { assemblyAmbient('wall clock read during assembly'); return Reflect.apply(target, receiver, args); },
    construct(target, args, targetClass) {
      if (!args.length) assemblyAmbient('wall clock read during assembly');
      return Reflect.construct(target, args, targetClass);
    },
  });
  ambient(NativeDate, 'now', 'wall clock read during assembly');
  ambient(Math, 'random', 'random input during assembly');
  ambient(performance, 'now', 'monotonic clock read during assembly');
  for (const name of ['randomBytes', 'randomFill', 'randomFillSync', 'randomInt', 'randomUUID', 'generateKey', 'generateKeySync', 'generateKeyPair', 'generateKeyPairSync', 'generatePrime', 'generatePrimeSync'])
    ambient(crypto, name, 'cryptographic random input during assembly: ' + name);
  for (const name of ['getRandomValues', 'randomUUID']) ambient(globalThis.crypto, name, 'cryptographic random input during assembly: ' + name);
  ambient(globalThis.crypto?.subtle, 'generateKey', 'cryptographic random input during assembly: generateKey');
  for (const name of ['ReadStream', 'WriteStream']) unobserved(fs, name, 'filesystem stream during assembly');
  for (const owner of [http, https]) for (const name of ['request', 'get', 'ClientRequest', 'createServer', 'Server']) unobserved(owner, name, 'HTTP I/O during assembly');
  for (const owner of [net, tls, dgram, http2]) for (const name of ['connect', 'createConnection', 'createServer', 'createSocket', 'createSecureServer', 'Socket', 'Server', 'TLSSocket']) unobserved(owner, name, 'network I/O during assembly');
  for (const owner of [dns, dns.promises]) for (const name of Object.keys(owner)) unobserved(owner, name, 'DNS I/O during assembly');
  unobserved(net.Socket.prototype, 'connect', 'network I/O during assembly');
  unobserved(workerThreads, 'Worker', 'worker thread during assembly');
  unobserved(process, 'getBuiltinModule', 'unobserved direct builtin access');
  const fetch = globalThis.fetch;
  if (fetch) globalThis.fetch = function (...args) { unknown('network input during assembly'); return Reflect.apply(fetch, this, args); };
  syncBuiltinESMExports();
  const builtins = new Set(builtinModules.flatMap(name => [name, 'node:' + name]));
  registerHooks({
    resolve(specifier, context, next) {
      const result = quiet(() => next(specifier, context));
      if (!builtins.has(specifier) && !specifier.startsWith('.') && !specifier.startsWith('file:') && !isAbsolute(specifier)) unknown('package resolution: ' + specifier, true);
      else if (!builtins.has(specifier) && result.url.startsWith('file:')) {
        try {
          const path = specifier.startsWith('file:') ? fileURLToPath(specifier) : isAbsolute(specifier) ? specifier : fileURLToPath(new URL(specifier, context.parentURL));
          const target = quiet(() => original.realpathSync(path));
          if (target !== fileURLToPath(result.url)) unknown('module resolution is not one exact file: ' + specifier, true);
          else record({kind: 'realpath', path, target: portable(ROOT, target)}, true);
        } catch (_) { unknown('module resolution is not one exact file: ' + specifier, true); }
      }
      return result;
    },
    load(url, context, next) {
      const result = quiet(() => next(url, context));
      if (url.startsWith('file:') && result.source != null) {
        const path = fileURLToPath(url);
        record(fileObservation(path, result.source), true);
        if (path.endsWith('.js')) try { record(quiet(() => scopeObservation(path)), true); } catch (error) { unknown('unreadable module package scope', true); }
      } else if (url.startsWith('file:')) unknown('module has no inspectable source: ' + url, true);
      return result;
    },
  });
}

const preload = process.execArgv.some((value, at, args) => value === '--import' && ownImport(args[at + 1]));
if (preload) install();
if (!preload && process.argv[1] && resolve(process.argv[1]) === resolve(ROOT, 'tools/build.mjs')) process.exit(runObservedBuild());

export const unobservedBuildIO = fn => quiet(fn);

export function buildObservationActive() { return Boolean(state()); }
export function runObservedBuild() {
  const result = original.spawnSync(process.execPath, [...process.execArgv, '--import', HERE, resolve(ROOT, 'tools/build.mjs'), ...process.argv.slice(2)], {stdio: 'inherit', env: process.env});
  if (result.error) throw result.error;
  if (result.signal) console.error('Observed build terminated by signal ' + result.signal);
  return result.status ?? 1;
}
export function buildPhase(phase) { if (state()) state().phase = phase; }

export async function readBuildInput({root = ROOT, path}) {
  const absolute = validatePath(root, path), bytes = await original.readFile(absolute);
  record(fileObservation(absolute, bytes), true);
  return bytes.toString('utf8');
}

export function buildMissingPaths({root = ROOT, paths}) {
  return paths.filter(path => {
    const absolute = validatePath(root, path), exists = original.existsSync(absolute);
    record({kind: 'exists', path: absolute, value: exists}, true);
    return !exists;
  });
}

export async function captureBuildGateOutputs({root = ROOT, paths = []} = {}) {
  if (!state()) throw new Error('Build observation did not start before imports');
  const outputs = [];
  for (const path of [...new Set(paths)].sort()) {
    const absolute = validatePath(root, path);
    try { outputs.push({...fileObservation(absolute, await original.readFile(absolute)), path}); }
    catch (error) { if (error.code !== 'ENOENT') throw error; outputs.push({kind: 'absent', path}); }
  }
  state().gateOutputs = outputs;
}

export function gateOutputSourceMatches({path, before, after}) {
  if (['mcp/render-assets.mjs', 'packages/rapier-embed/README.md'].includes(path)) return true;
  if (path === 'tools/engine-ownership.json') {
    try {
      const old = JSON.parse(before), current = JSON.parse(after);
      const limits = ['mutableRoots', 'domSinks', 'storageKeys', 'remainderBytes'];
      if (limits.some(key => !Number.isSafeInteger(current.limits?.[key]) || current.limits[key] < 0 || current.limits[key] > old.limits?.[key])) return false;
      if (Object.keys(current.engineRoots || {}).some(key => json(current.engineRoots[key]) !== json(old.engineRoots?.[key]))) return false;
      return json({...current, limits: old.limits, engineRoots: old.engineRoots}) === json(old);
    } catch (_) { return false; }
  }
  const normalize = text => path.endsWith('.json') ? text.replace(/("version"\s*:\s*")[^"]*(")/, '$1version$2')
    : text.replace(/\b((?:npx(?:[ \t]+--)?|npm[ \t]+install)[ \t]+rapier-(?:html|embed|markdown-kit))(?:@[^\s`"']+)?/g, '$1@version');
  return normalize(before) === normalize(after);
}

export async function readBuildShell(root = ROOT) {
  const path = resolve(root, 'rapier.html'), source = buildShellSource(await original.readFile(path, 'utf8'));
  record(fileObservation(path, source, 'utf8', 'shell'));
  return source;
}

const shellNotice = source => /^<!DOCTYPE html>\n<!--\n[\s\S]*?-->\n/.exec(source)?.[0] || '';
export async function readBuildNotice(root = ROOT) {
  const path = resolve(root, 'rapier.html');
  try {
    const source = shellNotice(await original.readFile(path, 'utf8'));
    record(fileObservation(path, source, 'utf8', 'notice'));
    return source;
  } catch (error) { failure(path, error); throw error; }
}

function configuration(profile, env) {
  const values = {...env, RAPIER_PROFILE: profile};
  const flags = process.execArgv.filter((value, at, args) => !(value === '--import' && ownImport(args[at + 1])) && !(at > 0 && args[at - 1] === '--import' && ownImport(value)));
  return {profile, environment: sha256(json(Object.keys(values).sort().map(key => [key, String(values[key])]))), flags, cwd: process.cwd(),
    runtime: {node: process.version, versions: process.versions, platform: process.platform, arch: process.arch, executable: sha256(original.readFileSync(process.execPath))}};
}
function validatePath(root, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.split('/').includes('..')) throw new Error('receipt path escapes the source tree');
  return resolve(root, path);
}
async function observe(root, expected) {
  const path = validatePath(root, expected.path);
  if (expected.kind === 'absent') {
    try { original.statSync(path); return {kind: 'absent', path, absent: false}; }
    catch (error) { return {kind: 'absent', path, absent: error.code === 'ENOENT'}; }
  }
  if (expected.kind === 'exists') return {kind: 'exists', path, value: original.existsSync(path)};
  if (expected.kind === 'directory') return directoryObservation(path, expected.options);
  if (expected.kind === 'stat') return statObservation(path);
  if (expected.kind === 'scope') return scopeObservation(path, root);
  if (expected.kind === 'realpath') return {kind: 'realpath', path, target: portable(root, original.realpathSync(path))};
  if (expected.kind === 'shell') return fileObservation(path, buildShellSource(await original.readFile(path, 'utf8')), 'utf8', 'shell');
  if (expected.kind === 'notice') return fileObservation(path, shellNotice(await original.readFile(path, 'utf8')), 'utf8', 'notice');
  if (expected.kind !== 'file') throw new Error('unknown build input observation');
  return fileObservation(path, await original.readFile(path, expected.encoding || undefined), expected.encoding);
}
const withoutPath = row => { const {path, ...value} = row; return value; };
async function changedObservations(root, observations) {
  const changed = [];
  for (const expected of observations) {
    try {
      const actual = await observe(root, expected);
      const same = expected.kind === 'absent' ? actual.absent : json(withoutPath(actual)) === json(withoutPath(expected));
      if (!same) changed.push(expected.path);
    } catch (_) { changed.push(expected.path); }
  }
  return [...new Set(changed)];
}

export async function checkBuildInputs({root = ROOT, profile, record}) {
  const reuse = record?.reuse;
  if (!reuse || reuse.schema !== SCHEMA || reuse.profile !== profile || !Array.isArray(reuse.inputs) || !reuse.inputs.length || !Array.isArray(reuse.outputs))
    throw new Error('refused: ' + profile + ' has no build input/output certificate');
  const {digest, ...body} = reuse;
  if (sha256(json(body)) !== digest) throw new Error('refused: ' + profile + ' build certificate is damaged');
  const page = reuse.outputs.find(row => row.path === BUILD_PROFILES[profile]);
  if (!page || page.sha256 !== record.sha256 || page.bytes !== record.bytes)
    throw new Error('refused: ' + profile + ' page and build certificate disagree');
  const changed = await changedObservations(root, reuse.inputs);
  if (changed.length) throw new Error('refused: ' + profile + ' build inputs changed: ' + changed.join(', '));
  return {inputs: reuse.inputs.length, certificate: digest};
}

export async function inspectBuildReuse({root = ROOT, profile = 'full', env = process.env} = {}) {
  if (!Object.hasOwn(BUILD_PROFILES, profile)) throw new Error('Unknown build profile: ' + profile);
  const refuse = (reason, extra = {}) => ({profile, reusable: false, requiresGates: true, reason, ...extra});
  let receipt;
  try { receipt = JSON.parse(await original.readFile(resolve(root, 'dist/BUILD.json'), 'utf8')); }
  catch (_) { return refuse('no readable build receipt'); }
  const record = receipt.profiles?.[profile], reuse = record?.reuse;
  if (!reuse || reuse.schema !== SCHEMA || reuse.profile !== profile || !Array.isArray(reuse.inputs) || !Array.isArray(reuse.outputs) || !Array.isArray(reuse.gateOutputs) || !reuse.inputs.length || !reuse.outputs.length)
    return refuse('no complete input/output certificate');
  const {digest, ...body} = reuse;
  if (sha256(json(body)) !== digest) return refuse('build certificate is damaged');
  if (reuse.unknown?.length) return refuse('build has unobserved inputs', {unknown: reuse.unknown});
  if (json(reuse.configuration) !== json(configuration(profile, env))) return refuse('build settings or toolchain changed');
  const changedInputs = await changedObservations(root, reuse.inputs);
  if (changedInputs.length) return refuse('build input changed', {changedInputs});
  const changedOutputs = await changedObservations(root, reuse.outputs);
  if (changedOutputs.length) return refuse('build output changed or missing', {changedOutputs});
  const changedGateOutputs = await changedObservations(root, reuse.gateOutputs);
  if (changedGateOutputs.length) return refuse('generated gate output changed or missing', {changedOutputs: changedGateOutputs});
  const page = reuse.outputs.find(row => row.path === BUILD_PROFILES[profile]);
  if (!page || page.sha256 !== record.sha256 || page.bytes !== record.bytes) return refuse('page and certificate disagree');
  return {profile, reusable: true, requiresGates: true, reason: 'exact assembly inputs, settings, toolchain and outputs match', receipt: record};
}

export async function reuseBuildAssembly({root = ROOT, profile = 'full'} = {}) {
  if (!state()) throw new Error('Build observation did not start before imports');
  if (process.argv.includes('--reuse')) {
    const result = state().unknown.size ? {reusable: false, reason: 'bootstrap has unobserved inputs'} : await inspectBuildReuse({root, profile});
    if (result.reusable) {
      const receipt = JSON.parse(await original.readFile(resolve(root, 'dist/BUILD.json'), 'utf8'));
      const envelope = result.receipt.reuse.envelope;
      await original.writeFile(resolve(root, 'dist/BUILD.json'), json({...receipt, ...envelope, profiles: receipt.profiles}) + '\n');
      console.log(JSON.stringify({buildReuse: {profile, skipped: true, reason: result.reason, builtAt: result.receipt.builtAt, gates: 'passed'}}));
      return true;
    }
    console.log(JSON.stringify({buildReuse: {profile, skipped: false, reason: result.reason, changedInputs: result.changedInputs, changedOutputs: result.changedOutputs}}));
  }
  buildPhase('assembly');
  return false;
}

export async function finishBuildReuse({root = ROOT, profile = 'full'} = {}) {
  const current = state();
  if (!current) throw new Error('Build observation did not start before imports');
  buildPhase('receipt');
  const receiptPath = resolve(root, 'dist/BUILD.json'), receipt = JSON.parse(await original.readFile(receiptPath, 'utf8'));
  const inputs = [...current.inputs.values()].map(row => ({...row, path: portable(root, row.path)})).sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  const changedInputs = await changedObservations(root, inputs);
  for (const path of changedInputs) current.unknown.add('input changed during build: ' + path);
  const outputs = [];
  for (const path of [...current.written].sort()) {
    if (path === receiptPath || path.endsWith('.part')) continue;
    try { outputs.push({...fileObservation(path, await original.readFile(path)), path: portable(root, path)}); }
    catch (_) { current.unknown.add('output unavailable: ' + portable(root, path)); }
  }
  const {profiles, ...envelope} = receipt;
  const certificate = {schema: SCHEMA, profile, configuration: configuration(profile, process.env), inputs, outputs, gateOutputs: current.gateOutputs || [], unknown: [...current.unknown].sort(), envelope};
  certificate.digest = sha256(json(certificate));
  receipt.profiles[profile].reuse = certificate;
  await original.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({buildReuse: {profile, skipped: false, inputs: inputs.length, outputs: outputs.length, reusable: !certificate.unknown.length, unknown: certificate.unknown}}));
}
