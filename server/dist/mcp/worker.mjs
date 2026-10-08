import {agentActorId} from '../kit/ledger/format.mjs';
import { createKernel, createState, serializeJson, admissibleText, minimalSplice, transformSplices, waitTimeout, exportFilename, exportFidelity, admitExportArtifact, LIMITS } from '../agent/kernel.mjs';
import {prepareDoorLetters} from './letters.mjs';
import { sourceEdits, mergeSource, replay } from '../kernel/live-merge.mjs';
import { paintAgentStrokes, agentPaintSheetHolds, agentPaintBrushRegistry, replayAgentPainting, sampleAgentPainting, validatePaintRaster } from '../draw/agent-paint.mjs';
import { VERSION } from '../version.mjs';
import { INSTRUCTIONS, guideResult } from '../agent/guide.mjs';
import { RETURN_ORIGIN } from '../skills/rapier-html/return-address.mjs';
import { wrap } from '../skills/rapier-html/wrap.mjs';
import { HOST_TOOLS, ICONS, MAX_TEXT_BYTES, MAX_EXPORT_BYTES, MAX_FILENAME_CHARS, UI_RESOURCE, getTool, mcpDescriptors, validateInput } from '../agent/catalog.mjs';
import { analyzeDocument } from '../agent/structure.mjs';
import { analyzeMarkdown, checkMarkdownReferences } from '../agent/markdown-server.mjs';
import { resolveCaller, validateOrigin, WORKER_PRESENCE, sealForEditor, fromBase64url } from '../agent/door-identity.mjs';
import { mintEditorKey, verifyEditorKey, editorSecretUsable, classifyEditorSecret, editorSecretKeyMaterial } from './editor-keys.mjs';
import { visualResult, sameVisualDrawing } from '../agent/visual.mjs';
import {editorResult, editorFailure, editorPreferences, EDITOR_LIMITS, EDITOR_TOOL_ACTIONS} from '../agent/editor.mjs';
import { createRequestWait } from './request-lifetime.mjs';
import { exportRenderer } from './export-port.mjs';
import {handleOAuth, oauthChallenge, oauthForbidden, oauthOrigin, HOUSE_STYLE} from './oauth.mjs';
import { PAIRED_PATH, PAIR_CODE, PAIR_CODE_MS, MAX_PAIRINGS, PAIR_SESSION_MS, PAGE_CSP, sessionCookie, pendingCookie, readCookie, setCookie, newCode, newSecret, mintSession, verifySession, pageFlags } from './paired.mjs';
import {DOOR_LIMITS} from './limits.mjs';

// Two eras on one endpoint (MCP 2026-07-28 dual-era): legacy `initialize` plus header, modern per-request `_meta`. Stateless in both;
// PROTOCOL_VERSION names the legacy era.
export const PROTOCOL_VERSION = '2025-11-25';
export const MODERN_PROTOCOL_VERSION = '2026-07-28';
export const PROTOCOL_VERSIONS = Object.freeze([MODERN_PROTOCOL_VERSION, PROTOCOL_VERSION]);
// A host pinned to an earlier legacy revision is answered in its own version; the legacy era's shapes serve it and it
// needs no later feature. Without a version header a request is the oldest of these, as that revision's rule says.
const LEGACY_VERSIONS = Object.freeze([PROTOCOL_VERSION, '2025-06-18', '2025-03-26']);
// /mcp admits the anonymous reference kind beside a connection; /muse admits a connection alone.
const DOORS = new Set(['/mcp', '/muse']);
const META_VERSION = 'io.modelcontextprotocol/protocolVersion', META_CLIENT = 'io.modelcontextprotocol/clientCapabilities', META_SERVER = 'io.modelcontextprotocol/serverInfo';
const UNSUPPORTED_VERSION = -32022, HEADER_MISMATCH = -32020;
// Re-exported: this door's own resource URI.
export { UI_RESOURCE, INSTRUCTIONS };
export { RapierOwnedNotes } from './owned-notes.mjs';
const UI_MIME = 'text/html;profile=mcp-app';
// The single descriptor projection; tools/build.mjs makes the same call and proves agreement. Never patch a descriptor here.
export const DESCRIPTORS = Object.freeze(mcpDescriptors({ uiResource: UI_RESOURCE }));
const SERVER_DESCRIPTORS = Object.freeze(mcpDescriptors({uiResource: UI_RESOURCE, auth: 'server-bearer'}));
const TOOL_BY_NAME = new Map(DESCRIPTORS.map(tool => [tool.name, tool]));
// Editor authority is a verified workspace-bound capability delivered through widget-only metadata,
// or the paired page's own admission. Tool names and client declarations grant no authority.
const EDITOR_ONLY_TOOLS = new Set(HOST_TOOLS.filter(tool => tool.visibility?.includes('app')).map(tool => tool.name));
const EDITOR_REQUEST_TOOLS = new Set(['document.set_view', ...Object.keys(EDITOR_TOOL_ACTIONS)]);
// /muse lists what an agent calls and carries no embedded editor: the person edits at editor_url, the paired page,
// which calls the editor's own operations over its own route.
// The Muse host holds a tool call well under 20 s (the host evidence), so its door bounds a wait to MUSE_WAIT_MS through the one wait
// adapter and its listing says so; /mcp keeps the catalogue's range.
const MUSE_WAIT_MS = 15000;
const museWait = tool => tool.name !== 'document.wait_for_user' ? tool : {...tool, inputSchema: {...tool.inputSchema, properties: {...tool.inputSchema.properties,
  timeout_ms: {...tool.inputSchema.properties.timeout_ms, maximum: MUSE_WAIT_MS, description: 'How long to wait: 1,000 to 15,000 milliseconds on this door; 15,000 by default.'}}}};
const MUSE_DESCRIPTORS = Object.freeze(mcpDescriptors({auth: 'oauth'}).filter(tool => !EDITOR_ONLY_TOOLS.has(tool.name)).map(museWait));
const PAIR_BROWSER = 'document.pair_browser', PAIR_STATUS = 'document.pair_status';
const MUSE_EXPORT_TEXT_CHARS = 60000;
// Without a connection, on /mcp, the document value is the whole authority.
const ANONYMOUS = Object.freeze({source: 'anonymous', scopes: Object.freeze(['rapier:read', 'rapier:write'])});
const editorSecret = env => (editorSecretUsable(env.EDITOR_KEY_SECRET) ? env.EDITOR_KEY_SECRET : '');
// One deployment verdict, read by /health and every entry point: a missing piece is refused, never permissive.
// Development is ALLOW_UNMETERED_CREATE=true, never inferred. An absent or non-32-byte root secret serves no editor page.
export function deployment(env, {authentication = 'oauth'} = {}) {
  if (!['oauth', 'server-bearer'].includes(authentication)) throw new TypeError('Unknown deployment authentication profile');
  const missing = [], invalid = [];
  if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) missing.push('DOCUMENTS');
  if (!env.ASSETS?.fetch) missing.push('ASSETS');
  if (authentication === 'oauth' && (!env.OAUTH_KV?.get || !env.OAUTH_KV?.put)) missing.push('OAUTH_KV');
  const development = env.ALLOW_UNMETERED_CREATE === 'true';
  const budget = !!(env.BUDGET?.get && env.BUDGET?.idFromName);
  if (!budget && !development) missing.push('BUDGET');
  const secret = classifyEditorSecret(env.EDITOR_KEY_SECRET);
  if (!secret.usable) (secret.reason === 'malformed' ? invalid : missing).push('EDITOR_KEY_SECRET');
  if (authentication === 'oauth') {
    let authorityOrigin;
    try { authorityOrigin = oauthOrigin(env); } catch { invalid.push('OAUTH_ORIGIN'); }
    if (env.RETURN_ORIGIN && env.RETURN_ORIGIN !== authorityOrigin) invalid.push('RETURN_ORIGIN');
  }
  for (const [name, local] of [['UI_ORIGIN', true], ['FILE_DOWNLOAD_ORIGINS', false], ['ALLOWED_ORIGINS', true], ['RETURN_ORIGIN', true]]) {
    for (const value of String(env[name] || '').split(',').map(part => part.trim()).filter(Boolean)) {
      try { configuredOrigin(value, name, local); } catch (error) { invalid.push(name); break; }
    }
  }
  return { ready: !missing.length && !invalid.length && !development, development, missing, invalid, documents: !missing.includes('DOCUMENTS'), assets: !missing.includes('ASSETS'), budget, editorKey: secret.usable, editorSecret: secret.usable ? secret.form : null, unmeteredCreate: development };
}
const WORKSPACE_HANDLE = /^rpr_[A-Za-z0-9_-]{43}$/;
const RETURN_HANDLE = /^rpret_([a-f0-9]{64})\.(return_[a-f0-9]{32})$/;
const EXPORT_HANDLE = /^rpexp_([a-f0-9]{64})\.(export_[a-f0-9]{32})$/;
// An anonymous workspace's file and return links are their own grants, as its reference is its own authority.
const RETURN_CAPABILITY = /^rpret_([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/;
const EXPORT_CAPABILITY = /^rpexp_([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/;
const BEARER_RETURN_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Rapier-Name' };
const MAX_RETURNS = 16;
const returnReply = (value, status = 200) => json(value, status);
const returnRefused = (reason, status) => returnReply({ accepted: false, reason }, status);
const receivedReturns = head => (head.returns || []).filter(row => row.receivedAt).sort((a, b) => a.sequence - b.sequence);
const returnMetadata = row => ({ return_id: row.id, name: row.name, receivedAt: row.receivedAt, bytes: row.bytes, chars: row.chars });
const CHUNK_CHARS = 32768;
const MAX_RECEIPTS = 64;
const MAX_UI_BYTES = 16 * 1024 * 1024;
// The body bound is three times MAX_TEXT_BYTES plus envelope room (JSON escaping), never the text law itself.
export const MAX_RPC_BODY_BYTES = MAX_TEXT_BYTES * 3 + 1024 * 1024;
const VIEW_LEASE_MS = 15000;
// The open editor builds a Word or PDF file in its own time; the request waits this long for it.
const EXPORT_LEASE_MS = 90000;
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

// The finished file for document.export, each format from its one owner: the source as it stands, the offline page (the built editor page
// with the source carried inside), the text and the standalone page (the inert renderer the platform installed). Word and PDF arrive from the
// open editor already checked, in request.file.
async function exportFile(env, { format, filename, docKind, text, base, file: supplied }) {
  let file;
  if (supplied) file = supplied;
  else if (format === 'markdown') file = { name: filename, mimeType: docKind === 'markdown' ? 'text/markdown' : 'text/plain', bytes: encoder.encode(text) };
  else if (format === 'html') {
    try {
      const response = await env.ASSETS?.fetch?.(new Request('https://rapier.internal/rapier.html'));
      if (!response?.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('Content-Type') || '')) return { reason: 'export_page_unavailable' };
      const page = await readTextBody(response, MAX_EXPORT_BYTES, 'export page', 'EXPORT_PAGE_TOO_LARGE');
      file = { name: exportFilename(filename, format), mimeType: 'text/html', bytes: encoder.encode(wrap(page, text, filename, base ? {base} : undefined)) };
    } catch (error) {
      return error?.code === 'EXPORT_PAGE_TOO_LARGE' ? { reason: 'export_too_large', limitBytes: MAX_EXPORT_BYTES } : { reason: 'export_page_unavailable' };
    }
  } else if (format === 'txt' || format === 'page') {
    const renderer = exportRenderer();
    if (!renderer) return { reason: 'export_render_unavailable' };
    try {
      const rendered = await (format === 'txt' ? renderer.renderText : renderer.renderPage)(text, { filename, docKind });
      file = { name: exportFilename(filename, format), mimeType: format === 'txt' ? 'text/plain' : 'text/html',
        bytes: encoder.encode(format === 'txt' ? rendered.text : rendered.html), ...(rendered.fidelity ? { fidelity: rendered.fidelity } : {}) };
    } catch (error) { return { reason: error?.code === 'export_render_limit' ? 'export_render_limit' : 'export_render_unavailable' }; }
  } else return { reason: 'export_format_invalid' };
  file.fidelity ||= exportFidelity(format, docKind);
  return file.bytes.byteLength > MAX_EXPORT_BYTES
    ? { reason: 'export_too_large', limitBytes: MAX_EXPORT_BYTES, byteLength: file.bytes.byteLength } : file;
}
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const exportHandle = (address, grant) => 'rpexp_' + address + '.' + grant.id;
async function exportToken(address, grant, env) {
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-export-v1:'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(grant.id + ':' + grant.owner)));
  return 'rpexp_' + address + '.' + base64url(mac);
}
// A stored file's grant: its owner, its bytes' digest and a day to live. An anonymous workspace's link is its own grant, so that grant
// also carries the digest of the link it is read by.
async function createExportGrant(file, owner, address, env, bearer = false) {
  const grant = {id: file.id || mintId('export_'), owner, name: file.name, mimeType: file.mimeType,
    bytes: file.bytes.byteLength, parts: Math.ceil(file.bytes.byteLength / CHUNK_CHARS), expiresAt: Date.now() + DAY,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', file.bytes)), byte => byte.toString(16).padStart(2, '0')).join('')};
  if (bearer) grant.hash = await digest(await exportToken(address, grant, env));
  return grant;
}
function newCapability() {
  return 'rpr_' + base64url(crypto.getRandomValues(new Uint8Array(32))).slice(0, 43);
}
// A public workspace reference has a stable address and a revocable generation.
// The verified owner scopes the storage address; possession of the reference grants nothing.
const ADDRESS_CHARS = 'rpr_'.length + 22;
const workspaceAddress = (handle, ownerKey) => digest(ownerKey + ':' + handle.slice(0, ADDRESS_CHARS));
// Without a connection the reference is the whole authority; its owner is named by its address, which a rotation keeps.
const anonymousOwner = handle => digest('bearer:' + handle.slice(0, ADDRESS_CHARS));
// The paired editor's public name is its storage address, which the file and return links already carry.
const pageId = address => 'ws_' + base64url(Uint8Array.from(address.match(/../g), pair => parseInt(pair, 16)));
const pageAddress = id => Array.from(fromBase64url(id.slice('ws_'.length)), byte => byte.toString(16).padStart(2, '0')).join('');
// The successor is HMAC-derived from the predecessor, so a lost rotation response is answered again with the same successor. Never stored clear.
async function rotatedCapability(capability, env) {
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-rotation-v1:'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(capability)));
  return capability.slice(0, ADDRESS_CHARS) + base64url(mac).slice(0, 43 - 22);
}
const ROTATE = 'document.rotate_capability';

// Creation retries are names within one authenticated owner's namespace.
const CREATE_TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
function createTokenRefusal(token) {
  if (!CREATE_TOKEN.test(token)) return 'createToken must be 1 to 128 URL-safe characters (A-Z a-z 0-9 _ -).';
  return null;
}
// Without a connection a createToken is the secret the reference is derived from: a counter or a short run is guessable.
function secretTokenRefusal(token) {
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(token)) return 'Without a connection, a createToken must be 22 to 128 URL-safe characters (A-Z a-z 0-9 _ -) that you generated at random.';
  if (new Set(token).size < 8) return 'Generate createToken at random: this one has too few distinct characters to keep the workspace private.';
  return null;
}
async function tokenCapability(token, env, ownerKey) {
  const payload = encoder.encode(ownerKey ? 'rapier-create:' + ownerKey + ':' + token : 'rapier-create-v2:' + token);
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

function snapshot(state, collaboration, viewIntent, visualIntent, exportIntent, editorIntent) {
  const compare = state.compare ? { id: state.compare.id, revision: state.compare.revision, baseline: state.compare.baseline, incoming: state.compare.incoming, name: state.compare.name, ...(state.compare.contribution ? {contribution: state.compare.contribution} : {}), reviewOnly: state.compare.reviewOnly === true, changes: state.compare.changes.map(({ id, start, end, incomingStart, incomingEnd, removed, inserted, status }) => ({ id, start, end, incomingStart, incomingEnd, removed, inserted, status })) } : null;
  return { documentId: state.documentId, revision: state.revision, text: state.text, filename: state.filename, docKind: state.docKind, journal: state.journal, proposalBase: state.proposalBase, compare, collaboration, viewIntent: viewIntent || null, ...(visualIntent ? {visualIntent} : {}), ...(exportIntent ? {exportIntent} : {}), ...(editorIntent ? {editorIntent} : {}) };
}

function retainEditorReceipt(head, request, receipt) {
  const held = (head.editorReceipts || []).filter(row => row.receipt.id !== receipt.id &&
    !(receipt.status === 'applied' && row.receipt.preference === receipt.preference));
  const metadata = {kind: 'editor', id: request.id, documentId: request.documentId, revision: request.revision,
    operation: request.operation, ...(request.preference ? {preference: request.preference, value: request.value} : {action: request.action})};
  head.editorReceipts = [...held, {request: metadata, receipt}].slice(-EDITOR_LIMITS.receipts);
}

function returnedEditorFact(row) {
  return {...row.request, receipt: row.receipt};
}

// The last call an agent made, as the editor's sync reports it: when, which operation and a find's kind, never what the call carried. It is what
// the editor needs to show the agent present, and the acorn when the call read the document's structure (editor/engine.js, the agent bar).
function agentReport(head) {
  const call = head?.agentCall;
  return call ? { agent: { id: call.id, ago: Math.max(0, Date.now() - call.at), operation: call.operation, ...(call.kind ? { kind: call.kind } : {}) } } : {};
}

function collaborationSummary(value) {
  const presence = value.presence, review = value.review;
  return { posture: value.posture, readOnly: value.readOnly, agentPresence: value.agentPresence, presence: presence ? { active: presence.active, editing: presence.editing, revision: presence.revision, expiresAt: presence.expiresAt } : null, review: review ? { id: review.id, kind: review.kind, status: review.status, cause: review.cause, ...(review.law ? { law: review.law, region: review.region } : {}), revision: review.revision, expiresAt: review.expiresAt, label: review.label, ...(review.contribution ? {contribution: review.contribution, complete: review.complete !== false} : {}), editCount: review.editCount ?? review.splices?.length ?? 0, ...(Array.isArray(review.changeIds) ? { changeIds: review.changeIds } : {}), ...(Array.isArray(review.changes) ? { changes: review.changes } : {}), ...(review.splices ? { splices: review.splices } : {}), ...(review.baseRevision !== undefined ? { baseRevision: review.baseRevision, scope: review.scope, includesHumanChanges: review.includesHumanChanges } : {}), ...(review.reason ? { reason: review.reason } : {}), ...(review.decision ? { decision: review.decision } : {}) } : null };
}

// Model-facing: ids, statuses, counts; never splices. Built from the same collaboration() as collaborationSummary, without the editor's
// aggregate of every agent's pointer (their words and owners): a caller's own presence is get_context's, never a shared fact.
function collaborationContext(value) {
  const presence = value.presence, review = value.review;
  return { posture: value.posture, readOnly: value.readOnly, presence: presence ? { active: presence.active, editing: presence.editing, revision: presence.revision, expiresAt: presence.expiresAt } : null, review: review ? { id: review.id, kind: review.kind, status: review.status, cause: review.cause, ...(review.law ? { law: review.law, region: review.region } : {}), revision: review.revision, expiresAt: review.expiresAt, label: review.label, ...(review.contribution ? {contribution: review.contribution, complete: review.complete !== false} : {}), editCount: review.editCount ?? review.splices?.length ?? 0, ...(Array.isArray(review.changeIds) ? { changeIds: review.changeIds } : {}), ...(Array.isArray(review.changes) ? { changes: review.changes.map(({ id, status, reason }) => ({ id, status, ...(reason ? { reason } : {}) })) } : {}), ...(review.baseRevision !== undefined ? { baseRevision: review.baseRevision, scope: review.scope, includesHumanChanges: review.includesHumanChanges } : {}), ...(review.reason ? { reason: review.reason } : {}), ...(review.decision ? { decision: review.decision } : {}) } : null };
}

// Sorted defensively; storage order is not promised.
function reviewChangesFingerprint(review) {
  if (!Array.isArray(review?.changes) || !review.changes.length) return '';
  return review.changes.map(row => `${row.id}:${row.status}:${row.reason || ''}`).sort().join('|');
}

function viewChanged(before, after) {
  if (JSON.stringify(before.pointers) !== JSON.stringify(after.pointers)) return true;
  if (before.revision !== after.revision || before.text !== after.text || before.filename !== after.filename || before.docKind !== after.docKind || before.compare?.id !== after.compare?.id || before.compare?.revision !== after.compare?.revision || before.posture !== after.posture || before.readOnly !== after.readOnly || before.review?.id !== after.review?.id || before.review?.status !== after.review?.status || before.reviewedRevision !== after.reviewedRevision) return true;
  // Per-change status moves without review.id/status changing: fingerprint the changes too, or a partial drop reads unchanged.
  if (reviewChangesFingerprint(before.review) !== reviewChangesFingerprint(after.review)) return true;
  const left = before.compare?.changes || [], right = after.compare?.changes || [];
  return left.length !== right.length || left.some((row, index) => row.id !== right[index].id || row.status !== right[index].status);
}

// `modelFacing`: the one call site a model reads. If the assembled envelope is over budget, collaboration degrades to counts; nothing else is cut.
function envelope(value, head, meta = {}, { modelFacing = false, fallbackCollaboration = true } = {}) {
  if (head) meta = {...meta, editorIssuedAt: head.editorIssuedAt ?? head.createdAt};
  const isError = value.isError || ['refused', 'invalid', 'conflict', 'yielded', 'target_gone'].includes(value.outcome);
  const collaboration = value.collaboration ?? (fallbackCollaboration ? modelFacing ? head?.collaborationContext : head?.collaboration : undefined);
  const result = { ...value, outcome: value.outcome || 'ok', ...(head ? { documentId: head.documentId, revision: head.revision, documentRevision: value.documentRevision ?? head.revision, ...(value.replayed && value.documentRevision !== undefined ? {currentRevision: head.revision} : {}), version: head.version, filename: head.filename, docKind: head.docKind, chars: head.chars, ...(collaboration !== undefined ? {collaboration} : {}), ...(head.viewIntent ? { view: { ...value.view, id: head.viewIntent.id, kind: head.viewIntent.kind, revision: head.viewIntent.revision, status: head.viewIntent.status, ...(head.viewIntent.view ? {requested: head.viewIntent.view} : {}), ...(head.viewIntent.reason ? { reason: head.viewIntent.reason } : {}) } } : {}), expiresAt: new Date(head.expiresAt).toISOString() } : {}) };
  if (modelFacing && collaboration?.review && encoder.encode(JSON.stringify(result)).byteLength > LIMITS.resultBytes) {
    const review = collaboration.review;
    result.collaboration = { ...collaboration, review: { id: review.id, kind: review.kind, status: review.status, cause: review.cause, ...(review.law ? { law: review.law, region: review.region } : {}), editCount: review.editCount, ...(review.contribution ? {contribution: review.contribution} : {}), complete: false } };
  }
  const message = typeof result.message === 'string' ? result.message : typeof result.reason === 'string' ? result.reason : `${result.outcome}${head ? `; document revision ${head.revision}` : ''}`;
  return { content: [{ type: 'text', text: message }], structuredContent: result, ...(isError ? { isError: true } : {}), ...(Object.keys(meta).length ? { _meta: { rapier: meta } } : {}) };
}

function operationEnvelope(operation, recorded, head) {
  const {hostedDownload, ...value} = recorded;
  if (operation === 'document.save' && value.saved) Object.assign(value, {verified: true, destination: 'workspace', durable: true});
  // A context refusal has no caller-scoped presence. The shared projection cannot substitute for it, in a first result or its replay.
  const result = envelope(value, hostedDownload ? {...head, filename: hostedDownload.name} : head, {}, {modelFacing: true, fallbackCollaboration: operation !== 'document.get_context'});
  if (hostedDownload) result.content.push(hostedDownload);
  return result;
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
  const allowed = new Set([RETURN_ORIGIN, env.OAUTH_ORIGIN, ...(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)].filter(Boolean));
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
  // Resource text is model-readable. Editor authority travels only in tool-result metadata.
  if (!editorSecret(env)) throw failure('INVALID_UI_CONFIGURATION', 'EDITOR_KEY_SECRET must encode 32 generated bytes as base64 or base64url before the editor can be served.');
  // Same list as the host's connect-src; the page checks it again before any fetch.
  const fileOrigins = connectDomains.filter(origin => origin !== 'https://cdn.jsdelivr.net');
  const flagged = html.replace(/globalThis\.RAPIER_APPS_HOST\s*=\s*true;/, match => match + ' globalThis.RAPIER_FILE_DOWNLOAD_ORIGINS = ' + JSON.stringify(fileOrigins) + ';');
  if (flagged === html) throw failure('UI_NOT_BUILT', 'The asset carries no RAPIER_APPS_HOST flag.');
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
    'openai/widgetDescription': 'Rapier is the shared editor for this document. Edit its text and drawings, review attributed changes, and export an independent Markdown file or offline editor.' } }] };
}

function configuredOrigin(value, name, local = false) {
  let url;
  try { url = new URL(value); } catch { throw failure('INVALID_UI_CONFIGURATION', `${name} must contain origins.`); }
  const development = local && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !development) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) throw failure('INVALID_UI_CONFIGURATION', `${name} must contain exact HTTPS origins without credentials, paths or wildcards.`);
  return url.origin;
}

// Listing is not authority: app-only tools require verified editor authority. The default listing is app-clients.
// Only the formal MCP Apps declaration counts, in either era.
function declaresAppsUi(params) {
  const capabilities = plain(params?.capabilities) ? params.capabilities : {};
  const ui = plain(capabilities.extensions) ? capabilities.extensions['io.modelcontextprotocol/ui'] : null;
  return !!(plain(ui) && Array.isArray(ui.mimeTypes) && ui.mimeTypes.includes(UI_MIME));
}
function listedTools(env, appsClient, authority) {
  const descriptors = authority?.source === 'server' ? SERVER_DESCRIPTORS : DESCRIPTORS;
  if (env.HOST_TOOLS_LISTING === 'all') return descriptors;
  return appsClient ? descriptors : descriptors.filter(tool => !EDITOR_ONLY_TOOLS.has(tool.name));
}

// 'ok', 'exceeded', 'uncertain' or 'no-binding'. No binding refuses creation, never unmetered. The two takes are a sequential pair, not one transaction;
// a successful take holds for its window and a retry reuses it. An authorized reopen never calls this.
// Check the principal first: a full principal window must not spend the shared deployment allowance.
async function takeCreateBudget(env, { takeId, principalKey }) {
  if (!env.BUDGET?.get || !env.BUDGET?.idFromName) return env.ALLOW_UNMETERED_CREATE === 'true' ? 'ok' : 'no-binding';
  const keys = [['create-principal:' + principalKey, DOOR_LIMITS.principalCreatesPerHour],
    ['deployment', DOOR_LIMITS.deploymentCreatesPerHour]];
  for (const [key, limit] of keys) {
    let response;
    try {
      response = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit, windowMs: DOOR_LIMITS.hourMs, takeId }) }));
    } catch { return 'uncertain'; }
    if (!response.ok) return 'uncertain';
    let body;
    try { body = await response.json(); } catch { return 'uncertain'; }
    if (body.code === 'WORKSPACE_UNAVAILABLE') return 'uncertain';
    if (!body.allowed) return 'exceeded';
  }
  return 'ok';
}

// authority: a verified connection (oauth or the local server), the anonymous kind on /mcp, or the paired page, whose
// admission (the owner's browser, or a browser paired by code) the workspace itself decides.
async function callTool(name, args, env, request, authority, hostAgent = null, door = '/mcp', editorProof = null, editorActivity = false) {
  const descriptor = TOOL_BY_NAME.get(name);
  if (!descriptor) throw failure('UNKNOWN_TOOL', 'Unknown tool.');
  const rawArgs = args;
  const humanNamed = ['document.comment', 'document.read_context'].includes(name) && (Object.hasOwn(args, 'editorKey') || typeof editorProof === 'string');
  if (humanNamed && authority.source !== 'page' && typeof editorProof !== 'string') return toolError(failure('HUMAN_AUTHORITY_REQUIRED', "This operation needs the editor's own authority."));
  const keyArgument = humanNamed ? args.editorKey ?? editorProof : undefined;
  if (humanNamed) { args = {...args}; delete args.editorKey; }
  try { args = validateInput(descriptor.inputSchema, args, 'arguments', !EDITOR_ONLY_TOOLS.has(name)); }
  catch (error) {
    if (error.code !== 'invalid_arguments') throw error;
    const result = toolError(failure('invalid_arguments', error.message, {path: error.path}));
    // Input feedback is not an instance of the tool's declared successful output.
    return {isError: true, content: [{type: 'text', text: JSON.stringify(result.structuredContent)}]};
  }
  if (humanNamed) args.editorKey = keyArgument;
  if (name === 'rapier.guide') return envelope(guideResult());
  if (name === PAIR_STATUS) return toolError(failure('PAIRING_PAGE_ONLY', 'Only the paired editor page asks for its own pairing code, on its own route.'));
  for (const field of ['text', 'query']) if (typeof args[field] === 'string' && contentBytes(args[field]) > MAX_TEXT_BYTES) return toolError(failure('TEXT_TOO_LARGE', `${field} exceeds the UTF-8 text limit.`, { limitBytes: MAX_TEXT_BYTES }));
  const verdict = deployment(env, {authentication: authority.source === 'server' ? 'server-bearer' : 'oauth'});
  if (!verdict.documents) return toolError(failure('STORAGE_UNAVAILABLE', 'The document storage binding is unavailable.'));
  const page = authority.source === 'page' ? authority : null, anonymous = authority.source === 'anonymous';
  const create = !page && name === 'rapier.open' && args.document === undefined;
  if (name === 'rapier.open' && args.file && ['document', 'text', 'filename', 'docKind'].some(key => Object.hasOwn(args, key))) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Open a host file with file alone; its contents are read by the editor through the host.'));
  if (name === 'rapier.open' && args.file && (/[\\/\u0000-\u001f\u007f]/.test(args.file.name) || !args.file.resourceUri.trim())) return toolError(failure('INVALID_DOCUMENT_INPUT', 'A host file needs a filename without a path and a nonempty resource URI.'));
  if (page ? args.document !== page.id : !create && !WORKSPACE_HANDLE.test(args.document || '')) return toolError(failure('INVALID_DOCUMENT', 'Use the document value returned by rapier.open.'));
  const connectedOwner = page || anonymous ? null : await digest(authority.ownerId);
  // A connection's retry name belongs to its verified owner; without a connection the createToken is a secret.
  // Without one, every create is a new workspace.
  const createToken = typeof args.createToken === 'string' ? args.createToken : null;
  if (create && createToken !== null) {
    const refusal = anonymous ? secretTokenRefusal(createToken) : createTokenRefusal(createToken);
    if (refusal) return toolError(failure('INVALID_CREATE_TOKEN', refusal));
  }
  if (!create && args.createToken !== undefined) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'createToken belongs to a create. Reopening uses the existing document value.'));
  const minted = create ? (createToken !== null ? await tokenCapability(createToken, env, connectedOwner) : newCapability()) : null;
  // Cloudflare supplies the anonymous address; forwarding headers and document handles cannot select a new allowance.
  // Connected tokens share their verified connection's window, including refreshed tokens and calls from another address.
  const createBudget = create ? { takeId: await takeIdOf(minted), retryable: createToken !== null,
    principalKey: await digest(anonymous ? 'address:' + (request.headers.get('CF-Connecting-IP') || 'unknown')
      : authority.source + ':' + authority.ownerId + ':' + (authority.connectionId || '')) } : null;
  if (!create && name === 'rapier.open' && ['text', 'filename', 'docKind'].some(key => Object.hasOwn(args, key))) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Reopen with document alone; create with text and no document; replace content with document.open_text.'));
  const humanTool = humanNamed;
  const document = create ? minted : page ? null : args.document;
  const ownerKey = page ? null : anonymous ? await anonymousOwner(document) : connectedOwner;
  const capabilityHash = document ? await digest(document) : null;
  const documentAddress = page ? page.address : await workspaceAddress(document, ownerKey);
  if (door === '/muse' && name === 'document.wait_for_user') args = {...args, timeout_ms: waitTimeout(args.timeout_ms, MUSE_WAIT_MS)};
  const editorBinding = {workspace: documentAddress, connection: page ? page.authority.ownerKey || '' : authority.connectionId || authority.ownerId || ''};
  let editorSource = authority.source;
  if (EDITOR_ONLY_TOOLS.has(name) || humanTool) {
    if (!editorSecret(env)) return toolError(failure('EDITOR_KEY_UNCONFIGURED', 'This deployment has no EDITOR_KEY_SECRET, so editor operations cannot be verified.'));
    // Metadata is not an authenticity claim. Only the bound HMAC capability establishes the editor path.
    // A model-filled argument never promotes an OAuth or anonymous caller.
    const proof = page ? args.editorKey : editorProof;
    const verdict = await verifyEditorKey(editorSecret(env), proof, Date.now(), editorBinding);
    if (verdict.ok && (page || proof === args.editorKey)) editorSource = 'page';
    if (editorSource !== 'page' || !verdict.ok) return toolError(failure('HUMAN_AUTHORITY_REQUIRED', "This is the editor's own operation. Open the editor to make this decision.", {reason: verdict.reason || 'editor_path_required'}));
  }
  // Credentials stay outside the workspace; operation_id names the call. Preserve raw operational
  // arguments so changed ignored fields or clipped tails cannot replay. Admission above uses declared fields.
  const { document: ignored, editorKey: ignoredKey, createToken: ignoredToken, operation_id: operationName, ...input } =
    name === 'rapier.open' || EDITOR_ONLY_TOOLS.has(name) ? args : rawArgs;
  const file = name === 'rapier.open' ? input.file : undefined;
  if (file) { delete input.file; Object.assign(input, {text: '', filename: file.name}); }
  // Rotation mints the successor here (the workspace never sees a capability, only digests) and
  // hands the workspace the successor's digest to store; the successor itself goes back sealed.
  // A paired page's exact session recovers its own latest rotation after a lost response.
  const pageRotation = name === ROTATE && page ? await pageSuccessor(env, page, args.editorKey) : null;
  const successor = name === ROTATE ? (document ? await rotatedCapability(document, env) : pageRotation?.capability) : null;
  if (name === ROTATE && !successor) return toolError(failure('PAIRING_REQUIRED', 'This browser is not paired with this workspace. Open its editor link and give the assistant the code the page shows.'));
  // Owned Notes content terminates at the enrolled endpoint. The opaque relay receives
  // only a verified address for this status check, never a query, note or tool result.
  if (name.startsWith('notes.') && env.OWNED_NOTES !== undefined) {
    let status;
    try {
      const response = await env.OWNED_NOTES.get(env.OWNED_NOTES.idFromName(documentAddress)).fetch(new Request('https://rapier.internal/status', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({capabilityHash}),
      }));
      if (response.ok) status = await response.json();
    } catch {}
    if (status?.reason === 'notes_not_configured') return envelope({outcome: 'ok', availability: 'unavailable', reason: 'notes_not_configured', message: 'Notes is not set up on this host.',
      complete: true, remaining: 0, next_cursor: null, ...(name === 'notes.list' ? {notes: []} : {}),
      ...(name === 'notes.read' ? {file: args.file, found: false, text: null} : {})});
    const hint = typeof status?.hint === 'string' && status.hint.length <= 512 ? status.hint
      : 'Unlock Notes at the enrolled endpoint and use its private connection. The hosted relay cannot read encrypted Notes.';
    return envelope({outcome: 'refused', availability: 'locked', reason: 'notes_locked',
      adapter_enrolled: status?.adapterEnrolled === true, hint, message: hint});
  }
  // Pending observations and private paint work follow client disconnects. The
  // operation still owns its durable receipt after cancellation or publication.
  const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(documentAddress)).fetch(new Request('https://rapier.internal/operation', { method: 'POST', ...(['document.wait_for_user', 'document.inspect_visual', 'document.draw', 'document.undo_agent_change'].includes(name) || EDITOR_REQUEST_TOOLS.has(name) || name === 'document.export' && ['docx', 'pdf'].includes(input.format) ? {signal: request.signal} : {}), headers: { 'Content-Type': 'application/json' }, body: serializeJson({ operation: name, args: input, create, ...(page ? {page: {...page.authority, ...(pageRotation ? {rotationEpoch: pageRotation.epoch, rotationRetry: pageRotation.retry} : {})}} : {ownerKey, capabilityHash}), ...(create ? {prefix: document.slice(0, ADDRESS_CHARS), ...(anonymous ? {bearer: true} : {})} : {}), ...(hostAgent ? {hostAgent} : {}), ...(humanTool ? {humanTool: true} : {}), ...(EDITOR_ONLY_TOOLS.has(name) || humanTool ? {editorAuthorized: true} : {}), ...(editorSource === 'page' && editorActivity === true && ['document.commit', 'document.human_context'].includes(name) ? {editorActivity: true} : {}), ...(name === 'document.create_return' ? { returnAddress: documentAddress } : {}), ...(['document.export', 'document.propose'].includes(name) ? { exportAddress: documentAddress, exportOrigin: new URL(request.url).origin } : {}), ...(createBudget ? { createBudget } : {}), ...(successor ? { rotateToHash: await digest(successor) } : {}), ...(operationName !== undefined ? { operationId: operationName } : {}) }) }));
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
  const issuedAt = result._meta?.rapier?.editorIssuedAt;
  if ((name === 'rapier.open' || editorSource === 'page' && editorActivity === true) && Number.isSafeInteger(issuedAt)) {
    result._meta = {...result._meta, rapier: {...result._meta?.rapier, editorKey: await mintEditorKey(editorSecret(env), issuedAt, editorBinding), editorDocument: page ? page.id : document}};
  }
  if (successor && result.structuredContent?.rotated === true) {
    result._meta = {...result._meta, rapier: {...result._meta?.rapier, editorKey: args.editorKey, editorDocument: page ? page.id : successor}};
    result.structuredContent = { ...result.structuredContent, sealed: await sealForEditor(args.editorKey, successor) };
    return result;
  }
  // The paired page names its workspace by id and never receives a reference.
  if (page) return result;
  result.structuredContent = { ...result.structuredContent, document, ...(name === 'rapier.open' ? { editor_url: new URL('/d/' + pageId(documentAddress), request.url).href } : {}) };
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

export function handleMcp(request, env, ctx = {}) {
  return withOrigin(request, env, () => handleOAuth(request, env, ctx, (incoming, authority) => handleRequest(incoming, env, authority)));
}

// In-process ingress only: the local HTTP server independently verifies its deployment bearer
// before passing this authority. No request header, tool argument or environment flag selects it.
export function handleAuthenticatedMcp(request, env, authority) {
  if (authority?.source !== 'server' || !/^owner_[A-Za-z0-9_-]{43}$/.test(authority.ownerId || '') ||
      !Array.isArray(authority.scopes) || !['rapier:read', 'rapier:write'].every(scope => authority.scopes.includes(scope)))
    throw new TypeError('Verified server authority is required');
  return withOrigin(request, env, () => handleRequest(request, env, authority));
}

async function withOrigin(request, env, dispatch) {
  const path = new URL(request.url).pathname;
  // An anonymous workspace's return address is its own grant, posted from any page; an offline file's origin is null.
  if (path.startsWith('/return/') && RETURN_CAPABILITY.test(path.slice('/return/'.length))) return dispatch();
  if (!DOORS.has(path) && !path.startsWith('/return/')) return dispatch();
  if (!allowedOrigin(request, env)) return rpcError(null, -32000, 'Origin is not allowed.', 403);
  const origin = request.headers.get('Origin');
  // Browser clients must be able to read refusals as well as successful replies. The existing
  // origin admission owns access; CORS reflects that one admitted origin, never a wildcard.
  const response = request.method === 'OPTIONS'
    ? new Response(null, {status: 204, headers: {'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': DOORS.has(path) ? 'POST' : 'GET, POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, X-Rapier-Apps-Client, X-Rapier-Name'}})
    : await dispatch();
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'X-Rapier-Apps-Client, WWW-Authenticate');
  headers.set('Vary', 'Origin');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

function requireScope(request, env, authority, scopes) {
  if (!authority) return oauthChallenge(request, env, scopes);
  if (!scopes.every(scope => authority.scopes.includes(scope))) return oauthForbidden(request, env, scopes);
  return null;
}

// The offline file carries a public return address. Only this top-level page can use the
// private browser cookie; its explicit confirmation sends the source to the same origin.
function returnPage(status = 200, reason = '') {
  const nonce = crypto.randomUUID();
  const initial = JSON.stringify({status, reason}).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Send back · Rapier</title><link rel="stylesheet" href="/fonts.css"><style nonce="${nonce}">${HOUSE_STYLE}#send{margin-top:auto}#name{color:var(--muted);font:400 .75rem/1.5 "Geist Mono",monospace}</style><main><h1>Send this document back</h1><p id="status" role="status">Waiting for the offline page.</p><p id="name"></p><pre id="preview" hidden></pre><p>The agent receives a separate returned copy. Your current workspace text stays as it is.</p><button id="send" disabled>Send document</button></main>
<script nonce="${nonce}">
const initial=${initial}, status=document.getElementById('status'), button=document.getElementById('send');
const sourceWindow=window.opener;
let pending=null, port=null, sending=false;
function reply(code,answer){port?.postMessage({type:'rapier-return-result',status:code,answer});}
if(initial.status!==200){
  status.textContent=initial.reason;
  sourceWindow?.postMessage({type:'rapier-return-unavailable',...initial},'*');
}else if(!sourceWindow){
  status.textContent='Open this return using Send back on the offline page.';
}else{
  window.addEventListener('message',event=>{
    if(event.source!==sourceWindow||pending||event.data?.type!=='rapier-return-document'||event.ports.length!==1)return;
    const data=event.data;
    if(typeof data.source!=='string'||typeof data.name!=='string'||!data.name||[...data.name].length>${MAX_FILENAME_CHARS}||data.source.length>${MAX_TEXT_BYTES})return;
    const bytes=new TextEncoder().encode(data.source).byteLength;
    if(bytes>${MAX_TEXT_BYTES})return;
    pending={source:data.source,name:data.name};port=event.ports[0];
    document.getElementById('name').textContent=data.name+' · '+bytes.toLocaleString()+' bytes';
    const preview=document.getElementById('preview');preview.textContent=data.source.slice(0,4000);preview.hidden=false;
    status.textContent='Check the document preview, then confirm the upload.';button.disabled=false;
  });
  // This readiness message contains no source, identity or credential.
  sourceWindow.postMessage({type:'rapier-return-ready'},'*');
}
button.addEventListener('click',async event=>{
  if(!event.isTrusted||!pending||sending)return;
  sending=true;button.disabled=true;status.textContent='Sending…';
  try{
    const response=await fetch(location.pathname,{method:'POST',credentials:'same-origin',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',
      headers:{'Content-Type':'text/markdown;charset=utf-8','X-Rapier-Name':encodeURIComponent(pending.name)},body:pending.source});
    const answer=await response.json();reply(response.status,answer);
    if(response.ok&&answer.accepted===true){status.textContent='Accepted. You can close this page.';pending=null;}
    else{status.textContent=answer.reason||answer.message||'The return was not accepted.';}
  }catch{status.textContent='The receipt could not be confirmed. Ask the agent whether it arrived.';reply(503,{accepted:false,reason:status.textContent});}
  finally{sending=false;button.disabled=true;}
});
</script></html>`;
  return new Response(html, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; font-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`}});
}

async function handleRequest(request, env, authority) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/export/')) {
    const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {...headers, Allow: 'GET, HEAD'}});
    const token = url.pathname.slice('/export/'.length), granted = EXPORT_CAPABILITY.exec(token);
    // An anonymous workspace's link is its own grant; a connected workspace's names a file its owner reads.
    const refusal = granted ? null : requireScope(request, env, authority, ['rapier:read']);
    if (refusal) return refusal;
    const match = granted || EXPORT_HANDLE.exec(token);
    if (!match || url.search || url.hash) return new Response(null, {status: 404, headers});
    if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) return new Response(null, {status: 503, headers});
    try {
      return await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(match[1])).fetch(new Request('https://rapier.internal/export', {
        method: request.method, headers: granted ? {'X-Rapier-Export-Hash': await digest(token)} : {'X-Rapier-Export-ID': match[2], 'X-Rapier-Owner': await digest(authority.ownerId)},
      }));
    } catch { return new Response(null, {status: 503, headers}); }
  }
  if (url.pathname.startsWith('/return/')) {
    // An anonymous workspace's return address is its own one-use grant, posted directly by any page.
    const token = url.pathname.slice('/return/'.length), granted = RETURN_CAPABILITY.exec(token);
    const refused = (reason, status) => granted ? json({ accepted: false, reason }, status, BEARER_RETURN_CORS) : returnRefused(reason, status);
    if (granted && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...BEARER_RETURN_CORS, 'Cache-Control': 'no-store' } });
    const browserPage = !granted && request.method === 'GET';
    if (!browserPage && request.method !== 'POST') return refused('Use POST to send this document back.', 405);
    if (!granted) {
      const refusal = requireScope(request, env, authority, ['rapier:read', 'rapier:write']);
      if (refusal) return browserPage ? returnPage(refusal.status, 'Open this page in the browser where you connected Rapier. Connect in your app first if needed, then reopen this return.') : refusal;
      if (!browserPage && authority.source === 'browser' && request.headers.get('Origin') !== url.origin)
        return returnRefused('Confirm the upload on the return page.', 403);
    }
    const match = granted || RETURN_HANDLE.exec(token);
    if (!match || url.search || url.hash) return browserPage ? returnPage(404, 'This return address is unknown.') : refused('This return address is unknown.', 404);
    if (!browserPage && !/^text\/markdown(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('Content-Type') || '')) return refused('Content-Type must be text/markdown with UTF-8 text.', 415);
    if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) return refused('Return storage is unavailable.', 503);
    try {
      const headers = new Headers(request.headers);
      if (granted) headers.set('X-Rapier-Return-Hash', await digest(token));
      else {
        headers.set('X-Rapier-Return-ID', match[2]);
        headers.set('X-Rapier-Owner', await digest(authority.ownerId));
      }
      headers.delete('Authorization');
      headers.delete('Cookie');
      // Own the incoming-body transfer until it settles. A storage refusal can
      // arrive before reading the body; its pump must stop before this response.
      const relay = request.body ? new TransformStream() : null, controller = new AbortController();
      const transfer = relay ? request.body.pipeTo(relay.writable, {signal: controller.signal}).then(() => true, () => false) : Promise.resolve(true);
      let response;
      try {
        const forwarded = new Request('https://rapier.internal/return', {method: request.method, headers, signal: request.signal,
          ...(relay ? {body: relay.readable, duplex: 'half'} : {})});
        response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(match[1])).fetch(forwarded);
      } finally {
        if (!response?.ok) controller.abort();
        const transferred = await transfer;
        if (response?.ok && !transferred) throw new Error('The returned source transfer was not confirmed.');
      }
      if (granted) {
        const answered = new Headers(response.headers);
        for (const [name, value] of Object.entries(BEARER_RETURN_CORS)) answered.set(name, value);
        return new Response(response.body, { status: response.status, headers: answered });
      }
      if (!browserPage) return response;
      const result = await response.json();
      return returnPage(response.status, result.reason || '');
    } catch { return refused('The return receipt could not be confirmed. Ask the agent whether it arrived.', 503); }
  }
  if (url.pathname === '/health') return json({ service: 'rapier', serverInfo: serverInfo(env), protocolVersions: PROTOCOL_VERSIONS, protocolVersion: PROTOCOL_VERSION, ...deployment(env) });
  // The ChatGPT app directory verifies the door's domain by reading a token it gives the publisher at this
  // path (developers.openai.com/apps-sdk, "domain verification"); the token is a plain variable of the
  // deployment, deliberately public for verification, never a credential or a byte of the door's state.
  if (url.pathname === '/.well-known/openai-apps-challenge') {
    if (request.method !== 'GET') return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const token = typeof env.OPENAI_APPS_CHALLENGE === 'string' ? env.OPENAI_APPS_CHALLENGE : '';
    return token ? new Response(token, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }) : new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const paired = PAIRED_PATH.exec(url.pathname);
  if (!DOORS.has(url.pathname) && !paired) return new Response('Not found', { status: 404 });
  const door = paired ? 'page' : url.pathname, cookies = [];
  // A host that has not connected is told where to; nothing is read or stored first. A client asks for the scope this
  // names, so it names the refresh permission too: without it a connection would need consent again every 15 minutes.
  if (door === '/muse' && !authority) return oauthChallenge(request, env, ['rapier:read', 'rapier:write', 'offline_access']);
  if (door === '/mcp') authority ??= ANONYMOUS;
  if (paired) {
    authority = await pageCaller(request, env, paired[1], authority);
    if (!authority) return new Response('Not found', { status: 404 });
    if (['GET', 'HEAD'].includes(request.method)) return pairedPage(request, env, authority);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD, POST' } });
    // The page's own transport: same origin only, so no other site can spend its cookies.
    if (request.headers.get('Origin') !== url.origin || !['same-origin', null].includes(request.headers.get('Sec-Fetch-Site'))) return rpcError(null, -32000, 'Origin is not allowed.', 403);
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return rpcError(null, -32600, 'Content-Type must be application/json.', 415);
  // Every reply is one JSON object, so a client that accepts no event stream is answered the same way.
  const accept = (request.headers.get('Accept') || '').toLowerCase().split(',').filter(part => !/;\s*q=0(?:\.0*)?\s*(?:;|$)/.test(part)).map(part => part.split(';')[0].trim()).filter(Boolean);
  if (accept.length && !accept.some(type => ['application/json', 'application/*', '*/*'].includes(type))) return rpcError(null, -32600, 'Accept must allow application/json.', 406);
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
    if (message.method !== 'initialize' && header !== null && !LEGACY_VERSIONS.includes(header)) return rpcError(id ?? null, -32600, `MCP-Protocol-Version must be one of ${LEGACY_VERSIONS.join(', ')}.`, 400);
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
  if (door === 'page' && message.method !== 'tools/call') return rpcError(id, -32601, 'Method not found.');
  // A tool refused for want of a connection or a scope still answers as a tool, naming the challenge for hosts that
  // link an account from it.
  const challenged = refusal => {
    const challenge = refusal.headers.get('WWW-Authenticate');
    return json({jsonrpc: '2.0', id, result: {isError: true, content: [{type: 'text', text: 'Connect Rapier with the permission this tool needs.'}],
      _meta: {'mcp/www_authenticate': [challenge]}}}, refusal.status, {'WWW-Authenticate': challenge});
  };
  try {
    switch (message.method) {
      case 'initialize':
        if (modern) return rpcError(id, -32601, 'Method not found.', 404);
        if (typeof params.protocolVersion !== 'string' || !plain(params.capabilities) || !plain(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') return rpcError(id, -32602, 'initialize requires protocolVersion, capabilities, and clientInfo.');
        result = { protocolVersion: LEGACY_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSION, capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [UI_MIME] }, 'io.modelcontextprotocol/skills': {} } }, serverInfo: serverInfo(env), instructions };
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
        result = door === '/muse' ? cacheable({ tools: MUSE_DESCRIPTORS }, 3600000, 'public')
          : cacheable({ tools: listedTools(env, appsClient, authority) }, env.HOST_TOOLS_LISTING === 'all' ? 3600000 : 0, env.HOST_TOOLS_LISTING === 'all' ? 'public' : 'private'); break;
      case 'tools/call':
        if (typeof params.name !== 'string' || (params.arguments !== undefined && !plain(params.arguments))) return rpcError(id, -32602, 'tools/call requires name and an arguments object.');
        if (door === '/muse' && EDITOR_ONLY_TOOLS.has(params.name)) throw failure('UNKNOWN_TOOL', 'Unknown tool.');
        if (params.name !== 'rapier.guide' && TOOL_BY_NAME.has(params.name)) {
          const reads = TOOL_BY_NAME.get(params.name).annotations.readOnlyHint || params.name === 'rapier.open' && params.arguments?.document !== undefined;
          const refusal = requireScope(request, env, authority, reads ? ['rapier:read'] : ['rapier:read', 'rapier:write']);
          if (refusal) return challenged(refusal);
        }
        if (door === 'page' && params.name === PAIR_STATUS) { result = await pairStatus(request, env, authority, params.arguments, cookies); break; }
        result = await callTool(params.name, params.arguments || {}, env, request, authority, modern ? meta['io.modelcontextprotocol/clientInfo']?.name : null, door, meta['rapier/editorKey'], meta['rapier/editorActivity']);
        // The page that disconnects agents keeps its own pairing; every other paired browser loses it.
        if (door === 'page' && params.name === ROTATE && result.structuredContent?.rotated === true)
          cookies.push(setCookie(authority.id, sessionCookie(authority.id), await mintSession(editorSecret(env), authority.id, result.structuredContent.rotations), PAIR_SESSION_MS / 1000));
        break;
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
        result = cacheable({ resources: [...(door === '/muse' ? [] : [{ uri: UI_RESOURCE, name: 'rapier-editor', title: 'Rapier document workspace', mimeType: UI_MIME, description: 'The full Rapier editor, connected to the canonical document through the MCP Apps bridge.' }]), ...skills] }, 3600000, 'public'); break;
      }
      case 'resources/templates/list':
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'The empty resource template catalog has no continuation.');
        result = cacheable({resourceTemplates: []}, 3600000, 'public'); break;
      case 'resources/read': {
        if (params.uri === UI_RESOURCE) {
          // The editor key reaches /muse only through the paired page.
          if (door === '/muse') throw failure('RESOURCE_NOT_FOUND', 'Unknown resource.');
          const refusal = requireScope(request, env, authority, ['rapier:read']);
          if (refusal) return refusal;
        }
        result = cacheable(await resource(request, env, params.uri), 0, 'private'); break;
      }
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
  // A host that renders no link still receives the Markdown itself, within one bounded result.
  if (door === '/muse' && message.method === 'tools/call' && params.name === 'document.export' && params.arguments?.format === 'markdown' && result.structuredContent?.outcome === 'ok') {
    const link = result.content.find(item => item.type === 'resource_link');
    const file = link ? await handleRequest(new Request(link.uri), env, authority) : null;
    const text = file?.ok ? await file.text() : null;
    if (text !== null) result.content.push({type: 'text', text: text.length <= MUSE_EXPORT_TEXT_CHARS ? text
      : `The Markdown is ${text.length} characters, more than one result carries; read it in pages with document.read_context.`});
  }
  if (modern) result = { ...result, resultType: 'complete', _meta: { ...(plain(result._meta) ? result._meta : {}), [META_SERVER]: serverInfo(env) } };
  const reply = json({ jsonrpc: '2.0', id, result }, 200, headers);
  for (const cookie of cookies) reply.headers.append('Set-Cookie', cookie);
  return reply;
}

// The paired editor's authority over one workspace: the owner's browser (its owner cookie), or a browser paired by
// code (its pairing cookie). The workspace decides whether either admits it.
async function pageCaller(request, env, id, browser) {
  const address = pageAddress(id);
  if (pageId(address) !== id) return null;
  const authority = {};
  if (browser?.source === 'browser') authority.ownerKey = await digest(browser.ownerId);
  const held = readCookie(request, sessionCookie(id));
  const session = editorSecret(env) ? await verifySession(editorSecret(env), id, held) : null;
  if (session) Object.assign(authority, {pairEpoch: session.epoch, pairSessionHash: await digest(held)});
  return Object.freeze({source: 'page', id, address, authority, scopes: ANONYMOUS.scopes});
}

async function pageAdmission(env, page, rotationRetry) {
  if (!Object.keys(page.authority).length) return {admitted: false};
  const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(page.address)).fetch(new Request('https://rapier.internal/page', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({authority: page.authority, ...(rotationRetry ? {rotationRetry} : {})})}));
  return response.ok ? response.json() : {admitted: false};
}

// The session nonce and verified live-page key bind one latest rotation receipt.
// An owner-cookie page has no paired session yet; its exact page key owns that first retry.
async function pageSuccessor(env, page, editorKey) {
  const retry = await digest(editorKey + ':' + (page.authority.pairSessionHash || 'owner'));
  const admission = await pageAdmission(env, page, retry);
  if (!admission.admitted || !/^rpr_[A-Za-z0-9_-]{22}$/.test(admission.prefix || '')) return null;
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-page-rotation-v1:'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const suffix = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(admission.prefix + ':' + admission.epoch + ':' + retry)));
  return {capability: admission.prefix + base64url(suffix).slice(0, 21), epoch: admission.epoch, retry};
}

// GET /d/<id>: the Apps resource's own page at the top level. An admitted browser receives the editor key with it; any
// other browser receives the page without one, which shows its pairing code. An unknown workspace looks the same.
async function pairedPage(request, env, page) {
  const headers = {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': PAGE_CSP};
  const unavailable = () => new Response('The editor is unavailable.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}});
  if (!env.ASSETS?.fetch || !env.DOCUMENTS?.get || !editorSecret(env)) return unavailable();
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/rapier-app.html', request.url)));
    if (!response.ok) return unavailable();
    let html = await readTextBody(response, MAX_UI_BYTES, 'editor page', 'UI_RESOURCE_TOO_LARGE');
    const versions = [...html.matchAll(/<meta\s+name="rapier-version"\s+content="([^"]+)"\s*\/?\s*>/gi)];
    if (versions.length !== 1 || versions[0][1] !== VERSION) return unavailable();
    html = html.replace(/(<link\b[^>]*\bhref=)(["'])(icon-(?:192|512)\.png)\2/gi, (_, prefix, quote, name) => prefix + quote + '/' + name + quote);
    const admitted = (await pageAdmission(env, page)).admitted === true;
    const fileOrigins = (env.FILE_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(value => configuredOrigin(value, 'FILE_DOWNLOAD_ORIGINS'));
    html = pageFlags(html, {id: page.id, editorKey: admitted ? await mintEditorKey(editorSecret(env), Date.now(), {workspace: page.address, connection: page.authority.ownerKey || ''}) : '', fileOrigins});
    if (!html) return unavailable();
    return new Response(request.method === 'HEAD' ? null : html, {headers});
  } catch { return unavailable(); }
}

// Only a fresh public start spends address admission. A held browser can poll or decide even when that budget is full.
async function takePairingStart(request, env) {
  if (!env.BUDGET?.get || !env.BUDGET?.idFromName) return false;
  try {
    const key = 'pairing-start:' + await digest(request.headers.get('CF-Connecting-IP') || 'unknown');
    const response = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({limit: DOOR_LIMITS.pairingStartsPerMinute, windowMs: DOOR_LIMITS.minuteMs}),
    }));
    return response.ok && (await response.json()).allowed === true;
  } catch { return false; }
}

// Agent confirmation only makes the page's decision available. The pending cookie is not editor authority;
// only this page's explicit ALLOW consumes the confirmed row and mints a workspace-scoped session.
async function pairStatus(request, env, page, args, cookies) {
  if (!plain(args) || args.document !== page.id) return toolError(failure('INVALID_DOCUMENT', 'The page names its own workspace.'));
  if (Object.keys(args).some(key => !['document', 'decision'].includes(key)) ||
      args.decision !== undefined && !['allow', 'cancel'].includes(args.decision)) return toolError(failure('INVALID_DOCUMENT_INPUT', 'Choose allow or cancel for this pairing.'));
  if (!editorSecret(env)) return toolError(failure('EDITOR_KEY_UNCONFIGURED', 'This deployment cannot pair a browser.'));
  const ask = async body => (await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(page.address)).fetch(new Request('https://rapier.internal/pair', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}))).json();
  const held = readCookie(request, pendingCookie(page.id));
  if (/^[A-Za-z0-9_-]{43}$/.test(held || '')) {
    const status = await ask({action: args.decision || 'status', secretHash: await digest(held)});
    if (status.status === 'absent') return toolError(failure('DOCUMENT_UNAVAILABLE', 'This workspace is unknown, deleted or expired.'));
    if (status.status === 'waiting') return envelope({outcome: 'waiting', paired: false, pairingCode: status.code, codeExpiresAt: new Date(status.expiresAt).toISOString()});
    if (status.status === 'confirmation_required') return envelope({outcome: 'confirmation_required', paired: false});
    if (status.status === 'cancelled') {
      cookies.push(setCookie(page.id, pendingCookie(page.id), '', 0));
      return envelope({outcome: 'cancelled', paired: false});
    }
    if (status.status === 'paired') {
      cookies.push(setCookie(page.id, sessionCookie(page.id), await mintSession(editorSecret(env), page.id, status.epoch), PAIR_SESSION_MS / 1000), setCookie(page.id, pendingCookie(page.id), '', 0));
      return envelope({outcome: 'paired', paired: true});
    }
  }
  if (args.decision) return envelope({outcome: 'refused', reason: 'pairing_not_ready', paired: false});
  if (!await takePairingStart(request, env)) return envelope({outcome: 'refused', reason: 'busy', paired: false});
  const secret = newSecret(), started = await ask({action: 'start', secretHash: await digest(secret), codes: [newCode(), newCode(), newCode(), newCode()]});
  if (started.status === 'absent') return toolError(failure('DOCUMENT_UNAVAILABLE', 'This workspace is unknown, deleted or expired.'));
  if (!started.code) return envelope({outcome: 'refused', reason: 'busy', paired: false});
  cookies.push(setCookie(page.id, pendingCookie(page.id), secret, Math.ceil(PAIR_CODE_MS * 3 / 1000)));
  return envelope({outcome: 'waiting', paired: false, pairingCode: started.code, codeExpiresAt: new Date(started.expiresAt).toISOString()});
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
    this.exportWaiter = null;
    this.editorWaiter = null;
    this.retention = bounded(env.RETENTION_DAYS, 30, 1, 365) * DAY;
    this.maxStateBytes = bounded(env.MAX_STATE_MIB, 48, 8, 64) * 1024 * 1024;
  }

  exclusive(operation) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {});
    return task;
  }

  readParts(prefix, count) {
    if (count === undefined) throw failure('WORKSPACE_UNAVAILABLE', 'This workspace representation is unavailable. Open a fresh workspace from an exported copy.');
    if (!Number.isSafeInteger(count) || count < 1 || count > Math.ceil(this.maxStateBytes / CHUNK_CHARS)) throw failure('CORRUPT_WORKSPACE', 'The stored workspace is incomplete.');
    const chunks = [];
    for (let index = 0; index < count; index++) {
      const chunk = this.ctx.storage.kv.get(prefix + index);
      if (typeof chunk !== 'string') throw failure('CORRUPT_WORKSPACE', 'The stored workspace is incomplete.');
      chunks.push(chunk);
    }
    return chunks.join('');
  }

  readState(head) {
    if (this.cachedState) return this.cachedState;
    this.cachedState = { ...JSON.parse(this.readParts('state:', head.parts)), ...JSON.parse(this.readParts('human:', head.contextParts)) };
    return this.cachedState;
  }

  // The invocation journal is a kernel closure Map: retained in chunks and reseeded on every operate().
  readJournal() {
    if (this.cachedJournal) return this.cachedJournal;
    this.cachedJournal = JSON.parse(this.readParts('journal:', this.ctx.storage.kv.get('head')?.journalParts));
    return this.cachedJournal;
  }

  async persist(head, state, journal, contextOnly = false, exported = null) {
    const admittedUntil = head.expiresAt;
    const assertUnexpired = () => {
      if (admittedUntil !== undefined && admittedUntil <= Date.now()) throw failure('DOCUMENT_UNAVAILABLE', 'This workspace expired before the operation could commit.');
    };
    assertUnexpired();
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
      // Not gated by contextOnly: invocation receipts include retained reads and spent mutation identities.
      if (Array.isArray(journal)) {
        journalText = JSON.stringify(journal);
        head.journalBytes = contentBytes(journalText);
      }
      if (!Number.isSafeInteger(head.stateBytes) || head.stateBytes + head.contextBytes + (head.journalBytes || 0) + head.exportBytes + contentBytes(JSON.stringify(head.exports || [])) > this.maxStateBytes) throw failure('WORKSPACE_STATE_LIMIT', 'This would exceed the workspace size. Open the alternative as a separate workspace or let temporary exports expire.', { limitBytes: this.maxStateBytes });
    }
    const expiresAt = Date.now() + this.retention;
    const renew = !(head.expiresAt > expiresAt - 60000);
    if (!state && !renew && !expired.length && !exported) return;
    // Source and its expiry alarm commit together; a lost acknowledgement must not retain an unscheduled workspace.
    if (renew) head.expiresAt = expiresAt;
    const records = [
      {prefix: 'state:', field: 'parts', text},
      {prefix: 'human:', field: 'contextParts', text: human},
      {prefix: 'journal:', field: 'journalParts', text: journalText},
    ].filter(row => row.text !== undefined).map(row => ({...row, previous: head[row.field] || 0}));
    for (const row of records) head[row.field] = Math.ceil(row.text.length / CHUNK_CHARS);
    // SQLite limits a key and value together to 2 MB; leave room for the key and serialization.
    if (contentBytes(JSON.stringify(head)) > 2_000_000 - 1024) throw failure('WORKSPACE_STATE_LIMIT', 'The workspace metadata is full. Let temporary exports expire before creating another.', {limitBytes: this.maxStateBytes});
    await this.ctx.storage.transaction(async () => {
      assertUnexpired();
      for (const row of expired) for (let index = 0; index < row.parts; index++) this.ctx.storage.kv.delete('export:' + row.id + ':' + index);
      if (exported) for (let index = 0; index < exported.grant.parts; index++) {
        this.ctx.storage.kv.put('export:' + exported.grant.id + ':' + index, exported.bytes.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS));
      }
      for (const row of records) {
        for (let index = 0; index < head[row.field]; index++) {
          const key = row.prefix + index, chunk = row.text.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS);
          if (this.ctx.storage.kv.get(key) !== chunk) this.ctx.storage.kv.put(key, chunk);
        }
        for (let index = head[row.field]; index < row.previous; index++) this.ctx.storage.kv.delete(row.prefix + index);
      }
      this.ctx.storage.kv.put('head', head);
      if (renew) await this.ctx.storage.setAlarm(head.expiresAt);
    });
    await this.ctx.storage.sync();
    if (state) this.cachedState = state;
    if (journalText !== undefined) this.cachedJournal = journal;
  }

  describe(state, head, version, collaboration) {
    const expiries = [collaboration.nextExpiryAt, head.viewIntent?.status === 'pending' && head.viewIntent.kind !== 'mode' ? head.viewIntent.expiresAt : null, head.editorIntent?.expiresAt].filter(value => Number.isFinite(value) && value > 0);
    return { ...head, documentId: state.documentId, revision: state.revision, filename: state.filename, docKind: state.docKind, chars: state.text.length, version, collaboration: collaborationSummary(collaboration), collaborationContext: collaborationContext(collaboration), nextExpiryAt: expiries.length ? Math.min(...expiries) : null };
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/return' && ['GET', 'POST'].includes(request.method)) return this.exclusive(() => this.acceptReturn(request));
    if (path === '/export' && ['GET', 'HEAD'].includes(request.method)) return this.exclusive(() => this.readExport(request));
    if (path === '/pair' && request.method === 'POST') return this.exclusive(() => this.pairing(request));
    if (path === '/page' && request.method === 'POST') return this.exclusive(async () => {
      const head = this.ctx.storage.kv.get('head'), body = await request.json().catch(() => null);
      const replaying = body?.rotationRetry && this.replaysPageRotation(head, body.authority, body.rotationRetry);
      const admitted = !!head && head.expiresAt > Date.now() && plain(body?.authority) && (this.admits(head, body.authority) || replaying);
      return json(admitted ? { admitted, prefix: head.prefix, epoch: replaying ? head.rotation.pageEpoch : head.pairEpoch || 0 } : { admitted });
    });
    try {
      if (request.method !== 'POST' || path !== '/operation') return new Response(null, { status: 404 });
      const input = await request.json();
      // The paired editor names no reference: the workspace admits the browser, then the call acts as the workspace's own.
      if (plain(input) && plain(input.page)) {
        const head = this.ctx.storage.kv.get('head');
        const replaying = input.operation === ROTATE && this.replaysPageRotation(head, input.page, input.page.rotationRetry);
        if (!head || head.expiresAt <= Date.now() || !this.admits(head, input.page) && !replaying ||
            input.operation === ROTATE && input.page.rotationEpoch !== (replaying ? head.rotation.pageEpoch : head.pairEpoch || 0))
          return json(toolError(failure('PAIRING_REQUIRED', 'This browser is not paired with this workspace. Open its editor link and give the assistant the code the page shows.')));
        Object.assign(input, { capabilityHash: replaying ? head.rotation.predecessorHash : head.capabilityHash, ownerKey: head.ownerKey,
          ...(input.operation === ROTATE ? {pageRetry: input.page.rotationRetry, ...(input.page.pairSessionHash ? {pageSessionHash: input.page.pairSessionHash} : {})} : {}) });
      }
      if (!plain(input) || !/^[a-f0-9]{64}$/.test(input.ownerKey || '') || !/^[a-f0-9]{64}$/.test(input.capabilityHash || '') || typeof input.operation !== 'string' || !plain(input.args) || (input.prefix !== undefined && !/^rpr_[A-Za-z0-9_-]{22}$/.test(input.prefix)) || (input.rotateToHash !== undefined && !/^[a-f0-9]{64}$/.test(input.rotateToHash)) || (input.operationId !== undefined && (typeof input.operationId !== 'string' || !input.operationId.length || input.operationId.length > 256 || [...input.operationId].length > 128)) || (input.returnAddress !== undefined && !/^[a-f0-9]{64}$/.test(input.returnAddress)) || (input.exportAddress !== undefined && !/^[a-f0-9]{64}$/.test(input.exportAddress))) return new Response(null, { status: 400 });
      if (input.create === true && (!plain(input.createBudget) || !/^take_[a-f0-9]{32}$/.test(input.createBudget.takeId || '') || !/^[a-f0-9]{64}$/.test(input.createBudget.principalKey || '') || typeof input.createBudget.retryable !== 'boolean')) return new Response(null, { status: 400 });
      // Mint once per incoming call, before any observation continuation can re-enter operate().
      input.operationId ??= crypto.randomUUID();
      if (input.operation === 'document.wait_for_user') return await this.waitForReturn(input, request.signal);
      if (input.operation === 'document.inspect_visual') return await this.inspectVisual(input, request.signal);
      if (input.operation === 'document.export' && ['docx', 'pdf'].includes(input.args.format)) return await this.exportDocument(input, request.signal);
      if (EDITOR_REQUEST_TOOLS.has(input.operation)) return await this.requestEditor(input, request.signal);
      return await this.exclusive(async () => {
        const result = await this.operate(input, undefined, undefined, undefined, request.signal);
        if (input.editorAuthorized === true && input.editorActivity === true && !result.isError && ['document.commit', 'document.human_context'].includes(input.operation)) {
          const head = this.ctx.storage.kv.get('head');
          if (head && head.expiresAt > Date.now()) {
            head.editorIssuedAt = Date.now();
            this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
            await this.ctx.storage.sync();
            result._meta = {...result._meta, rapier: {...result._meta?.rapier, editorIssuedAt: head.editorIssuedAt}};
          }
        }
        return json(result);
      });
    } catch (error) {
      this.cachedState = null;
      this.cachedJournal = null;
      // These two kernel input verdicts are fixed public values, never arbitrary exception text.
      const inputVerdict = error instanceof TypeError && ['filename_invalid', 'document_kind_invalid'].includes(error.message);
      return json(toolError(inputVerdict ? failure('INVALID_DOCUMENT_INPUT', error.message) : error));
    }
  }

  // A browser reaches this workspace as its connected owner, or through a pairing of the current epoch.
  admits(head, authority) {
    return !head.bearer && typeof authority.ownerKey === 'string' && authority.ownerKey === head.ownerKey
      || Number.isSafeInteger(authority.pairEpoch) && authority.pairEpoch === (head.pairEpoch || 0);
  }

  replaysPageRotation(head, authority, retry) {
    const rotation = head?.rotation;
    if (!plain(authority) || typeof retry !== 'string' || rotation?.pageRetry !== retry ||
        rotation.pageEpoch + 1 !== head.pairEpoch) return false;
    return rotation.pageSessionHash
      ? authority.pairSessionHash === rotation.pageSessionHash && authority.pairEpoch === rotation.pageEpoch
      : !head.bearer && authority.ownerKey === head.ownerKey && authority.pairEpoch === undefined;
  }

  // Pending pairings live in the head: a code for a minute, then two minutes for the page to decide after the agent
  // names it. Polling never grants a session. A decision spends only that browser's row, without renewing the document.
  async pairing(request) {
    try {
      const body = await request.json(), now = Date.now();
      const head = structuredClone(this.ctx.storage.kv.get('head'));
      if (!head || head.expiresAt <= now) return json({ status: 'absent' });
      if (!plain(body) || !/^[a-f0-9]{64}$/.test(body.secretHash || '')) return new Response(null, { status: 400 });
      const live = (head.pairings || []).filter(row => row.confirmedAt ? row.confirmedAt + 2 * PAIR_CODE_MS > now : row.expiresAt > now);
      const save = async () => {
        head.pairings = live;
        this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
        await this.ctx.storage.sync();
      };
      if (['status', 'allow', 'cancel'].includes(body.action)) {
        const row = live.find(entry => entry.secretHash === body.secretHash);
        if (!row) { await save(); return json({ status: 'expired' }); }
        if (body.action === 'status') return json(row.confirmedAt
          ? {status: 'confirmation_required'} : {status: 'waiting', code: row.code, expiresAt: row.expiresAt});
        if (body.action === 'allow' && !row.confirmedAt) return json({status: 'not_ready'});
        live.splice(live.indexOf(row), 1);
        await save();
        return json(body.action === 'allow' ? {status: 'paired', epoch: head.pairEpoch || 0} : {status: 'cancelled'});
      }
      if (body.action !== 'start' || !Array.isArray(body.codes)) return new Response(null, { status: 400 });
      if (live.length >= MAX_PAIRINGS) return json({status: 'busy'});
      const code = body.codes.find(value => PAIR_CODE.test(value) && !live.some(entry => entry.code === value));
      if (!code) return json({ status: 'busy' });
      live.push({ code, secretHash: body.secretHash, expiresAt: now + PAIR_CODE_MS });
      await save();
      return json({ status: 'waiting', code, expiresAt: now + PAIR_CODE_MS });
    } catch { return new Response(null, { status: 503 }); }
  }

  async readExport(request) {
    const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Referrer-Policy': 'no-referrer'};
    try {
      const head = this.ctx.storage.kv.get('head'), byHash = request.headers.get('X-Rapier-Export-Hash');
      // An anonymous workspace's link is its own grant; a connected workspace's link needs its owner.
      if (head && (byHash ? !head.bearer : head.bearer || head.ownerKey !== request.headers.get('X-Rapier-Owner'))) return new Response(null, {status: 404, headers});
      if (!head || head.expiresAt <= Date.now()) return new Response(null, {status: 410, headers});
      const row = head.exports?.find(row => byHash ? row.hash === byHash : row.id === request.headers.get('X-Rapier-Export-ID'));
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
      const head = structuredClone(this.ctx.storage.kv.get('head')), byHash = request.headers.get('X-Rapier-Return-Hash');
      if (head && (byHash ? !head.bearer : head.bearer || head.ownerKey !== request.headers.get('X-Rapier-Owner'))) return returnRefused('This return address is unknown.', 404);
      if (!head || head.expiresAt <= Date.now()) return returnRefused('This return session has expired or was deleted.', 410);
      const grant = head.returns?.find(row => byHash ? row.hash === byHash : row.id === request.headers.get('X-Rapier-Return-ID'));
      if (!grant) return returnRefused('This return address is unknown.', 404);
      if (grant.receivedAt) return returnRefused('This document was already sent back. The first copy is retained.', 409);
      if (grant.expiresAt <= Date.now() || grant.owner !== head.capabilityHash) return returnRefused('This return address has expired.', 410);
      if (request.method === 'GET') return returnReply({ready: true});
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
      if (error?.[PUBLIC_FAILURE] && error.code === 'RETURN_TOO_LARGE') return returnRefused(error.message, 413);
      if (error instanceof TypeError) return returnRefused('The document is not valid UTF-8 text.', 400);
      return returnRefused('The return receipt could not be confirmed. Ask the agent whether it arrived.', 503);
    } finally {
      // An early owner/grant refusal must stop the forwarded upload before the DO response ends its lifetime.
      if (request.body && !request.bodyUsed) await request.body.cancel().catch(() => {});
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
      if (!head || head.ownerKey !== input.ownerKey || head.capabilityHash !== input.capabilityHash || head.agentAccess === false || head.expiresAt <= Date.now()) return refused('return_unavailable');
      const key = resolveCaller({ actor: 'agent', principal: 'remote:' + input.capabilityHash, requestId: input.operationId }, { transport: 'mcp' }).invocationKey;
      if (this.readJournal().some(row => row.key === key || row.spent?.some(([heldKey]) => heldKey === key))) return { value: null };
      if (this.returnWaiter) return refused('wait_already_pending');
      if (mode === 'selection' && input.args.after_return_id !== undefined) return refused('return_cursor_needs_message_mode');
      const received = receivedReturns(head), after = input.args.after_return_id;
      if (after && !received.some(row => row.id === after)) return refused('return_unavailable');
      const latest = received.at(-1);
      if (mode === 'message' && latest && latest.id !== after) return { value: { outcome: 'ok', returned: returnMetadata(latest) } };
      const waiter = createRequestWait({signal, timeoutMs: waitTimeout(input.args.timeout_ms),
        onFinish: settled => { if (this.returnWaiter === settled) this.returnWaiter = null; }});
      waiter.mode = mode;
      waiter.capabilityHash = input.capabilityHash;
      waiter.operationId = input.operationId;
      waiter.caller = {...resolveCaller({actor: 'agent', principal: 'remote:' + input.capabilityHash,
        requestId: input.operationId}, {transport: 'mcp'}), agent: input.args.agent};
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

  inspectVisual(input, signal) { return this.requestSurface(input, signal, 'visual'); }
  exportDocument(input, signal) { return this.requestSurface(input, signal, 'export'); }

  // A request the editor answers waits outside the document's commit queue so the editor can acknowledge it. Only the small
  // request is durable until the checked answer is published with its receipt; observation pixels and file bytes exist for this response alone.
  async requestSurface(input, signal, kind) {
    const exporting = kind === 'export', slot = exporting ? 'exportWaiter' : 'visualWaiter', intentKey = kind + 'Intent';
    const expired = exporting ? 'export_expired' : 'visual_capture_expired';
    if (signal?.aborted) return new Response(null, {status: 499});
    const started = await this.exclusive(async () => {
      if (signal?.aborted) return {abandoned: true};
      const result = await this.operate(input);
      const pending = result.structuredContent?.pending;
      if (!exporting && result.structuredContent?.outcome === 'ok' && result.structuredContent?.representation === 'visual') return {result: envelope({outcome: 'refused', reason: expired, representation: 'visual'})};
      if (result.structuredContent?.outcome !== 'pending' || pending?.kind !== 'surface-fact' || pending.requirements?.kind !== kind) return {result};
      // A retry observes its original request, including the interval after the
      // answer arrives and before its terminal journal write. It cannot replace it.
      if (this[slot]?.id === pending.requestId && this[slot].capabilityHash === input.capabilityHash) return {result};
      const request = pending.requirements;
      const refuse = reason => ({...request, outcome: 'refused', reason});
      const resume = fact => this.operate(input, undefined, {requestId: pending.requestId, fact});
      if (result.structuredContent.replayed) return {result: await resume(refuse(expired))};
      if (signal?.aborted) return {result: await resume(refuse('cancelled'))};
      if (this[slot]) return {result: await resume(refuse(exporting ? 'export_busy' : 'visual_capture_busy'))};
      if (!result.structuredContent.collaboration?.presence?.active) return {result: await resume(refuse(exporting ? 'editor_unavailable' : 'editor_not_present'))};
      const timeoutMs = exporting ? EXPORT_LEASE_MS : VIEW_LEASE_MS;
      const wait = createRequestWait({signal, timeoutMs});
      const capture = {wait, id: pending.requestId, request, capabilityHash: input.capabilityHash,
        operationId: input.operationId,
        caller: {...resolveCaller({actor: 'agent', principal: 'remote:' + input.capabilityHash,
          requestId: input.operationId}, {transport: 'mcp'}), agent: input.args.agent}};
      this[slot] = capture;
      try {
        const head = structuredClone(this.ctx.storage.kv.get('head'));
        head[intentKey] = {id: capture.id, ...request, status: 'pending', expiresAt: Date.now() + timeoutMs};
        head.version++;
        this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
        await this.ctx.storage.sync();
      } catch (error) {
        wait.finish(refuse(exporting ? 'export_unavailable' : 'visual_render_unavailable'));
        // A lost acknowledgment can leave the intent committed. If storage is
        // still unavailable, the next authorized operation retires the orphan.
        try { await this.retireSurfaceIntent(kind, capture.id); } catch {}
        if (this[slot] === capture) this[slot] = null;
        throw error;
      }
      return {capture};
    });
    if (started.abandoned) return new Response(null, {status: 499});
    if (started.result) return json(started.result);
    const {capture} = started;
    const settled = await capture.wait.promise;
    const fact = settled.kind === 'value' ? settled.value : {...capture.request, outcome: 'refused', reason: settled.kind === 'aborted' ? 'cancelled' : expired};
    return this.exclusive(async () => {
      try {
        await this.retireSurfaceIntent(kind, capture.id);
        return json(await this.operate(input, undefined, {requestId: capture.id, fact}));
      } finally {
        if (this[slot] === capture) this[slot] = null;
      }
    });
  }

  // Called only under the document's serial owner. A stale completion cannot
  // retire a successor's intent, and the version invalidates editor sync caches.
  async retireSurfaceIntent(kind, id, head = this.ctx.storage.kv.get('head')) {
    const key = kind + 'Intent';
    if (!head?.[key] || head[key].id !== id) return head;
    const next = {...head, [key]: null, version: head.version + 1};
    this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', next));
    await this.ctx.storage.sync();
    return next;
  }

  // Wait only for the first editor receipt. A gesture card remains durable until
  // its own signed completion; it does not hold the document's operation queue.
  async requestEditor(input, signal) {
    if (signal?.aborted) return new Response(null, {status: 499});
    const started = await this.exclusive(async () => {
      if (signal?.aborted) return {abandoned: true};
      const result = await this.operate(input, undefined, undefined, undefined, signal), pending = result.structuredContent?.pending;
      if (result.structuredContent?.outcome !== 'pending' || pending?.kind !== 'surface-fact' || pending.requirements?.kind !== 'editor') return {result};
      if (this.editorWaiter?.id === pending.requestId && this.editorWaiter.capabilityHash === input.capabilityHash) return {result};
      const request = pending.requirements;
      const refuse = reason => ({kind: 'editor', documentId: request.documentId, revision: request.revision,
        operation: request.operation, receipt: {id: request.id, status: 'unavailable', reason}});
      const resume = fact => this.operate(input, undefined, undefined, {requestId: pending.requestId, fact});
      const head = structuredClone(this.ctx.storage.kv.get('head'));
      const received = head.editorReceipts?.find(row => row.receipt.id === pending.requestId);
      if (received) return {result: await resume(returnedEditorFact(received))};
      if (result.structuredContent.replayed) return {result: await resume(refuse('editor_request_expired'))};
      if (signal?.aborted) return {result: await resume(refuse('cancelled'))};
      if (head.editorIntent || this.editorWaiter) return {result: await resume(refuse('editor_request_pending'))};
      if (!result.structuredContent.collaboration?.presence?.active) return {result: await resume(refuse('editor_unavailable'))};
      const timeoutMs = VIEW_LEASE_MS;
      const wait = createRequestWait({signal, timeoutMs}), capture = {id: request.id, request, capabilityHash: input.capabilityHash, wait,
        operationId: input.operationId,
        caller: {...resolveCaller({actor: 'agent', principal: 'remote:' + input.capabilityHash,
          requestId: input.operationId}, {transport: 'mcp'}), agent: input.args.agent}};
      this.editorWaiter = capture;
      try {
        head.editorIntent = {...request, status: 'pending', expiresAt: Date.now() + timeoutMs};
        head.version++;
        this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
        await this.ctx.storage.sync();
      } catch (error) {
        wait.finish(refuse('editor_unavailable'));
        try {await this.retireEditorIntent(capture.id, undefined, 'editor_unavailable');} catch {}
        if (this.editorWaiter === capture) this.editorWaiter = null;
        throw error;
      }
      return {capture};
    });
    if (started.abandoned) return new Response(null, {status: 499});
    if (started.result) return json(started.result);
    const {capture} = started, settled = await capture.wait.promise;
    const fact = settled.kind === 'value' ? settled.value : {kind: 'editor', documentId: capture.request.documentId,
      revision: capture.request.revision, operation: capture.request.operation,
      receipt: {id: capture.id, status: 'unavailable', reason: settled.kind === 'aborted' ? 'cancelled' : 'editor_request_expired'}};
    return this.exclusive(async () => {
      try {
        if (fact.receipt.status !== 'waiting') await this.retireEditorIntent(capture.id, undefined, fact.receipt.status === 'unavailable' ? fact.receipt.reason : undefined);
        return json(await this.operate(input, undefined, undefined, {requestId: capture.id, fact}));
      } finally {
        if (this.editorWaiter === capture) this.editorWaiter = null;
      }
    });
  }

  async retireEditorIntent(id, head = this.ctx.storage.kv.get('head'), reason) {
    if (!head?.editorIntent || head.editorIntent.id !== id) return head;
    const request = head.editorIntent, next = {...head, editorIntent: null, version: head.version + 1};
    if (reason) retainEditorReceipt(next, request, {id, status: 'unavailable', reason,
      ...(request.preference ? {preference: request.preference} : {action: request.action})});
    this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', next));
    await this.ctx.storage.sync();
    return next;
  }

  async operate(input, waitResult, observation, editor, signal) {
    await prepareDoorLetters();
    const { operation, args, capabilityHash, ownerKey } = input;
    try { if (this.ctx.storage) this.ctx.storage.operation = operation; } catch {}
    let head = structuredClone(this.ctx.storage.kv.get('head'));
    // Queued page work rechecks the current epoch inside the serial operation owner.
    if (input.page) {
      const replaying = operation === ROTATE && this.replaysPageRotation(head, input.page, input.page.rotationRetry);
      if (!head || head.expiresAt <= Date.now() || !this.admits(head, input.page) && !replaying ||
          operation === ROTATE && input.page.rotationEpoch !== (replaying ? head.rotation.pageEpoch : head.pairEpoch || 0))
        return toolError(failure('PAIRING_REQUIRED', 'This browser is not paired with this workspace. Open its editor link and give the assistant the code the page shows.'));
    }
    if (head && head.ownerKey !== ownerKey) return toolError(failure('DOCUMENT_UNAVAILABLE', 'This workspace is unavailable to the connected identity.'));
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
        if (head.agentAccess === false) return toolError(failure('DOCUMENT_UNAVAILABLE', 'Agent access to this workspace is disconnected. The person can share it again from the editor.'));
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
      head = this.describe(state, { ownerKey, capabilityHash, ...(input.bearer === true ? { bearer: true } : {}), prefix: input.prefix, pairEpoch: 0, createdAt: Date.now(), receipts: [], parts: 0, viewIntent: null }, 1, collaboration);
      await this.persist(head, state, kernel.invocationJournal());
      return envelope({ outcome: 'created', created: true }, head, { snapshot: snapshot(state, collaboration) });
    }
    if (!head || head.capabilityHash !== capabilityHash) {
      if (operation === 'document.delete' && !head) return envelope({ outcome: 'deleted', deleted: true });
      // Replay of the last rotation: same receipt, nothing moves. Any other call by a retired bearer is refused.
      if (head && operation === ROTATE && head.rotation && head.rotation.predecessorHash === capabilityHash && input.rotateToHash === head.capabilityHash && (!input.page || this.replaysPageRotation(head, input.page, input.page.rotationRetry))) {
        return envelope({ outcome: 'rotated', rotated: true, replayed: true, rotations: head.rotations, rotatedAt: new Date(head.rotatedAt).toISOString() }, head);
      }
      return toolError(failure('DOCUMENT_UNAVAILABLE', 'This document capability is unknown, deleted or expired. Open a new workspace from an exported copy.'));
    }
    // A connected workspace's Disconnect is a stored decision: no agent call passes it, whatever reference it holds,
    // until the person's editor shares the workspace again (document.set_policy with agentAccess).
    if (head.agentAccess === false && input.editorAuthorized !== true) return toolError(failure('DOCUMENT_UNAVAILABLE', 'Agent access to this workspace is disconnected. The person can share it again from the editor.'));
    // Pending observations are live requests owned by their existing waiters. A fresh kernel
    // receives those callers as transient facts; none survives request settlement or a restart.
    const inFlight = [this.returnWaiter, this.visualWaiter, this.exportWaiter, this.editorWaiter].filter(row => row &&
      row.capabilityHash === capabilityHash && row.operationId !== input.operationId).map(row => row.caller);
    const principal = 'remote:' + capabilityHash;
    const actor = ['document.comment', 'document.read_context'].includes(operation) && input.humanTool === true ? 'human' : 'agent';
    const agentCaller = () => ({...resolveCaller({ actor, principal, ...(actor === 'human' ? {session: 'editor'} : {}), requestId: input.operationId }, { transport: 'mcp' }), ...(actor === 'agent' && input.hostAgent ? {hostAgent: input.hostAgent} : {})});
    if (getTool(operation) && !observation && !editor) {
      const caller = agentCaller(), journal = this.readJournal();
      // A retained receipt is read before maintenance can require another write. The key
      // is only a quick candidate check; the kernel owns caller, document, digest and expiry.
      if (journal.some(row => row.key === caller.invocationKey || row.spent?.some(([key]) => key === caller.invocationKey))) {
        const replay = createKernel({state: this.readState(head), invocationJournal: journal, inFlight, clock: Date.now, mintId}).replay(operation, args, caller);
        if (replay) return operationEnvelope(operation, replay, head);
      }
    }
    for (const kind of ['visual', 'export']) {
      const intent = head[kind + 'Intent'], capture = this[kind + 'Waiter'];
      if (intent && (!capture || capture.id !== intent.id || capture.capabilityHash !== capabilityHash ||
          intent.expiresAt <= Date.now() || intent.revision !== head.revision)) {
        if (capture?.id === intent.id) capture.wait.finish({...capture.request, outcome: 'refused',
          reason: intent.expiresAt <= Date.now() ? kind === 'export' ? 'export_expired' : 'visual_capture_expired' : 'document_changed'});
        head = await this.retireSurfaceIntent(kind, intent.id, head);
      }
    }
    const editorIntent = head.editorIntent;
    if (editorIntent && (editorIntent.expiresAt <= Date.now() || editorIntent.revision !== head.revision ||
        editorIntent.status === 'pending' && (!this.editorWaiter || this.editorWaiter.id !== editorIntent.id || this.editorWaiter.capabilityHash !== capabilityHash))) {
      const reason = editorIntent.revision !== head.revision ? 'document_changed' : 'editor_request_expired';
      if (this.editorWaiter?.id === editorIntent.id) this.editorWaiter.wait.finish({...editorIntent,
        receipt: {id: editorIntent.id, status: 'unavailable', reason}});
      head = await this.retireEditorIntent(editorIntent.id, head, reason);
    }
    if (operation === 'document.delete') {
      this.cachedState = null;
      this.cachedJournal = null;
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.sync();
      this.returnWaiter?.finish({ outcome: 'refused', reason: 'document_deleted' });
      this.visualWaiter?.wait.finish({...this.visualWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.exportWaiter?.wait.finish({...this.exportWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.editorWaiter?.wait.finish({...this.editorWaiter.request, receipt: {id: this.editorWaiter.id, status: 'unavailable', reason: 'document_changed'}});
      return envelope({ outcome: 'deleted', deleted: true, documentId: head.documentId });
    }
    if (operation === ROTATE) {
      // The bearer digest changes; nothing else does. Content, journal, controls, pending review
      // and leases are the same workspace -- only who can reach it is decided again.
      if (!input.rotateToHash) return toolError(failure('INVALID_DOCUMENT_INPUT', 'Rotation needs a successor.'));
      if (head.editorIntent) head = await this.retireEditorIntent(head.editorIntent.id, head, 'document_changed');
      // The receipt a lost response can be asked for again: the predecessor's digest, one generation.
      head.rotation = { predecessorHash: head.capabilityHash, generation: (head.rotations || 0) + 1,
        ...(input.page ? {pageRetry: input.pageRetry, pageEpoch: head.pairEpoch || 0, ...(input.pageSessionHash ? {pageSessionHash: input.pageSessionHash} : {})} : {}) };
      head.capabilityHash = input.rotateToHash;
      // An anonymous workspace's reference is its whole authority, so retiring it is the decision; a connected
      // workspace's authority is the connection, so the decision is stored. Every paired browser is unpaired.
      if (!head.bearer) { head.agentAccess = false; head.version++; }
      head.pairEpoch = (head.pairEpoch || 0) + 1;
      head.pairings = [];
      head.rotatedAt = Date.now();
      head.rotations = (head.rotations || 0) + 1;
      // No agent holds the successor yet; the editor must not show the one that held the predecessor as present.
      delete head.agentCall;
      this.ctx.storage.transactionSync(() => { this.ctx.storage.kv.put('head', head); });
      await this.ctx.storage.sync();
      this.returnWaiter?.finish({ outcome: 'refused', reason: 'document_disconnected' });
      this.visualWaiter?.wait.finish({...this.visualWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.exportWaiter?.wait.finish({...this.exportWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.editorWaiter?.wait.finish({...this.editorWaiter.request, receipt: {id: this.editorWaiter.id, status: 'unavailable', reason: 'document_changed'}});
      return envelope({ outcome: 'rotated', rotated: true, rotations: head.rotations, rotatedAt: new Date(head.rotatedAt).toISOString() }, head);
    }
    if (operation === PAIR_BROWSER) {
      const now = Date.now(), code = String(args.code || '').toUpperCase();
      // A window belongs to the workspace, not a pending browser. Drawing or cancelling a code cannot reset guesses.
      const attempts = head.pairingAttempts?.expiresAt > now ? head.pairingAttempts : {misses: 0, expiresAt: now + PAIR_CODE_MS};
      const locked = () => envelope({outcome: 'refused', reason: 'pairing_locked', paired: false, message: 'Pairing is locked for this code window. Try again after the window ends.'}, head);
      if (attempts.misses >= DOOR_LIMITS.pairingMissesPerWindow) return locked();
      const row = (head.pairings || []).find(entry => entry.code === code && !entry.confirmedAt && entry.expiresAt > now);
      if (!row) {
        head.pairingAttempts = {...attempts, misses: attempts.misses + 1};
        this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
        await this.ctx.storage.sync();
        return head.pairingAttempts.misses >= DOOR_LIMITS.pairingMissesPerWindow ? locked()
          : envelope({outcome: 'refused', reason: 'pairing_code_unknown', message: 'No browser is waiting with that code. A code works once, for one minute: ask for the code the page shows now.'}, head);
      }
      row.confirmedAt = now;
      this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
      await this.ctx.storage.sync();
      return envelope({outcome: 'confirmation_required', paired: false, message: 'The browser showing that code can now choose ALLOW or CANCEL.'}, head);
    }
    const elapsed = head.nextExpiryAt !== null && head.nextExpiryAt <= Date.now();
    if (operation === 'document.sync' && !elapsed &&
        (head.collaboration?.agentPresence?.inFlight || 0) === inFlight.length &&
        args.afterVersion === head.version && (args.afterRevision === undefined || args.afterRevision === head.revision)) {
      return envelope({ outcome: 'current', unchanged: true, ...agentReport(head) }, head);
    }
    let state = this.readState(head), collaboration;
    let viewKey = JSON.stringify(head.viewIntent);
    // resolveCaller is shared by every door (agent/door-identity.mjs). The invocation key derives from the principal and the operation's own name,
    // never the JSON-RPC id (it restarts at 1 and would hand one operation another's answer).
    const human = handle => ({ ...resolveCaller({ actor: 'human', principal, session: 'editor', requestId: handle }, { transport: 'mcp' }), serverNow: Date.now() });
    const queueView = (kind, request) => {
      const presence = kernel.collaboration().presence;
      const pointer = request.pointer;
      if (pointer?.expiresAt <= Date.now()) return {ok: false, status: 'expired', reason: 'pointer_expired'};
      if (!pointer && !presence?.active) return { ok: false, reason: 'editor_not_present' };
      if (!pointer && kind !== 'mode' && presence.editing) return { ok: false, reason: 'human_edit_in_progress' };
      if (kind === 'mode' && !presence.view) return {ok: false, reason: 'view_unavailable'};
      const prior = head.viewIntent;
      if (prior?.status === 'pending' && prior.expiresAt > Date.now() &&
          kind !== 'mode' && !(pointer && prior.pointer)) return { ok: false, reason: 'presentation_already_pending' };
      head.viewIntent = { id: crypto.randomUUID(), kind, revision: request.revision, status: 'pending', expiresAt: pointer?.expiresAt ?? Date.now() + VIEW_LEASE_MS,
        ...(pointer ? {pointer} : {}),
        ...(kind === 'mode' ? {view: request.view, fromView: presence.view} : kind === 'document' ? { start: request.start, end: request.end } : { compareId: request.compareId, changeId: request.changeId }) };
      return { pending: true, viewId: head.viewIntent.id, ...(!presence?.active ? {reason: 'editor_not_present'} : presence.editing ? {reason: 'human_edit_in_progress'} : {}) };
    };
    // Seed from the persisted journal, or a DO retry finds an empty one and acts twice.
    let exported = null;
    const kernel = createKernel({ state, inFlight, host: { proposalPage: UI_RESOURCE, exportFile: async request => {
      if (!editorSecret(this.env) || !input.exportAddress) return {reason: 'export_unavailable'};
      const file = request.file || await exportFile(this.env, request);
      exported = file.bytes && file.bytes.byteLength <= MAX_EXPORT_BYTES ? {...file, id: mintId('export_')} : file;
      return exported;
    }, markdown: analyzeMarkdown, referenceCheck: checkMarkdownReferences,
      paint: (strokes, options = {}) => paintAgentStrokes(strokes, options.seed, options.target, options),
      paintSheet: agentPaintSheetHolds, paintBrushes: agentPaintBrushRegistry, paintReplay: replayAgentPainting, paintRaster: validatePaintRaster, paintSample: sampleAgentPainting,
      setView: request => queueView('mode', request), view: () => ({current: kernel.collaboration().presence?.view || null}),
      editorContext: () => ({preferences: head.editorPreferences || null, receipts: (head.editorReceipts || []).map(row => row.receipt)}),
      // Names are disclosed by wait/read; repeating 16 maximum names can overflow context's result bound.
      returns: () => receivedReturns(head).map(row => { const { name, ...listed } = returnMetadata(row); return listed; }),
      readReturn: input => this.readReturn(head, input),
      createReturn: async () => {
        if (!input.returnAddress) return { outcome: 'refused', reason: 'return_unavailable' };
        const retained = (head.returns || []).filter(row => row.receivedAt || row.expiresAt > Date.now() && row.owner === head.capabilityHash);
        if (retained.length >= MAX_RETURNS) return { outcome: 'refused', reason: 'return_envelopes_full' };
        const grant = { id: mintId('return_'), owner: head.capabilityHash, expiresAt: Math.min(Date.now() + DAY, head.expiresAt) };
        // An anonymous workspace's return address is its own one-use grant, kept only as a digest.
        const token = 'rpret_' + input.returnAddress + '.' + (head.bearer ? base64url(crypto.getRandomValues(new Uint8Array(32))) : grant.id);
        if (head.bearer) grant.hash = await digest(token);
        head.returns = [...retained, grant];
        return { outcome: 'ok', return_url: configuredOrigin(this.env.RETURN_ORIGIN || oauthOrigin(this.env), 'RETURN_ORIGIN', true) + '/return/' + token, return_id: grant.id, return_expires_at: new Date(grant.expiresAt).toISOString(), max_bytes: MAX_TEXT_BYTES };
      },
      wait: async () => waitResult || { outcome: 'refused', reason: 'wait_unavailable' },
      save: async () => ({ ok: true }), reveal: request => queueView('document', request), revealChange: request => queueView('compare', request) }, clock: Date.now, mintId,
      // A fresh kernel consumes the returned surface observation as a checked world fact. Its ephemeral
      // continuation map belongs to one instance; retire only this read's pending receipt.
      invocationJournal: observation || editor ? this.readJournal().filter(row => row.output?.pending?.requestId !== (observation || editor).requestId) : this.readJournal() });
    // decide does not await host.structure for surface facts (structure freshness).
    const resolveStructureFact = requirements => {
      if (!requirements || !['outline', 'find'].includes(requirements.mode) || state.filename !== requirements.filename) return null;
      const value = analyzeDocument({ text: state.text, filename: state.filename, mode: requirements.mode,
        ...(requirements.mode === 'find' ? { docKind: requirements.docKind, query: requirements.query, kind: requirements.kind, within: requirements.within, offset: requirements.offset } : {}) });
      return { mode: requirements.mode, revision: state.revision, filename: state.filename,
        ...(requirements.mode === 'find' ? { query: requirements.query, kind: requirements.kind, within: requirements.within, offset: requirements.offset } : {}), value };
    };
    const refresh = (capture = true) => {
      collaboration = kernel.collaboration();
      let next = capture ? kernel.snapshot() : state;
      if (state.filename !== next.filename || state.docKind !== next.docKind) head.metadataRevision = next.revision;
      if (head.viewIntent?.pointer && ['pending', 'presented'].includes(head.viewIntent.status)) {
        const view = head.viewIntent;
        const pointer = Object.values(next.pointers).find(row => row.id === view.pointer.id);
        if (!pointer || pointer.status === 'expired' || view.expiresAt <= Date.now() || view.revision !== next.revision) {
          if (pointer && pointer.status !== 'expired') {
            kernel.pointResult({pointerId: pointer.id, status: 'expired', reason: 'document_changed'}, human(view.id));
            next = kernel.snapshot();
          }
          head.viewIntent = {...view, status: 'expired', reason: pointer?.reason || 'pointer_expired', pointer: {...view.pointer, status: 'expired'}};
          collaboration = kernel.collaboration();
        } else head.viewIntent = {...view, pointer: {...pointer}};
      } else if (head.viewIntent?.status === 'pending') {
        const view = head.viewIntent;
        if (view.kind === 'mode') head.viewIntent = {...view, revision: next.revision};
        else if (view.revision !== next.revision || (view.kind === 'compare' && view.compareId !== next.compare?.id)) head.viewIntent = { ...view, status: 'invalidated', reason: 'document_changed' };
        else if (view.expiresAt <= Date.now()) head.viewIntent = { ...view, status: 'expired', reason: 'presentation_expired' };
      }
      const nextViewKey = JSON.stringify(head.viewIntent);
      const changed = viewChanged(state, next) || nextViewKey !== viewKey ||
        (head.collaboration?.agentPresence?.inFlight || 0) !== collaboration.agentPresence.inFlight;
      head = this.describe(next, head, head.version + (changed ? 1 : 0), collaboration);
      state = next;
      viewKey = nextViewKey;
    };
    const initialVersion = head.version, initialExpiry = head.nextExpiryAt;
    // Without collaboration or a view to expire, the initial refresh only advances the
    // kernel's clock. Its final snapshot owns that clock; do not clone the whole source twice.
    refresh(elapsed || !!state.review || Object.keys(state.humanContexts).length > 0 || !!head.viewIntent);
    if (elapsed || head.version !== initialVersion || (initialExpiry !== null && initialExpiry <= Date.now())) await this.persist(head, state, kernel.invocationJournal());
    const current = () => ({...snapshot(state, collaboration, head.viewIntent, head.visualIntent, head.exportIntent, head.editorIntent), ...(head.bearer ? {} : {agentAccess: head.agentAccess !== false})});
    if (operation === 'document.export_ack') {
      const capture = this.exportWaiter;
      if (!capture || capture.id !== args.exportId || capture.capabilityHash !== capabilityHash) return toolError(failure('EXPORT_UNAVAILABLE', 'This export is no longer pending.'), head);
      if (args.expectedRevision !== state.revision || capture.request.revision !== state.revision) {
        capture.wait.finish({...capture.request, outcome: 'refused', reason: 'document_changed'});
        return toolError(failure('REVISION_CONFLICT', 'The document changed before the export arrived.'), head);
      }
      if (args.fact.documentId !== capture.request.documentId || args.fact.revision !== capture.request.revision || args.fact.format !== capture.request.format)
        return envelope({outcome: 'refused', reason: 'export_target_changed'}, head);
      const file = admitExportArtifact(capture.request, args.fact);
      if (args.fact.outcome === 'ok' && !file.bytes) return envelope({outcome: 'refused', reason: file.reason,
        ...(file.limitBytes ? {limitBytes: file.limitBytes} : {}), ...(file.byteLength ? {bytes: file.byteLength} : {})}, head);
      if (!capture.wait.finish(args.fact)) return toolError(failure('EXPORT_UNAVAILABLE', 'This export is no longer pending.'), head);
      return envelope({outcome: 'ok', exportId: args.exportId}, head);
    }
    if (operation === 'document.editor_ack') {
      const active = head.editorIntent?.id === args.editorId ? head.editorIntent : null;
      const prior = head.editorReceipts?.find(row => row.receipt.id === args.editorId);
      const request = active || prior?.request;
      if (!request) return envelope(editorFailure('editor_request_unavailable'), head);
      const acknowledge = (row, replayed = false) => {
        // A committed receipt survives a lost storage acknowledgment. Its retry
        // must release the original waiter as well as return the retained result.
        if (this.editorWaiter?.id === args.editorId && this.editorWaiter.capabilityHash === capabilityHash)
          this.editorWaiter.wait.finish(returnedEditorFact(row));
        return envelope({outcome: 'ok', editorId: args.editorId, receipt: row.receipt, ...(replayed ? {replayed: true} : {})}, head);
      };
      const verdict = editorResult(request, args.fact);
      if (verdict.receipt?.id !== args.editorId) return envelope(verdict, head);
      const receipt = verdict.receipt;
      if (!active) {
        if (prior?.receipt.status === 'applied' && receipt.status === 'applied' &&
            receipt.value === prior.receipt.value && receipt.previous === prior.receipt.previous) {
          if (receipt.superseded !== true || JSON.stringify(receipt) === JSON.stringify(prior.receipt))
            return acknowledge(prior, true);
          retainEditorReceipt(head, request, receipt);
          if (head.editorPreferences) head.editorPreferences = {...head.editorPreferences, [receipt.preference]: receipt.current};
          head.version++;
          await this.persist(head, state, kernel.invocationJournal());
          return acknowledge(head.editorReceipts.find(row => row.receipt.id === args.editorId));
        }
        if (JSON.stringify(receipt) === JSON.stringify(prior?.receipt)) return acknowledge(prior, true);
        return envelope(editorFailure('editor_request_unavailable'), head);
      }
      if (args.expectedRevision !== state.revision || active.revision !== state.revision) return envelope(editorFailure('document_changed'), head);
      if (prior && JSON.stringify(receipt) === JSON.stringify(prior.receipt)) return acknowledge(prior, true);
      if (active.status === 'waiting' && !['done', 'declined', 'unavailable'].includes(receipt.status)) return envelope(editorFailure('editor_receipt_invalid'), head);
      retainEditorReceipt(head, request, receipt);
      if (receipt.status === 'applied' && head.editorPreferences) head.editorPreferences = {...head.editorPreferences, [receipt.preference]: receipt.value};
      head.editorIntent = receipt.status === 'waiting' ? {...active, status: 'waiting', expiresAt: Date.now() + EDITOR_LIMITS.cardMs} : null;
      head.version++;
      await this.persist(head, state, kernel.invocationJournal());
      return acknowledge(head.editorReceipts.find(row => row.receipt.id === args.editorId));
    }
    if (operation === 'document.visual_ack') {
      const capture = this.visualWaiter;
      if (!capture || capture.id !== args.visualId || capture.capabilityHash !== capabilityHash) return toolError(failure('VISUAL_UNAVAILABLE', 'This visual observation is no longer pending.'), head);
      if (args.expectedRevision !== state.revision || capture.request.revision !== state.revision) {
        capture.wait.finish({...capture.request, outcome: 'refused', reason: 'document_changed'});
        return toolError(failure('REVISION_CONFLICT', 'The document changed before the observation arrived.'), head);
      }
      if (!sameVisualDrawing(capture.request.drawing, kernel.drawingContext())) {
        capture.wait.finish({...capture.request, outcome: 'refused', reason: 'visual_target_changed'});
        return envelope({outcome: 'refused', reason: 'visual_target_changed', representation: 'visual'}, head);
      }
      const verdict = visualResult(capture.request, args.fact);
      if (args.fact.outcome === 'ok' && verdict.outcome !== 'ok') return envelope(verdict, head);
      if (!capture.wait.finish(args.fact)) return toolError(failure('VISUAL_UNAVAILABLE', 'This visual observation is no longer pending.'), head);
      return envelope({outcome: 'ok', visualId: args.visualId}, head);
    }
    if (operation === 'rapier.open' || operation === 'document.sync') {
      // A read-only sync does not slide expiry.
      if (operation === 'rapier.open') await this.persist(head);
      return envelope({ outcome: 'current', unchanged: false, ...(operation === 'document.sync' ? agentReport(head) : {}) }, head, { snapshot: current() });
    }
    if (operation === 'document.human_context') {
      const priorVersion = head.version;
      const value = kernel.humanContext(args, human(args.contextId));
      const view = head.viewIntent;
      if (value.acknowledged && args.visible && args.view && view?.kind === 'mode' && view.status === 'pending' && args.view !== view.fromView) {
        head.viewIntent = {...view, status: args.view === view.view ? 'presented' : 'refused',
          ...(args.view === view.view ? {} : {reason: 'human_view_changed'})};
      }
      if (value.outcome === 'ok' && value.acknowledged === true && args.visible && args.editor) {
        const preferences = editorPreferences(args.editor.preferences);
        if (preferences && JSON.stringify(preferences) !== JSON.stringify(head.editorPreferences)) {
          head.editorPreferences = preferences;
          head.version++;
        }
      }
      refresh();
      await this.persist(head, state, kernel.invocationJournal(), head.version === priorVersion);
      if (value.outcome === 'ok' && args.visible && args.selection && this.returnWaiter?.mode === 'selection') this.returnWaiter.finish({ outcome: 'ok', selection: args.selection });
      return envelope({ ...value, contextId: args.contextId, contextExpiresAt: value.expiresAt ?? null, ...(value.outcome === 'conflict' ? { code: 'HUMAN_CONTEXT_STALE' } : {}) }, head);
    }
    if (operation === 'document.view_ack') {
      const view = head.viewIntent;
      if (!view || view.id !== args.viewId) return toolError(failure('VIEW_UNAVAILABLE', 'This presentation request is no longer current.'), head);
      if (!['presented', 'refused', 'expired'].includes(args.status) || args.status === 'expired' && !view.pointer) return toolError(failure('INVALID_VIEW_ACK', 'This presentation acknowledgment is not supported.'), head);
      if (view.pointer && args.status === 'expired') {
        const value = kernel.pointResult({pointerId: view.pointer.id, status: 'expired', reason: args.reason || 'dismissed'}, human(args.viewId));
        head.viewIntent = {...view, status: 'expired', reason: args.reason || 'dismissed', pointer: {...view.pointer, status: 'expired'}};
        refresh();
        await this.persist(head, state, kernel.invocationJournal());
        return envelope({...value, outcome: 'ok', viewId: view.id, presented: false}, head);
      }
      if (view.status !== 'pending') {
        if (view.status === args.status && (view.reason || '') === (args.reason || '')) return envelope({ outcome: 'ok', replayed: true, viewId: view.id }, head);
        return toolError(failure('VIEW_UNAVAILABLE', 'This presentation request has already settled or expired.'), head);
      }
      if (args.expectedRevision !== state.revision || view.revision !== state.revision || (view.kind === 'compare' && (view.compareId !== state.compare?.id || !state.compare.changes.some(row => row.id === view.changeId)))) return toolError(failure('REVISION_CONFLICT', 'The target changed before presentation was acknowledged.'), head, { snapshot: current() });
      head.viewIntent = { ...view, status: args.status, ...(args.reason ? { reason: args.reason } : {}) };
      if (view.pointer) kernel.pointResult({pointerId: view.pointer.id,
        status: args.status === 'presented' ? 'shown' : 'expired', ...(args.reason ? {reason: args.reason} : {})}, human(args.viewId));
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
      if (operation === 'document.set_policy') {
        if (args.agentAccess !== undefined && head.bearer) return toolError(failure('INVALID_DECISION', 'An anonymous workspace is shared by its document value, not by a stored decision.'), head, { snapshot: current() });
        value = args.agentAccess !== undefined && args.posture === undefined && args.readOnly === undefined ? {outcome: 'ok'}
          : kernel.setPolicy({ expectedRevision: args.expectedRevision, ...(args.posture !== undefined ? { posture: args.posture } : {}), ...(args.readOnly !== undefined ? { readOnly: args.readOnly } : {}) }, human(args.decisionId));
        if (value.outcome === 'ok' && args.agentAccess !== undefined && (head.agentAccess !== false) !== args.agentAccess) { head.agentAccess = args.agentAccess; head.version++; }
      }
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
      const who = human(args.commitId), client = row => row.actor + ':' + row.principal + ':' + row.requestId;
      const hash = await digest(JSON.stringify({ expectedRevision: args.expectedRevision, text: args.text, splices: args.splices ?? null, filename: args.filename ?? null, docKind: args.docKind ?? null }));
      const receipt = head.receipts.find(entry => entry.id === args.commitId);
      if (receipt) {
        if (receipt.hash !== hash) return toolError(failure('COMMIT_ID_REUSED', 'This commitId already identifies different content. Keep an identifier stable only for an identical retry.'), head, { snapshot: current() });
        await this.persist(head);
        const draftEdits = state.commitResults?.find(row => row.id === receipt.id)?.edits || [];
        const text = replay(args.text, draftEdits);
        const accepted = {...(head.version === receipt.version ? current() : { documentId: head.documentId, revision: receipt.revision, text, filename: receipt.filename, docKind: receipt.docKind }), draftEdits, draftClient: client(who)};
        const acceptedHead = { ...head, revision: receipt.revision, version: receipt.version, filename: receipt.filename, docKind: receipt.docKind, chars: text.length };
        return envelope({ outcome: 'committed', replayed: true, commitId: receipt.id, acceptedRevision: receipt.revision, acceptedVersion: receipt.version, currentRevision: head.revision, currentVersion: head.version }, acceptedHead, { snapshot: accepted, ...(head.version !== receipt.version ? { currentSnapshot: current() } : {}) });
      }
      if (state.journal.some(row => row.actor === 'human' && row.requestId === args.commitId))
        return toolError(failure('COMMIT_RECEIPT_EXPIRED', 'This draft was already committed, but its exact receipt is no longer retained.'), head, { snapshot: current() });
      if (state.readOnly) return toolError(failure('DOCUMENT_READ_ONLY', 'The current workspace policy is read-only. Your draft was not applied.'), head, { snapshot: current() });
      const filename = args.filename ?? state.filename, docKind = args.docKind ?? state.docKind;
      if ((filename !== state.filename || docKind !== state.docKind) && (head.metadataRevision || 0) > args.expectedRevision)
        return toolError(failure('DOCUMENT_METADATA_CHANGED', 'The document name or kind changed while this draft was being edited.'), head, { snapshot: current() });
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
      return envelope({ outcome: 'committed', commitId: args.commitId, acceptedRevision: state.revision, acceptedVersion: head.version }, head, { snapshot: {...current(), draftEdits, draftClient: client(who)} });
    }
    if (!getTool(operation)) return toolError(failure('UNKNOWN_TOOL', 'Unknown operation.'));
    const documentId = head.documentId;
    // WORKER_PRESENCE: unknown is not absent. Surface-fact continuations keep the incoming call's key.
    // The verified editor mode is part of the invocation identity. The same
    // operation_id cannot replay an agent's handles or review as a human call.
    let value = await kernel.invoke(operation, args, { ...agentCaller(), signal, world: { presence: WORKER_PRESENCE, ...(observation ? {[operation === 'document.export' ? 'export' : 'visual']: observation.fact} : {}), ...(editor ? {editor: editor.fact} : {}) } });
    // pending is a complete outcome: each pass invokes again with continues set, never a wait inside the kernel.
    for (let guard = 0; guard < 4 && value.outcome === 'pending' && value.pending?.kind === 'surface-fact'; guard++) {
      const fact = resolveStructureFact(value.pending.requirements);
      if (!fact) break;
      value = await kernel.invoke(operation, args, { ...agentCaller(), signal, continues: value.pending.requestId, world: { presence: WORKER_PRESENCE, structure: fact } });
    }
    refresh();
    if (state.documentId !== documentId) return toolError(failure('DOCUMENT_IDENTITY_CHANGED', 'This operation cannot replace the remote workspace identity.'));
    if (actor === 'agent' && !value.replayed) head.agentCall = { id: input.operationId, at: Date.now(), operation, ...(operation === 'document.find' && typeof args.kind === 'string' ? { kind: args.kind.slice(0, 24) } : {}) };
    let download = null, publication = null;
    const exportId = value.exportId;
    if (['document.export', 'document.propose'].includes(operation) && value.outcome === 'ok') {
      let grant = head.exports?.find(row => row.id === value.exportId);
      if (exported?.id) {
        grant = await createExportGrant(exported, capabilityHash, input.exportAddress, this.env, head.bearer);
        head.exports = [...head.exports || [], grant];
        publication = {grant, bytes: exported.bytes};
      }
      if (!grant || grant.owner !== capabilityHash || grant.expiresAt <= Date.now()) value = {...value, outcome: 'refused', reason: 'export_expired'};
      else {
        // An anonymous workspace's link is a grant derived again from the deployment key; a connected one's names the file.
        const token = !input.exportAddress ? null : !head.bearer ? exportHandle(input.exportAddress, grant)
          : editorSecret(this.env) ? await exportToken(input.exportAddress, grant, this.env) : null;
        if (!token || head.bearer && await digest(token) !== grant.hash) value = {...value, outcome: 'refused', reason: 'export_unavailable'};
        else {
          download = {type: 'resource_link', uri: input.exportOrigin + '/export/' + token, name: grant.name, mimeType: grant.mimeType, size: grant.bytes};
          value = {...value, filename: grant.name, mimeType: grant.mimeType, bytes: grant.bytes, exportExpiresAt: new Date(grant.expiresAt).toISOString(),
            ...(operation === 'document.propose' ? {page: download.uri} : {})};
        }
      }
    }
    if (download) value = {...value, hostedDownload: download};
    if (!value.replayed) {
      const journal = kernel.invocationJournal();
      if (exportId) {
        const caller = agentCaller(), owner = JSON.stringify([caller.transport, caller.actor, caller.principal]);
        const record = journal.find(row => row.key === caller.invocationKey && row.owner === owner && row.documentId === documentId && row.operation === operation && row.output?.exportId === exportId);
        if (!record) throw failure('WORKSPACE_UNAVAILABLE', 'The exported result was not retained. Retry with the same operation identity.');
        // Publication and its original delivery receipt commit together. A retry returns
        // this link without renewing it; the download owner still decides availability.
        record.output = structuredClone(value);
      }
      await this.persist(head, state, journal, false, publication);
    }
    const result = operationEnvelope(operation, value, head);
    if (operation === 'document.inspect_visual' && value.outcome === 'ok' && observation?.fact?.image) result.content.push({type: 'image', mimeType: 'image/png', data: observation.fact.image.data});
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
