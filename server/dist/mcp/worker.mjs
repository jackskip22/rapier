import {agentActorId} from '../kit/ledger/format.mjs';
import { createKernel, createState, admissibleText, minimalSplice, transformSplices, LIMITS } from '../agent/kernel.mjs';
import { sourceEdits, mergeSource, replay } from '../kernel/live-merge.mjs';
import { paintAgentStrokes, agentPaintSheetHolds } from '../draw/agent-paint.mjs';
import { VERSION } from '../version.mjs';
import { INSTRUCTIONS, guideResult } from '../agent/guide.mjs';
import { RETURN_ORIGIN } from '../skills/rapier-html/return-address.mjs';
import { wrap } from '../skills/rapier-html/wrap.mjs';
import { HOST_TOOLS, ICONS, MAX_TEXT_BYTES, MAX_EXPORT_BYTES, MAX_FILENAME_CHARS, UI_RESOURCE, getTool, mcpDescriptors, validateInput } from '../agent/catalog.mjs';
import { analyzeDocument } from '../agent/structure.mjs';
import { analyzeMarkdown, checkMarkdownReferences } from '../agent/markdown-server.mjs';
import { resolveCaller, validateOrigin, WORKER_PRESENCE, sealForEditor } from '../agent/door-identity.mjs';
import { mintEditorKey, verifyEditorKey, editorSecretUsable, classifyEditorSecret, editorSecretKeyMaterial } from './editor-keys.mjs';
import { visualResult } from '../agent/visual.mjs';
import { createRequestWait } from './request-lifetime.mjs';

// Two eras on one endpoint (MCP 2026-07-28 dual-era): legacy `initialize` plus header, modern per-request `_meta`. Stateless in both;
// PROTOCOL_VERSION names the legacy era.
export const PROTOCOL_VERSION = '2025-11-25';
export const MODERN_PROTOCOL_VERSION = '2026-07-28';
export const PROTOCOL_VERSIONS = Object.freeze([MODERN_PROTOCOL_VERSION, PROTOCOL_VERSION]);
const META_VERSION = 'io.modelcontextprotocol/protocolVersion', META_CLIENT = 'io.modelcontextprotocol/clientCapabilities', META_SERVER = 'io.modelcontextprotocol/serverInfo';
const UNSUPPORTED_VERSION = -32022, HEADER_MISMATCH = -32020;
// Re-exported: this door's own resource URI.
export { UI_RESOURCE, INSTRUCTIONS };
const UI_MIME = 'text/html;profile=mcp-app';
// The single descriptor projection; tools/build.mjs makes the same call and proves agreement. Never patch a descriptor here.
export const DESCRIPTORS = Object.freeze(mcpDescriptors({ uiResource: UI_RESOURCE }));
const TOOL_BY_NAME = new Map(DESCRIPTORS.map(tool => [tool.name, tool]));
// The editor key is verified before human authority is minted. What it proves is exact and no more: the caller
// holds the page this deployment served to whoever read the UI resource, a host-attested path, not proof of a
// person. No operation name promotes an agent.
const EDITOR_ONLY_TOOLS = new Set(HOST_TOOLS.filter(tool => tool.visibility?.includes('app')).map(tool => tool.name));
const editorSecret = env => (editorSecretUsable(env.EDITOR_KEY_SECRET) ? env.EDITOR_KEY_SECRET : '');
// One deployment verdict, read by /health and every entry point: a missing piece is refused, never permissive.
// Development is ALLOW_UNMETERED_CREATE=true, never inferred. An absent or non-32-byte root secret serves no editor page.
export function deployment(env) {
  const missing = [], invalid = [];
  if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) missing.push('DOCUMENTS');
  if (!env.ASSETS?.fetch) missing.push('ASSETS');
  const development = env.ALLOW_UNMETERED_CREATE === 'true';
  const budget = !!(env.BUDGET?.get && env.BUDGET?.idFromName);
  if (!budget && !development) missing.push('BUDGET');
  const secret = classifyEditorSecret(env.EDITOR_KEY_SECRET);
  if (!secret.usable) (secret.reason === 'malformed' ? invalid : missing).push('EDITOR_KEY_SECRET');
  for (const [name, local] of [['UI_ORIGIN', true], ['FILE_DOWNLOAD_ORIGINS', false], ['ALLOWED_ORIGINS', true], ['RETURN_ORIGIN', true]]) {
    for (const value of String(env[name] || '').split(',').map(part => part.trim()).filter(Boolean)) {
      try { configuredOrigin(value, name, local); } catch (error) { invalid.push(name); break; }
    }
  }
  return { ready: !missing.length && !invalid.length && !development, development, missing, invalid, documents: !missing.includes('DOCUMENTS'), assets: !missing.includes('ASSETS'), budget, editorKey: secret.usable, editorSecret: secret.usable ? secret.form : null, unmeteredCreate: development };
}
// Creates per deployment per hour, metered by RapierBudget. Not per address: a host's many people share its addresses.
const CREATE_BUDGET_PER_DEPLOYMENT = 5000, CREATE_BUDGET_WINDOW_MS = 60 * 60 * 1000;
const CAPABILITY = /^rpr_[A-Za-z0-9_-]{43}$/;
const RETURN_CAPABILITY = /^rpret_([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/;
const EXPORT_CAPABILITY = /^rpexp_([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/;
const MAX_RETURNS = 16;
const RETURN_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Rapier-Name' };
const returnReply = (value, status = 200) => json(value, status, RETURN_CORS);
const returnRefused = (reason, status) => returnReply({ accepted: false, reason }, status);
const receivedReturns = head => (head.returns || []).filter(row => row.receivedAt).sort((a, b) => a.sequence - b.sequence);
const returnMetadata = row => ({ return_id: row.id, name: row.name, receivedAt: row.receivedAt, bytes: row.bytes, chars: row.chars });
const CHUNK_CHARS = 32768;
const MAX_RECEIPTS = 64;
const MAX_UI_BYTES = 8 * 1024 * 1024;
// The body bound is three times MAX_TEXT_BYTES plus envelope room (JSON escaping), never the text law itself.
export const MAX_RPC_BODY_BYTES = MAX_TEXT_BYTES * 3 + 1024 * 1024;
const VIEW_LEASE_MS = 15000;
const DAY = 86400000;
const encoder = new TextEncoder();

const instructions = INSTRUCTIONS;

// Only errors authored at this boundary carry public text. Storage and platform exceptions may contain private data.
const PUBLIC_FAILURE = Symbol('public failure');
const failure = (code, message, details = {}) => Object.assign(new Error(message), { code, details, [PUBLIC_FAILURE]: true });
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const rpcError = (id, code, message, status = 200, data) => json({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }, status);
const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.floor(Number(value)))) : fallback;

function contentBytes(text) {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index++; }
    else bytes += 3;
  }
  return bytes;
}

async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

// The finished file for document.export: the source as it stands, or the offline page (the built editor page, with the source carried inside).
async function exportFile(env, { format, filename, docKind, text }) {
  let file;
  if (format === 'markdown') file = { name: filename, mimeType: docKind === 'markdown' ? 'text/markdown' : 'text/plain', bytes: encoder.encode(text) };
  else {
    try {
      const response = await env.ASSETS?.fetch?.(new Request('https://rapier.internal/rapier.html'));
      if (!response?.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('Content-Type') || '')) return { reason: 'export_page_unavailable' };
      const page = await readTextBody(response, MAX_EXPORT_BYTES, 'export page', 'EXPORT_PAGE_TOO_LARGE');
      const suffix = '.rapier.html';
      const stem = [...filename.replace(/\.(md|markdown|txt)$/i, '')].slice(0, MAX_FILENAME_CHARS - suffix.length).join('');
      file = { name: stem + suffix, mimeType: 'text/html', bytes: encoder.encode(wrap(page, text, filename)) };
    } catch (error) {
      return error?.code === 'EXPORT_PAGE_TOO_LARGE' ? { reason: 'export_too_large', limitBytes: MAX_EXPORT_BYTES } : { reason: 'export_page_unavailable' };
    }
  }
  return file.bytes.byteLength > MAX_EXPORT_BYTES
    ? { reason: 'export_too_large', limitBytes: MAX_EXPORT_BYTES, byteLength: file.bytes.byteLength } : file;
}
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function exportToken(address, grant, env) {
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-export-v1:'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(grant.id + ':' + grant.owner)));
  return 'rpexp_' + address + '.' + base64url(mac);
}
function newCapability() {
  return 'rpr_' + base64url(crypto.getRandomValues(new Uint8Array(32))).slice(0, 43);
}
// Capability: `rpr_` + 43 chars, 22 address then 21 secret. DO addressed by digest of the address; head stores digest of the whole.
// Rotation keeps the address, replaces the secret. Only SHA-256 digests are stored.
const ADDRESS_CHARS = 'rpr_'.length + 22;
const workspaceAddress = capability => digest(capability.slice(0, ADDRESS_CHARS));
// The successor is HMAC-derived from the predecessor, so a lost rotation response is answered again with the same successor. Never stored clear.
async function rotatedCapability(capability, env) {
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-rotation-v1:'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(capability)));
  return capability.slice(0, ADDRESS_CHARS) + base64url(mac).slice(0, 43 - 22);
}
const ROTATE = 'document.rotate_capability';

// The JSON-RPC id is never creation authority. A client-secret createToken derives one capability; degenerate tokens are refused.
const CREATE_TOKEN = /^[A-Za-z0-9_-]{22,128}$/;
// A createToken is a secret: a counter or one-character run is guessable.
const fewDistinct = token => new Set(token).size < 8;
function createTokenRefusal(token) {
  if (!CREATE_TOKEN.test(token)) return 'A createToken must be 22 to 128 url-safe characters (A-Z a-z 0-9 _ -) that you generated at random.';
  if (fewDistinct(token)) return 'Generate createToken at random: this one has too few distinct characters to keep the workspace private.';
  return null;
}
async function tokenCapability(token, env) {
  const payload = encoder.encode('rapier-create-v2:' + token);
  const secret = editorSecret(env);
  let raw;
  if (secret) {
    const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(secret, 'rapier-create-v2:'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    raw = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  } else {
    raw = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  }
  return 'rpr_' + base64url(raw).slice(0, 43);
}
// takeId derives from the address part of the workspace being created, never the JSON-RPC id or the bearer secret.
async function takeIdOf(capability) {
  return 'take_' + (await digest(String(capability ?? '').slice(0, ADDRESS_CHARS))).slice(0, 32);
}
// The decision core takes no randomness; this door supplies the minter.
const mintId = prefix => prefix + crypto.randomUUID().replaceAll('-', '');

function snapshot(state, collaboration, viewIntent, visualIntent) {
  const compare = state.compare ? { id: state.compare.id, revision: state.compare.revision, baseline: state.compare.baseline, incoming: state.compare.incoming, name: state.compare.name, reviewOnly: state.compare.reviewOnly === true, changes: state.compare.changes.map(({ id, start, end, incomingStart, incomingEnd, removed, inserted, status }) => ({ id, start, end, incomingStart, incomingEnd, removed, inserted, status })) } : null;
  return { documentId: state.documentId, revision: state.revision, text: state.text, filename: state.filename, docKind: state.docKind, journal: state.journal, proposalBase: state.proposalBase, compare, collaboration, viewIntent: viewIntent || null, ...(visualIntent ? {visualIntent} : {}) };
}

function collaborationSummary(value) {
  const presence = value.presence, review = value.review;
  return { posture: value.posture, readOnly: value.readOnly, presence: presence ? { active: presence.active, editing: presence.editing, revision: presence.revision, expiresAt: presence.expiresAt } : null, review: review ? { id: review.id, kind: review.kind, status: review.status, cause: review.cause, ...(review.law ? { law: review.law, region: review.region } : {}), revision: review.revision, expiresAt: review.expiresAt, label: review.label, editCount: review.editCount ?? review.splices?.length ?? 0, ...(Array.isArray(review.changeIds) ? { changeIds: review.changeIds } : {}), ...(Array.isArray(review.changes) ? { changes: review.changes } : {}), ...(review.splices ? { splices: review.splices } : {}), ...(review.baseRevision !== undefined ? { baseRevision: review.baseRevision, scope: review.scope, includesHumanChanges: review.includesHumanChanges } : {}), ...(review.reason ? { reason: review.reason } : {}), ...(review.decision ? { decision: review.decision } : {}) } : null };
}

// Model-facing: ids, statuses, counts; never splices. Built from the same collaboration() as collaborationSummary.
function collaborationContext(value) {
  const presence = value.presence, review = value.review;
  return { posture: value.posture, readOnly: value.readOnly, presence: presence ? { active: presence.active, editing: presence.editing, revision: presence.revision, expiresAt: presence.expiresAt } : null, review: review ? { id: review.id, kind: review.kind, status: review.status, cause: review.cause, ...(review.law ? { law: review.law, region: review.region } : {}), revision: review.revision, expiresAt: review.expiresAt, label: review.label, editCount: review.editCount ?? review.splices?.length ?? 0, ...(Array.isArray(review.changeIds) ? { changeIds: review.changeIds } : {}), ...(Array.isArray(review.changes) ? { changes: review.changes.map(({ id, status, reason }) => ({ id, status, ...(reason ? { reason } : {}) })) } : {}), ...(review.baseRevision !== undefined ? { baseRevision: review.baseRevision, scope: review.scope, includesHumanChanges: review.includesHumanChanges } : {}), ...(review.reason ? { reason: review.reason } : {}), ...(review.decision ? { decision: review.decision } : {}) } : null };
}

// Sorted defensively; storage order is not promised.
function reviewChangesFingerprint(review) {
  if (!Array.isArray(review?.changes) || !review.changes.length) return '';
  return review.changes.map(row => `${row.id}:${row.status}:${row.reason || ''}`).sort().join('|');
}

function viewChanged(before, after) {
  if (before.revision !== after.revision || before.text !== after.text || before.filename !== after.filename || before.docKind !== after.docKind || before.compare?.id !== after.compare?.id || before.compare?.revision !== after.compare?.revision || before.posture !== after.posture || before.readOnly !== after.readOnly || before.review?.id !== after.review?.id || before.review?.status !== after.review?.status) return true;
  // Per-change status moves without review.id/status changing: fingerprint the changes too, or a partial drop reads unchanged.
  if (reviewChangesFingerprint(before.review) !== reviewChangesFingerprint(after.review)) return true;
  const left = before.compare?.changes || [], right = after.compare?.changes || [];
  return left.length !== right.length || left.some((row, index) => row.id !== right[index].id || row.status !== right[index].status);
}

// `modelFacing`: the one call site a model reads. If the assembled envelope is over budget, collaboration degrades to counts; nothing else is cut.
function envelope(value, head, meta = {}, { modelFacing = false } = {}) {
  const isError = value.isError || ['refused', 'invalid', 'conflict', 'yielded', 'target_gone'].includes(value.outcome);
  const collaboration = value.collaboration ?? (modelFacing ? head?.collaborationContext : head?.collaboration);
  const result = { ...value, outcome: value.outcome || 'ok', ...(head ? { documentId: head.documentId, revision: head.revision, documentRevision: head.revision, version: head.version, filename: head.filename, docKind: head.docKind, chars: head.chars, collaboration, ...(head.viewIntent ? { view: { id: head.viewIntent.id, kind: head.viewIntent.kind, revision: head.viewIntent.revision, status: head.viewIntent.status, ...(head.viewIntent.reason ? { reason: head.viewIntent.reason } : {}) } } : {}), expiresAt: new Date(head.expiresAt).toISOString() } : {}) };
  if (modelFacing && collaboration?.review && encoder.encode(JSON.stringify(result)).byteLength > LIMITS.resultBytes) {
    const review = collaboration.review;
    result.collaboration = { ...collaboration, review: { id: review.id, kind: review.kind, status: review.status, cause: review.cause, ...(review.law ? { law: review.law, region: review.region } : {}), editCount: review.editCount, complete: false } };
  }
  const message = typeof result.message === 'string' ? result.message : typeof result.reason === 'string' ? result.reason : `${result.outcome}${head ? `; document revision ${head.revision}` : ''}`;
  return { content: [{ type: 'text', text: message }], structuredContent: result, ...(isError ? { isError: true } : {}), ...(Object.keys(meta).length ? { _meta: { rapier: meta } } : {}) };
}

function toolError(error, head, meta) {
  if (!error?.[PUBLIC_FAILURE]) error = failure('WORKSPACE_UNAVAILABLE', 'The workspace operation was not acknowledged. Retry with the same operation identity.');
  const uncertain = ['WORKSPACE_UNAVAILABLE', 'WORKSPACE_UNACKNOWLEDGED'].includes(error.code);
  return envelope({ outcome: uncertain ? 'uncertain' : 'refused', isError: true, code: typeof error.code === 'string' ? error.code : 'WORKSPACE_ERROR', message: error.message || 'The workspace operation failed.', ...(error.details || {}) }, head, meta);
}

async function readTextBody(request, limit = MAX_RPC_BODY_BYTES, label = 'JSON request', code = 'REQUEST_TOO_LARGE', preserveBOM = false) {
  const length = request.headers.get('Content-Length');
  const reader = request.body?.getReader(), signal = request.signal;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: preserveBOM });
  const parts = [];
  let bytes = 0, cancelled = false;
  // A broken peer can leave cancel() pending or reject it. Cleanup must neither
  // stall the refusal nor replace its original error, and no more bytes are read.
  const cancel = reason => {
    if (cancelled || !reader) return;
    cancelled = true;
    reader.cancel(reason).catch(() => {});
  };
  const abort = () => cancel(signal.reason);
  try {
    signal?.throwIfAborted();
    if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw failure(code, `The ${label} must be at most ${limit} bytes.`, { limitBytes: limit });
    if (!reader) { if (preserveBOM) return ''; throw failure('EMPTY_BODY', `The ${label} body is missing.`); }
    signal?.addEventListener('abort', abort, {once: true});
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw failure(code, `The ${label} must be at most ${limit} bytes.`, { limitBytes: limit });
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } catch (error) {
    cancel(error);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader?.releaseLock();
  }
  return parts.join('');
}

const readBody = async request => JSON.parse(await readTextBody(request));

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  // Host is caller controlled. Browser origins for secondary deployments must be configured explicitly.
  const allowed = new Set([RETURN_ORIGIN, ...(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)]);
  const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i;
  if (loopback.test(url.host) && loopback.test(request.headers.get('Host') || url.host)) allowed.add(url.origin);
  return validateOrigin(origin, allowed);
}

// Exact URI lookup over a generated public package. Never interpret caller-controlled paths or URLs.
const skillBundles = new WeakMap();
async function skillsBundle(request, env) {
  const assets = env.ASSETS;
  if (!assets?.fetch) throw failure('SKILLS_NOT_BUILT', 'The skill snapshot is unavailable.');
  if (!skillBundles.has(assets)) {
    const loading = (async () => {
      const response = await assets.fetch(new Request(new URL('/rapier-skills.json', request.url)));
      if (!response.ok) throw failure('SKILLS_NOT_BUILT', 'Publish the complete skill snapshot with this release.');
      const bundle = JSON.parse(await readTextBody(response, 16 * 1024 * 1024, 'skill snapshot', 'SKILLS_NOT_BUILT'));
      if (bundle.release !== VERSION || !Array.isArray(bundle.skills) || !plain(bundle.contents)) throw failure('SKILLS_NOT_BUILT', 'The skill snapshot does not match the serving release.');
      const admitted = new Set();
      for (const skill of bundle.skills) {
        const prefix = 'skill://rapier/' + skill.frontmatter?.name + '/';
        if (typeof skill.frontmatter?.name !== 'string' || !/^[a-z0-9-]+$/.test(skill.frontmatter.name) ||
            typeof skill.frontmatter.description !== 'string' || !skill.frontmatter.description.trim() || skill.uri !== prefix + 'SKILL.md' ||
            !Array.isArray(skill.resources) || !skill.resources.some(row => row.uri === skill.uri)) throw failure('SKILLS_NOT_BUILT', 'The skill manifest is incomplete.');
        for (const entry of skill.resources) {
          const content = Object.hasOwn(bundle.contents, entry.uri) ? bundle.contents[entry.uri] : null;
          if (!entry.uri.startsWith(prefix) || admitted.has(entry.uri) || content?.uri !== entry.uri || typeof content.text !== 'string' ||
              typeof content.mimeType !== 'string' || !content.mimeType || !Number.isSafeInteger(entry.size) || entry.size !== contentBytes(content.text) ||
              entry.digest !== 'sha256:' + await digest(content.text)) throw failure('SKILLS_NOT_BUILT', 'The skill resource failed its package size or digest.');
          admitted.add(entry.uri);
        }
      }
      if (admitted.size !== Object.keys(bundle.contents).length) throw failure('SKILLS_NOT_BUILT', 'The skill snapshot contains undeclared resources.');
      return bundle;
    })();
    skillBundles.set(assets, loading);
    loading.catch(() => { if (skillBundles.get(assets) === loading) skillBundles.delete(assets); });
  }
  return skillBundles.get(assets);
}

async function resource(request, env, uri) {
  if (typeof uri === 'string' && uri.startsWith('skill://')) {
    const bundle = await skillsBundle(request, env);
    if (!Object.hasOwn(bundle.contents, uri)) throw failure('RESOURCE_NOT_FOUND', 'Unknown skill resource.');
    return {contents: [bundle.contents[uri]]};
  }
  if (uri !== UI_RESOURCE) throw failure('RESOURCE_NOT_FOUND', 'Unknown resource.');
  if (!env.ASSETS?.fetch) throw failure('UI_NOT_BUILT', 'Build the Rapier MCP App and bind its static assets before opening the editor.');
  const response = await env.ASSETS.fetch(new Request(new URL('/rapier-app.html', request.url)));
  if (!response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('Content-Type') || '')) throw failure('UI_NOT_BUILT', 'The built /rapier-app.html asset is unavailable.');
  const endpoint = new URL(request.url).origin;
  const domain = configuredOrigin(env.UI_ORIGIN || endpoint, 'UI_ORIGIN', true);
  const connectDomains = [...new Set(['https://cdn.jsdelivr.net', ...(env.FILE_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(value => configuredOrigin(value, 'FILE_DOWNLOAD_ORIGINS'))])];
  let html = await readTextBody(response, MAX_UI_BYTES, 'editor resource', 'UI_RESOURCE_TOO_LARGE');
  const versions = [...html.matchAll(/<meta\s+name="rapier-version"\s+content="([^"]+)"\s*\/?\s*>/gi)];
  if (!/globalThis\.RAPIER_APPS_HOST\s*=\s*true/.test(html) || versions.length !== 1 || versions[0][1] !== VERSION) throw failure('UI_NOT_BUILT', `The asset must be the Rapier ${VERSION} MCP App. Run node tools/build.mjs and publish the MCP App.`);
  html = html.replace(/(<link\b[^>]*\bhref=)(["'])(icon-(?:192|512)\.png)\2/gi, (_, prefix, quote, name) => prefix + quote + new URL('/' + name, endpoint).href + quote);
  // The editor key rides in the page (host-attested path), so the read is private and never cached (ttlMs 0, cacheScope private).
  if (!editorSecret(env)) throw failure('INVALID_UI_CONFIGURATION', 'EDITOR_KEY_SECRET must encode 32 generated bytes as base64 or base64url before the editor can be served.');
  const editorKey = await mintEditorKey(editorSecret(env));
  // Same list as the host's connect-src; the page checks it again before any fetch.
  const fileOrigins = connectDomains.filter(origin => origin !== 'https://cdn.jsdelivr.net');
  const flagged = html.replace(/globalThis\.RAPIER_APPS_HOST\s*=\s*true;/, match => match + ' globalThis.RAPIER_EDITOR_KEY = ' + JSON.stringify(editorKey) + '; globalThis.RAPIER_FILE_DOWNLOAD_ORIGINS = ' + JSON.stringify(fileOrigins) + ';');
  if (flagged === html) throw failure('UI_NOT_BUILT', 'The asset carries no RAPIER_APPS_HOST flag to attach the editor key to.');
  html = flagged;
  // clipboard-write is declared: undeclared, a host has no reason to grant it and copy silently fails. Camera, microphone, geolocation unused.
  // openai/widgetDescription is the Apps host's caption, read off this resource.
  const csp = { connectDomains, resourceDomains: [endpoint] };
  // Sandbox domains have host-specific formats. Claude validates ui.domain as a hash of its
  // connector URL, not an HTTPS origin. Let it choose its sandbox; scope our origin to ChatGPT.
  return { contents: [{ uri: UI_RESOURCE, mimeType: UI_MIME, text: html, _meta: { ui: { prefersBorder: false, csp, permissions: { clipboardWrite: {} } },
    'openai/widgetDomain': domain,
    // Model-opened documents start in the conversation; the person can expand the same scrolling editor.
    'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] },
    'openai/widgetCSP': { connect_domains: csp.connectDomains, resource_domains: csp.resourceDomains },
    'openai/widgetDescription': 'Rapier, the person\'s editor on this document: they see your edits and decide your proposals here.' } }] };
}

function configuredOrigin(value, name, local = false) {
  let url;
  try { url = new URL(value); } catch { throw failure('INVALID_UI_CONFIGURATION', `${name} must contain origins.`); }
  const development = local && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !development) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) throw failure('INVALID_UI_CONFIGURATION', `${name} must contain exact HTTPS origins without credentials, paths or wildcards.`);
  return url.origin;
}

// Listing is not authority: every app-only tool needs the editor key. HOST_TOOLS_LISTING=app-clients is off by default.
// Only the formal MCP Apps declaration counts, in either era.
function declaresAppsUi(params) {
  const capabilities = plain(params?.capabilities) ? params.capabilities : {};
  const ui = plain(capabilities.extensions) ? capabilities.extensions['io.modelcontextprotocol/ui'] : null;
  return !!(plain(ui) && Array.isArray(ui.mimeTypes) && ui.mimeTypes.includes(UI_MIME));
}
function listedTools(env, appsClient) {
  if (env.HOST_TOOLS_LISTING !== 'app-clients') return DESCRIPTORS;
  return appsClient ? DESCRIPTORS : DESCRIPTORS.filter(tool => !EDITOR_ONLY_TOOLS.has(tool.name));
}

// 'ok', 'exceeded', 'uncertain' or 'no-binding'. No binding refuses creation, never unmetered. The two takes are a sequential pair, not one transaction;
// a successful take holds for its window and a retry reuses it. An authorized reopen never calls this.
async function takeCreateBudget(env, { takeId }) {
  if (!env.BUDGET?.get || !env.BUDGET?.idFromName) return env.ALLOW_UNMETERED_CREATE === 'true' ? 'ok' : 'no-binding';
  const keys = [['deployment', CREATE_BUDGET_PER_DEPLOYMENT]];
  for (const [key, limit] of keys) {
    let response;
    try {
      response = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit, windowMs: CREATE_BUDGET_WINDOW_MS, takeId }) }));
    } catch { return 'uncertain'; }
    if (!response.ok) return 'uncertain';
    let body;
    try { body = await response.json(); } catch { return 'uncertain'; }
    if (body.code === 'WORKSPACE_UNAVAILABLE') return 'uncertain';
    if (!body.allowed) return 'exceeded';
  }
  return 'ok';
}

async function callTool(name, args, env, request, hostAgent = null) {
  const descriptor = TOOL_BY_NAME.get(name);
  if (!descriptor) throw failure('UNKNOWN_TOOL', 'Unknown tool.');
  const rawArgs = args;
  try { args = validateInput(descriptor.inputSchema, args, 'arguments', !EDITOR_ONLY_TOOLS.has(name)); }
  catch (error) {
    if (error.code !== 'invalid_arguments') throw error;
    const result = toolError(failure('invalid_arguments', error.message, {path: error.path}));
    // Input feedback is not an instance of the tool's declared successful output.
    return {isError: true, content: [{type: 'text', text: JSON.stringify(result.structuredContent)}]};
  }
  if (name === 'rapier.guide') return envelope(guideResult());
  for (const field of ['text', 'query']) if (typeof args[field] === 'string' && contentBytes(args[field]) > MAX_TEXT_BYTES) return toolError(failure('TEXT_TOO_LARGE', `${field} exceeds the UTF-8 text limit.`, { limitBytes: MAX_TEXT_BYTES }));
  const verdict = deployment(env);
  if (!verdict.documents) return toolError(failure('STORAGE_UNAVAILABLE', 'The document storage binding is unavailable.'));
  const create = name === 'rapier.open' && args.document === undefined;
  if (name === 'rapier.open' && args.file && ['document', 'text', 'filename', 'docKind'].some(key => Object.hasOwn(args, key))) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Open a host file with file alone; its contents are read by the editor through the host.'));
  if (name === 'rapier.open' && args.file && (/[\\/\u0000-\u001f\u007f]/.test(args.file.name) || !args.file.resourceUri.trim())) return toolError(failure('INVALID_DOCUMENT_INPUT', 'A host file needs a filename without a path and a nonempty resource URI.'));
  if (!create && !CAPABILITY.test(args.document || '')) return toolError(failure('INVALID_DOCUMENT', 'Use the document capability returned by rapier.open.'));
  // Creation identity never comes from the public request id. A secret token recovers it; absent
  // a token, every call draws a new identity and therefore needs its own budget spend.
  const createToken = typeof args.createToken === 'string' ? args.createToken : null;
  if (create && createToken !== null) {
    const refusal = createTokenRefusal(createToken);
    if (refusal) return toolError(failure('INVALID_CREATE_TOKEN', refusal));
  }
  if (!create && args.createToken !== undefined) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'createToken belongs to a create. Reopening uses the document capability you already hold.'));
  const minted = create ? (createToken !== null ? await tokenCapability(createToken, env) : newCapability()) : null;
  const createBudget = create ? { takeId: await takeIdOf(minted), retryable: createToken !== null } : null;
  if (!create && name === 'rapier.open' && ['text', 'filename', 'docKind'].some(key => Object.hasOwn(args, key))) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Reopen with document alone; create with text and no document; replace content with document.open_text.'));
  const humanTool = ['document.comment', 'document.read_context'].includes(name) && args.editorKey !== undefined;
  if (EDITOR_ONLY_TOOLS.has(name) || humanTool) {
    if (!editorSecret(env)) return toolError(failure('EDITOR_KEY_UNCONFIGURED', 'This deployment has no EDITOR_KEY_SECRET, so the editor\'s own operations cannot be verified.'));
    const verdict = await verifyEditorKey(editorSecret(env), args.editorKey);
    if (!verdict.ok) return toolError(failure('HUMAN_AUTHORITY_REQUIRED', 'This is the editor\'s own operation. It needs the editor key the Rapier app received with its page.', { reason: verdict.reason }));
  }
  const document = create ? minted : args.document;
  const capabilityHash = await digest(document);
  // Credentials stay outside the workspace; operation_id names the call. Preserve raw operational
  // arguments so changed ignored fields or clipped tails cannot replay. Admission above uses declared fields.
  const { document: ignored, editorKey: ignoredKey, createToken: ignoredToken, operation_id: operationName, ...input } =
    name === 'rapier.open' || EDITOR_ONLY_TOOLS.has(name) ? args : rawArgs;
  const file = name === 'rapier.open' ? input.file : undefined;
  if (file) { delete input.file; Object.assign(input, {text: '', filename: file.name}); }
  // Rotation mints the successor here (the workspace never sees a capability, only digests) and
  // hands the workspace the successor's digest to store; the successor itself goes back sealed.
  const successor = name === ROTATE ? await rotatedCapability(document, env) : null;
  const documentAddress = await workspaceAddress(document);
  // Only pending observations follow client disconnects. Once a durable operation
  // starts, its receipt must finish even if the caller has stopped listening.
  const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(documentAddress)).fetch(new Request('https://rapier.internal/operation', { method: 'POST', ...(name === 'document.wait_for_user' || name === 'document.inspect_visual' ? {signal: request.signal} : {}), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: name, args: input, create, capabilityHash, ...(hostAgent ? {hostAgent} : {}), ...(humanTool ? {humanTool: true} : {}), ...(name === 'document.create_return' ? { returnAddress: documentAddress } : {}), ...(name === 'document.export' ? { exportAddress: documentAddress, exportOrigin: new URL(request.url).origin } : {}), ...(createBudget ? { createBudget } : {}), ...(successor ? { rotateToHash: await digest(successor) } : {}), ...(operationName !== undefined ? { operationId: operationName } : {}) }) }));
  if (!response.ok) {
    const identity = ['operation_id', 'commitId', 'decisionId', 'createToken'].find(key => args[key] !== undefined);
    const retryable = Boolean(identity) || !create && (EDITOR_ONLY_TOOLS.has(name) || descriptor.annotations.readOnlyHint);
    const recovery = identity ? `Retry unchanged arguments with the same ${identity}.`
      : create ? 'Creation may have succeeded; without createToken a retry creates another workspace.'
      : retryable ? 'Retry with unchanged arguments.' : 'This call may have succeeded; read current state before another operation.';
    return toolError(failure('WORKSPACE_UNACKNOWLEDGED', 'The workspace did not acknowledge this operation. ' + recovery,
      {retryable, ...(identity ? {retryIdentity: identity} : {})}));
  }
  const result = await response.json();
  if (result.isError) return result;
  if (successor && result.structuredContent?.rotated === true) {
    result.structuredContent = { ...result.structuredContent, sealed: await sealForEditor(args.editorKey, successor) };
    return result;
  }
  result.structuredContent = { ...result.structuredContent, document };
  if (file || create && Object.keys(args).length === 0) result._meta = {...result._meta, rapier: {...result._meta?.rapier, ...(file ? {hostFile: file} : {home: true})}};
  return result;
}

// Mcp-Name and Mcp-Param-* header values may arrive in the base64 sentinel form
// (`=?base64?...?=`, MCP 2026-07-28 Streamable HTTP "Value Encoding"); decode before comparing.
// RFC 9110 section 5.5 excludes raw field SP/HTAB. Decoded metadata whitespace is data.
const headerField = value => value === null ? null : value.replace(/^[ \t]+|[ \t]+$/g, '');
function headerValue(value) {
  value = headerField(value);
  if (value === null) return null;
  const sentinel = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(value);
  if (!sentinel) return value;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(sentinel[1]), char => char.charCodeAt(0))); } catch { return null; }
}
// Runtime deployment identity is independent of the installed skills snapshot. No binding means no deployment claim.
const serverInfo = env => ({ name: 'rapier', title: 'Rapier', version: VERSION + (env.RAPIER_DEPLOYMENT?.id ? '+worker.' + env.RAPIER_DEPLOYMENT.id : ''), websiteUrl: 'https://rapier.website', icons: ICONS });

export async function handleMcp(request, env) {
  if (new URL(request.url).pathname !== '/mcp') return handleRequest(request, env);
  if (!allowedOrigin(request, env)) return rpcError(null, -32000, 'Origin is not allowed.', 403);
  const origin = request.headers.get('Origin');
  // Browser clients must be able to read refusals as well as successful replies. The existing
  // origin admission owns access; CORS reflects that one admitted origin, never a wildcard.
  const response = request.method === 'OPTIONS'
    ? new Response(null, {status: 204, headers: {'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, X-Rapier-Apps-Client'}})
    : await handleRequest(request, env);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'X-Rapier-Apps-Client');
  headers.set('Vary', 'Origin');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/export/')) {
    const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {...headers, Allow: 'GET, HEAD'}});
    const token = url.pathname.slice('/export/'.length), match = EXPORT_CAPABILITY.exec(token);
    if (!match || url.search || url.hash) return new Response(null, {status: 404, headers});
    if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) return new Response(null, {status: 503, headers});
    try {
      return await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(match[1])).fetch(new Request('https://rapier.internal/export', {
        method: request.method, headers: {'X-Rapier-Export-Hash': await digest(token)},
      }));
    } catch { return new Response(null, {status: 503, headers}); }
  }
  if (url.pathname.startsWith('/return/')) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...RETURN_CORS, 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST') return returnRefused('Use POST to send this document back.', 405);
    const token = url.pathname.slice('/return/'.length), match = RETURN_CAPABILITY.exec(token);
    if (!match || url.search || url.hash) return returnRefused('This return address is unknown.', 404);
    if (!/^text\/markdown(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('Content-Type') || '')) return returnRefused('Content-Type must be text/markdown with UTF-8 text.', 415);
    if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) return returnRefused('Return storage is unavailable.', 503);
    try {
      const forwarded = new Request('https://rapier.internal/return', request);
      forwarded.headers.set('X-Rapier-Return-Hash', await digest(token));
      return await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(match[1])).fetch(forwarded);
    } catch { return returnRefused('The return receipt could not be confirmed. Ask the agent whether it arrived.', 503); }
  }
  if (url.pathname === '/health') return json({ service: 'rapier', serverInfo: serverInfo(env), protocolVersions: PROTOCOL_VERSIONS, protocolVersion: PROTOCOL_VERSION, ...deployment(env) });
  // The ChatGPT app directory verifies the door's domain by reading a token it gives the publisher at this
  // path (developers.openai.com/apps-sdk, "domain verification"); the token is a plain variable of the
  // deployment (`wrangler secret put OPENAI_APPS_CHALLENGE`), never a byte of the door's own state.
  if (url.pathname === '/.well-known/openai-apps-challenge') {
    if (request.method !== 'GET') return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const token = typeof env.OPENAI_APPS_CHALLENGE === 'string' ? env.OPENAI_APPS_CHALLENGE : '';
    return token ? new Response(token, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }) : new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return rpcError(null, -32600, 'Content-Type must be application/json.', 415);
  const accept = (request.headers.get('Accept') || '').toLowerCase().split(',').filter(part => !/;\s*q=0(?:\.0*)?\s*(?:;|$)/.test(part)).map(part => part.split(';')[0].trim());
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return rpcError(null, -32600, 'Accept must include application/json and text/event-stream.', 406);
  let message;
  try {
    message = await readBody(request);
  } catch (error) {
    const oversized = error?.[PUBLIC_FAILURE] && error.code === 'REQUEST_TOO_LARGE';
    return rpcError(null, oversized ? -32600 : -32700, oversized ? error.message : 'Invalid UTF-8 JSON request.', oversized ? 413 : 400, oversized ? error.details : undefined);
  }
  if (!plain(message) || Object.keys(message).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key)) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.params !== undefined && !plain(message.params)) || (Object.hasOwn(message, 'id') && !(typeof message.id === 'string' || Number.isSafeInteger(message.id)))) return rpcError(null, -32600, 'Expected one JSON-RPC 2.0 request or notification.', 400);
  const id = message.id;
  const params = message.params || {};
  const header = headerField(request.headers.get('MCP-Protocol-Version'));
  if (params._meta !== undefined && !plain(params._meta)) return rpcError(id ?? null, -32602, 'params._meta: expected an object.', header === MODERN_PROTOCOL_VERSION ? 400 : 200);
  const meta = params._meta || {};
  // Either modern version declaration selects per-request admission, including malformed metadata.
  const modern = header === MODERN_PROTOCOL_VERSION || Object.hasOwn(meta, META_VERSION);
  let appsClient;
  if (modern) {
    const requested = meta[META_VERSION];
    if (typeof requested !== 'string') return rpcError(id ?? null, -32602, `${META_VERSION} must be a string in every request's _meta.`, 400);
    if (!plain(meta[META_CLIENT])) return rpcError(id ?? null, -32602, `${META_CLIENT} must be an object in every request's _meta.`, 400);
    if (header !== requested) return rpcError(id ?? null, HEADER_MISMATCH, `Header mismatch: MCP-Protocol-Version header value '${header}' does not match body value '${requested}'.`, 400);
    if (requested !== MODERN_PROTOCOL_VERSION) return rpcError(id ?? null, UNSUPPORTED_VERSION, 'Unsupported protocol version', 400, { supported: PROTOCOL_VERSIONS, requested });
    const method = headerField(request.headers.get('Mcp-Method'));
    if (method !== message.method) return rpcError(id ?? null, HEADER_MISMATCH, method === null ? 'Header mismatch: Mcp-Method header is missing.' : `Header mismatch: Mcp-Method header value '${method}' does not match body value '${message.method}'.`, 400);
    const named = message.method === 'tools/call' ? params.name : message.method === 'resources/read' ? params.uri : message.method === 'prompts/get' ? params.name : undefined;
    if (named !== undefined) {
      const name = headerValue(request.headers.get('Mcp-Name'));
      if (name !== named) return rpcError(id ?? null, HEADER_MISMATCH, name === null ? 'Header mismatch: Mcp-Name header is missing or malformed.' : `Header mismatch: Mcp-Name header value '${name}' does not match body value '${named}'.`, 400);
    }
    if (!Object.hasOwn(message, 'id')) return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    const client = meta['io.modelcontextprotocol/clientInfo'];
    if (client !== undefined && (!plain(client) || typeof client.name !== 'string' || typeof client.version !== 'string'))
      return rpcError(id, -32602, 'io.modelcontextprotocol/clientInfo: expected name and version strings.');
    if (client) {
      try { agentActorId('mcp', {name: client.name}); }
      catch (_) { return rpcError(id, -32602, 'clientInfo.name must be a nonempty host name of at most 96 characters, without control characters.'); }
    }
    appsClient = declaresAppsUi({ capabilities: meta[META_CLIENT] });
  } else {
    if (message.method !== 'initialize' && header !== PROTOCOL_VERSION) return rpcError(id ?? null, -32600, `MCP-Protocol-Version must be ${PROTOCOL_VERSION}.`, 400);
    if (!Object.hasOwn(message, 'id')) return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    appsClient = request.headers.get('X-Rapier-Apps-Client') === '1';
  }
  // The server does not implement multi-round-trip/task parameters. Refuse unsupported fields
  // instead of appearing to honor them (especially write retries carrying requestState).
  const fields = {initialize: ['protocolVersion', 'capabilities', 'clientInfo'], 'server/discover': [],
    ping: [], 'tools/list': ['cursor'], 'tools/call': ['name', 'arguments'],
    'resources/list': ['cursor'], 'resources/templates/list': ['cursor'], 'resources/read': ['uri'], 'skills/list': ['cursor'], 'skills/get': ['uri']};
  const methodFields = Object.hasOwn(fields, message.method) ? fields[message.method] : null;
  if (methodFields) for (const key of Object.keys(params)) {
    if (key !== '_meta' && !methodFields.includes(key)) return rpcError(id, -32602, 'params: unsupported field ' + key, 200, {path: 'params.' + key});
  }
  let result, headers = {};
  const cacheable = (value, ttlMs, cacheScope) => modern ? { ...value, ttlMs, cacheScope } : value;
  try {
    switch (message.method) {
      case 'initialize':
        if (modern) return rpcError(id, -32601, 'Method not found.', 404);
        if (typeof params.protocolVersion !== 'string' || !plain(params.capabilities) || !plain(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') return rpcError(id, -32602, 'initialize requires protocolVersion, capabilities, and clientInfo.');
        result = { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [UI_MIME] }, 'io.modelcontextprotocol/skills': {} } }, serverInfo: serverInfo(env), instructions };
        // Stateless: the client carries the declaration back as a header.
        if (declaresAppsUi(params)) headers = { 'X-Rapier-Apps-Client': '1' };
        break;
      case 'server/discover':
        if (!modern) return rpcError(id, -32601, 'Method not found.');
        result = { supportedVersions: PROTOCOL_VERSIONS, capabilities: { tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [UI_MIME] }, 'io.modelcontextprotocol/skills': {} } }, instructions, ttlMs: 3600000, cacheScope: 'public' };
        break;
      case 'ping':
        if (modern) return rpcError(id, -32601, 'Method not found.', 404);
        result = {}; break;
      case 'tools/list':
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'Rapier returns its full fixed tool catalog in one page.');
        // A listing that varies by the client's Apps declaration is not shared-cache content.
        result = cacheable({ tools: listedTools(env, appsClient) }, env.HOST_TOOLS_LISTING === 'app-clients' ? 0 : 3600000, env.HOST_TOOLS_LISTING === 'app-clients' ? 'private' : 'public'); break;
      case 'tools/call':
        if (typeof params.name !== 'string' || (params.arguments !== undefined && !plain(params.arguments))) return rpcError(id, -32602, 'tools/call requires name and an arguments object.');
        result = await callTool(params.name, params.arguments || {}, env, request, modern ? meta['io.modelcontextprotocol/clientInfo']?.name : null); break;
      case 'skills/list':
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'Rapier returns its complete static skill catalog in one page.');
        result = cacheable({skills: (await skillsBundle(request, env)).skills}, 3600000, 'public'); break;
      case 'skills/get': {
        const skill = (await skillsBundle(request, env)).skills.find(entry => entry.uri === params.uri);
        if (!skill) return rpcError(id, -32602, 'Unknown skill URI.');
        result = cacheable({skill}, 3600000, 'public'); break;
      }
      case 'resources/list': {
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'Rapier returns its resources in one page.');
        // The skills' own files are resources too (resources/read serves them), so a host that knows no skills/list still
        // finds them. A damaged package is a failed listing, never a cacheable partial catalog.
        const bundle = await skillsBundle(request, env);
        const skills = bundle.skills.flatMap(skill => skill.resources.map(entry => ({
          uri: entry.uri, name: entry.uri === skill.uri ? skill.frontmatter.name : entry.uri.slice('skill://rapier/'.length), mimeType: bundle.contents[entry.uri].mimeType,
          ...(entry.uri === skill.uri ? { description: skill.frontmatter.description } : {}) })));
        result = cacheable({ resources: [{ uri: UI_RESOURCE, name: 'rapier-editor', title: 'Rapier document workspace', mimeType: UI_MIME, description: 'The full Rapier editor, connected to the canonical document through the MCP Apps bridge.' }, ...skills] }, 3600000, 'public'); break;
      }
      case 'resources/templates/list':
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'The empty resource template catalog has no continuation.');
        result = cacheable({resourceTemplates: []}, 3600000, 'public'); break;
      case 'resources/read': result = cacheable(await resource(request, env, params.uri), 0, 'private'); break;
      default: return rpcError(id, -32601, 'Method not found.', modern ? 404 : 200);
    }
  } catch (error) {
    if (error?.[PUBLIC_FAILURE] && error.code === 'UNKNOWN_TOOL') return rpcError(id, -32602, error.message);
    if (error?.[PUBLIC_FAILURE] && error.code === 'RESOURCE_NOT_FOUND') return rpcError(id, modern ? -32602 : -32002, error.message, 200,
      typeof params.uri === 'string' ? {uri: params.uri} : undefined);
    if (error?.[PUBLIC_FAILURE] && ['UI_NOT_BUILT', 'INVALID_UI_CONFIGURATION', 'UI_RESOURCE_TOO_LARGE', 'SKILLS_NOT_BUILT'].includes(error.code)) return rpcError(id, -32603, error.message, 200, error.details);
    if (message.method === 'tools/call') result = toolError(failure('WORKSPACE_UNAVAILABLE', 'The workspace operation was not acknowledged. Retry an editor commit only with the same commitId.'));
    else return rpcError(id, -32603, 'The server could not complete this request.');
  }
  // Some clients expose only content to the model. Mirror the final public result, after the
  // document capability is attached. Never serialize _meta (editor snapshots) or app-only results.
  if (message.method === 'tools/call' && !EDITOR_ONLY_TOOLS.has(params.name) && plain(result.structuredContent)) {
    result = { ...result, content: [{ type: 'text', text: JSON.stringify(result.structuredContent) }, ...(result.content || []).filter(item => item.type === 'image' || item.type === 'resource' || item.type === 'resource_link')] };
  }
  if (modern) result = { ...result, resultType: 'complete', _meta: { ...(plain(result._meta) ? result._meta : {}), [META_SERVER]: serverInfo(env) } };
  return json({ jsonrpc: '2.0', id, result }, 200, headers);
}

export default { fetch: handleMcp };

// One fixed window per key from its first take; successes kept to its end, capped (5000 per deployment). Denials store nothing.
// Rollover is checked before replay.
export class RapierBudget {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    let takeId = null;
    try {
      if (this.ctx.storage) this.ctx.storage.operation = 'budget.take';
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/take') return new Response('Not found', { status: 404 });
      let body;
      try { body = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }
      const limit = Number.isSafeInteger(body?.limit) && body.limit > 0 ? body.limit : 1, windowMs = Number.isSafeInteger(body?.windowMs) && body.windowMs > 0 ? body.windowMs : 3600000;
      takeId = typeof body.takeId === 'string' && /^take_[A-Za-z0-9_-]{1,96}$/.test(body.takeId) ? body.takeId : null;
      const now = Date.now();
      let start = this.ctx.storage.kv.get('windowStart'), count = this.ctx.storage.kv.get('count');
      const active = typeof start === 'number' && typeof count === 'number' && now - start < windowMs;
      if (!active) { start = now; count = 0; }
      const retained = active ? this.ctx.storage.kv.get('receipts') : null;
      const receipts = Array.isArray(retained) ? retained.filter(entry => entry.allowed && entry.resetAt === start + windowMs) : [];
      if (takeId) {
        const prior = receipts.find(entry => entry.id === takeId);
        if (prior) return json({ allowed: prior.allowed, remaining: prior.remaining, resetAt: prior.resetAt, replayed: true, takeId });
      }
      const allowed = count < limit;
      if (allowed) count++;
      const remaining = Math.max(0, limit - count), resetAt = start + windowMs;
      // Denied traffic neither spends nor rewrites the bounded successful-retry ledger.
      if (!allowed) return json({ allowed, remaining, resetAt, ...(takeId ? { takeId } : {}) });
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.kv.put('windowStart', start);
        this.ctx.storage.kv.put('count', count);
        this.ctx.storage.kv.put('resetAt', resetAt);
        this.ctx.storage.kv.put('receipts', allowed && takeId ? [...receipts, { id: takeId, allowed, remaining, resetAt }] : receipts);
      });
      await this.ctx.storage.sync();
      await this.ctx.storage.setAlarm(start + windowMs);
      return json({ allowed, remaining, resetAt, ...(takeId ? { takeId } : {}) });
    } catch (error) {
      // Committed take, response lost: do not look like CREATE_BUDGET_EXCEEDED. The caller retries
      // with the same takeId and is answered from the stored receipt (or, if the throw was before
      // commit, takes once).
      if (takeId) {
        const retained = this.ctx.storage.kv.get('receipts');
        const receipts = Array.isArray(retained) ? retained : [];
        const prior = receipts.find(entry => entry.id === takeId && entry.allowed && entry.resetAt > Date.now());
        if (prior) return json({ allowed: prior.allowed, remaining: prior.remaining, resetAt: prior.resetAt, replayed: true, takeId, code: 'WORKSPACE_UNAVAILABLE' });
      }
      return json({ allowed: false, code: 'WORKSPACE_UNAVAILABLE', message: 'The budget operation was not acknowledged.' });
    }
  }
  async alarm() {
    try { if (this.ctx.storage) this.ctx.storage.operation = 'budget.alarm'; } catch {}
    const resetAt = this.ctx.storage.kv.get('resetAt');
    // A delayed/duplicate callback may belong to the window a request already rolled over.
    // It cannot retire the new window's spends; the stored window, not the callback, owns expiry.
    if (typeof resetAt === 'number' && resetAt > Date.now()) {
      await this.ctx.storage.setAlarm(resetAt);
      return;
    }
    await this.ctx.storage.deleteAll();
  }
}

export class RapierDocument {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.pending = Promise.resolve();
    this.cachedState = null;
    this.cachedJournal = null;
    this.returnWaiter = null;
    this.visualWaiter = null;
    this.retention = bounded(env.RETENTION_DAYS, 30, 1, 365) * DAY;
    this.maxStateBytes = bounded(env.MAX_STATE_MIB, 48, 8, 64) * 1024 * 1024;
  }

  exclusive(operation) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {});
    return task;
  }

  readState(head) {
    if (this.cachedState) return this.cachedState;
    const chunks = [];
    for (let index = 0; index < head.parts; index++) {
      const chunk = this.ctx.storage.kv.get('state:' + index);
      if (typeof chunk !== 'string') throw failure('CORRUPT_WORKSPACE', 'The stored workspace is incomplete.');
      chunks.push(chunk);
    }
    const human = this.ctx.storage.kv.get('human');
    if (typeof human !== 'string') throw failure('CORRUPT_WORKSPACE', 'The stored human context is missing.');
    this.cachedState = { ...JSON.parse(chunks.join('')), ...JSON.parse(human) };
    return this.cachedState;
  }

  // The invocation journal is a kernel closure Map: persisted as its own KV key and reseeded on every operate(). Missing reads as empty.
  readJournal() {
    if (this.cachedJournal) return this.cachedJournal;
    const raw = this.ctx.storage.kv.get('journal');
    this.cachedJournal = typeof raw === 'string' ? JSON.parse(raw) : [];
    return this.cachedJournal;
  }

  async persist(head, state, journal, contextOnly = false, exported = null) {
    let text, human, journalText;
    const expired = (head.exports || []).filter(row => row.expiresAt <= Date.now() || row.owner !== head.capabilityHash);
    if (expired.length) head.exports = head.exports.filter(row => !expired.includes(row));
    head.exportBytes = (head.exports || []).reduce((sum, row) => sum + row.bytes, 0);
    if (state) {
      if (state.commitResults) state.commitResults = state.commitResults.filter(row => head.receipts.some(receipt => receipt.id === row.id));
      const { humanContexts, contextSequences, clock, ...canonical } = state;
      human = JSON.stringify({ humanContexts, contextSequences, clock });
      head.contextBytes = contentBytes(human);
      if (!contextOnly) {
        text = JSON.stringify(canonical);
        head.stateBytes = contentBytes(text);
      }
      // Not gated by contextOnly: bounded (LIMITS.invocationKeys) and on the human-context cadence.
      if (Array.isArray(journal)) {
        journalText = JSON.stringify(journal);
        head.journalBytes = contentBytes(journalText);
      }
      if (!Number.isSafeInteger(head.stateBytes) || head.stateBytes + head.contextBytes + (head.journalBytes || 0) + head.exportBytes + contentBytes(JSON.stringify(head.exports || [])) > this.maxStateBytes) throw failure('WORKSPACE_STATE_LIMIT', 'This would exceed the workspace size. Open the alternative as a separate workspace or let temporary exports expire.', { limitBytes: this.maxStateBytes });
    }
    const expiresAt = Date.now() + this.retention;
    const renew = !(head.expiresAt > expiresAt - 60000);
    if (!state && !renew && !expired.length && !exported) return;
    // Alarm after the transaction (from the committed head); a crash before setAlarm recovers from head.expiresAt.
    if (renew) head.expiresAt = expiresAt;
    const previousParts = head.parts || 0;
    if (text !== undefined) head.parts = Math.ceil(text.length / CHUNK_CHARS);
    // SQLite limits a key and value together to 2 MB; leave room for the key and serialization.
    if (contentBytes(JSON.stringify(head)) > 2_000_000 - 1024) throw failure('WORKSPACE_STATE_LIMIT', 'The workspace metadata is full. Let temporary exports expire before creating another.', {limitBytes: this.maxStateBytes});
    this.ctx.storage.transactionSync(() => {
      for (const row of expired) for (let index = 0; index < row.parts; index++) this.ctx.storage.kv.delete('export:' + row.id + ':' + index);
      if (exported) for (let index = 0; index < exported.grant.parts; index++) {
        this.ctx.storage.kv.put('export:' + exported.grant.id + ':' + index, exported.bytes.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS));
      }
      if (text !== undefined) {
        for (let index = 0; index < head.parts; index++) {
          const key = 'state:' + index, chunk = text.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS);
          if (this.ctx.storage.kv.get(key) !== chunk) this.ctx.storage.kv.put(key, chunk);
        }
        for (let index = head.parts; index < previousParts; index++) this.ctx.storage.kv.delete('state:' + index);
      }
      if (human !== undefined && this.ctx.storage.kv.get('human') !== human) this.ctx.storage.kv.put('human', human);
      if (journalText !== undefined && this.ctx.storage.kv.get('journal') !== journalText) this.ctx.storage.kv.put('journal', journalText);
      this.ctx.storage.kv.put('head', head);
    });
    await this.ctx.storage.sync();
    if (renew) await this.ctx.storage.setAlarm(head.expiresAt);
    if (state) this.cachedState = state;
    if (journalText !== undefined) this.cachedJournal = journal;
  }

  describe(state, head, version, collaboration) {
    const expiries = [collaboration.nextExpiryAt, head.viewIntent?.status === 'pending' ? head.viewIntent.expiresAt : null].filter(value => Number.isFinite(value) && value > 0);
    return { ...head, documentId: state.documentId, revision: state.revision, filename: state.filename, docKind: state.docKind, chars: state.text.length, version, collaboration: collaborationSummary(collaboration), collaborationContext: collaborationContext(collaboration), nextExpiryAt: expiries.length ? Math.min(...expiries) : null };
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/return' && request.method === 'POST') return this.exclusive(() => this.acceptReturn(request));
    if (path === '/export' && ['GET', 'HEAD'].includes(request.method)) return this.exclusive(() => this.readExport(request));
    try {
      if (request.method !== 'POST' || path !== '/operation') return new Response(null, { status: 404 });
      const input = await request.json();
      if (!plain(input) || !/^[a-f0-9]{64}$/.test(input.capabilityHash || '') || typeof input.operation !== 'string' || !plain(input.args) || (input.rotateToHash !== undefined && !/^[a-f0-9]{64}$/.test(input.rotateToHash)) || (input.operationId !== undefined && (typeof input.operationId !== 'string' || !input.operationId.length || input.operationId.length > 256 || [...input.operationId].length > 128)) || (input.returnAddress !== undefined && !/^[a-f0-9]{64}$/.test(input.returnAddress)) || (input.exportAddress !== undefined && !/^[a-f0-9]{64}$/.test(input.exportAddress))) return new Response(null, { status: 400 });
      if (input.create === true && (!plain(input.createBudget) || !/^take_[a-f0-9]{32}$/.test(input.createBudget.takeId || '') || typeof input.createBudget.retryable !== 'boolean')) return new Response(null, { status: 400 });
      // Mint once per incoming call, before any observation continuation can re-enter operate().
      input.operationId ??= crypto.randomUUID();
      if (input.operation === 'document.wait_for_user') return await this.waitForReturn(input, request.signal);
      if (input.operation === 'document.inspect_visual') return await this.inspectVisual(input, request.signal);
      return await this.exclusive(async () => json(await this.operate(input)));
    } catch (error) {
      this.cachedState = null;
      this.cachedJournal = null;
      // These two kernel input verdicts are fixed public values, never arbitrary exception text.
      const inputVerdict = error instanceof TypeError && ['filename_invalid', 'document_kind_invalid'].includes(error.message);
      return json(toolError(inputVerdict ? failure('INVALID_DOCUMENT_INPUT', error.message) : error));
    }
  }

  async readExport(request) {
    const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Referrer-Policy': 'no-referrer'};
    try {
      const head = this.ctx.storage.kv.get('head');
      if (!head || head.expiresAt <= Date.now()) return new Response(null, {status: 410, headers});
      const row = head.exports?.find(row => row.hash === request.headers.get('X-Rapier-Export-Hash'));
      if (!row) return new Response(null, {status: 404, headers});
      if (row.expiresAt <= Date.now() || row.owner !== head.capabilityHash) return new Response(null, {status: 410, headers});
      const bytes = new Uint8Array(row.bytes);
      for (let index = 0; index < row.parts; index++) {
        const part = this.ctx.storage.kv.get('export:' + row.id + ':' + index);
        if (!(part instanceof Uint8Array) || part.length !== Math.min(CHUNK_CHARS, row.bytes - index * CHUNK_CHARS)) throw new Error('export incomplete');
        bytes.set(part, index * CHUNK_CHARS);
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== row.sha256) throw new Error('export changed');
      const name = encodeURIComponent(row.name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
      return new Response(request.method === 'HEAD' ? null : bytes, {headers: {...headers, 'Content-Type': row.mimeType + '; charset=utf-8',
        'Content-Length': String(row.bytes), 'Content-Disposition': "attachment; filename*=UTF-8''" + name}});
    } catch { return new Response(null, {status: 503, headers}); }
  }

  async acceptReturn(request) {
    try {
      try { this.ctx.storage.operation = 'return'; } catch {}
      const head = structuredClone(this.ctx.storage.kv.get('head'));
      if (!head || head.expiresAt <= Date.now()) return returnRefused('This return session has expired or was deleted.', 410);
      const grant = head.returns?.find(row => row.hash === request.headers.get('X-Rapier-Return-Hash'));
      if (!grant) return returnRefused('This return address is unknown.', 404);
      if (grant.receivedAt) return returnRefused('This document was already sent back. The first copy is retained.', 409);
      if (grant.expiresAt <= Date.now() || grant.owner !== head.capabilityHash) return returnRefused('This return address has expired.', 410);
      let name;
      try { name = decodeURIComponent(request.headers.get('X-Rapier-Name') || 'document.md'); } catch { return returnRefused('The document name is not valid URI-encoded text.', 400); }
      if (!name || [...name].length > MAX_FILENAME_CHARS || /[\\/\x00-\x1f\x7f]/.test(name)) return returnRefused(`The document name must be a filename of at most ${MAX_FILENAME_CHARS} characters.`, 400);
      const text = await readTextBody(request, MAX_TEXT_BYTES, 'returned document', 'RETURN_TOO_LARGE', true);
      if (grant.expiresAt <= Date.now() || head.expiresAt <= Date.now()) return returnRefused('This return address has expired.', 410);
      const bytes = contentBytes(text);
      if ((head.returnBytes || 0) + bytes > MAX_TEXT_BYTES) return returnRefused('This session’s return storage is full. The earlier documents are retained; send this file to the agent separately.', 507);
      head.returnSequence = (head.returnSequence || 0) + 1;
      Object.assign(grant, { sequence: head.returnSequence, name, receivedAt: new Date().toISOString(), bytes, chars: text.length, parts: Math.ceil(text.length / CHUNK_CHARS) });
      head.returnBytes = (head.returnBytes || 0) + bytes;
      // The source and the spent capability commit together. Neither can outlive the other.
      this.ctx.storage.transactionSync(() => {
        for (let index = 0; index < grant.parts; index++) this.ctx.storage.kv.put('return:' + grant.id + ':' + index, text.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS));
        this.ctx.storage.kv.put('head', head);
      });
      await this.ctx.storage.sync();
      if (this.returnWaiter?.mode === 'message') this.returnWaiter.finish({ outcome: 'ok', returned: returnMetadata(grant) });
      return returnReply({ accepted: true, ...returnMetadata(grant) });
    } catch (error) {
      if (error.code === 'RETURN_TOO_LARGE') return returnRefused(error.message, 413);
      if (error instanceof TypeError) return returnRefused('The document is not valid UTF-8 text.', 400);
      return returnRefused('The return receipt could not be confirmed. Ask the agent whether it arrived.', 503);
    }
  }

  readReturn(head, input) {
    const row = head.returns?.find(row => row.id === input.return_id && row.receivedAt);
    if (!row) return { outcome: 'refused', reason: 'return_unavailable' };
    if (['ref', 'context_handle', 'cursor', 'end'].some(key => input[key] !== undefined)) return { outcome: 'refused', reason: 'return_read_uses_start_and_limit' };
    const start = input.start ?? 0;
    if (start > row.chars) return { outcome: 'refused', reason: 'range_invalid' };
    const limit = bounded(input.limit, LIMITS.readChars, 256, LIMITS.readChars), first = Math.floor(start / CHUNK_CHARS);
    let source = '';
    for (let index = first; index < Math.min(row.parts, Math.ceil((start + limit + 1) / CHUNK_CHARS)); index++) {
      const part = this.ctx.storage.kv.get('return:' + row.id + ':' + index);
      if (typeof part !== 'string') throw failure('CORRUPT_WORKSPACE', 'The stored return is incomplete.');
      source += part;
    }
    const offset = start - first * CHUNK_CHARS;
    if (/[\udc00-\udfff]/.test(source.charAt(offset))) return { outcome: 'refused', reason: 'range_splits_character' };
    let text = source.slice(offset, offset + limit);
    while (text.length && (/[\ud800-\udbff]/.test(text.at(-1)) || contentBytes(JSON.stringify(text)) > LIMITS.resultBytes - 2000)) text = text.slice(0, -1);
    const end = start + text.length;
    return { outcome: 'ok', ...returnMetadata(row), text, start, end, complete: end === row.chars, remaining: row.chars - end };
  }

  async waitForReturn(input, signal) {
    const abandoned = () => new Response(null, {status: 499});
    if (signal?.aborted) return abandoned();
    const prepared = await this.exclusive(async () => {
      if (signal?.aborted) return {aborted: true};
      const head = this.ctx.storage.kv.get('head'), mode = input.args.mode || 'message';
      const refused = reason => ({ value: { outcome: 'refused', reason } });
      if (!head || head.capabilityHash !== input.capabilityHash || head.expiresAt <= Date.now()) return refused('return_unavailable');
      const key = resolveCaller({ actor: 'agent', principal: 'remote:' + input.capabilityHash, requestId: input.operationId }, { transport: 'mcp' }).invocationKey;
      if (this.readJournal().some(row => row.key === key)) return { value: null };
      if (this.returnWaiter) return refused('wait_already_pending');
      if (mode === 'selection' && input.args.after_return_id !== undefined) return refused('return_cursor_needs_message_mode');
      const received = receivedReturns(head), after = input.args.after_return_id;
      if (after && !received.some(row => row.id === after)) return refused('return_unavailable');
      const latest = received.at(-1);
      if (mode === 'message' && latest && latest.id !== after) return { value: { outcome: 'ok', returned: returnMetadata(latest) } };
      const waiter = createRequestWait({signal, timeoutMs: bounded(input.args.timeout_ms, 30000, 1000, 120000),
        onFinish: settled => { if (this.returnWaiter === settled) this.returnWaiter = null; }});
      waiter.mode = mode;
      this.returnWaiter = waiter;
      return {promise: waiter.promise};
    });
    // Await outside exclusive(): a return or editor selection must be able to enter this object.
    const result = prepared.promise ? await prepared.promise : {kind: 'value', value: prepared.value};
    if (prepared.aborted || signal?.aborted || result.kind === 'aborted') return abandoned();
    const value = result.kind === 'timeout' ? {outcome: 'timeout', reason: 'wait_timed_out'} : result.value;
    // Check again after re-entering the serial owner. An abandoned observation has
    // no receipt and never advances the document or the durable invocation journal.
    return this.exclusive(async () => signal?.aborted ? abandoned() : json(await this.operate(input, value)));
  }

  // Capture waits outside the document's commit queue so the editor can acknowledge it.
  // Only the small request is durable; observation pixels exist for this response alone.
  async inspectVisual(input, signal) {
    if (signal?.aborted) return new Response(null, {status: 499});
    const started = await this.exclusive(async () => {
      if (signal?.aborted) return {abandoned: true};
      const result = await this.operate(input);
      const pending = result.structuredContent?.pending;
      if (result.structuredContent?.outcome === 'ok' && result.structuredContent?.representation === 'visual') return {result: envelope({outcome: 'refused', reason: 'visual_capture_expired', representation: 'visual'})};
      if (result.structuredContent?.outcome !== 'pending' || pending?.kind !== 'surface-fact' || pending.requirements?.kind !== 'visual') return {result};
      // A retry observes its original capture, including the interval after the
      // pixels arrive and before its terminal journal write. It cannot replace it.
      if (this.visualWaiter?.id === pending.requestId && this.visualWaiter.capabilityHash === input.capabilityHash) return {result};
      const request = pending.requirements;
      const refuse = reason => ({...request, outcome: 'refused', reason});
      const resume = fact => this.operate(input, undefined, {requestId: pending.requestId, fact});
      if (result.structuredContent.replayed) return {result: await resume(refuse('visual_capture_expired'))};
      if (signal?.aborted) return {result: await resume(refuse('cancelled'))};
      if (this.visualWaiter) return {result: await resume(refuse('visual_capture_busy'))};
      if (!result.structuredContent.collaboration?.presence?.active) return {result: await resume(refuse('editor_not_present'))};
      const wait = createRequestWait({signal, timeoutMs: VIEW_LEASE_MS});
      const capture = {wait, id: pending.requestId, request, capabilityHash: input.capabilityHash};
      this.visualWaiter = capture;
      try {
        const head = structuredClone(this.ctx.storage.kv.get('head'));
        head.visualIntent = {id: capture.id, ...request, status: 'pending', expiresAt: Date.now() + VIEW_LEASE_MS};
        head.version++;
        this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
        await this.ctx.storage.sync();
      } catch (error) {
        wait.finish(refuse('visual_render_unavailable'));
        // A lost acknowledgment can leave the intent committed. If storage is
        // still unavailable, the next authorized operation retires the orphan.
        try { await this.retireVisualIntent(capture.id); } catch {}
        if (this.visualWaiter === capture) this.visualWaiter = null;
        throw error;
      }
      return {capture};
    });
    if (started.abandoned) return new Response(null, {status: 499});
    if (started.result) return json(started.result);
    const {capture} = started;
    const settled = await capture.wait.promise;
    const fact = settled.kind === 'value' ? settled.value : {...capture.request, outcome: 'refused', reason: settled.kind === 'aborted' ? 'cancelled' : 'visual_capture_expired'};
    return this.exclusive(async () => {
      try {
        await this.retireVisualIntent(capture.id);
        return json(await this.operate(input, undefined, {requestId: capture.id, fact}));
      } finally {
        if (this.visualWaiter === capture) this.visualWaiter = null;
      }
    });
  }

  // Called only under the document's serial owner. A stale completion cannot
  // retire a successor's intent, and the version invalidates editor sync caches.
  async retireVisualIntent(id, head = this.ctx.storage.kv.get('head')) {
    if (!head?.visualIntent || head.visualIntent.id !== id) return head;
    const next = {...head, visualIntent: null, version: head.version + 1};
    this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', next));
    await this.ctx.storage.sync();
    return next;
  }

  async operate(input, waitResult, visual) {
    const { operation, args, capabilityHash } = input;
    try { if (this.ctx.storage) this.ctx.storage.operation = operation; } catch {}
    let head = structuredClone(this.ctx.storage.kv.get('head'));
    if (head && head.expiresAt <= Date.now()) {
      this.cachedState = null;
      this.cachedJournal = null;
      await this.ctx.storage.deleteAll();
      head = undefined;
    }
    if (input.create === true) {
      if (operation !== 'rapier.open') return toolError(failure('WORKSPACE_EXISTS', 'A workspace cannot be created at this capability.'));
      if (head) {
        // Same capability as a committed create: reopen; no second workspace, no budget. A different capability at this address is WORKSPACE_EXISTS.
        if (head.capabilityHash !== capabilityHash) return toolError(failure('WORKSPACE_EXISTS', 'A workspace cannot be created at this capability.'));
        const state = this.readState(head);
        const kernel = createKernel({ state, clock: Date.now, mintId, invocationJournal: this.readJournal() });
        const collaboration = kernel.collaboration();
        head = this.describe(state, head, head.version, collaboration);
        await this.persist(head);
        return envelope({ outcome: 'created', created: true, replayed: true, message: 'Reopened the existing workspace; no new document was created.' }, head, { snapshot: snapshot(state, collaboration) });
      }
      // Admission shares the document's serialized operation owner. Concurrent token retries
      // therefore authorize the committed head before considering any new address/window spend.
      const budget = await takeCreateBudget(this.env, input.createBudget);
      if (budget === 'no-binding') return toolError(failure('WORKSPACE_CREATION_UNAVAILABLE', 'This deployment creates no workspaces (no BUDGET binding); existing document capabilities still open.'));
      if (budget === 'uncertain') return toolError(failure('WORKSPACE_UNAVAILABLE', input.createBudget.retryable ? 'The creation budget did not answer. Retry with the same createToken.' : 'The creation budget did not answer, so no workspace was made. Retry; a createToken makes the next create retryable.'));
      if (budget !== 'ok') return toolError(failure('CREATE_BUDGET_EXCEEDED', 'The creation budget is full for this hour. Reopen an existing document capability, or create later.'));
      // This is authored input, not an already-owned snapshot. Keep strict scalar admission.
      const invalid = admissibleText(args.text ?? '');
      if (invalid) throw failure('INVALID_DOCUMENT_INPUT', invalid);
      const kernel = createKernel({ state: createState({ id: crypto.randomUUID(), filename: args.filename ?? 'Untitled.md', text: args.text ?? '', docKind: args.docKind }), clock: Date.now, mintId });
      const collaboration = kernel.collaboration(), state = kernel.snapshot();
      head = this.describe(state, { capabilityHash, createdAt: Date.now(), receipts: [], parts: 0, viewIntent: null }, 1, collaboration);
      await this.persist(head, state, kernel.invocationJournal());
      return envelope({ outcome: 'created', created: true }, head, { snapshot: snapshot(state, collaboration) });
    }
    if (!head || head.capabilityHash !== capabilityHash) {
      if (operation === 'document.delete' && !head) return envelope({ outcome: 'deleted', deleted: true });
      // Replay of the last rotation: same receipt, nothing moves. Any other call by a retired bearer is refused.
      if (head && operation === ROTATE && head.rotation && head.rotation.predecessorHash === capabilityHash && input.rotateToHash === head.capabilityHash) {
        return envelope({ outcome: 'rotated', rotated: true, replayed: true, rotations: head.rotations, rotatedAt: new Date(head.rotatedAt).toISOString() }, head);
      }
      return toolError(failure('DOCUMENT_UNAVAILABLE', 'This document capability is unknown, deleted or expired. Open a new workspace from an exported copy.'));
    }
    const intent = head.visualIntent, capture = this.visualWaiter;
    if (intent && (!capture || capture.id !== intent.id || capture.capabilityHash !== capabilityHash ||
        intent.expiresAt <= Date.now() || intent.revision !== head.revision)) {
      if (capture?.id === intent.id) capture.wait.finish({...capture.request, outcome: 'refused',
        reason: intent.expiresAt <= Date.now() ? 'visual_capture_expired' : 'document_changed'});
      head = await this.retireVisualIntent(intent.id, head);
    }
    if (operation === 'document.delete') {
      this.cachedState = null;
      this.cachedJournal = null;
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.sync();
      this.returnWaiter?.finish({ outcome: 'refused', reason: 'document_deleted' });
      this.visualWaiter?.wait.finish({...this.visualWaiter.request, outcome: 'refused', reason: 'document_changed'});
      return envelope({ outcome: 'deleted', deleted: true, documentId: head.documentId });
    }
    if (operation === ROTATE) {
      // The bearer digest changes; nothing else does. Content, journal, controls, pending review
      // and leases are the same workspace -- only who can reach it is decided again.
      if (!input.rotateToHash) return toolError(failure('INVALID_DOCUMENT_INPUT', 'Rotation needs a successor.'));
      // The receipt a lost response can be asked for again: the predecessor's digest, one generation.
      head.rotation = { predecessorHash: head.capabilityHash, generation: (head.rotations || 0) + 1 };
      head.capabilityHash = input.rotateToHash;
      head.rotatedAt = Date.now();
      head.rotations = (head.rotations || 0) + 1;
      this.ctx.storage.transactionSync(() => { this.ctx.storage.kv.put('head', head); });
      await this.ctx.storage.sync();
      this.returnWaiter?.finish({ outcome: 'refused', reason: 'document_disconnected' });
      this.visualWaiter?.wait.finish({...this.visualWaiter.request, outcome: 'refused', reason: 'document_changed'});
      return envelope({ outcome: 'rotated', rotated: true, rotations: head.rotations, rotatedAt: new Date(head.rotatedAt).toISOString() }, head);
    }
    const elapsed = head.nextExpiryAt !== null && head.nextExpiryAt <= Date.now();
    if (operation === 'document.sync' && !elapsed && args.afterVersion === head.version && (args.afterRevision === undefined || args.afterRevision === head.revision)) {
      return envelope({ outcome: 'current', unchanged: true }, head);
    }
    let state = this.readState(head), collaboration;
    let viewKey = JSON.stringify(head.viewIntent);
    const principal = 'remote:' + capabilityHash;
    // resolveCaller is shared by every door (agent/door-identity.mjs). The invocation key derives from the principal and the operation's own name,
    // never the JSON-RPC id (it restarts at 1 and would hand one operation another's answer).
    const human = handle => ({ ...resolveCaller({ actor: 'human', principal, session: 'editor', requestId: handle }, { transport: 'mcp' }), serverNow: Date.now() });
    const queueView = (kind, request) => {
      const presence = kernel.collaboration().presence;
      if (!presence?.active) return { ok: false, reason: 'editor_not_present' };
      if (presence.editing) return { ok: false, reason: 'human_edit_in_progress' };
      if (head.viewIntent?.status === 'pending' && head.viewIntent.expiresAt > Date.now()) return { ok: false, reason: 'presentation_already_pending' };
      head.viewIntent = { id: crypto.randomUUID(), kind, revision: request.revision, status: 'pending', expiresAt: Date.now() + VIEW_LEASE_MS,
        ...(kind === 'document' ? { start: request.start, end: request.end } : { compareId: request.compareId, changeId: request.changeId }) };
      return { pending: true, viewId: head.viewIntent.id };
    };
    // Seed from the persisted journal, or a DO retry finds an empty one and acts twice.
    let exported = null;
    const kernel = createKernel({ state, host: { proposalPage: UI_RESOURCE, exportFile: async request => {
      if (!editorSecret(this.env) || !input.exportAddress) return {reason: 'export_unavailable'};
      const file = await exportFile(this.env, request);
      exported = file.bytes && file.bytes.byteLength <= MAX_EXPORT_BYTES ? {...file, id: mintId('export_')} : file;
      return exported;
    }, markdown: analyzeMarkdown, referenceCheck: checkMarkdownReferences, paint: paintAgentStrokes, paintSheet: agentPaintSheetHolds,
      // Names are disclosed by wait/read; repeating 16 maximum names can overflow context's result bound.
      returns: () => receivedReturns(head).map(row => { const { name, ...listed } = returnMetadata(row); return listed; }),
      readReturn: input => this.readReturn(head, input),
      createReturn: async () => {
        if (!input.returnAddress) return { outcome: 'refused', reason: 'return_unavailable' };
        const retained = (head.returns || []).filter(row => row.receivedAt || row.expiresAt > Date.now() && row.owner === head.capabilityHash);
        if (retained.length >= MAX_RETURNS) return { outcome: 'refused', reason: 'return_envelopes_full' };
        const token = 'rpret_' + input.returnAddress + '.' + base64url(crypto.getRandomValues(new Uint8Array(32)));
        const grant = { id: mintId('return_'), hash: await digest(token), owner: head.capabilityHash, expiresAt: Math.min(Date.now() + DAY, head.expiresAt) };
        head.returns = [...retained, grant];
        return { outcome: 'ok', return_url: configuredOrigin(this.env.RETURN_ORIGIN || RETURN_ORIGIN, 'RETURN_ORIGIN', true) + '/return/' + token, return_id: grant.id, return_expires_at: new Date(grant.expiresAt).toISOString(), max_bytes: MAX_TEXT_BYTES };
      },
      wait: async () => waitResult || { outcome: 'refused', reason: 'wait_unavailable' },
      save: async () => ({ ok: true }), reveal: request => queueView('document', request), revealChange: request => queueView('compare', request) }, clock: Date.now, mintId,
      // A fresh kernel consumes the returned observation as a checked world fact. Its ephemeral
      // continuation map belongs to one instance; retire only this read's pending receipt.
      invocationJournal: visual ? this.readJournal().filter(row => row.output?.pending?.requestId !== visual.requestId) : this.readJournal() });
    // decide does not await host.structure for surface facts (structure freshness).
    const resolveStructureFact = requirements => {
      if (!requirements || !['outline', 'find'].includes(requirements.mode) || state.filename !== requirements.filename) return null;
      const value = analyzeDocument({ text: state.text, filename: state.filename, mode: requirements.mode,
        ...(requirements.mode === 'find' ? { query: requirements.query, kind: requirements.kind, within: requirements.within, offset: requirements.offset } : {}) });
      return { mode: requirements.mode, revision: state.revision, filename: state.filename,
        ...(requirements.mode === 'find' ? { query: requirements.query, kind: requirements.kind, within: requirements.within, offset: requirements.offset } : {}), value };
    };
    const refresh = (capture = true) => {
      collaboration = kernel.collaboration();
      const next = capture ? kernel.snapshot() : state;
      if (state.filename !== next.filename || state.docKind !== next.docKind) head.metadataRevision = next.revision;
      if (head.viewIntent?.status === 'pending') {
        const view = head.viewIntent;
        if (view.revision !== next.revision || (view.kind === 'compare' && view.compareId !== next.compare?.id)) head.viewIntent = { ...view, status: 'invalidated', reason: 'document_changed' };
        else if (view.expiresAt <= Date.now()) head.viewIntent = { ...view, status: 'expired', reason: 'presentation_expired' };
      }
      const nextViewKey = JSON.stringify(head.viewIntent);
      const changed = viewChanged(state, next) || nextViewKey !== viewKey;
      head = this.describe(next, head, head.version + (changed ? 1 : 0), collaboration);
      state = next;
      viewKey = nextViewKey;
    };
    const initialVersion = head.version, initialExpiry = head.nextExpiryAt;
    // Without collaboration or a view to expire, the initial refresh only advances the
    // kernel's clock. Its final snapshot owns that clock; do not clone the whole source twice.
    refresh(elapsed || !!state.review || Object.keys(state.humanContexts).length > 0 || !!head.viewIntent);
    if (elapsed || head.version !== initialVersion || (initialExpiry !== null && initialExpiry <= Date.now())) await this.persist(head, state, kernel.invocationJournal());
    const current = () => snapshot(state, collaboration, head.viewIntent, head.visualIntent);
    if (operation === 'document.visual_ack') {
      const capture = this.visualWaiter;
      if (!capture || capture.id !== args.visualId || capture.capabilityHash !== capabilityHash) return toolError(failure('VISUAL_UNAVAILABLE', 'This visual observation is no longer pending.'), head);
      if (args.expectedRevision !== state.revision || capture.request.revision !== state.revision) {
        capture.wait.finish({...capture.request, outcome: 'refused', reason: 'document_changed'});
        return toolError(failure('REVISION_CONFLICT', 'The document changed before the observation arrived.'), head);
      }
      const verdict = visualResult(capture.request, args.fact);
      if (args.fact.outcome === 'ok' && verdict.outcome !== 'ok') return envelope(verdict, head);
      if (!capture.wait.finish(args.fact)) return toolError(failure('VISUAL_UNAVAILABLE', 'This visual observation is no longer pending.'), head);
      return envelope({outcome: 'ok', visualId: args.visualId}, head);
    }
    if (operation === 'rapier.open' || operation === 'document.sync') {
      // A read-only sync does not slide expiry.
      if (operation === 'rapier.open') await this.persist(head);
      return envelope({ outcome: 'current', unchanged: false }, head, { snapshot: current() });
    }
    if (operation === 'document.human_context') {
      const priorVersion = head.version;
      const value = kernel.humanContext(args, human(args.contextId));
      refresh();
      await this.persist(head, state, kernel.invocationJournal(), head.version === priorVersion);
      if (value.outcome === 'ok' && args.visible && args.selection && this.returnWaiter?.mode === 'selection') this.returnWaiter.finish({ outcome: 'ok', selection: args.selection });
      return envelope({ ...value, contextId: args.contextId, contextExpiresAt: value.expiresAt ?? null, ...(value.outcome === 'conflict' ? { code: 'HUMAN_CONTEXT_STALE' } : {}) }, head);
    }
    if (operation === 'document.view_ack') {
      const view = head.viewIntent;
      if (!view || view.id !== args.viewId) return toolError(failure('VIEW_UNAVAILABLE', 'This presentation request is no longer current.'), head);
      if (!['presented', 'refused'].includes(args.status)) return toolError(failure('INVALID_VIEW_ACK', 'A presentation acknowledgment must be presented or refused.'), head);
      if (view.status !== 'pending') {
        if (view.status === args.status && (view.reason || '') === (args.reason || '')) return envelope({ outcome: 'ok', replayed: true, viewId: view.id }, head);
        return toolError(failure('VIEW_UNAVAILABLE', 'This presentation request has already settled or expired.'), head);
      }
      if (args.expectedRevision !== state.revision || view.revision !== state.revision || (view.kind === 'compare' && (view.compareId !== state.compare?.id || !state.compare.changes.some(row => row.id === view.changeId)))) return toolError(failure('REVISION_CONFLICT', 'The target changed before presentation was acknowledged.'), head, { snapshot: current() });
      head.viewIntent = { ...view, status: args.status, ...(args.reason ? { reason: args.reason } : {}) };
      refresh();
      await this.persist(head, state, kernel.invocationJournal());
      return envelope({ outcome: 'ok', viewId: view.id, presented: args.status === 'presented' }, head);
    }
    if (['document.compare_decide', 'document.set_policy', 'document.review_decide'].includes(operation)) {
      if (!args.decisionId) return toolError(failure('INVALID_DECISION_ID', 'decisionId must identify this exact human decision.'));
      if (operation === 'document.compare_decide' && args.action === 'close' && args.changeIds !== undefined) return toolError(failure('INVALID_DECISION', 'Closing a comparison does not accept changeIds.'));
      const hash = await digest(JSON.stringify({ operation, arguments: Object.fromEntries(Object.keys(args).filter(key => key !== 'decisionId').sort().map(key => [key, args[key]])) }));
      const receipt = head.receipts.find(entry => entry.id === args.decisionId);
      if (receipt) {
        if (receipt.hash !== hash) return toolError(failure('DECISION_ID_REUSED', 'This decisionId already identifies a different operation.'), head, { snapshot: current() });
        await this.persist(head);
        return envelope({ ...receipt.result, replayed: true, decisionId: receipt.id, acceptedRevision: receipt.revision, acceptedVersion: receipt.version }, head, { snapshot: current() });
      }
      if (args.expectedRevision !== state.revision || args.expectedVersion !== head.version) return toolError(failure('REVISION_CONFLICT', 'The document or decision changed. Inspect the current state before deciding again.'), head, { snapshot: current() });
      let value;
      if (operation === 'document.set_policy') value = kernel.setPolicy({ expectedRevision: args.expectedRevision, ...(args.posture !== undefined ? { posture: args.posture } : {}), ...(args.readOnly !== undefined ? { readOnly: args.readOnly } : {}) }, human(args.decisionId));
      else if (operation === 'document.review_decide') value = await kernel.decideReview({ expectedRevision: args.expectedRevision, reviewId: args.reviewId, action: args.action, ...(Array.isArray(args.changeIds) ? { changeIds: args.changeIds } : {}) }, human(args.decisionId));
      else {
        if (args.compareId !== state.compare?.id) return toolError(failure('REVISION_CONFLICT', 'The comparison changed before this decision arrived.'), head, { snapshot: current() });
        if (!['accept', 'reject', 'close'].includes(args.action)) return toolError(failure('INVALID_DECISION', 'Use accept, reject, or close.'));
        value = await kernel.invoke('document.compare', { action: args.action, ...(args.changeIds ? { change_ids: args.changeIds } : {}) }, human(args.decisionId));
      }
      refresh();
      const accepted = ['ok', 'applied', 'rebased', 'unchanged'].includes(value.outcome);
      if (accepted) head.receipts = [...head.receipts, { id: args.decisionId, hash, revision: state.revision, version: head.version,
        result: { outcome: value.outcome, ...(value.decided !== undefined ? { decided: value.decided } : {}), ...(value.closed !== undefined ? { closed: value.closed } : {}), ...(value.changeId ? { changeId: value.changeId } : {}), ...(value.review ? { review: value.review } : {}) } }].slice(-MAX_RECEIPTS);
      await this.persist(head, state, kernel.invocationJournal());
      return envelope({ ...value, decisionId: args.decisionId, ...(accepted ? { acceptedRevision: state.revision, acceptedVersion: head.version } : {}) }, head, { snapshot: current() });
    }
    if (operation === 'document.commit') {
      // reconcile adopts authoritative snapshots; this wire draft has not been admitted yet.
      const invalid = admissibleText(args.text);
      if (invalid) throw failure('INVALID_DOCUMENT_INPUT', invalid);
      if (!args.commitId) return toolError(failure('INVALID_COMMIT_ID', 'commitId must be a nonempty identifier for this exact draft.'));
      const hash = await digest(JSON.stringify({ expectedRevision: args.expectedRevision, text: args.text, splices: args.splices ?? null, filename: args.filename ?? null, docKind: args.docKind ?? null }));
      const receipt = head.receipts.find(entry => entry.id === args.commitId);
      if (receipt) {
        if (receipt.hash !== hash) return toolError(failure('COMMIT_ID_REUSED', 'This commitId already identifies different content. Keep an identifier stable only for an identical retry.'), head, { snapshot: current() });
        await this.persist(head);
        const draftEdits = state.commitResults?.find(row => row.id === receipt.id)?.edits || [];
        const text = replay(args.text, draftEdits);
        const accepted = {...(head.version === receipt.version ? current() : { documentId: head.documentId, revision: receipt.revision, text, filename: receipt.filename, docKind: receipt.docKind }), draftEdits};
        const acceptedHead = { ...head, revision: receipt.revision, version: receipt.version, filename: receipt.filename, docKind: receipt.docKind, chars: text.length };
        return envelope({ outcome: 'committed', replayed: true, commitId: receipt.id, acceptedRevision: receipt.revision, acceptedVersion: receipt.version, currentRevision: head.revision, currentVersion: head.version }, acceptedHead, { snapshot: accepted, ...(head.version !== receipt.version ? { currentSnapshot: current() } : {}) });
      }
      if (state.journal.some(row => row.actor === 'human' && row.requestId === args.commitId))
        return toolError(failure('COMMIT_RECEIPT_EXPIRED', 'This draft was already committed, but its exact receipt is no longer retained.'), head, { snapshot: current() });
      if (state.readOnly) return toolError(failure('DOCUMENT_READ_ONLY', 'The current workspace policy is read-only. Your draft was not applied.'), head, { snapshot: current() });
      const filename = args.filename ?? state.filename, docKind = args.docKind ?? state.docKind;
      if ((filename !== state.filename || docKind !== state.docKind) && (head.metadataRevision || 0) > args.expectedRevision)
        return toolError(failure('DOCUMENT_METADATA_CHANGED', 'The document name or kind changed while this draft was being edited.'), head, { snapshot: current() });
      const who = human(args.commitId), client = row => row.actor + ':' + row.principal + ':' + row.requestId;
      let original = state.text, revision = state.revision, splices, text, draftEdits;
      const log = [];
      try {
        // The exact journal owns the old source. Missing history or replacement cannot
        // authorize guessing a base; concurrent source edits use the existing merge core.
        for (let index = state.journal.length - 1; revision > args.expectedRevision && index >= 0; index--) {
          const row = state.journal[index];
          if (row.revision !== revision || row.baseRevision !== revision - 1 || row.operation === 'document.open_text') throw new Error('draft_base_unavailable');
          const before = transformSplices(original, row.splices, true);
          if (before === null) throw new Error('draft_base_unavailable');
          log.unshift(...row.splices.map(splice => ({client: client(row),
            splices: [{at: splice.pos, remove: splice.removed.length, insert: splice.inserted}]})));
          original = before; revision = row.baseRevision;
        }
        if (revision !== args.expectedRevision) throw new Error('draft_base_unavailable');
        let authored = args.splices;
        try { if (authored === undefined) authored = sourceEdits(original, args.text); }
        catch (error) {
          if (log.length || error.message !== 'source_diff_limit') throw error;
          authored = [minimalSplice(original, args.text)];
        }
        if (transformSplices(original, authored) !== args.text)
          return toolError(failure('INVALID_DOCUMENT_EDITS', 'The local journal does not produce this exact draft from its acknowledged source.'), head, {snapshot: current()});
        ({text, splices, remote: draftEdits} = mergeSource(original, authored, client(who), log));
      } catch (_) {
        return toolError(failure('DRAFT_BASE_UNAVAILABLE', 'The retained history cannot rebase this draft. Its source remains in the editor.'), head, { snapshot: current() });
      }
      const mergedInvalid = admissibleText(text);
      if (mergedInvalid) return toolError(failure('INVALID_DOCUMENT_INPUT', mergedInvalid), head, { snapshot: current() });
      const changed = text !== state.text || filename !== state.filename || docKind !== state.docKind;
      const nextRevision = state.revision + (changed ? 1 : 0);
      const entry = {id: mintId('change_'), ...who, baseRevision: state.revision, revision: nextRevision,
        operation: 'document.human_edit', splices};
      kernel.reconcile({ documentId: state.documentId, revision: nextRevision, text, filename, docKind,
        ...(changed ? {journal: [entry]} : {}) }, who);
      refresh();
      head.receipts = [...head.receipts, { id: args.commitId, hash, revision: state.revision, version: head.version, filename: state.filename, docKind: state.docKind }].slice(-MAX_RECEIPTS);
      // The accepted result can differ from the submitted draft. Keep that difference
      // with the chunked, size-bounded source, never in the single-key receipt index.
      if (draftEdits.length) state.commitResults = [...(state.commitResults || []), {id: args.commitId, edits: draftEdits}];
      await this.persist(head, state, kernel.invocationJournal());
      return envelope({ outcome: 'committed', commitId: args.commitId, acceptedRevision: state.revision, acceptedVersion: head.version }, head, { snapshot: {...current(), draftEdits} });
    }
    if (!getTool(operation)) return toolError(failure('UNKNOWN_TOOL', 'Unknown operation.'));
    const documentId = head.documentId;
    // WORKER_PRESENCE: unknown is not absent. Surface-fact continuations keep the incoming call's key.
    const actor = ['document.comment', 'document.read_context'].includes(operation) && input.humanTool === true ? 'human' : 'agent';
    // The verified editor mode is part of the invocation identity. The same
    // operation_id cannot replay an agent's handles or review as a human call.
    const agentCaller = () => ({...resolveCaller({ actor, principal, ...(actor === 'human' ? {session: 'editor'} : {}), requestId: input.operationId }, { transport: 'mcp' }), ...(actor === 'agent' && input.hostAgent ? {hostAgent: input.hostAgent} : {})});
    let value = await kernel.invoke(operation, args, { ...agentCaller(), world: { presence: WORKER_PRESENCE, ...(visual ? {visual: visual.fact} : {}) } });
    // pending is a complete outcome: each pass invokes again with continues set, never a wait inside the kernel.
    for (let guard = 0; guard < 4 && value.outcome === 'pending' && value.pending?.kind === 'surface-fact'; guard++) {
      const fact = resolveStructureFact(value.pending.requirements);
      if (!fact) break;
      value = await kernel.invoke(operation, args, { ...agentCaller(), continues: value.pending.requestId, world: { presence: WORKER_PRESENCE, structure: fact } });
    }
    refresh();
    if (state.documentId !== documentId) return toolError(failure('DOCUMENT_IDENTITY_CHANGED', 'This operation cannot replace the remote workspace identity.'));
    let download = null, publication = null;
    if (operation === 'document.export' && value.outcome === 'ok') {
      let grant = head.exports?.find(row => row.id === value.exportId);
      if (exported?.id) {
        grant = {id: exported.id, owner: capabilityHash, name: exported.name, mimeType: exported.mimeType,
          bytes: exported.bytes.byteLength, parts: Math.ceil(exported.bytes.byteLength / CHUNK_CHARS), expiresAt: Date.now() + DAY,
          sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', exported.bytes)), byte => byte.toString(16).padStart(2, '0')).join('')};
        grant.hash = await digest(await exportToken(input.exportAddress, grant, this.env));
        head.exports = [...head.exports || [], grant];
        publication = {grant, bytes: exported.bytes};
      }
      if (!grant || grant.owner !== capabilityHash || grant.expiresAt <= Date.now()) value = {outcome: 'refused', reason: 'export_expired'};
      else {
        const token = editorSecret(this.env) ? await exportToken(input.exportAddress, grant, this.env) : null;
        if (!token || await digest(token) !== grant.hash) value = {outcome: 'refused', reason: 'export_unavailable'};
        else {
          download = {type: 'resource_link', uri: input.exportOrigin + '/export/' + token, name: grant.name, mimeType: grant.mimeType, size: grant.bytes};
          value = {...value, filename: grant.name, mimeType: grant.mimeType, bytes: grant.bytes, exportExpiresAt: new Date(grant.expiresAt).toISOString()};
        }
      }
    }
    await this.persist(head, state, kernel.invocationJournal(), false, publication);
    if (operation === 'document.save' && value.saved) Object.assign(value, { verified: true, destination: 'workspace', durable: true });
    const result = envelope(value, download ? {...head, filename: download.name} : head, {}, { modelFacing: true });
    if (operation === 'document.inspect_visual' && value.outcome === 'ok' && visual?.fact?.image) result.content.push({type: 'image', mimeType: 'image/png', data: visual.fact.image.data});
    if (download) result.content.push(download);
    return result;
  }

  alarm() {
    return this.exclusive(async () => {
      try { if (this.ctx.storage) this.ctx.storage.operation = 'alarm'; } catch {}
      const head = this.ctx.storage.kv.get('head');
      if (!head || head.expiresAt <= Date.now()) {
        this.cachedState = null;
        this.cachedJournal = null;
        await this.ctx.storage.deleteAll();
        await this.ctx.storage.sync();
      }
      else await this.ctx.storage.setAlarm(head.expiresAt);
    });
  }
}
