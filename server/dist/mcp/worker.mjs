import {parseJsonStream, parseJsonChunks, JSON_STRING_LIMIT, jsonStringExceedsBytes} from './incremental-json.mjs';
import {jsonBodyInit, jsonResponse} from './json-transport.mjs';
import {jsonRecord} from './json-record.mjs';
import {transposeAuthored, authoredPlacement, authoredHistory, authoredBasis} from '../kit/ledger/transport.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {agentActorId} from '../kit/ledger/format.mjs';
import {_rapierValidAuthored, _rapierValidMetadata, _rapierValidMetadataEffect, _rapierMetadataDelta, _rapierTransformMetadata,
  _rapierReplayMetadata, _rapierHasHistoryEffect} from '../kit/ledger/journal-records.mjs';
import { createKernel, createState, canonicalJson, serializeJson, admissibleText, minimalSplice, transformSplices, waitTimeout, exportFilename, exportFidelity, admitExportArtifact, showTarget, LIMITS, HINTS } from '../agent/kernel.mjs';
import {fencedBlocks} from '../agent/text-surface.mjs';
import {prepareDoorLetters} from './letters.mjs';
import {inputErrorResult, modelReply, parseReply} from '../agent/page-result.mjs';
import {normalizeLabel, encodeBase64, svgDataPrefix} from '../images/assets.mjs';
import { sourceEdits, mergeSource, replay } from '../kernel/live-merge.mjs';
import { paintAgentStrokes, agentPaintSheetHolds, agentPaintBrushRegistry, agentStrokesFault, replayAgentPainting, sampleAgentPainting, validatePaintRaster } from '../draw/agent-paint.mjs';
import { VERSION } from '../version.mjs';
import { mcpServer, CURRENT_DOOR } from '../tools/discovery.mjs';
import { INSTRUCTIONS, GUIDE_RESOURCES, guideResource, guideResult, PROMPTS, promptResult } from '../agent/guide.mjs';
import { RETURN_ORIGIN } from '../skills/rapier-html/return-address.mjs';
import { wrap, carry, portableNeeds } from '../skills/rapier-html/wrap.mjs';
import { parseFlowchart } from '../spec/flowchart.mjs';
import { HOST_TOOLS, TOOLS, HUMAN_OPERATIONS, ICONS, MAX_TEXT_BYTES, MAX_EXPORT_BYTES, MAX_FILENAME_CHARS, UI_RESOURCE, getTool, getHumanOperation, inputGuide, mcpDescriptors, publishedSchema, validateInput } from '../agent/catalog.mjs';
import { analyzeDocument } from '../agent/structure.mjs';
import { analyzeMarkdown, checkMarkdownReferences } from '../agent/markdown-server.mjs';
import { resolveCaller, validateOrigin, WORKER_PRESENCE, sealForEditor, fromBase64url } from '../agent/door-identity.mjs';
import { mintEditorKey, verifyEditorKey, mintEditorTicket, verifyEditorTicket, editorSecretUsable, classifyEditorSecret, editorSecretKeyMaterial, EDITOR_KEY_LIFETIME_MS, CLIENT_SESSION_PATTERN, mintClientSession, clientSessionApps } from './editor-keys.mjs';
import { visualResult, sameVisualDrawing, DRAWING_PREVIEW_CHARS, DRAWING_PREVIEW_TOTAL_CHARS } from '../agent/visual.mjs';
import {editorResult, editorFailure, editorPreferences, EDITOR_LIMITS, EDITOR_TOOL_ACTIONS} from '../agent/editor.mjs';
import { createRequestWait, createRequestLifetime, responsiveJson, REQUEST_CANCELLED } from './request-lifetime.mjs';
import {TaskLifetime, TASK_EXTENSION, TASK_TTL_MS} from './task-lifetime.mjs';
import { exportRenderer } from './export-port.mjs';
import {handleOAuth, oauthChallenge, oauthForbidden, oauthOrigin, HOUSE_STYLE, validGrantReference, oauthGrantCurrent} from './oauth.mjs';
import {changeSignal, validWait, waitInObject} from './waited-read.mjs';
import {oauthStoreRequest} from './oauth-store.mjs';
import {GrantVerdicts, watchGrant, tellRevoked} from './grant-watch.mjs';
import { PAIRED_PATH, PAIRED_PREVIEW, PAIR_CODE, PAIR_CODE_MS, MAX_PAIRINGS, PAIR_SESSION_MS, PAGE_CSP, sessionCookie, pendingCookie, readCookie, setCookies, newCode, newSecret, mintSession, verifySession, pageFlags, pageFlagText } from './paired.mjs';
import {DOOR_LIMITS} from './limits.mjs';
import {WritePace, PACED_OPERATIONS, PACE_WORDS} from './write-pace.mjs';
import {LiveSessions, LIVE_PROTOCOL, LIVE_LIMITS} from './live-session.mjs';
import {createCommitFence} from '../agent/commit-fence.mjs';
import {viewChanged} from './custody-wire.mjs';
import {PageRelay} from './page-relay.mjs';
import {queuedConflict} from './page-queue.mjs';
import {PRIVATE_LIVE_PROTOCOL, PRIVATE_LIVE_LIMITS, privateSecret} from '../kernel/live-private-wire.mjs';
import {MATERIAL_LIMITS, materialDescription, materialMatches, admitMaterialResult} from '../agent/material.mjs';
import {handlePublishedPages} from './publish.mjs';

export const PROTOCOL_VERSION = '2025-11-25';
export const MODERN_PROTOCOL_VERSION = '2026-07-28';
export const PROTOCOL_VERSIONS = Object.freeze([MODERN_PROTOCOL_VERSION, PROTOCOL_VERSION]);
const LEGACY_VERSIONS = Object.freeze([PROTOCOL_VERSION, '2025-06-18', '2025-03-26']);
const DOORS = new Set(['/mcp', '/muse', '/editor']);
const META_VERSION = 'io.modelcontextprotocol/protocolVersion', META_CLIENT = 'io.modelcontextprotocol/clientCapabilities', META_SERVER = 'io.modelcontextprotocol/serverInfo';
const UNSUPPORTED_VERSION = -32022, HEADER_MISMATCH = -32020;
export { UI_RESOURCE, INSTRUCTIONS };
const UI_MIME = 'text/html;profile=mcp-app';
export const DESCRIPTORS = Object.freeze(mcpDescriptors({ uiResource: UI_RESOURCE }));
const SERVER_DESCRIPTORS = Object.freeze(mcpDescriptors({uiResource: UI_RESOURCE, auth: 'server-bearer'}));
const TOOL_BY_NAME = new Map([...DESCRIPTORS, ...mcpDescriptors({editor: true}), ...HUMAN_OPERATIONS.map(entry => ({...entry, inputSchema: {...entry.inputSchema, properties: {document: {type: 'string'}, ...entry.inputSchema.properties}, required: ['document', ...(entry.inputSchema.required || [])]}, annotations: {readOnlyHint: entry.effect === 'read'}}))].map(tool => [tool.name, tool]));
const EDITOR_ONLY_TOOLS = new Set(HOST_TOOLS.filter(tool => tool.visibility?.includes('app')).map(tool => tool.name));
const EDITOR_REQUEST_TOOLS = new Set(['editor.set_view', 'editor.set_preferences', ...Object.keys(EDITOR_TOOL_ACTIONS)]);
const MUSE_WAIT_MS = 14000;
const museDescriptor = tool => { const {ui, ...meta} = tool._meta || {}; return {...tool, _meta: meta}; };
const published = tool => ({...tool, inputSchema: publishedSchema(tool.inputSchema)});
const MUSE_DESCRIPTORS = Object.freeze(mcpDescriptors({auth: 'oauth'}).filter(tool => !EDITOR_ONLY_TOOLS.has(tool.name)).map(museDescriptor).map(published));
const PAIR_BROWSER = 'editor.pair', PAIR_STATUS = 'document.pair_status';
const MUSE_EXPORT_TEXT_CHARS = 60000;
const ANONYMOUS = Object.freeze({source: 'anonymous', scopes: Object.freeze(['rapier:read', 'rapier:write'])});
const remotePrincipal = input => 'remote:' + input.capabilityHash + (input.connectionKey ? ':connection:' + input.connectionKey : input.access ? ':access:' + input.access.principalId : '');
const editorSecret = env => (editorSecretUsable(env.EDITOR_KEY_SECRET) ? env.EDITOR_KEY_SECRET : '');
export function deployment(env, {authentication = env.ACCESS_PROFILE === true ? 'access' : 'oauth'} = {}) {
  if (!['oauth', 'server-bearer', 'access'].includes(authentication)) throw new TypeError('Unknown deployment authentication profile');
  const missing = [], invalid = [];
  if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) missing.push('DOCUMENTS');
  if (!env.ASSETS?.fetch) missing.push('ASSETS');
  if (authentication === 'oauth' && (!env.OAUTH_KV?.get || !env.OAUTH_KV?.put)) missing.push('OAUTH_KV');
  const development = env.ALLOW_UNMETERED_CREATE === 'true';
  const budget = !!(env.BUDGET?.get && env.BUDGET?.idFromName);
  if (!budget && !development) missing.push('BUDGET');
  const secret = classifyEditorSecret(env.EDITOR_KEY_SECRET);
  if (authentication !== 'access' && !secret.usable) (secret.reason === 'malformed' ? invalid : missing).push('EDITOR_KEY_SECRET');
  if (authentication === 'access' && (env.ACCESS_PROFILE !== true || typeof env.accessCurrent !== 'function' || typeof env.accessLease !== 'function' || typeof env.accessRefreshNeeded !== 'function')) missing.push('CLOUDFLARE_ACCESS');
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
const RETURN_CAPABILITY = /^rpret_([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/;
const EXPORT_CAPABILITY = /^rpexp_([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/;
const BEARER_RETURN_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Rapier-Name' };
const MAX_RETURNS = 16;
const returnReply = (value, status = 200) => json(value, status);
const returnRefused = (reason, status) => returnReply({ accepted: false, reason }, status);
const receivedReturns = head => (head.returns || []).filter(row => row.receivedAt).sort((a, b) => a.sequence - b.sequence);
const returnMetadata = row => ({ return_id: row.id, name: row.name, receivedAt: row.receivedAt, bytes: row.bytes, chars: row.chars });
const CHUNK_CHARS = 32768;
const WORKSPACE_STATE_FORMAT = 'rapier-workspace/2';
const MAX_RECEIPTS = 64;
const MAX_UI_BYTES = 16 * 1024 * 1024;
export const MAX_RPC_BODY_BYTES = MAX_TEXT_BYTES * 3 + 1024 * 1024;
const VIEW_LEASE_MS = 15000;
const HUMAN_MESSAGE_CHARS = 1500;
const HUMAN_MESSAGE_KEEP = 5;
const ASK_KEPT_MS = 10 * 60 * 1000;

function admitHumanReferent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const revision = Number(value.revision);
  const raw = value.target;
  if (!Number.isSafeInteger(revision) || revision < 0) return { target: null, revision: 0 };
  if (raw == null) return { target: null, revision };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { target: null, revision };
  const kind = raw.kind === 'drawing' || raw.kind === 'selection' ? raw.kind : null;
  if (!kind) return { target: null, revision };
  const target = { kind };
  if (raw.blockId != null) {
    const n = Number(raw.blockId);
    target.blockId = Number.isSafeInteger(n) ? n : String(raw.blockId).slice(0, 128);
  }
  if (kind === 'selection') {
    const start = Number(raw.start), end = Number(raw.end);
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start) {
      target.start = start;
      target.end = end;
    }
    if (raw.endBlockId != null) {
      const n = Number(raw.endBlockId);
      target.endBlockId = Number.isSafeInteger(n) ? n : String(raw.endBlockId).slice(0, 128);
    }
    if (typeof raw.hold === 'string') target.hold = raw.hold.slice(0, 80);
  } else if (Array.isArray(raw.figureIds)) {
    const figureIds = raw.figureIds.map(id => String(id).slice(0, 128)).filter(Boolean).slice(0, 64);
    if (figureIds.length) target.figureIds = figureIds;
  }
  return { target, revision };
}

function humanReferentHolds(target, state) {
  if (!target || typeof target !== 'object') return false;
  if (target.kind === 'drawing') return false;
  if (target.kind !== 'selection') return false;
  if (target.blockId != null) return false;
  const start = Number(target.start), end = Number(target.end);
  const text = String(state?.text || '');
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > text.length) return false;
  if (Object.hasOwn(target, 'hold') && text.slice(start, end).slice(0, 80) !== String(target.hold || '')) return false;
  return true;
}

function resolveHumanReferent(referent, state) {
  if (!referent) return null;
  const target = referent.target && typeof referent.target === 'object' ? { ...referent.target } : null;
  const revision = Number(referent.revision);
  const out = { target, revision: Number.isSafeInteger(revision) ? revision : 0 };
  const current = Number(state?.revision);
  if (Number.isSafeInteger(revision) && Number.isSafeInteger(current) && revision !== current && !humanReferentHolds(target, state))
    out.stale = true;
  return out;
}

function deliverHumanMessage(row, state, extra = {}) {
  const referent = resolveHumanReferent(row.referent, state);
  return {
    text: String(row.text || ''),
    ...(row.truncated === true ? { truncated: true } : {}),
    ...(referent ? { referent } : {}),
    ...extra,
  };
}

const EXPORT_LEASE_MS = 90000;
const DAY = 86400000;
const REQUEST_LEASE_MS = 300000;
const MATERIAL_RETRY_WAIT_MS = 15000;
const CLOCK_SKEW_MS = 60000;
const REQUEST_SESSION = CLIENT_SESSION_PATTERN;
const TASK_HANDLE = /^rptask_[A-Za-z0-9_-]{43}$/;
const TASK_METHODS = new Set(['tasks/get', 'tasks/update', 'tasks/cancel']);
const taskTool = (name, args) => name === 'show' && args?.target === 'ask' || name === 'read' && args?.as === 'image' ||
  name === 'export' && ['pdf', 'docx'].includes(args?.format);
const taskHosting = (env, authority) => ['anonymous', 'oauth'].includes(authority.source) &&
  !!editorSecret(env) && typeof env.DOCUMENTS?.get === 'function' && typeof env.DOCUMENTS?.idFromName === 'function';
const encoder = new TextEncoder();

const instructions = INSTRUCTIONS;

const PUBLIC_FAILURE = Symbol('public failure');
const failure = (code, message, details = {}) => Object.assign(new Error(message), { code, details, [PUBLIC_FAILURE]: true });
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const assertRequestActive = authority => {
  if (Array.isArray(authority)) { for (const item of authority) assertRequestActive(item); }
  else authority?.signal?.throwIfAborted();
};
const json = jsonResponse;
const rpcError = (id, code, message, status = 200, data) => json({ jsonrpc: '2.0', ...(id == null ? {} : { id }), error: { code, message, ...(data ? { data } : {}) } }, status);
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

function holdsDrawing(text) {
  if (/<metadata id="rapier-draw"/.test(text)) return true;
  for (const match of text.matchAll(/data:image\/svg\+xml(?:;base64)?,[^\s"'<>)]{16,}/gi)) {
    if (svgDataPrefix(match[0], 16384).includes('<metadata id="rapier-draw"')) return true;
  }
  return false;
}

async function exportFile(env, { format, filename, docKind, text, base, file: supplied, signal }) {
  signal?.throwIfAborted();
  let file;
  if (supplied) file = supplied;
  else if (format === 'markdown') file = { name: exportFilename(filename, format), mimeType: docKind === 'markdown' ? 'text/markdown' : 'text/plain', bytes: encoder.encode(text) };
  else if (format === 'html') {
    try {
      const response = await env.ASSETS?.fetch?.(new Request('https://rapier.internal/rapier.html', {signal}));
      if (!response?.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('Content-Type') || '')) return { reason: 'export_page_unavailable' };
      const page = await readTextBody(response, MAX_EXPORT_BYTES, 'export page', 'EXPORT_PAGE_TOO_LARGE', false, signal);
      const carries = docKind === 'markdown' ? [...(holdsDrawing(text) ? ['drawing'] : []),
        ...portableNeeds(text, {base: typeof base === 'string' ? base : base?.text, flowchart: fence => parseFlowchart(fence).ok === true})] : [];
      const carried = carry(page, carries), options = base ? {base} : {};
      let bytes = encoder.encode(wrap(carried, text, filename, options));
      if (bytes.byteLength > MAX_EXPORT_BYTES) bytes = encoder.encode(wrap(carried, text, filename, {...options, readable: ''}));
      file = { name: exportFilename(filename, format), mimeType: 'text/html', bytes, fidelity: {...exportFidelity(format, docKind), carries} };
    } catch (error) {
      return error?.code === 'EXPORT_PAGE_TOO_LARGE' ? { reason: 'export_too_large', limitBytes: MAX_EXPORT_BYTES } : { reason: 'export_page_unavailable' };
    }
  } else if (format === 'txt') {
    const renderer = env.EXPORT_RENDERER || exportRenderer();
    if (!renderer) return { reason: 'export_render_unavailable' };
    try {
      const rendered = await renderer.renderText(text, { filename, docKind });
      file = { name: exportFilename(filename, format), mimeType: 'text/plain',
        bytes: encoder.encode(rendered.text), ...(rendered.fidelity ? { fidelity: rendered.fidelity } : {}) };
    } catch (error) { return { reason: error?.code === 'export_render_limit' ? 'export_render_limit' : 'export_render_unavailable' }; }
  } else return { reason: 'export_format_invalid' };
  signal?.throwIfAborted();
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
async function createExportGrant(file, owner, address, env, bearer = false, authority = null) {
  const grant = {id: file.id || mintId('export_'), owner, name: file.name, mimeType: file.mimeType,
    bytes: file.bytes.byteLength, parts: Math.ceil(file.bytes.byteLength / CHUNK_CHARS), expiresAt: Date.now() + DAY,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', file.bytes)), byte => byte.toString(16).padStart(2, '0')).join('')};
  if (bearer || address && editorSecret(env)) grant.hash = await digest(await exportToken(address, grant, env));
  if (!bearer && authority && Object.keys(authority).length) grant.authority = authority;
  return grant;
}
function newCapability() {
  return 'rpr_' + base64url(crypto.getRandomValues(new Uint8Array(32))).slice(0, 43);
}
const ADDRESS_CHARS = 'rpr_'.length + 22;
const workspaceAddress = (handle, ownerKey) => digest(ownerKey + ':' + handle.slice(0, ADDRESS_CHARS));
const anonymousOwner = handle => digest('bearer:' + handle.slice(0, ADDRESS_CHARS));
async function linkCapability(head, env) {
  if (env.ACCESS_PROFILE === true) return head.prefix +
    base64url(Uint8Array.from((await digest('access-owner-link:' + head.ownerKey + ':' + head.capabilityHash)).match(/../g), byte => parseInt(byte, 16))).slice(0, 21);
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-owner-link:'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(head.ownerKey + ':' + head.capabilityHash)));
  return head.prefix + base64url(tag).slice(0, 21);
}
async function resolveOwnerLink(env, address, authority, capabilityHash) {
  const ownerKey = await digest(authority.ownerId), connectionKey = authority.source === 'oauth' ? await digest(authority.connectionId) : undefined;
  const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(address)).fetch(new Request('https://rapier.internal/owner-link', {method: 'POST',
    body: JSON.stringify({ownerKey, connectionKey, oauthGrant: authority.grant, capabilityHash, ...(authority.access ? {access: authority.access} : {})})}));
  return response.ok ? response.json() : null;
}

const pageId = address => 'ws_' + base64url(Uint8Array.from(address.match(/../g), pair => parseInt(pair, 16)));
const pageAddress = id => Array.from(fromBase64url(id.slice('ws_'.length)), byte => byte.toString(16).padStart(2, '0')).join('');
async function rotatedCapability(capability, env) {
  if (env.ACCESS_PROFILE === true) return capability.slice(0, ADDRESS_CHARS) +
    base64url(Uint8Array.from((await digest('access-rotation:' + capability)).match(/../g), byte => parseInt(byte, 16))).slice(0, 21);
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-rotation-v1:'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(capability)));
  return capability.slice(0, ADDRESS_CHARS) + base64url(mac).slice(0, 43 - 22);
}
const ROTATE = 'document.rotate_capability';

const CREATE_TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
function createTokenRefusal(token) {
  if (!CREATE_TOKEN.test(token)) return 'createToken must be 1 to 128 URL-safe characters (A-Z a-z 0-9 _ -).';
  return null;
}
function secretTokenRefusal(token) {
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(token)) return 'Without a connection, a createToken must be 22 to 128 URL-safe characters (A-Z a-z 0-9 _ -) that you generated at random.';
  if (new Set(token).size < 8) return 'Generate createToken at random: this one has too few distinct characters to keep the workspace private.';
  return null;
}
async function tokenCapability(token, env, ownerNamespace) {
  const payload = encoder.encode(ownerNamespace ? 'rapier-create:' + ownerNamespace + ':' + token : 'rapier-create-v2:' + token);
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
async function takeIdOf(capability) {
  return 'take_' + (await digest(String(capability ?? '').slice(0, ADDRESS_CHARS))).slice(0, 32);
}
const mintId = prefix => prefix + crypto.randomUUID().replaceAll('-', '');

function snapshot(state, collaboration, viewIntent, visualIntent, exportIntent, editorIntent) {
  const compare = state.compare ? { id: state.compare.id, revision: state.compare.revision, baseline: state.compare.baseline, incoming: state.compare.incoming, name: state.compare.name, ...(state.compare.turnId ? {turnId: state.compare.turnId} : {}), changes: state.compare.changes.map(({ id, start, end, incomingStart, incomingEnd, removed, inserted }) => ({ id, start, end, incomingStart, incomingEnd, removed, inserted })) } : null;
  if (collaboration?.drawingIntent?.drawingPatch) {
    const {drawingPatch, ...drawingIntent} = collaboration.drawingIntent;
    collaboration = {...collaboration, drawingIntent};
  }
  return { documentId: state.documentId, revision: state.revision, text: state.text, filename: state.filename, docKind: state.docKind, journal: state.journal, historyComplete: state.history.complete === true, compare, collaboration, viewIntent: viewIntent || null, ...(visualIntent ? {visualIntent} : {}), ...(exportIntent ? {exportIntent} : {}), ...(editorIntent ? {editorIntent} : {}) };
}

function workspaceMetadata(state, start = null) {
  const head = {filename: state?.filename, docKind: state?.docKind};
  if (!_rapierValidMetadata(head) || !Array.isArray(state?.journal) || typeof state.text !== 'string' ||
      !Number.isSafeInteger(state.revision) || state.revision < 0) throw failure('CORRUPT_WORKSPACE', 'The stored document history is invalid.');
  let source = state.text, revision = state.revision;
  for (let index = state.journal.length - 1; index >= 0; index--) {
    const row = state.journal[index];
    if (!row || row.revision !== revision || row.revision < 1 || row.baseRevision !== revision - 1 ||
        !row.author || row.author.kind !== row.actor || typeof row.author.id !== 'string' || !row.author.id ||
        !(row.createdAt === null || Number.isSafeInteger(row.createdAt) && row.createdAt >= 0))
      throw failure('CORRUPT_WORKSPACE', 'The stored canonical act is incomplete.');
    source = transformSplices(source, row.splices, true);
    if (source === null) throw failure('CORRUPT_WORKSPACE', 'The stored document source does not replay.');
    revision = row.baseRevision;
  }
  if (start === null) {
    start = {...head};
    for (let index = state.journal.length - 1; start && index >= 0; index--)
      start = _rapierTransformMetadata(start, state.journal[index].metadata, true);
  }
  const records = state.journal.map(row => ({splices: row.splices, ...(Object.hasOwn(row, 'authored') ? {authored: row.authored} : {}), ...(row.metadata ? {metadata: row.metadata} : {}), transaction: row}));
  try { if (records.some(row => Object.hasOwn(row, 'authored'))) authoredHistory(source, records); }
  catch (_) { throw failure('CORRUPT_WORKSPACE', 'The stored authored placement does not replay.'); }
  const replayed = start && _rapierReplayMetadata(start, records);
  if (!replayed || canonicalJson(replayed) !== canonicalJson(head)) throw failure('CORRUPT_WORKSPACE', 'The stored document metadata does not replay.');
  return {start, head};
}

function requireWorkspaceFormat(head) {
  if (head?.stateFormat !== WORKSPACE_STATE_FORMAT)
    throw failure('UNSUPPORTED_WORKSPACE_FORMAT', 'This workspace uses an unsupported history format. Open a new workspace from an exported copy.');
}

export function readWorkspaceState(head, envelope) {
  requireWorkspaceFormat(head);
  if (!plain(envelope) || envelope.format !== WORKSPACE_STATE_FORMAT)
    throw failure('UNSUPPORTED_WORKSPACE_FORMAT', 'The stored workspace uses an unsupported history format.');
  if (!plain(envelope.state) || !_rapierValidMetadata(envelope.metadata?.start) || !_rapierValidMetadata(envelope.metadata?.head))
    throw failure('CORRUPT_WORKSPACE', 'The stored workspace metadata is incomplete.');
  const metadata = workspaceMetadata(envelope.state, envelope.metadata.start);
  if (canonicalJson(metadata.head) !== canonicalJson(envelope.metadata.head))
    throw failure('CORRUPT_WORKSPACE', 'The stored workspace metadata does not match its head.');
  return envelope.state;
}

function retainEditorReceipt(head, request, receipt) {
  const held = (head.editorReceipts || []).filter(row => row.receipt.id !== receipt.id &&
    !(receipt.status === 'applied' && row.receipt.preference === receipt.preference));
  const metadata = {kind: 'editor', id: request.id, documentId: request.documentId, revision: request.revision,
    operation: request.operation, ...(request.preference ? {preference: request.preference, value: request.value} : {action: request.action}),
    ...(request.page_id !== undefined ? {page_id: request.page_id} : {}),
    ...(request.offset !== undefined ? {offset: request.offset, limit: request.limit} : {})};
  head.editorReceipts = [...held, {request: metadata, receipt}].slice(-EDITOR_LIMITS.receipts);
}

function returnedEditorFact(row) {
  return {...row.request, receipt: row.receipt};
}

function agentReport(head) {
  const call = head?.agentCall;
  return call ? { agent: { id: call.id, ago: Math.max(0, Date.now() - call.at), operation: call.operation, ...(call.kind ? { kind: call.kind } : {}), ...(call.name ? { name: call.name } : {}) } } : {};
}


function pairingReport(head) {
  const now = Date.now(), live = (head.pairings || []).filter(row => row.confirmedAt ? row.confirmedAt + 2 * PAIR_CODE_MS > now : row.expiresAt > now);
  const confirmed = live.find(row => row.confirmedAt);
  if (confirmed) return !head.bearer && !confirmed.ownerApprovedAt
    ? {status: 'owner_approval_required', next: 'The person approves at owner_approval_url, then chooses ALLOW; their typing reaches you only after that.'}
    : {status: 'awaiting_allow', next: 'The person chooses ALLOW on the page; their typing stays in their browser until then.'};
  if (head.pairedAt) return head.collaboration?.presence?.active && head.collaboration.presence.expiresAt > now
    ? {status: 'paired', page: 'reporting', pairedAt: new Date(head.pairedAt).toISOString()}
    : {status: 'paired', page: 'silent', pairedAt: new Date(head.pairedAt).toISOString(),
      next: 'The paired page is not reporting: it is closed, in the background or stalled, and unsent typing stays in that browser. Ask the person to bring the page to the front.'};
  if (live.length) return {status: 'code_shown', next: 'A browser shows a code; ask for it and send show {target:"pair", code}.'};
  return {status: 'none'};
}

function drawingTurn(value) {
  return value ? Object.fromEntries(['id', 'transactionId', 'documentId', 'revision', 'status', 'presentation', 'occurrence', 'reference', 'reason']
    .filter(field => value[field] !== undefined).map(field => [field, value[field]])) : null;
}

function materialWait(value, editorUrl, named = true) {
  const seconds = MATERIAL_LIMITS.lifetimeMs / 1000;
  const retry = named ? 'retry this exact call with the same operation_id'
    : 'read the document (this call had no operation_id, so retrying it would paint again; when the painting is in the text it is done)';
  const pairing = value.pairing?.status, then = '; then ' + retry + ' within ' + seconds + ' seconds. After that it expires and nothing is drawn.';
  return {...(editorUrl ? {editor_url: editorUrl} : {}), wait_ms: MATERIAL_LIMITS.lifetimeMs, next: value.collaboration?.presence?.active
    ? 'An open editor is painting this. To collect the result, ' + retry + ' within ' + seconds + ' seconds.'
    : pairing === 'code_shown' ? 'An editor is open but not paired; ask for its code and send show {target:"pair", code}' + then
    : pairing === 'awaiting_allow' || pairing === 'owner_approval_required' ? 'An editor is pairing. ' + value.pairing.next.replace(/\.$/, '') + then
    : pairing === 'paired' ? 'The paired editor is not reporting; ask the person to bring it to the front' + then
    : 'No editor is open. ' + (editorUrl ? 'The person opens editor_url (or an MCP Apps host shows the editor)' : 'An MCP Apps host shows the editor') + ' within ' + seconds +
      ' seconds to finish this paint; then ' + retry + '. After that it expires and nothing is drawn.'};
}

function materialReport(head) {
  const intent = head.materialIntent;
  if (intent?.status === 'pending' && intent.expiresAt > Date.now())
    return {status: 'waiting', expires_in_ms: intent.expiresAt - Date.now(), next: 'Waiting for a visible editor.'};
  if (intent?.status === 'refused' || head.materialEnded) {
    const ended = head.materialEnded;
    const reason = intent?.reason || ended.reason;
    const field = intent?.field || ended?.field;
    return {status: reason === 'material_request_expired' ? 'expired' : 'ended', reason,
      ...(field ? {field} : {}),
      next: 'Nothing was drawn. Reread the target, then retry with a new operation_id once an editor is open.'};
  }
  return null;
}

function collaborationSummary(value) {
  const presence = value.presence;
  return {...(value.drawingIntent ? {drawingIntent: drawingTurn(value.drawingIntent)} : {}), agentPresence: value.agentPresence,
    presence: presence ? {active: presence.active, editing: presence.editing, revision: presence.revision, expiresAt: presence.expiresAt} : null};
}

function collaborationContext(value) {
  const {agentPresence, ...context} = collaborationSummary(value);
  return context;
}


function envelope(value, head, meta = {}, { modelFacing = false, fallbackCollaboration = true } = {}) {
  if (head) meta = {...meta, editorIssuedAt: head.editorIssuedAt ?? head.createdAt,
    ...(head.fileHydration ? {fileHydration: {id: head.fileHydration.id, baseRevision: head.fileHydration.baseRevision,
      status: head.fileHydration.status === 'pending' && head.revision !== head.fileHydration.baseRevision ? 'superseded' : head.fileHydration.status}} : {})};
  const isError = value.isError || ['refused', 'invalid', 'conflict', 'yielded', 'target_gone'].includes(value.outcome);
  let collaboration = value.collaboration ?? (fallbackCollaboration ? modelFacing ? head?.collaborationContext : head?.collaboration : undefined);
  if (modelFacing && collaboration?.drawingIntent) collaboration = {...collaboration, drawingIntent: drawingTurn(collaboration.drawingIntent)};
  const result = { ...value, outcome: value.outcome || 'ok', ...(head ? { documentId: head.documentId, revision: value.revision ?? head.revision, documentRevision: value.documentRevision ?? head.revision, ...(value.replayed && value.documentRevision !== undefined ? {currentRevision: head.revision} : {}), version: head.version, filename: head.filename, docKind: head.docKind, chars: head.chars, ...(collaboration !== undefined ? {collaboration} : {}), ...(head.viewIntent ? { view: { ...value.view, id: head.viewIntent.id, kind: head.viewIntent.kind, revision: head.viewIntent.revision, status: head.viewIntent.status, ...(head.viewIntent.view ? {requested: head.viewIntent.view} : {}), ...(head.viewIntent.reason ? { reason: head.viewIntent.reason } : {}) } } : {}), expiresAt: new Date(head.expiresAt).toISOString() } : {}) };
  if (head && result.pairing === undefined) result.pairing = pairingReport(head);
  const message = typeof result.message === 'string' ? result.message : typeof result.reason === 'string' ? result.reason : `${result.outcome}${head ? `; document revision ${head.revision}` : ''}`;
  return { content: [{ type: 'text', text: message }], structuredContent: result, ...(isError ? { isError: true } : {}), ...(Object.keys(meta).length ? { _meta: { rapier: meta } } : {}) };
}

function operationEnvelope(operation, recorded, head, {notesVersions = false} = {}) {
  const {hostedDownload, drawingPatch, ...value} = recorded;
  if (['document.save', 'export'].includes(operation) && value.saved) Object.assign(value, {verified: true, destination: 'workspace', durable: true});
  const result = envelope(value, hostedDownload ? {...head, filename: hostedDownload.name} : head, drawingPatch ? {drawingPatch} : {}, {modelFacing: true, fallbackCollaboration: operation !== 'document.observe'});
  if (notesVersions && operation === 'read' && value.availability === 'available' && typeof value.note_ref === 'string') {
    if (Number.isSafeInteger(value.version) && value.version > 0) result.structuredContent.version = value.version;
    else delete result.structuredContent.version;
  }
  if (hostedDownload) result.content.push(hostedDownload);
  return result;
}

function toolError(error, head, meta) {
  if (!error?.[PUBLIC_FAILURE]) error = failure('WORKSPACE_UNAVAILABLE', 'The workspace operation was not acknowledged. Retry with the same operation identity.');
  const uncertain = ['WORKSPACE_UNAVAILABLE', 'WORKSPACE_UNACKNOWLEDGED'].includes(error.code);
  return envelope({ outcome: uncertain ? 'uncertain' : 'refused', isError: true, code: typeof error.code === 'string' ? error.code : 'WORKSPACE_ERROR', message: error.message || 'The workspace operation failed.', ...(error.details || {}) }, head, meta);
}

async function readTextBody(request, limit = MAX_RPC_BODY_BYTES, label = 'JSON request', code = 'REQUEST_TOO_LARGE', preserveBOM = false, activeSignal, received) {
  const length = request.headers.get('Content-Length');
  const reader = request.body?.getReader(), signal = activeSignal || request.signal;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: preserveBOM });
  const parts = [];
  let bytes = 0, cancelled = false;
  if (received) received.bytes = 0;
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
      if (received) received.bytes = bytes;
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

const USED_RPC_META = new Set(['io.modelcontextprotocol/protocolVersion', 'io.modelcontextprotocol/clientCapabilities',
  'io.modelcontextprotocol/clientInfo', 'rapier/editorKey', 'rapier/editorActivity', 'rapier/visual']);
const rpcProjection = path => path.length === 2 && path[0] === 'params' && path[1] === '_meta' ? USED_RPC_META : null;
const MAX_RPC_ID_BYTES = 1024;
const rpcStringLimit = path => path.length === 1 && path[0] === 'id' ||
  path.length === 2 && path[0] === 'params' && path[1] === 'requestId' ? MAX_RPC_ID_BYTES : undefined;
const oversizedRpcId = value => value === JSON_STRING_LIMIT || jsonStringExceedsBytes(value, MAX_RPC_ID_BYTES);
const readBody = (request, received) => parseJsonStream(request, {limit: MAX_RPC_BODY_BYTES, received,
  failure, projectObject: rpcProjection, stringLimit: rpcStringLimit, inlineBytes: 65536});

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const allowed = new Set([RETURN_ORIGIN, env.OAUTH_ORIGIN, ...(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)].filter(Boolean));
  const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i;
  if (loopback.test(url.host) && loopback.test(request.headers.get('Host') || url.host)) allowed.add(url.origin);
  return validateOrigin(origin, allowed);
}

const SKILLS_PAGE_SIZE = 2;
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
        const prefix = 'skill://' + skill.frontmatter?.name + '/';
        if (typeof skill.frontmatter?.name !== 'string' || !/^[a-z0-9-]+$/.test(skill.frontmatter.name) ||
            typeof skill.frontmatter.description !== 'string' || !skill.frontmatter.description.trim() || skill.uri !== prefix + 'SKILL.md' ||
            !Array.isArray(skill.resources) || !skill.resources.some(row => row.uri === skill.uri)) throw failure('SKILLS_NOT_BUILT', 'The skill manifest is incomplete.');
        for (const entry of skill.resources) {
          const content = Object.hasOwn(bundle.contents, entry.uri) ? bundle.contents[entry.uri] : null;
          if (!entry.uri.startsWith(prefix) || admitted.has(entry.uri) || content?.uri !== entry.uri || typeof content.text !== 'string' ||
              typeof content.mimeType !== 'string' || !content.mimeType || !Number.isSafeInteger(entry.size) || entry.size !== encoder.encode(content.text).byteLength ||
              !/^sha256:[a-f0-9]{64}$/.test(entry.digest)) throw failure('SKILLS_NOT_BUILT', 'The skill resource failed its package size or digest.');
          admitted.add(entry.uri);
        }
      }
      if (admitted.size !== Object.keys(bundle.contents).length) throw failure('SKILLS_NOT_BUILT', 'The skill snapshot contains undeclared resources.');
      if (!/^[a-f0-9]{64}$/.test(bundle.cursorKey || '')) throw failure('SKILLS_NOT_BUILT', 'The skill snapshot has no catalogue key.');
      return bundle;
    })();
    skillBundles.set(assets, loading);
    loading.catch(() => { if (skillBundles.get(assets) === loading) skillBundles.delete(assets); });
  }
  return skillBundles.get(assets);
}

function editorAssetBase(html, request) {
  return html.replace(/globalThis\.RAPIER_APPS_HOST\s*=\s*true;/,
    match => match + ' globalThis.RAPIER_ASSET_BASE = ' + JSON.stringify(new URL('/editor-assets/', request.url).href) + ';');
}

const uiPages = new WeakMap();
async function resource(request, env, uri) {
  if (typeof uri === 'string' && uri.startsWith('skill://')) {
    const bundle = await skillsBundle(request, env);
    if (!Object.hasOwn(bundle.contents, uri)) throw failure('RESOURCE_NOT_FOUND', 'Unknown skill resource.');
    return {contents: [bundle.contents[uri]]};
  }
  const guide = guideResource(uri, uri === 'rapier://guide/water' ? agentPaintBrushRegistry() : null);
  if (guide) return {contents: [guide]};
  if (uri !== UI_RESOURCE) throw failure('RESOURCE_NOT_FOUND', 'Unknown resource.');
  if (!env.ASSETS?.fetch) throw failure('UI_NOT_BUILT', 'Build the Rapier MCP App and bind its static assets before opening the editor.');
  const endpoint = new URL(request.url).origin;
  const domain = configuredOrigin(env.UI_ORIGIN || endpoint, 'UI_ORIGIN', true);
  const fileOrigins = [...new Set((env.FILE_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(value => configuredOrigin(value, 'FILE_DOWNLOAD_ORIGINS')))];
  const connectDomains = [...new Set([endpoint, endpoint.replace(/^http/, 'ws'), 'https://cdn.jsdelivr.net', ...fileOrigins])];
  const prepared = uiPages.get(env.ASSETS) || new Map(), preparedKey = JSON.stringify([endpoint, fileOrigins]);
  uiPages.set(env.ASSETS, prepared);
  let html = prepared.get(preparedKey);
  if (html !== undefined && env.ACCESS_PROFILE !== true && !editorSecret(env)) throw failure('INVALID_UI_CONFIGURATION', 'EDITOR_KEY_SECRET must encode 32 generated bytes as base64 or base64url before the editor can be served.');
  if (html === undefined) {
  const response = await env.ASSETS.fetch(new Request(new URL('/rapier-app.html', request.url)));
  if (!response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('Content-Type') || '')) throw failure('UI_NOT_BUILT', 'The built /rapier-app.html asset is unavailable.');
  html = await readTextBody(response, MAX_UI_BYTES, 'editor resource', 'UI_RESOURCE_TOO_LARGE');
  const versions = [...html.matchAll(/<meta\s+name="rapier-version"\s+content="([^"]+)"\s*\/?\s*>/gi)];
  if (!/globalThis\.RAPIER_APPS_HOST\s*=\s*true/.test(html) || versions.length !== 1 || versions[0][1] !== VERSION) throw failure('UI_NOT_BUILT', `The asset must be the Rapier ${VERSION} MCP App. Run node tools/build.mjs and publish the MCP App.`);
  html = html.replace(/(<link\b[^>]*\bhref=)(["'])(icon-(?:192|512)\.png)\2/gi, (_, prefix, quote, name) => prefix + quote + new URL('/' + name, endpoint).href + quote);
  if (env.ACCESS_PROFILE !== true && !editorSecret(env)) throw failure('INVALID_UI_CONFIGURATION', 'EDITOR_KEY_SECRET must encode 32 generated bytes as base64 or base64url before the editor can be served.');
  const flagged = html.replace(/globalThis\.RAPIER_APPS_HOST\s*=\s*true;/, match => match + ' globalThis.RAPIER_FILE_DOWNLOAD_ORIGINS = ' + JSON.stringify(fileOrigins) + ';');
  if (flagged === html) throw failure('UI_NOT_BUILT', 'The asset carries no RAPIER_APPS_HOST flag.');
  html = editorAssetBase(flagged, request);
  if (prepared.size >= 4) prepared.clear();
  prepared.set(preparedKey, html);
  }
  const csp = { connectDomains, resourceDomains: [endpoint] };
  return { contents: [{ uri: UI_RESOURCE, mimeType: UI_MIME, text: html, _meta: { ui: { prefersBorder: false, csp, permissions: { clipboardWrite: {} } },
    'openai/widgetDomain': domain,
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

function declaresAppsUi(params) {
  const capabilities = plain(params?.capabilities) ? params.capabilities : {};
  const ui = plain(capabilities.extensions) ? capabilities.extensions['io.modelcontextprotocol/ui'] : null;
  return !!(plain(ui) && Array.isArray(ui.mimeTypes) && ui.mimeTypes.includes(UI_MIME));
}
function clientSessionBinding(request, authority, door) {
  return [new URL(request.url).origin, door, authority.source, authority.ownerId || '', authority.connectionId || ''];
}
function listedTools(env, appsClient, authority) {
  const descriptors = authority?.source === 'server' ? SERVER_DESCRIPTORS : DESCRIPTORS;
  const listed = env.HOST_TOOLS_LISTING === 'all' || appsClient ? descriptors : descriptors.filter(tool => !EDITOR_ONLY_TOOLS.has(tool.name));
  return listed.map(published);
}

async function takeCreateBudget(env, { takeId, principalKey, anonymous }) {
  if (!env.BUDGET?.get || !env.BUDGET?.idFromName) return env.ALLOW_UNMETERED_CREATE === 'true' ? 'ok' : 'no-binding';
  const keys = anonymous === true
    ? [['create-anonymous-hour', DOOR_LIMITS.anonymousCreatesPerHour, DOOR_LIMITS.hourMs]]
    : [['create-principal:' + principalKey, DOOR_LIMITS.principalCreatesPerHour, DOOR_LIMITS.hourMs], ['deployment', DOOR_LIMITS.deploymentCreatesPerHour, DOOR_LIMITS.hourMs]];
  for (const [key, limit, windowMs] of keys) {
    let response;
    try {
      response = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit, windowMs, takeId }) }));
    } catch { return 'uncertain'; }
    if (!response.ok) return 'uncertain';
    let body;
    try { body = await parseJsonStream(response, {inlineBytes: 65536}); } catch { return 'uncertain'; }
    if (body.code === 'WORKSPACE_UNAVAILABLE') return 'uncertain';
    if (!body.allowed) return windowMs === DOOR_LIMITS.dayMs ? 'exceeded-day' : 'exceeded';
  }
  return 'ok';
}

const humanEditorCall = (name, args, editorProof) =>
  (['comments.write', 'comments.read', 'document.read'].includes(name) || name === 'comparison.present' && args.action === 'close') &&
  (Object.hasOwn(args, 'editorKey') || typeof editorProof === 'string');

async function editorProofVerdict(env, args, authority, editorProof, documentAddress) {
  const page = authority.source === 'page', proof = page ? args.editorKey : editorProof;
  if (env.ACCESS_PROFILE === true) return {ok: page && authority.access?.kind === 'browser' &&
    proof === authority.access.principalId && await env.accessCurrent(authority.access)};
  const verdict = await verifyEditorKey(editorSecret(env), proof, Date.now(), {
    workspace: documentAddress, connection: page ? authority.authority.ownerKey || '' : authority.connectionId || authority.ownerId || '',
  });
  return {...verdict, ok: verdict.ok && (page || proof === args.editorKey)};
}

async function takeToolBudget(request, env, authority, name, args, door, editorProof) {
  if (authority.source === 'page' && ![PAIR_STATUS, ROTATE].includes(name)) return null;
  const bound = !!(env.BUDGET?.get && env.BUDGET?.idFromName), limited = typeof env.MODEL_CALLS?.limit === 'function' && typeof env.EDITOR_CALLS?.limit === 'function';
  if (!bound && !limited && env.ALLOW_UNMETERED_CREATE === 'true') return null;
  const unavailable = () => ({status: 503, code: 'TOOL_BUDGET_UNAVAILABLE',
    message: 'Tool invocation admission is unavailable. Retry when the service is available.'});
  try {
    const page = authority.source === 'page', human = humanEditorCall(name, args, editorProof);
    if (human && (door === '/muse' || !page && typeof editorProof !== 'string')) return null;
    if (name === PAIR_STATUS && !page) return null;
    let editor = false, principal = (['oauth', 'server'].includes(authority.source) || env.ACCESS_PROFILE === true && ['access', 'browser'].includes(authority.source))
      ? authority.source + ':' + authority.ownerId + ':' + (authority.connectionId || '')
      : 'address:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
    if (page) {
      const retry = name === ROTATE && typeof args.editorKey === 'string'
        ? await digest(args.editorKey + ':' + (authority.authority.pairSessionHash || 'owner')) : undefined;
      const admitted = await pageAdmission(env, authority, retry);
      editor = admitted.admitted === true;
      if (editor && !admitted.bearer) principal = 'page-owner:' + admitted.ownerKey;
      if (!editor && name !== PAIR_STATUS) return null;
    }
    if (EDITOR_ONLY_TOOLS.has(name) && name !== PAIR_STATUS || human) {
      if (env.ACCESS_PROFILE !== true && !editorSecret(env) || (page ? args.document !== authority.id : !WORKSPACE_HANDLE.test(args.document || ''))) return null;
      const documentAddress = page ? authority.address : await workspaceAddress(args.document,
        authority.source === 'anonymous' ? await anonymousOwner(args.document) : await digest(authority.ownerId));
      const proofArgs = human ? {editorKey: args.editorKey ?? editorProof} : args;
      if (!(await editorProofVerdict(env, proofArgs, authority, editorProof, documentAddress)).ok) return null;
      editor = true;
    }
    return await takeVerifiedToolBudget(env, editor, principal);
  } catch { return unavailable(); }
}

async function takeVerifiedToolBudget(env, editor, principal) {
  const bound = !!(env.BUDGET?.get && env.BUDGET?.idFromName), limited = typeof env.MODEL_CALLS?.limit === 'function' && typeof env.EDITOR_CALLS?.limit === 'function';
  if (!bound && !limited && env.ALLOW_UNMETERED_CREATE === 'true') return null;
  const unavailable = () => ({status: 503, code: 'TOOL_BUDGET_UNAVAILABLE',
    message: 'Tool invocation admission is unavailable. Retry when the service is available.'});
  try {
    const key = (editor ? 'tool-editor:' : 'tool-model:') + await digest(principal);
    if (limited) {
      const {success} = await (editor ? env.EDITOR_CALLS : env.MODEL_CALLS).limit({key});
      return success === true ? null : {status: 429, code: 'TOOL_BUDGET_EXCEEDED',
        message: 'This caller has reached its tool invocation limit. Retry after the current minute window resets.',
        retryAfter: DOOR_LIMITS.minuteMs / 1000};
    }
    if (!bound) return unavailable();
    const response = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({limit: editor ? DOOR_LIMITS.editorCallsPerMinute : DOOR_LIMITS.modelCallsPerMinute,
        windowMs: DOOR_LIMITS.minuteMs}),
    }));
    if (!response.ok) return unavailable();
    const body = await parseJsonStream(response, {inlineBytes: 65536});
    if (body.code || typeof body.allowed !== 'boolean') return unavailable();
    if (body.allowed) return null;
    if (!Number.isSafeInteger(body.resetAt)) return unavailable();
    return {status: 429, code: 'TOOL_BUDGET_EXCEEDED',
      message: 'This caller has reached its tool invocation limit. Retry after the current minute window resets.',
      retryAfter: Math.max(1, Math.min(DOOR_LIMITS.minuteMs / 1000, Math.ceil((body.resetAt - Date.now()) / 1000)))};
  } catch { return unavailable(); }
}

async function initialObservation(kernel, input) {
  return kernel.invoke('open', input.args.note ? input.args : typeof input.args.agent === 'string' ? {agent: input.args.agent} : {},
    {...resolveCaller({actor: 'agent', principal: remotePrincipal(input), requestId: mintId('observation_')}, {transport: 'mcp'}),
      world: {presence: WORKER_PRESENCE}});
}

async function waitedRead(args, env, request, authority, hostAgent, door, editorProof, editorActivity, task) {
  const {wait_ms: asked, after_revision: after, operation_id: name, ...plainArgs} = args, started = Date.now();
  const wait = door === '/muse' && Number.isFinite(asked) ? Math.min(asked, MUSE_WAIT_MS) : asked;
  if (after === undefined) return toolError(failure('INVALID_DOCUMENT_INPUT', 'wait_ms needs after_revision, the revision you last read.'));
  for (let polled = false;;) {
    const result = await callTool('read', polled && name !== undefined ? {...plainArgs, operation_id: name} : plainArgs,
      env, request, authority, hostAgent, door, editorProof, editorActivity, task, !polled);
    const value = result.structuredContent, waited = Date.now() - started;
    const changed = !!(value && (value.documentRevision ?? value.revision) > after);
    const editing = value?.human?.editing === true;
    if (polled || result.isError || !value) {
      if (value && !result.isError) result.structuredContent = {...value, waited_ms: waited, changed};
      return result;
    }
    if (waited + 500 > wait || value.messagesQueued > 0 || (changed && !editing)) { polled = true; continue; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

function toolInputShape(descriptor) {
  if (!['open', 'read', 'undo'].includes(descriptor.name)) return descriptor.inputSchema;
  const {oneOf, ...shape} = descriptor.inputSchema;
  return shape;
}

async function callTool(name, args, env, request, authority, hostAgent = null, door = '/mcp', editorProof = null, editorActivity = false, task = null, peek = false, wait = null, visualObservation = null) {
  if (name === 'show' && plain(args) && args.target === undefined) args = {...args, target: showTarget(args)};
  if (name === 'read' && plain(args) && (args.wait_ms !== undefined || args.after_revision !== undefined) && authority?.source !== 'page') {
    const descriptor = TOOL_BY_NAME.get(name);
    try { validateInput(toolInputShape(descriptor), args, 'arguments', true); } catch (error) { if (error.code === 'invalid_arguments') return inputErrorResult(error); throw error; }
    if (args.as === 'image') return waitedRead({wait_ms: 0, ...args}, env, request, authority, hostAgent, door, editorProof, editorActivity, task);
    const {wait_ms: asked = 0, after_revision: after, ...plainArgs} = args;
    if (after === undefined) return toolError(failure('INVALID_DOCUMENT_INPUT', 'wait_ms needs after_revision, the revision you last read.'));
    const result = await callTool(name, plainArgs, env, request, authority, hostAgent, door, editorProof, editorActivity, task, false,
      {after, waitMs: door === '/muse' ? Math.min(asked, MUSE_WAIT_MS) : asked});
    if (!result.isError && plain(result.structuredContent) && Object.hasOwn(result.structuredContent, 'waited_ms')) {
      const {waited_ms, changed, ...value} = result.structuredContent;
      result.structuredContent = {...value, waited_ms, changed};
    }
    return result;
  }
  const descriptor = TOOL_BY_NAME.get(name);
  if (!descriptor) throw failure('UNKNOWN_TOOL', 'Unknown tool.');
  if (name === 'open' && args?.url !== undefined) {
    try {validateInput(toolInputShape(descriptor),args,'arguments',true);} catch(error) {if(error.code==='invalid_arguments') return inputErrorResult(error); throw error;}
    if (Object.keys(args).some(key => !['url', 'agent', 'operation_id'].includes(key))) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Open a document link with url alone.'));
    let url; try {url = new URL(args.url);} catch {}
    const id = url && url.origin === new URL(request.url).origin && PAIRED_PATH.exec(url.pathname)?.[1];
    if (!id || url.username || url.password || !(['oauth', 'server'].includes(authority.source) || env.ACCESS_PROFILE === true && ['access', 'browser'].includes(authority.source))) return toolError(failure('DOCUMENT_UNAVAILABLE', 'A document link requires its authorized connection. Otherwise use the private document value.'));
    const resolved = await resolveOwnerLink(env, pageAddress(id), authority);
    if (!resolved?.document) return toolError(failure('DOCUMENT_UNAVAILABLE', 'This document is unavailable to this connection.'));
    args = {document: resolved.document, ...(args.agent ? {agent: args.agent} : {}), ...(args.operation_id ? {operation_id: args.operation_id} : {})};
  }
  let rawArgs = args;
  const humanNamed = humanEditorCall(name, args, editorProof);
  if (humanNamed && (door === '/muse' || authority.source !== 'page' && typeof editorProof !== 'string')) return toolError(failure('HUMAN_AUTHORITY_REQUIRED', "This operation needs the editor's own authority."));
  const keyArgument = humanNamed ? args.editorKey ?? editorProof : undefined;
  if (humanNamed) { args = {...args}; delete args.editorKey; }
  try { args = validateInput(toolInputShape(descriptor), args, 'arguments', !EDITOR_ONLY_TOOLS.has(name)); }
  catch (error) {
    if (error.code !== 'invalid_arguments') throw error;
    return inputErrorResult(error);
  }
  if (humanNamed) args.editorKey = keyArgument;
  if (name === 'show' && args.code !== undefined && args.target !== 'pair') return toolError(failure('INVALID_DOCUMENT_INPUT', 'A browser code pairs an editor only with target:"pair": show {document, target:"pair", code}.'));
  if (name === PAIR_STATUS) return toolError(failure('PAIRING_PAGE_ONLY', 'Only the paired editor page asks for its own pairing code, on its own route.'));
  if (door === '/muse' && name === 'open' && args.file) return toolError(failure('HOST_FILE_UNAVAILABLE', 'Host file references require an embedded editor. Read the file and pass its text to open.'));
  for (const field of ['text', 'query']) if (typeof args[field] === 'string' && contentBytes(args[field]) > MAX_TEXT_BYTES) return toolError(failure('TEXT_TOO_LARGE', `${field} exceeds the UTF-8 text limit.`, { limitBytes: MAX_TEXT_BYTES }));
  if (name === 'open') {
    const supplied = key => Object.hasOwn(args, key);
    if (supplied('note') && (!args.note || ['file', 'filename'].some(supplied) || args.note !== 'new' && ['text', 'title'].some(supplied)))
      return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Open an existing note by its reference, or create with note:new, text and optional title.'));
    if (supplied('title') && args.note !== 'new' || args.note === 'new' && !supplied('text'))
      return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'title belongs only to a new Note (note:"new" with text). For a document use filename with text, or document to resume.'));
  }
  const verdict = deployment(env, {authentication: env.ACCESS_PROFILE === true ? 'access' : authority.source === 'server' ? 'server-bearer' : 'oauth'});
  if (!verdict.documents) return toolError(failure('STORAGE_UNAVAILABLE', 'The document storage binding is unavailable.'));
  const page = authority.source === 'page' ? authority : null, anonymous = authority.source === 'anonymous';
  const create = !page && name === 'open' && args.document === undefined;
  if (create && args.note) return toolError(failure('INVALID_DOCUMENT', 'Notes require the current document returned by open.'));
  if (name === 'open' && args.file && ['document', 'text', 'filename', 'docKind'].some(key => Object.hasOwn(args, key))) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Open a host file with file alone; its contents are read by the editor through the host.'));
  if (name === 'open' && args.file && (/[\\/\u0000-\u001f\u007f]/.test(args.file.name) || !args.file.resourceUri.trim())) return toolError(failure('INVALID_DOCUMENT_INPUT', 'A host file needs a filename without a path and a nonempty resource URI.'));
  if (!page && name === 'read' && args.guide && args.document === undefined) {
    try {validateInput(descriptor.inputSchema, args, 'arguments', true);} catch (error) {if (error.code === 'invalid_arguments') return inputErrorResult(error); throw error;}
    const guide = guideResult({topic: args.guide}, args.guide === 'water' ? agentPaintBrushRegistry() : null);
    return envelope(guide.outcome === 'ok' ? {guide: args.guide, instructions: guide.instructions, complete: true, next_cursor: null} : guide);
  }
  if (!page && name === 'read' && typeof args.cursor === 'string' && args.cursor.startsWith(CURSOR_PREFIX)) {
    const opened = await openCursor(env, args.cursor);
    if (!opened) return toolError(failure('INVALID_DOCUMENT_INPUT', 'This page cursor is unknown here. Repeat the original read without a cursor.'));
    if (args.document !== undefined && args.document !== opened.document) return toolError(failure('INVALID_DOCUMENT', 'This page cursor belongs to another document.'));
    args = {...args, document: opened.document, cursor: opened.cursor};
    rawArgs = {...rawArgs, document: opened.document, cursor: opened.cursor};
  }
  if (page ? args.document !== page.id : !create && !WORKSPACE_HANDLE.test(args.document || '')) return toolError(failure('INVALID_DOCUMENT', 'Use the document value returned by open.'));
  const connectedOwner = page || anonymous ? null : await digest(authority.ownerId);
  const createToken = typeof args.createToken === 'string' ? args.createToken : null;
  if (create && createToken !== null) {
    const refusal = anonymous ? secretTokenRefusal(createToken) : createTokenRefusal(createToken);
    if (refusal) return toolError(failure('INVALID_CREATE_TOKEN', refusal));
  }
  if (!create && args.createToken !== undefined) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'createToken belongs to a create. Reopening uses the existing document value.'));
  if (!create && name === 'open' && args.note !== 'new' && ['text', 'filename', 'docKind'].some(key => Object.hasOwn(args, key))) return toolError(failure('OPEN_ARGUMENTS_CONFLICT', 'Reopen with document alone; create with text and no document; replace content with edit.'));
  if (!page && ['open', 'read'].includes(name)) {
    try {validateInput(descriptor.inputSchema, args, 'arguments', true);} catch (error) {
      if (error.code !== 'invalid_arguments') throw error;
      if (create && args.filename !== undefined && !_rapierValidMetadata({filename: args.filename, docKind: 'markdown'}))
        return toolError(failure('INVALID_DOCUMENT_INPUT', 'filename_invalid'));
      return inputErrorResult(error);
    }
  }
  const createNamespace = authority.source === 'oauth' ? connectedOwner + ':connection:' + authority.connectionId : connectedOwner;
  const minted = create ? (createToken !== null ? await tokenCapability(createToken, env, createNamespace) : newCapability()) : null;
  const createBudget = create ? { takeId: await takeIdOf(minted), retryable: createToken !== null,
    principalKey: await digest(anonymous ? 'anonymous' : authority.source + ':' + authority.ownerId + ':' + (authority.connectionId || '')),
    ...(anonymous ? {anonymous: true} : {}) } : null;
  const humanTool = humanNamed;
  const document = create ? minted : page ? null : args.document;
  const ownerKey = page ? null : anonymous ? await anonymousOwner(document) : connectedOwner;
  const capabilityHash = document ? await digest(document) : null;
  const connectionKey = authority.source === 'oauth' ? await digest(authority.connectionId) : null;
  const documentAddress = page ? page.address : await workspaceAddress(document, ownerKey);
  const ownerLink = !create && !page && !anonymous;
  const editorBinding = {workspace: documentAddress, connection: page ? page.authority.ownerKey || '' : authority.connectionId || authority.ownerId || ''};
  let editorSource = authority.source;
  if (EDITOR_ONLY_TOOLS.has(name) || humanTool) {
    if (env.ACCESS_PROFILE !== true && !editorSecret(env)) return toolError(failure('EDITOR_KEY_UNCONFIGURED', 'This deployment has no EDITOR_KEY_SECRET, so editor operations cannot be verified.'));
    const verdict = await editorProofVerdict(env, args, authority, editorProof, documentAddress);
    if (verdict.ok) editorSource = 'page';
    if (editorSource !== 'page' || !verdict.ok) return toolError(failure('HUMAN_AUTHORITY_REQUIRED', "This is the editor's own operation. Open the editor to make this decision.", {reason: verdict.reason || 'editor_path_required'}));
  }
  if (name === 'document.visual_ack' && visualObservation !== null &&
      (!plain(visualObservation) || new TextEncoder().encode(JSON.stringify(visualObservation)).length > 1024))
    return toolError(failure('VISUAL_METADATA_INVALID', 'The visual observation metadata is invalid.'));
  const { document: ignored, editorKey: ignoredKey, createToken: ignoredToken, operation_id: operationName, ...input } =
    name === 'open' || EDITOR_ONLY_TOOLS.has(name) ? args : rawArgs;
  const file = name === 'open' ? input.file : undefined;
  if (file) { delete input.file; Object.assign(input, {text: '', filename: file.name}); }
  const pageRotation = name === ROTATE && page ? await pageSuccessor(env, page, args.editorKey) : null;
  const successor = name === ROTATE ? (document ? await rotatedCapability(document, env) : pageRotation?.capability) : null;
  if (name === ROTATE && !successor) return toolError(failure('PAIRING_REQUIRED', 'This browser is not paired with this workspace. Open its editor link and give the assistant the code the page shows.'));
  const requestKey = mintId('request_'), requestExpiresAt = Date.now() + REQUEST_LEASE_MS;
  const payload = { operation: name === 'show' && args.target === 'pair' ? PAIR_BROWSER : name, args: name === 'show' && args.target === 'pair' ? {code: input.code} : input, create, ...(name === 'show' && args.target === 'ask' ? {waitBound: door === '/muse' ? MUSE_WAIT_MS : 120000} : {}), ...(door === '/muse' && ['edit', 'undo'].includes(name) ? {holdBound: MUSE_WAIT_MS} : {}), ...(file ? {hostFileBinding: await digest(JSON.stringify(file))} : {}), ...(page ? {page: {...page.authority, ...(pageRotation ? {rotationEpoch: pageRotation.epoch, rotationRetry: pageRotation.retry} : {})}} : {ownerKey, capabilityHash, ...(connectionKey ? {connectionKey, oauthGrant: authority.grant} : {})}), ...(create ? {prefix: document.slice(0, ADDRESS_CHARS), ...(anonymous ? {bearer: true} : {})} : {}), ...(hostAgent ? {hostAgent} : {}), ...(humanTool ? {humanTool: true} : {}), ...(EDITOR_ONLY_TOOLS.has(name) || humanTool ? {editorAuthorized: true} : {}), ...(editorSource === 'page' && editorActivity === true && ['document.commit', 'document.human_context'].includes(name) ? {editorActivity: true} : {}), ...(name === 'show' && args.target === 'return' ? { returnAddress: documentAddress } : {}), ...(name === 'export' ? { exportAddress: documentAddress, exportOrigin: new URL(request.url).origin } : {}), ...(createBudget ? { createBudget } : {}), ...(successor ? { rotateToHash: await digest(successor) } : {}), ...(operationName !== undefined ? { operationId: operationName } : {}), requestKey, requestExpiresAt, ...(task ? {task} : {}), ...(peek ? {peek: true} : {}), ...(wait ? {waitFor: wait} : {}), ...(ownerLink ? {ownerLink: true} : {}), ...(connectionKey ? {workspaceAddress: documentAddress} : {}) };
  if (page && ![PAIR_STATUS, ROTATE].includes(name))
    payload.pageBudgetAddress = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (name === 'document.visual_ack' && editorSource === 'page' && visualObservation !== null)
    payload.visualObservation = visualObservation;
  if (env.ACCESS_PROFILE === true) payload.access = authority.access;
  const workspace = env.DOCUMENTS.get(env.DOCUMENTS.idFromName(documentAddress));
  let cancellation;
  const cancel = () => cancellation ||= workspace.fetch(new Request('https://rapier.internal/operation/cancel', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({requestKey, requestExpiresAt, ownerKey, capabilityHash, connectionKey}),
  })).then(response => { if (!response.ok) throw failure('CANCELLATION_UNACKNOWLEDGED', 'Cancellation was not acknowledged.'); });
  const aborted = () => { cancel().catch(() => {}); };
  request.signal.addEventListener('abort', aborted, {once: true});
  let response;
  try {
    const running = workspace.fetch(new Request('https://rapier.internal/operation', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, ...jsonBodyInit(payload)}));
    if (request.signal.aborted) aborted();
    response = await running;
    if (request.signal.aborted || response.status === 499) {
      await cancel();
      throw new DOMException('Request canceled', 'AbortError');
    }
  } finally { request.signal.removeEventListener('abort', aborted); }
  if (!response.ok) {
    const identity = ['operation_id', 'commitId', 'decisionId', 'createToken'].find(key => args[key] !== undefined);
    const retryable = Boolean(identity) || !create && (EDITOR_ONLY_TOOLS.has(name) || descriptor.annotations.readOnlyHint);
    const recovery = identity ? `Retry unchanged arguments with the same ${identity}.`
      : create ? 'Creation may have succeeded; without createToken a retry creates another workspace.'
      : retryable ? 'Retry with unchanged arguments.' : 'This call may have succeeded; read current state before another operation.';
    return toolError(failure('WORKSPACE_UNACKNOWLEDGED', 'The workspace did not acknowledge this operation (HTTP ' + response.status + '). ' + recovery,
      {retryable, ...(identity ? {retryIdentity: identity} : {})}));
  }
  const result = await parseJsonStream(response, {inlineBytes: 65536});
  if (result.toolAdmission) throw failure('TOOL_INVOCATION_ADMISSION', 'Tool invocation admission refused.', result.toolAdmission);
  if (!page && authority.source !== 'server' && ['show', 'export', 'read'].includes(name) && ['editor_unavailable', 'editor_not_present'].includes(result.structuredContent?.reason)) {
    const editor_url = new URL('/d/' + pageId(documentAddress), request.url).href, pairing = result.structuredContent.pairing;
    result.structuredContent = {...result.structuredContent, reason: 'editor_unavailable', editor_url,
      hint: 'No editor is open for this document. ' + (pairing?.status && pairing.status !== 'none' && pairing.next ? pairing.next + ' '
        : 'Share editor_url with the person; if they read you a code, send show {target:"pair", code}. ') +
        (name === 'read' ? 'Without an editor, read the text.' : 'Without an editor, export markdown, html or txt.')};
  }
  if (result.isError && !(create && result.structuredContent?.created === true)) return result;
  const writer = authority.scopes?.includes('rapier:write') === true;
  if ((authority.source === 'server' || env.LOCAL_EDITOR_PAGE === true || !writer || env.ACCESS_PROFILE === true && authority.access?.kind !== 'browser') && result._meta?.rapier) delete result._meta.rapier.live;
  if (result._meta?.rapier?.live?.key) {
    const url = new URL('/live/' + pageId(documentAddress), request.url); url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    const join = new URL('/rapier.html', request.url);
    join.hash = new URLSearchParams({live: url.href, key: result._meta.rapier.live.key}).toString();
    result._meta.rapier.live = {...result._meta.rapier.live, url: url.href, joinUrl: join.href};
  }
  const issuedAt = result._meta?.rapier?.editorIssuedAt;
  if (door !== '/muse' && writer && (env.ACCESS_PROFILE !== true || authority.access?.kind === 'browser') && (name === 'open' || editorSource === 'page' && editorActivity === true) && Number.isSafeInteger(issuedAt)) {
    result._meta = {...result._meta, rapier: {...result._meta?.rapier, editorKey: env.ACCESS_PROFILE === true ? authority.access.principalId : await mintEditorKey(editorSecret(env), issuedAt, editorBinding), editorDocument: page ? page.id : document, ...(!page && env.ACCESS_PROFILE !== true ? {editorTransport: {url: new URL('/editor', request.url).href, ticket: await mintEditorTicket(editorSecret(env), document, authority, issuedAt)}} : {})}};
  }
  if (successor && result.structuredContent?.rotated === true) {
    result._meta = {...result._meta, rapier: {...result._meta?.rapier, editorKey: args.editorKey, editorDocument: page ? page.id : successor, ...(!page && env.ACCESS_PROFILE !== true ? {editorTransport: {url: new URL('/editor', request.url).href, ticket: await mintEditorTicket(editorSecret(env), successor, authority, issuedAt)}} : {})}};
    if (env.ACCESS_PROFILE !== true) result.structuredContent = { ...result.structuredContent, sealed: await sealForEditor(args.editorKey, successor) };
    return result;
  }
  if (name === 'open' && result.structuredContent) result.structuredContent = {...result.structuredContent,
    editor_open: result.structuredContent.human?.active === true,
    ...(file ? {hydration: {status: result._meta?.rapier?.fileHydration?.status || 'unavailable', destination: 'host_file'}} : {}),
    presentation: {status: door === '/muse' ? 'link_available' : 'requested', acknowledged: false}};
  if (page) { if (result.structuredContent) delete result.structuredContent.pairing; return result; }
  const editorUrl = authority.source === 'server' && env.LOCAL_EDITOR_PAGE !== true ? null : new URL('/d/' + pageId(documentAddress), request.url).href;
  result.structuredContent = { ...result.structuredContent, document, revision: result.structuredContent.revision ?? result.structuredContent.documentRevision, ...(editorUrl ? {editor_url: editorUrl} : {}) };
  if (name === 'read' && typeof result.structuredContent.next_cursor === 'string' && result.structuredContent.next_cursor) {
    const sealed = await sealCursor(env, document, result.structuredContent.next_cursor);
    if (sealed) result.structuredContent.next_cursor = sealed;
  }
  if (result.structuredContent.outcome === 'pending' && result.structuredContent.pending?.requirements?.kind === 'material')
    result.structuredContent = {...result.structuredContent, ...materialWait(result.structuredContent, editorUrl, typeof args.operation_id === 'string' && args.operation_id !== '')};
  if (name === 'show' && args.target === 'pair' && /^[a-f0-9]{64}$/.test(result.structuredContent.ownerApprovalId || '')) {
    const {ownerApprovalId, ...value} = result.structuredContent;
    result.structuredContent = {...value, owner_approval_url: new URL('/editor/' + pageId(documentAddress) + '?pair=' + ownerApprovalId, request.url).href};
  }
  if (file || create && Object.keys(args).length === 0) result._meta = {...result._meta, rapier: {...result._meta?.rapier, ...(file ? {hostFile: file} : {home: true})}};
  return result;
}

const CURSOR_PREFIX = 'rpcur_';
async function cursorKey(env, usage) {
  const secret = editorSecret(env); if (!secret) return null;
  const digested = await crypto.subtle.digest('SHA-256', editorSecretKeyMaterial(secret, 'rapier-read-cursor-v1:'));
  return crypto.subtle.importKey('raw', digested, {name: 'AES-GCM'}, false, [usage]);
}
async function sealCursor(env, document, cursor) {
  if (env.ACCESS_PROFILE === true) {
    const value = CURSOR_PREFIX + base64url(encoder.encode(document + '\n' + cursor));
    return value.length <= 256 ? value : null;
  }
  const key = await cursorKey(env, 'encrypt'); if (!key) return null;
  const plain = encoder.encode(document + '\n' + cursor), material = editorSecretKeyMaterial(editorSecret(env), 'rapier-read-cursor-nonce-v1:');
  const iv = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...material, ...plain]))).slice(0, 12);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, plain));
  const sealed = CURSOR_PREFIX + base64url(new Uint8Array([...iv, ...cipher]));
  return sealed.length <= 256 ? sealed : null;
}
async function openCursor(env, sealed) {
  try {
    if (env.ACCESS_PROFILE === true) {
      const value = new TextDecoder('utf-8', {fatal: true}).decode(fromBase64url(sealed.slice(CURSOR_PREFIX.length)));
      const at = value.indexOf('\n'), document = value.slice(0, at), cursor = value.slice(at + 1);
      return sealed.length <= 256 && at > 0 && WORKSPACE_HANDLE.test(document) && cursor ? {document, cursor} : null;
    }
    const key = await cursorKey(env, 'decrypt'), bytes = fromBase64url(sealed.slice(CURSOR_PREFIX.length));
    if (!key || bytes.length <= 12) return null;
    const plain = new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12)}, key, bytes.slice(12)));
    const at = plain.indexOf('\n'), document = plain.slice(0, at), cursor = plain.slice(at + 1);
    return at > 0 && WORKSPACE_HANDLE.test(document) && cursor ? {document, cursor} : null;
  } catch { return null; }
}

function editorCapabilityScopes(meta, value) {
  const scopes = {}, documentExpiry = Date.parse(value.expiresAt);
  const describe = (scope, key, lifetime) => {
    const issued = /^ek1\.[A-Za-z0-9_-]+\.(\d+)\./.exec(key || '')?.[1];
    const until = issued ? Math.min(Number(issued) + EDITOR_KEY_LIFETIME_MS, Number.isFinite(documentExpiry) ? documentExpiry : Infinity) : documentExpiry;
    return {scope, ...(Number.isFinite(until) ? {expiresAt: new Date(until).toISOString()} : {}), lifetime};
  };
  const documentLifetime = 'Ends when the document expires, is deleted, or its access is revoked.';
  const keyLifetime = 'At most 24 hours from issue; ends sooner with document access, connection revocation, or deployment key rotation.';
  const liveLifetime = keyLifetime + ' Stop live also revokes this value.';
  if (meta.editorKey) scopes.editorKey = describe('Editor operations for this document and connection; not proof of a person.', meta.editorKey, keyLifetime);
  if (meta.editorDocument) scopes.editorDocument = describe('Document selector for the editor transport; hosted document values also grant the caller document access.', null, documentLifetime);
  if (meta.editorTransport?.ticket) scopes['editorTransport.ticket'] = describe('Private /editor transport for this document with the original caller permissions.', meta.editorKey, keyLifetime);
  if (meta.open?.document) scopes['open.document'] = describe('Same document access as the public document value.', null, documentLifetime);
  for (const [key, scope] of Object.entries({key: 'Read and edit this live document.', stopKey: 'Disconnect live sharing and agent access for this document.', custodyKey: 'Editor custody of this document.'}))
    if (meta.live?.[key]) scopes['live.' + key] = describe(scope, meta.live[key], key === 'stopKey' ? keyLifetime : liveLifetime);
  if (meta.live?.joinUrl) scopes['live.joinUrl'] = describe('Editor link carrying live.key with the same live document access.', meta.live.key, liveLifetime);
  return scopes;
}

function publicToolResult(name, result, door, {workspaceNotes = false, appsClient = false} = {}) {
  const facts = result.structuredContent || {};
  if (door === '/muse' && result._meta) { const {_meta, ...value} = result; result = value; }
  if (['open', 'read', 'edit', 'undo', 'show', 'export'].includes(name) && plain(result.structuredContent)) {
    const reply = modelReply(name, result.structuredContent, {notesVersions: workspaceNotes}), {text, ...shaped} = reply;
    if (workspaceNotes && name === 'open' && !result.isError && reply.availability === 'available' && typeof reply.note_ref === 'string')
      for (const key of ['filename', 'chars', 'editor_url', 'presentation']) delete shaped[key];
    const {isError: _error, code, message, ...rest} = shaped;
    const receipt = typeof code === 'string' && rest.reason === undefined
      ? {outcome: rest.outcome, reason: code.toLowerCase(), ...(typeof message === 'string' && rest.hint === undefined ? {hint: message} : {}), ...rest}
      : shaped;
    const {structuredContent, ...value} = result;
    if (name === 'open' && door !== '/muse') value._meta = {...value._meta, rapier: {...value._meta?.rapier,
      open: Object.fromEntries(['document', 'documentId', 'outcome', 'created', 'resumed', 'version', 'currentVersion']
        .filter(key => structuredContent[key] !== undefined).map(key => [key, structuredContent[key]]))}};
    if (name === 'edit' && door !== '/muse' && typeof structuredContent.hash === 'string')
      value._meta = {...value._meta, rapier: {...value._meta?.rapier, edit: {revision: structuredContent.revision, hash: structuredContent.hash}}};
    result = {...value,
      content: [{type: 'text', text: JSON.stringify(receipt) + (typeof text === 'string' ? '\n' + text : '')},
        ...(result.content || []).filter(item => ['image', 'resource', 'resource_link'].includes(item.type))]};
  } else if (['open', 'read', 'edit', 'undo', 'show', 'export'].includes(name) && result.isError && result.content?.[0]?.type === 'text') {
    let value; try {value = JSON.parse(result.content[0].text);} catch {}
    if (plain(value) && typeof value.code === 'string' && value.reason === undefined) {
      const {isError: _error, code, message, ...rest} = value;
      result = {...result, content: [{type: 'text', text: JSON.stringify({outcome: rest.outcome, reason: code.toLowerCase(), ...(typeof message === 'string' ? {hint: message} : {}), ...rest})}, ...result.content.slice(1)]};
    }
  }
  if (result._meta?.rapier && !(['page', '/editor'].includes(door) &&
      (EDITOR_ONLY_TOOLS.has(name) || HUMAN_OPERATIONS.some(operation => operation.name === name)))) {
    if (appsClient && door !== '/muse') result._meta = {...result._meta, rapier: {...result._meta.rapier,
      capabilities: editorCapabilityScopes(result._meta.rapier, facts)}};
    else {
      const {rapier, ...meta} = result._meta;
      const {_meta, ...value} = result;
      result = Object.keys(meta).length ? {...value, _meta: meta} : value;
    }
  }
  return result;
}

async function taskDocument(input, authority, env, recover = false) {
  const original = input.authority;
  if (!plain(authority) || original.source !== authority.source || input.door !== (authority.door || input.door) ||
      original.ownerId !== authority.ownerId || original.connectionId !== authority.connectionId ||
      !input.scopes.every(scope => authority.scopes?.includes(scope)) ||
      original.grant && !await oauthGrantCurrent(original.grant, env)) return false;
  const document = input.args.document;
  if (!WORKSPACE_HANDLE.test(document || '')) return false;
  const ownerKey = authority.source === 'anonymous' ? await anonymousOwner(document) : await digest(authority.ownerId);
  const capabilityHash = await digest(document), address = await workspaceAddress(document, ownerKey);
  const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(address)).fetch(new Request('https://rapier.internal/task/' + (recover ? 'recover' : 'authority'), {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ownerKey, capabilityHash,
      ...(original.grant ? {oauthGrant: original.grant, connectionKey: await digest(original.connectionId)} : {}),
      ...(recover ? {taskKey: input.task.key, deadline: input.deadline} : {})}),
  }));
  return response.ok ? response.json() : null;
}

async function taskRoute(method, taskId, input, authority, env) {
  if (!TASK_HANDLE.test(taskId || '')) throw Object.assign(new Error('Task unavailable.'), {code: -32602});
  const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName('task:' + sha256(taskId))).fetch(new Request('https://rapier.internal/task/' + method, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, ...jsonBodyInit({taskId, input, authority}),
  }));
  if (!response.ok) throw Object.assign(new Error('Task unavailable.'), {code: -32603});
  const value = await parseJsonStream(response, {inlineBytes: 65536});
  if (value.error) throw Object.assign(new Error(value.error.message), {code: value.error.code, data: value.error.data});
  return value.result;
}

async function createTask(name, args, request, authority, env, hostAgent, door) {
  request.signal.throwIfAborted();
  if (name === 'show' && plain(args) && args.target === undefined) args = {...args, target: showTarget(args)};
  const descriptor = TOOL_BY_NAME.get(name);
  try { validateInput(descriptor.inputSchema, args, 'arguments', true); }
  catch { return callTool(name, args, env, request, authority, hostAgent, door); }
  const operationId = args.operation_id || crypto.randomUUID();
  args = {...args, operation_id: operationId};
  const identity = sha256(canonicalJson({name, args}));
  const tokenKey = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-task-v1:'),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const token = await crypto.subtle.sign('HMAC', tokenKey, encoder.encode(canonicalJson({document: args.document,
    owner: authority.ownerId || '', connection: authority.connectionId || '', door, operationId})));
  const taskId = 'rptask_' + base64url(new Uint8Array(token));
  const duration = name === 'show' && args.target === 'ask' ? waitTimeout(args.timeout_ms, door === '/muse' ? MUSE_WAIT_MS : 120000)
    : name === 'export' ? EXPORT_LEASE_MS : VIEW_LEASE_MS;
  const now = Date.now();
  const task = {key: sha256(taskId), expiresAt: now + TASK_TTL_MS, deadline: now + duration};
  const input = {identity, name, args, authority, hostAgent, door, url: request.url, task,
    scopes: descriptor.annotations.readOnlyHint ? ['rapier:read'] : ['rapier:read', 'rapier:write'],
    deadline: task.deadline + 1000};
  request.signal.throwIfAborted();
  return taskRoute('create', taskId, input, authority, env);
}

function requestScope(request, authority, door, modern) {
  const session = !modern && REQUEST_SESSION.test(request.headers.get('Mcp-Session-Id') || '')
    ? request.headers.get('Mcp-Session-Id') : '';
  if (['page', 'server'].includes(authority.source) || authority.source === 'anonymous' && !session) return null;
  return sha256(JSON.stringify([door, authority.source, authority.ownerId || '', authority.connectionId || '', session]));
}

export const REQUEST_OWNER_AFTER_MS = 1000;
async function requestTool(name, args, env, request, authority, hostAgent, door, editorProof, editorActivity, scope, id, visualObservation = null) {
  if (!scope) return callTool(name, args, env, request, authority, hostAgent, door, editorProof, editorActivity, null, false, null, visualObservation);
  const key = sha256(JSON.stringify(id)), occurrence = 'request_' + crypto.randomUUID().replaceAll('-', ''), startedAt = Date.now();
  const lifetime = createRequestLifetime(request.signal), held = new AbortController();
  let refused = null, cancelledByOwner = false, owner = null;
  const register = () => {
    owner = env.DOCUMENTS.get(env.DOCUMENTS.idFromName('request:' + scope));
    owner.fetch(new Request('https://rapier.internal/request/hold', {method: 'POST', signal: held.signal,
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key, occurrence, startedAt})}))
      .then(response => response.ok ? response.json() : {})
      .then(answer => {
        if (answer.inUse) refused = failure('REQUEST_ID_IN_USE', 'This request ID is already in use.');
        if (answer.cancelled) cancelledByOwner = true;
        if (answer.inUse || answer.cancelled) lifetime.cancel();
      }, () => {});
  };
  const timer = setTimeout(register, Number(env.REQUEST_OWNER_AFTER_MS ?? REQUEST_OWNER_AFTER_MS));
  try {
    const result = await callTool(name, args, env, new Request(request.url, {method: 'POST',
      headers: {'CF-Connecting-IP': request.headers.get('CF-Connecting-IP') || 'unknown'}, signal: lifetime.signal}),
      authority, hostAgent, door, editorProof, editorActivity, null, false, null, visualObservation);
    if (refused) throw refused;
    if (lifetime.signal.aborted) throw new DOMException('Request canceled', 'AbortError');
    return result;
  } catch (error) {
    if (refused) throw refused;
    if (lifetime.signal.aborted && error?.code !== 'CANCELLATION_UNACKNOWLEDGED') throw new DOMException('Request canceled', 'AbortError');
    throw error;
  } finally {
    clearTimeout(timer); lifetime.release();
    if (cancelledByOwner) await owner.fetch(new Request('https://rapier.internal/request/hold/done', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key, occurrence})})).catch(() => {});
    else held.abort();
  }
}

const headerField = value => value === null ? null : value.replace(/^[ \t]+|[ \t]+$/g, '');
function headerValue(value) {
  value = headerField(value);
  if (value === null) return null;
  const sentinel = /^=\?base64\?(.*)\?=$/.exec(value);
  if (!sentinel) return /^[\x20-\x7e\t]*$/.test(value) ? value : null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(sentinel[1])) return null;
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(atob(sentinel[1]), char => char.charCodeAt(0))); } catch { return null; }
}
const serverInfo = env => ({ name: 'rapier', title: 'Rapier', version: VERSION + (env.RAPIER_DEPLOYMENT?.id ? '+worker.' + env.RAPIER_DEPLOYMENT.id : ''), websiteUrl: 'https://rapier.website', icons: ICONS });

export function handleMcp(request, env, ctx = {}) {
  return handleMcpRequest(request, env, ctx);
}

export function handleRoutedMcp(request, env, ctx, route) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/mcp' || typeof route !== 'function')
    throw new TypeError('A trusted POST /mcp routing callback is required');
  return handleMcpRequest(request, env, ctx || {}, route);
}

function handleMcpRequest(request, env, ctx, route) {
  const path = new URL(request.url).pathname;
  if (/^\/(?:p|publish)(?:\/|$)/.test(path) || path === '/.well-known/assetlinks.json') return handlePublishedPages(request, env);
  return withOrigin(request, env, async () => {
    if (new URL(request.url).pathname === '/editor') {
      const ticket = await verifyEditorTicket(editorSecret(env), request.headers.get('Authorization')?.replace(/^Bearer /, ''));
      if (!ticket || ticket.authority.grant && !await oauthGrantCurrent(ticket.authority.grant, env)) return rpcError(null, -32000, 'Editor authority is required.', 401);
      return handleRequest(request, env, {...ticket.authority, editorDocument: ticket.document});
    }
    return handleOAuth(request, env, ctx, (incoming, authority) => {
      const routed = route ? (message, byteLength) => route(incoming, message, authority, byteLength) : undefined;
      if (route?.read) routed.read = (readNative, received) => route.read(incoming, authority, readNative, received);
      return handleRequest(incoming, env, authority, routed);
    });
  });
}

export function handleAuthenticatedMcp(request, env, authority) {
  requireServerAuthority(authority);
  return withOrigin(request, env, () => handleRequest(request, env, authority));
}

function requireServerAuthority(authority) {
  if (authority?.source !== 'server' || !/^owner_[A-Za-z0-9_-]{43}$/.test(authority.ownerId || '') ||
      !Array.isArray(authority.scopes) || !['rapier:read', 'rapier:write'].every(scope => authority.scopes.includes(scope)))
    throw new TypeError('Verified server authority is required');
}

export function handleLocalEditor(request, env, authority) {
  requireServerAuthority(authority);
  const url = new URL(request.url);
  if (env.LOCAL_EDITOR_PAGE !== true || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !/^\/(?:d\/ws_[A-Za-z0-9_-]{43}|editor\/ws_[A-Za-z0-9_-]{43}(?:\/admit)?)$/.test(url.pathname))
    throw new TypeError('A loopback editor route is required');
  return withOrigin(request, env, () => handleRequest(request, env, {...authority, source: 'browser'}));
}

export async function handleAccessMcp(request, env, authority) {
  if (env.ACCESS_PROFILE !== true || !['browser', 'access'].includes(authority?.source) ||
      authority.ownerId !== authority.access?.ownerId || !/^owner_[A-Za-z0-9_-]{43}$/.test(authority.ownerId || '') ||
      !Array.isArray(authority.scopes) || !['rapier:read', 'rapier:write'].every(scope => authority.scopes.includes(scope)) ||
      !await env.accessCurrent?.(authority.access)) return rpcError(null, -32000, 'Cloudflare sign-in is required.', 401);
  const url = new URL(request.url), browser = authority.source === 'browser' && authority.access.kind === 'browser';
  if ((authority.source === 'browser') !== (authority.access.kind === 'browser')) return rpcError(null, -32000, 'Cloudflare sign-in is required.', 401);
  if (url.pathname === '/editor' || /^\/(?:oauth|publish|p)(?:\/|$)/.test(url.pathname) ||
      /^\/live\/[a-f0-9]{32}\//.test(url.pathname)) return new Response(null, {status: 404});
  if (!browser && /^\/(?:editor|d|live)(?:\/|$)/.test(url.pathname)) return rpcError(null, -32000, 'Open the editor in a signed-in browser.', 403);
  if (browser && (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS' || request.headers.get('Upgrade')?.toLowerCase() === 'websocket') &&
      request.headers.get('Origin') !== url.origin) return rpcError(null, -32000, 'Origin is not allowed.', 403);
  const response = await withOrigin(request, env, () => handleRequest(request, env, authority));
  if (!await env.accessCurrent(authority.access)) {
    if (response.body) await response.body.cancel().catch(() => {});
    return rpcError(null, -32000, 'Cloudflare sign-in is required.', 401);
  }
  return response;
}

async function withOrigin(request, env, dispatch) {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/return/') && RETURN_CAPABILITY.test(path.slice('/return/'.length))) return dispatch();
  if (!DOORS.has(path) && !path.startsWith('/return/')) return dispatch();
  if (path !== '/editor' && !allowedOrigin(request, env)) return rpcError(null, -32000, 'Origin is not allowed.', 403);
  const origin = request.headers.get('Origin');
  const response = request.method === 'OPTIONS'
    ? new Response(null, {status: 204, headers: {'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': DOORS.has(path) ? 'POST' : 'GET, POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, X-Rapier-Name'}})
    : await dispatch();
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
  headers.set('Vary', 'Origin');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

function requireScope(request, env, authority, scopes) {
  if (!authority) return oauthChallenge(request, env, scopes);
  if (!scopes.every(scope => authority.scopes.includes(scope))) return oauthForbidden(request, env, scopes);
  return null;
}

function returnPage(status = 200, reason = '') {
  const nonce = crypto.randomUUID();
  const initial = JSON.stringify({status, reason}).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Send back · Rapier</title><link rel="stylesheet" href="/fonts.css"><style nonce="${nonce}">${HOUSE_STYLE}#send{margin-top:auto}#name{color:var(--muted);font:400 .75rem/1.5 "Geist Mono",monospace}</style><main><h1>Send this document back</h1><p id="status" role="status">Waiting for the offline page.</p><p id="name"></p><pre id="preview" hidden></pre><p>The agent receives a separate returned copy. Your current workspace text stays as it is.</p><button id="send" class="affirmative" disabled>Send document</button></main>
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

async function exportResponse(request, env, authority) {
  const url = new URL(request.url);
  const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex'};
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {...headers, Allow: 'GET, HEAD'}});
  const token = url.pathname.slice('/export/'.length), granted = EXPORT_CAPABILITY.exec(token);
  const refusal = granted ? null : requireScope(request, env, authority, ['rapier:read']);
  if (refusal) return refusal;
  const match = granted || EXPORT_HANDLE.exec(token);
  if (!match || url.search || url.hash) return new Response(null, {status: 404, headers});
  if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) return new Response(null, {status: 503, headers});
  try {
    return await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(match[1])).fetch(new Request('https://rapier.internal/export', {
      method: request.method, headers: {...(granted ? {'X-Rapier-Export-Hash': await digest(token)} : {'X-Rapier-Export-ID': match[2], 'X-Rapier-Owner': await digest(authority.ownerId), ...(authority.grant ? {'X-Rapier-Grant': JSON.stringify(authority.grant)} : {})}), ...(env.ACCESS_PROFILE === true ? {'X-Rapier-Access': JSON.stringify(authority.access), 'X-Rapier-Owner': await digest(authority.ownerId)} : {})},
    }));
  } catch { return new Response(null, {status: 503, headers}); }
}

const exportResourceToken = (request, uri) => {
  const prefix = new URL(request.url).origin + '/export/';
  if (typeof uri !== 'string' || !uri.startsWith(prefix)) return null;
  const token = uri.slice(prefix.length);
  return EXPORT_CAPABILITY.test(token) || EXPORT_HANDLE.test(token) ? token : null;
};

async function exportResource(response, uri) {
  if (!response.ok) throw failure(response.status === 404 || response.status === 410 ? 'RESOURCE_NOT_FOUND' : 'WORKSPACE_UNAVAILABLE',
    'The exported resource is unavailable.');
  const size = Number(response.headers.get('Content-Length'));
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_EXPORT_BYTES) throw failure('WORKSPACE_UNAVAILABLE', 'The exported resource is unavailable.');
  const mimeType = response.headers.get('Content-Type')?.replace(/; charset=utf-8$/, '');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== size || !mimeType) throw failure('WORKSPACE_UNAVAILABLE', 'The exported resource is unavailable.');
  return {contents: [{uri, mimeType, blob: encodeBase64(bytes)}]};
}

async function handleRequest(request, env, authority, route) {
  const url = new URL(request.url);
  const privateLive = /^\/live\/([a-f0-9]{32})\/(create|socket|stop)$/.exec(url.pathname);
  const liveStop = /^\/live\/(ws_[A-Za-z0-9_-]{43})\/stop$/.exec(url.pathname);
  if (privateLive || liveStop) {
    const headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type, X-Rapier-Live-Owner', 'Cache-Control': 'no-store'};
    const refuse = (reason, status) => json({reason}, status, headers);
    if (url.search || url.hash) return refuse('route_unavailable', 404);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    try {
      const action = privateLive?.[2] || 'stop', id = privateLive?.[1] || liveStop[1];
      const namespace = privateLive ? env.LIVE_RELAY : env.DOCUMENTS;
      if (!namespace?.get || !namespace?.idFromName) return refuse('live_unavailable', 503);
      const internalHeaders = new Headers(), init = {method: request.method, headers: internalHeaders};
      if (env.ACCESS_PROFILE === true) internalHeaders.set('X-Rapier-Access', JSON.stringify(authority.access));
      if (action === 'socket') {
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
          return refuse('websocket_required', 426);
        const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(value => value.trim());
        if (protocols.length !== 2 || protocols[0] !== PRIVATE_LIVE_PROTOCOL || !privateSecret(protocols[1]))
          return refuse('session_denied', 403);
        internalHeaders.set('Upgrade', 'websocket'); internalHeaders.set('X-Rapier-Live-Key', protocols[1]);
      } else {
        if (request.method !== 'POST') return refuse('post_required', 405);
        if (action === 'create') {
          if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('Content-Type') || ''))
            return refuse('json_required', 415);
          const body = await readTextBody(request, PRIVATE_LIVE_LIMITS.frameBytes, 'encrypted live document');
          const value = JSON.parse(body);
          if (value?.id !== id) return refuse('session_identity_conflict', 400);
          const budget = await takeCreateBudget(env, {takeId: 'live_' + id,
            principalKey: sha256('private-live:' + (request.headers.get('CF-Connecting-IP') || 'anonymous'))});
          if (budget !== 'ok') return refuse(budget === 'exceeded' ? 'create_limit' : 'create_unavailable', budget === 'exceeded' ? 429 : 503);
          internalHeaders.set('Content-Type', 'application/json'); init.body = body;
        } else {
          const owner = request.headers.get('X-Rapier-Live-Owner');
          if (!owner || privateLive && !privateSecret(owner)) return refuse('session_denied', 403);
          internalHeaders.set('X-Rapier-Live-Owner', owner);
        }
      }
      const response = await namespace.get(namespace.idFromName(privateLive ? id : pageAddress(id))).fetch(
        new Request('https://rapier.internal/' + (privateLive ? action : 'live/stop'), init));
      if (response.status === 101) return response;
      const combined = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) combined.set(key, value);
      return new Response(response.body, {status: response.status, headers: combined});
    } catch (error) { return refuse(error.code === 'REQUEST_TOO_LARGE' ? 'message_too_large' : 'live_unacknowledged',
      error.code === 'REQUEST_TOO_LARGE' ? 413 : error instanceof SyntaxError ? 400 : 503); }
  }
  const live = /^\/live\/(ws_[A-Za-z0-9_-]{43})$/.exec(url.pathname);
  if (live) {
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, {status: 426, headers: {Upgrade: 'websocket'}});
    if (url.search || url.hash || pageId(pageAddress(live[1])) !== live[1]) return new Response(null, {status: 404});
    const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(value => value.trim());
    if (protocols.length !== 2 || protocols[0] !== LIVE_PROTOCOL || (env.ACCESS_PROFILE === true ? protocols[1] !== authority.access?.principalId : !/^ek1\.[A-Za-z0-9_-]{22}\.[0-9]{1,16}\.[A-Za-z0-9_-]{43}$/.test(protocols[1]))) return new Response(null, {status: 403});
    if (!env.DOCUMENTS?.get) return new Response(null, {status: 503});
    return env.DOCUMENTS.get(env.DOCUMENTS.idFromName(pageAddress(live[1]))).fetch(new Request('https://rapier.internal/live', {
      headers: {Upgrade: 'websocket', 'X-Rapier-Live-Key': protocols[1], ...(env.ACCESS_PROFILE === true ? {'X-Rapier-Access': JSON.stringify(authority.access)} : {})},
    }));
  }
  if (url.pathname.startsWith('/export/')) return exportResponse(request, env, authority);
  if (url.pathname.startsWith('/return/')) {
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
      headers.delete('X-Rapier-Grant');
      headers.delete('X-Rapier-Access');
      if (env.ACCESS_PROFILE === true) headers.set('X-Rapier-Access', JSON.stringify(authority.access));
      if (authority?.grant) headers.set('X-Rapier-Grant', JSON.stringify(authority.grant));
      if (granted) headers.set('X-Rapier-Return-Hash', await digest(token));
      else {
        headers.set('X-Rapier-Return-ID', match[2]);
        headers.set('X-Rapier-Owner', await digest(authority.ownerId));
      }
      headers.delete('Authorization');
      headers.delete('Cookie');
      const failedSource = new AbortController();
      let relay, cancel = async () => {}, transfer = Promise.resolve(true);
      if (request.body) {
        const reader = request.body.getReader();
        let stopped = false, controller, finish;
        transfer = new Promise(resolve => { finish = resolve; });
        const stop = async () => {
          if (stopped) return;
          stopped = true;
          await reader.cancel().catch(() => {});
          finish(false);
        };
        relay = new ReadableStream({
          start(value) { controller = value; },
          async pull(controller) {
            try {
              const chunk = await reader.read();
              if (stopped) return;
              if (chunk.done) { stopped = true; controller.close(); finish(true); }
              else controller.enqueue(chunk.value);
            } catch (error) {
              if (!stopped) {
                stopped = true; finish(false);
                failedSource.abort(error);
                controller.error(error);
              }
            }
          },
          cancel: stop,
        });
        cancel = async () => {
          if (stopped) return;
          controller.close();
          await stop();
        };
      }
      let response;
      try {
        const forwarded = new Request('https://rapier.internal/return', {method: request.method, headers,
          signal: AbortSignal.any([request.signal, failedSource.signal]),
          ...(relay ? {body: relay, duplex: 'half'} : {})});
        response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(match[1])).fetch(forwarded);
      } finally {
        if (!response?.ok) await cancel();
        const transferred = await transfer;
        if (response?.ok && !transferred) throw new Error('The returned source transfer was not confirmed.');
      }
      if (granted) {
        const answered = new Headers(response.headers);
        for (const [name, value] of Object.entries(BEARER_RETURN_CORS)) answered.set(name, value);
        return new Response(response.body, { status: response.status, headers: answered });
      }
      if (!browserPage) return response;
      const result = await parseJsonStream(response, {inlineBytes: 65536});
      return returnPage(response.status, result.reason || '');
    } catch { return refused('The return receipt could not be confirmed. Ask the agent whether it arrived.', 503); }
  }
  if (url.pathname === '/health') return json({ service: 'rapier', serverInfo: serverInfo(env), protocolVersions: PROTOCOL_VERSIONS, protocolVersion: PROTOCOL_VERSION, ...deployment(env) });
  if (url.pathname === '/.well-known/mcp/server-card.json') {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const card = JSON.stringify({ ...mcpServer({ endpoint: CURRENT_DOOR }), $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json' }, null, 2) + '\n';
    return new Response(request.method === 'HEAD' ? null : card, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (url.pathname === '/.well-known/openai-apps-challenge') {
    if (request.method !== 'GET') return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const token = typeof env.OPENAI_APPS_CHALLENGE === 'string' ? env.OPENAI_APPS_CHALLENGE : '';
    return token ? new Response(token, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }) : new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const admit = /^\/editor\/(ws_[A-Za-z0-9_-]{43})\/admit$/.exec(url.pathname);
  if (admit) return editorAdmission(request, env, admit[1], authority);
  const editorPage = /^\/editor\/(ws_[A-Za-z0-9_-]{43})$/.exec(url.pathname);
  const paired = PAIRED_PATH.exec(url.pathname) || editorPage;
  if (!DOORS.has(url.pathname) && !paired) return new Response('Not found', { status: 404 });
  const door = paired ? 'page' : url.pathname, cookies = [];
  if (door === '/muse' && !authority) return oauthChallenge(request, env, ['rapier:read', 'rapier:write', 'offline_access']);
  if (door === '/mcp') authority ??= ANONYMOUS;
  if (paired) {
    if (url.searchParams.has('pair')) return approvePairing(request, env, paired[1], authority);
    authority = await pageCaller(request, env, paired[1], authority);
    if (!authority) return new Response('Not found', { status: 404 });
    if (!editorPage && ['GET', 'HEAD'].includes(request.method)) return pairedPage(request, env, authority);
    if (!editorPage) return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD, POST' } });
    if (request.headers.get('Origin') !== url.origin || !['same-origin', null].includes(request.headers.get('Sec-Fetch-Site'))) return rpcError(null, -32000, 'Origin is not allowed.', 403);
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return rpcError(null, -32600, 'Content-Type must be application/json.', 415);
  const accept = (request.headers.get('Accept') || '').toLowerCase().split(',').filter(part => !/;\s*q=0(?:\.0*)?\s*(?:;|$)/.test(part)).map(part => part.split(';')[0].trim()).filter(Boolean);
  if (accept.length && !accept.some(type => ['application/json', 'application/*', '*/*'].includes(type))) return rpcError(null, -32600, 'Accept must allow application/json.', 406);
  let message;
  const received = route ? {} : undefined;
  try {
    if (route?.read) {
      const selected = await route.read(replay => readBody(replay, received), received);
      if (selected instanceof Response) return selected;
      message = selected.message;
    } else message = await readBody(request, received);
  } catch (error) {
    if (route?.read && error?.code === 'REQUEST_TOO_LARGE')
      error = failure('REQUEST_TOO_LARGE', `The JSON request must be at most ${MAX_RPC_BODY_BYTES} bytes.`, {limitBytes: MAX_RPC_BODY_BYTES});
    if (route?.read && ['BACKING_UNAVAILABLE', 'BACKING_QUOTA'].includes(error?.code))
      return rpcError(null, -32603, 'The request backing is unavailable. Retry later.', 503);
    const oversized = error?.[PUBLIC_FAILURE] && error.code === 'REQUEST_TOO_LARGE';
    if (route && !oversized) {
      const response = await route(undefined, received.bytes);
      if (response !== null) return response;
    }
    return rpcError(null, oversized ? -32600 : -32700, oversized ? error.message : 'Invalid UTF-8 JSON request.', oversized ? 413 : 400, oversized ? error.details : undefined);
  }
  if (route) {
    const response = await route(message, received.bytes);
    if (response !== null) return response;
  }
  if (plain(message)) {
    const path = oversizedRpcId(message.id) ? 'id' : message.method === 'notifications/cancelled' &&
      plain(message.params) && oversizedRpcId(message.params.requestId) ? 'params.requestId' : null;
    if (path) return rpcError(null, -32600, 'String request IDs must be at most 1024 UTF-8 bytes.', 413,
      {path, limitBytes: MAX_RPC_ID_BYTES});
  }
  const id = plain(message) && (typeof message.id === 'string' || Number.isSafeInteger(message.id)) ? message.id : undefined;
  if (!plain(message) || Object.keys(message).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key)) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.params !== undefined && !plain(message.params)) || (Object.hasOwn(message, 'id') && id === undefined)) return rpcError(id, -32600, 'Expected one JSON-RPC 2.0 request or notification.', 400);
  const params = message.params || {};
  if (door === '/editor' && (message.method !== 'tools/call' || !authority?.editorDocument || params.arguments?.document !== authority.editorDocument))
    return rpcError(id, -32601, 'This editor transport is bound to one document.', 403);
  if (Object.hasOwn(message, 'id') && ['resources/read', 'skills/get'].includes(message.method) &&
      (typeof params.uri !== 'string' || !params.uri.trim())) return rpcError(id, -32602, 'A nonempty resource URI is required.');
  const header = headerField(request.headers.get('MCP-Protocol-Version'));
  if (params._meta !== undefined && !plain(params._meta)) return rpcError(id ?? null, -32602, 'params._meta: expected an object.', id === undefined || header === MODERN_PROTOCOL_VERSION ? 400 : 200);
  const meta = params._meta || {};
  const modern = header === MODERN_PROTOCOL_VERSION || Object.hasOwn(meta, META_VERSION);
  let appsClient, hostAgent = null;
  if (modern) {
    const requested = meta[META_VERSION];
    if (typeof requested !== 'string') return rpcError(id ?? null, -32602, `${META_VERSION} must be a string in every request's _meta.`, 400);
    if (!plain(meta[META_CLIENT])) return rpcError(id ?? null, -32602, `${META_CLIENT} must be an object in every request's _meta.`, 400);
    if (header !== requested) return rpcError(id ?? null, HEADER_MISMATCH, `Header mismatch: MCP-Protocol-Version header value '${header}' does not match body value '${requested}'.`, 400);
    if (requested !== MODERN_PROTOCOL_VERSION) return rpcError(id ?? null, UNSUPPORTED_VERSION, 'Unsupported protocol version', 400, { supported: PROTOCOL_VERSIONS, requested });
    const method = headerField(request.headers.get('Mcp-Method'));
    if (method !== message.method) return rpcError(id ?? null, HEADER_MISMATCH, method === null ? 'Header mismatch: Mcp-Method header is missing.' : `Header mismatch: Mcp-Method header value '${method}' does not match body value '${message.method}'.`, 400);
    const named = TASK_METHODS.has(message.method) ? params.taskId : message.method === 'tools/call' ? params.name : message.method === 'resources/read' ? params.uri : message.method === 'prompts/get' ? params.name : undefined;
    if (named !== undefined) {
      const name = headerValue(request.headers.get('Mcp-Name'));
      if (name !== named) return rpcError(id ?? null, HEADER_MISMATCH, name === null ? 'Header mismatch: Mcp-Name header is missing or malformed.' : `Header mismatch: Mcp-Name header value '${name}' does not match body value '${named}'.`, 400);
    }
    const client = meta['io.modelcontextprotocol/clientInfo'];
    if (client !== undefined && (!plain(client) || typeof client.name !== 'string' || typeof client.version !== 'string'))
      return rpcError(id ?? null, -32602, 'io.modelcontextprotocol/clientInfo: expected name and version strings.', id === undefined ? 400 : 200);
    if (client) {
      try { agentActorId('mcp', {name: client.name}); hostAgent = client.name; }
      catch (_) { if (id === undefined) return rpcError(null, -32602, 'clientInfo.name must be a nonempty host name of at most 96 characters, without control characters.', 400); }
    }
    appsClient = declaresAppsUi({ capabilities: meta[META_CLIENT] });
  } else {
    if (message.method !== 'initialize' && header !== null && !LEGACY_VERSIONS.includes(header)) return rpcError(id ?? null, -32600, `MCP-Protocol-Version must be one of ${LEGACY_VERSIONS.join(', ')}.`, 400);
    const session = request.headers.get('Mcp-Session-Id');
    appsClient = session ? await clientSessionApps(editorSecret(env), session, clientSessionBinding(request, authority, door)) : false;
  }
  const scope = requestScope(request, authority, door, modern);
  if (!Object.hasOwn(message, 'id')) {
    if (message.method === 'notifications/cancelled' && scope &&
        (typeof params.requestId === 'string' || Number.isSafeInteger(params.requestId))) {
      const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName('request:' + scope)).fetch(new Request('https://rapier.internal/request/cancel', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key: sha256(JSON.stringify(params.requestId))}),
      }));
      if (!response.ok) return new Response(null, {status: 503});
    }
    return new Response(null, {status: 202, headers: {'Cache-Control': 'no-store'}});
  }
  const fields = {initialize: ['protocolVersion', 'capabilities', 'clientInfo'], 'server/discover': [], 'subscriptions/listen': ['notifications'],
    ping: [], 'tools/list': ['cursor'], 'tools/call': ['name', 'arguments'],
    'prompts/list': [], 'prompts/get': ['name', 'arguments'], 'resources/list': ['cursor'], 'resources/templates/list': ['cursor'], 'resources/read': ['uri'], 'skills/list': ['cursor'], 'skills/get': ['uri'],
    'tasks/get': ['taskId'], 'tasks/update': ['taskId', 'inputResponses'], 'tasks/cancel': ['taskId']};
  const methodFields = Object.hasOwn(fields, message.method) ? fields[message.method] : null;
  if (methodFields) for (const key of Object.keys(params)) {
    if (modern && message.method === 'tools/call' && key === 'task') continue;
    if (key !== '_meta' && !methodFields.includes(key)) return rpcError(id, -32602, 'params: unsupported field ' + key, 200, {path: 'params.' + key});
  }
  const dispatch = async request => {
  const authorityRequest = door === '/editor' && authority?.grant
    ? new Request(authority.grant.audience, {headers: request.headers}) : request;
  let result, headers = {};
  const cacheable = (value, ttlMs, cacheScope) => modern ? { ...value, ttlMs, cacheScope } : value;
  const skillResult = value => ({...value, resultType: 'complete', ttlMs: 3600000, cacheScope: 'public'});
  const complete = value => modern ? {...value, resultType: value.resultType === 'task' ? 'task' : 'complete',
    _meta: {...(plain(value._meta) ? value._meta : {}), [META_SERVER]: serverInfo(env)}} : value;
  if (['page', '/editor'].includes(door) && message.method !== 'tools/call') return rpcError(id, -32601, 'Method not found.');
  const challenged = refusal => {
    const challenge = refusal.headers.get('WWW-Authenticate');
    return json({jsonrpc: '2.0', id, result: complete({isError: true, content: [{type: 'text', text: 'Connect Rapier with the permission this tool needs.'}],
      _meta: {'mcp/www_authenticate': [challenge]}})}, refusal.status, {'WWW-Authenticate': challenge});
  };
  if (authority?.grantUnchecked && message.method !== 'tools/call' && !await oauthGrantCurrent(authority.grant, env))
    return challenged(oauthChallenge(authorityRequest, env));
  try {
    switch (message.method) {
      case 'initialize':
        if (modern) return rpcError(id, -32601, 'Method not found.', 404);
        if (typeof params.protocolVersion !== 'string' || !plain(params.capabilities) || !plain(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') return rpcError(id, -32602, 'initialize requires protocolVersion, capabilities, and clientInfo.');
        result = { protocolVersion: LEGACY_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSION, capabilities: { prompts: {listChanged: false}, tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [UI_MIME] }, 'io.modelcontextprotocol/skills': {} } }, serverInfo: serverInfo(env), instructions };
        headers['Mcp-Session-Id'] = await mintClientSession(editorSecret(env), declaresAppsUi(params), clientSessionBinding(request, authority, door));
        break;
      case 'server/discover':
        if (!modern) return rpcError(id, -32601, 'Method not found.');
        result = { supportedVersions: PROTOCOL_VERSIONS, capabilities: { prompts: {listChanged: false}, tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [UI_MIME] }, 'io.modelcontextprotocol/skills': {}, ...(taskHosting(env, authority) ? {[TASK_EXTENSION]: {}} : {}) } }, instructions, ttlMs: 3600000, cacheScope: 'public' };
        break;
      case 'subscriptions/listen': {
        if (!modern) return rpcError(id, -32601, 'Method not found.');
        if (params.notifications !== undefined && !plain(params.notifications)) return rpcError(id, -32602, 'params.notifications: expected an object.');
        const subscriptionId = {'io.modelcontextprotocol/subscriptionId': id};
        const event = message => `event: message\ndata: ${JSON.stringify({jsonrpc: '2.0', ...message})}\n\n`;
        return new Response(event({method: 'notifications/subscriptions/acknowledged', params: {_meta: subscriptionId, notifications: {}}}) +
          event({id, result: {resultType: 'complete', _meta: subscriptionId}}), {status: 200, headers: {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store'}});
      }
      case 'tasks/get':
      case 'tasks/update':
      case 'tasks/cancel': {
        if (!modern || door === 'page' || !taskHosting(env, authority)) return rpcError(id, -32601, 'Method not found.', modern ? 404 : 200);
        if (!plain(meta[META_CLIENT]?.extensions?.[TASK_EXTENSION])) return rpcError(id, -32021,
          'Missing required client capability.', 400, {requiredCapabilities: {extensions: {[TASK_EXTENSION]: {}}}});
        if (typeof params.taskId !== 'string' || message.method === 'tasks/update' && !plain(params.inputResponses))
          return rpcError(id, -32602, 'Task requests require taskId and updates require inputResponses.');
        result = await taskRoute(message.method.slice('tasks/'.length), params.taskId, params.inputResponses,
          {...authority, door}, env);
        break;
      }
      case 'ping':
        if (modern) return rpcError(id, -32601, 'Method not found.', 404);
        result = {}; break;
      case 'tools/list':
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'Rapier returns its full fixed tool catalog in one page.');
        result = door === '/muse' ? cacheable({ tools: MUSE_DESCRIPTORS }, 3600000, 'public')
          : cacheable({ tools: listedTools(env, appsClient, authority) }, env.HOST_TOOLS_LISTING === 'all' ? 3600000 : 0, env.HOST_TOOLS_LISTING === 'all' ? 'public' : 'private'); break;
      case 'tools/call':
        if (typeof params.name !== 'string' || (params.arguments !== undefined && !plain(params.arguments))) return rpcError(id, -32602, 'tools/call requires name and an arguments object.');
        if (params.name === 'show' && plain(params.arguments) && params.arguments.target === undefined)
          params.arguments = {...params.arguments, target: showTarget(params.arguments)};
        if (!TOOL_BY_NAME.has(params.name) || !['page', '/editor'].includes(door) && !TOOLS.some(tool => tool.name === params.name)) throw failure('UNKNOWN_TOOL', 'Unknown tool.');
        if (TOOL_BY_NAME.has(params.name)) {
          const reads = TOOL_BY_NAME.get(params.name).annotations.readOnlyHint || params.name === 'open' &&
            (params.arguments?.document !== undefined || params.arguments?.url !== undefined) && params.arguments.note === undefined;
          const refusal = requireScope(authorityRequest, env, authority, reads ? ['rapier:read'] : ['rapier:read', 'rapier:write']);
          if (refusal) return challenged(refusal);
        }
        const admission = await takeToolBudget(request, env, authority, params.name, params.arguments || {}, door, meta['rapier/editorKey']);
        if (admission) return json({error: {code: admission.code, message: admission.message,
          ...(admission.retryAfter ? {retryAfter: admission.retryAfter} : {})}}, admission.status,
          admission.retryAfter ? {'Retry-After': String(admission.retryAfter)} : {});
        if (door === 'page' && params.name === PAIR_STATUS) { result = await pairStatus(request, env, authority, params.arguments, cookies); break; }
        result = modern && door !== 'page' && taskTool(params.name, params.arguments) && plain(meta[META_CLIENT]?.extensions?.[TASK_EXTENSION]) && taskHosting(env, authority)
          ? await createTask(params.name, params.arguments || {}, request, authority, env, hostAgent, door)
          : await requestTool(params.name, params.arguments || {}, env, request, authority, hostAgent, door, meta['rapier/editorKey'], meta['rapier/editorActivity'], scope, id, meta['rapier/visual'] ?? null);
        if (authority?.grant && !await oauthGrantCurrent(authority.grant, env)) return challenged(oauthChallenge(authorityRequest, env));
        if (env.ACCESS_PROFILE !== true && door === 'page' && params.name === ROTATE && result.structuredContent?.rotated === true)
          cookies.push(...setCookies(authority.id, sessionCookie(authority.id), await mintSession(editorSecret(env), authority.id, result.structuredContent.rotations), PAIR_SESSION_MS / 1000));
        break;
      case 'skills/list': {
        const bundle = await skillsBundle(request, env);
        const cursor = position => bundle.cursorKey + ':' + position;
        const start = Object.hasOwn(params, 'cursor')
          ? bundle.skills.findIndex((_, position) => position > 0 && position % SKILLS_PAGE_SIZE === 0 && params.cursor === cursor(position)) : 0;
        if (start < 0) return rpcError(id, -32602, 'Unknown or stale skill cursor.');
        const end = start + SKILLS_PAGE_SIZE;
        result = skillResult({skills: bundle.skills.slice(start, end), ...(end < bundle.skills.length ? {nextCursor: cursor(end)} : {})}); break;
      }
      case 'skills/get': {
        const skill = (await skillsBundle(request, env)).skills.find(entry => entry.uri === params.uri);
        if (!skill) return rpcError(id, -32602, 'Unknown skill URI.');
        result = skillResult({skill}); break;
      }
      case 'resources/list': {
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'Rapier returns its resources in one page.');
        const bundle = await skillsBundle(request, env);
        const skills = bundle.skills.flatMap(skill => skill.resources.map(entry => ({
          uri: entry.uri, name: entry.uri === skill.uri ? skill.frontmatter.name : entry.uri.slice('skill://'.length), mimeType: bundle.contents[entry.uri].mimeType,
          ...(entry.uri === skill.uri ? { description: skill.frontmatter.description } : {}) })));
        result = cacheable({ resources: [...GUIDE_RESOURCES, ...(door === '/muse' ? [] : [{ uri: UI_RESOURCE, name: 'rapier-editor', title: 'Rapier document workspace', mimeType: UI_MIME, description: 'The full Rapier editor, connected to the canonical document through the MCP Apps bridge.' }]), ...skills] }, 3600000, 'public'); break;
      }
      case 'prompts/list': result = cacheable({prompts: PROMPTS}, 3600000, 'public'); break;
      case 'prompts/get': {
        const prompt = promptResult(params.name, params.arguments || {});
        if (!prompt) return rpcError(id, -32602, 'Unknown prompt.');
        result = prompt; break;
      }
      case 'resources/templates/list':
        if (Object.hasOwn(params, 'cursor')) return rpcError(id, -32602, 'The empty resource template catalog has no continuation.');
        result = cacheable({resourceTemplates: []}, 3600000, 'public'); break;
      case 'resources/read': {
        if (params.uri.startsWith('skill://')) {
          result = skillResult(await resource(request, env, params.uri)); break;
        }
        if (exportResourceToken(request, params.uri)) {
          const response = await exportResponse(new Request(params.uri, {signal: request.signal}), env, authority);
          if (response.status === 401 || response.status === 403) return response;
          result = cacheable(await exportResource(response, params.uri), 0, 'private'); break;
        }
        if (params.uri === UI_RESOURCE) {
          if (door === '/muse') throw failure('RESOURCE_NOT_FOUND', 'Unknown resource.');
          const refusal = requireScope(authorityRequest, env, authority, ['rapier:read']);
          if (refusal) return refusal;
        }
        result = cacheable(await resource(request, env, params.uri), 0, 'private'); break;
      }
      default: return rpcError(id, -32601, 'Method not found.', modern ? 404 : 200);
    }
  } catch (error) {
    if (request.signal.aborted || error?.name === 'AbortError') return rpcError(id, REQUEST_CANCELLED, 'Request canceled.');
    if ((TASK_METHODS.has(message.method) || message.method === 'tools/call') && Number.isSafeInteger(error?.code)) return rpcError(id, error.code, error.message, 200, error.data);
    if (error?.[PUBLIC_FAILURE] && error.code === 'TOOL_INVOCATION_ADMISSION') {
      const admission = error.details;
      return json({error: {code: admission.code, message: admission.message,
        ...(admission.retryAfter ? {retryAfter: admission.retryAfter} : {})}}, admission.status,
        admission.retryAfter ? {'Retry-After': String(admission.retryAfter)} : {});
    }
    if (error?.[PUBLIC_FAILURE] && error.code === 'REQUEST_ID_IN_USE') return rpcError(id, -32600, error.message);
    if (error?.[PUBLIC_FAILURE] && error.code === 'UNKNOWN_TOOL') return rpcError(id, -32602, error.message);
    if (error?.[PUBLIC_FAILURE] && error.code === 'RESOURCE_NOT_FOUND') return rpcError(id, modern || /^skill:/i.test(params.uri) ? -32602 : -32002, error.message, 200,
      typeof params.uri === 'string' ? {uri: params.uri} : undefined);
    if (error?.[PUBLIC_FAILURE] && ['UI_NOT_BUILT', 'INVALID_UI_CONFIGURATION', 'UI_RESOURCE_TOO_LARGE', 'SKILLS_NOT_BUILT'].includes(error.code)) return rpcError(id, -32603, error.message, 200, error.details);
    if (message.method === 'prompts/get' && error instanceof TypeError) return rpcError(id, -32602, error.message);
    if (message.method === 'tools/call') result = toolError(failure('WORKSPACE_UNAVAILABLE', 'The workspace operation was not acknowledged. Retry an editor commit only with the same commitId.'));
    else return rpcError(id, -32603, 'The server could not complete this request.');
  }
  if (message.method === 'tools/call' && result.resultType !== 'task') result = publicToolResult(params.name, result, door, {workspaceNotes: env.ACCESS_PROFILE === true, appsClient});
  if (door === '/muse' && message.method === 'tools/call' && result.resultType !== 'task' && params.name === 'export' && params.arguments?.format === 'markdown' && parseReply(result.content[0].text).outcome === 'ok') {
    const link = result.content.find(item => item.type === 'resource_link');
    const file = link ? await handleRequest(new Request(link.uri), env, authority) : null;
    const text = file?.ok ? await file.text() : null;
    if (text !== null) result.content[0].text += '\n' + (text.length <= MUSE_EXPORT_TEXT_CHARS ? text
      : `The Markdown is ${text.length} characters, more than one result carries; read it in pages with read.`);
  }
  if (request.signal.aborted) return rpcError(id, REQUEST_CANCELLED, 'Request canceled.');
  result = complete(result);
  const reply = json({ jsonrpc: '2.0', id, result }, 200, headers);
  for (const cookie of cookies) reply.headers.append('Set-Cookie', cookie);
  return reply;
  };
  if (message.method !== 'tools/call' || door === 'page') return dispatch(request);
  const lifetime = createRequestLifetime(request.signal);
  const pending = dispatch(new Request(request.url, {method: 'POST', headers: request.headers, signal: lifetime.signal}))
    .finally(() => lifetime.release());
  return responsiveJson(pending, {signal: request.signal, onDisconnect: () => {
    lifetime.cancel();
    return pending.then(() => undefined);
  }});
}

async function approvePairing(request, env, id, authority) {
  const url = new URL(request.url), reference = url.searchParams.get('pair');
  const display = (status, body) => {
    const nonce = crypto.randomUUID();
    return new Response(request.method === 'HEAD' ? null : `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approve a browser · Rapier</title><link rel="stylesheet" href="/fonts.css"><style nonce="${nonce}">${HOUSE_STYLE}</style><main><h1>Approve a browser</h1>${body}</main></html>`, {
      status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': `default-src 'none'; style-src 'self' 'nonce-${nonce}'; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`},
    });
  };
  const unavailable = () => display(404, '<p>This browser request is unavailable or has expired.</p>');
  if (!/^[a-f0-9]{64}$/.test(reference || '') || [...url.searchParams].length !== 1 || url.hash || pageId(pageAddress(id)) !== id) return unavailable();
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD, POST'}});
  if (authority?.source !== 'browser') return display(401, '<p>Open this link in the browser where you connected Rapier. That browser approves access to this document.</p>');
  let action = 'owner-status';
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded')
      return display(403, '<p>Approve this request on its Rapier page.</p>');
    let form;
    try { form = new URLSearchParams(await readTextBody(request, 1024, 'browser approval')); }
    catch { return display(400, '<p>The browser decision is invalid.</p>'); }
    const decision = form.get('decision');
    if ([...form].length !== 1 || !['allow', 'cancel'].includes(decision)) return display(400, '<p>Choose Allow or Cancel.</p>');
    action = 'owner-' + decision;
  }
  if (!env.DOCUMENTS?.get || !env.DOCUMENTS?.idFromName) return display(503, '<p>Browser approval is temporarily unavailable.</p>');
  try {
    const response = await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(pageAddress(id))).fetch(new Request('https://rapier.internal/pair', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, secretHash: reference, ownerKey: await digest(authority.ownerId)}),
    }));
    if (!response.ok) return display(503, '<p>Browser approval is temporarily unavailable.</p>');
    const value = await parseJsonStream(response, {inlineBytes: 65536});
    if (value.status === 'owner-approved') return display(200, '<p>Approved. Choose Allow in the browser showing the code to finish connecting it.</p>');
    if (value.status === 'cancelled') return display(200, '<p>This browser request was canceled.</p>');
    if (value.status !== 'owner-required') return unavailable();
    const escape = text => String(text).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
    return display(200, `<p>Connect the browser showing <strong>${escape(value.code)}</strong> to <strong>${escape(value.filename)}</strong>?</p><p>It can read and edit this document and control its agent permissions for one day.</p><form method="post" action="${escape(url.pathname + url.search)}"><button type="submit" name="decision" value="allow" class="affirmative">Allow browser</button><button type="submit" name="decision" value="cancel" class="negative">Cancel</button></form>`);
  } catch { return display(503, '<p>The browser decision could not be confirmed. Retry the same request.</p>'); }
}

async function pageCaller(request, env, id, browser) {
  const address = pageAddress(id);
  if (pageId(address) !== id) return null;
  const authority = {};
  if (browser?.source === 'browser') authority.ownerKey = await digest(browser.ownerId);
  if (env.ACCESS_PROFILE === true) {
    if (browser?.access?.kind !== 'browser' || !await env.accessCurrent(browser.access)) return null;
    authority.access = browser.access;
    return Object.freeze({source: 'page', id, address, authority, access: browser.access, scopes: browser.scopes});
  }
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

async function pageSuccessor(env, page, editorKey) {
  const retry = await digest(editorKey + ':' + (page.authority.pairSessionHash || 'owner'));
  const admission = await pageAdmission(env, page, retry);
  if (!admission.admitted || !/^rpr_[A-Za-z0-9_-]{22}$/.test(admission.prefix || '')) return null;
  if (env.ACCESS_PROFILE === true) return {capability: admission.prefix +
    base64url(Uint8Array.from((await digest('access-page-rotation:' + admission.prefix + ':' + admission.epoch + ':' + retry)).match(/../g), byte => parseInt(byte, 16))).slice(0, 21), epoch: admission.epoch, retry};
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(editorSecret(env), 'rapier-page-rotation-v1:'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const suffix = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(admission.prefix + ':' + admission.epoch + ':' + retry)));
  return {capability: admission.prefix + base64url(suffix).slice(0, 21), epoch: admission.epoch, retry};
}

// RAPIER_APPS_HOST flag run once per isolate, asset binding and origin; a request splices in only its own flags.
const PAIRED_PAGE_PARTS = new WeakMap();
const APPS_HOST_FLAG = /globalThis\.RAPIER_APPS_HOST\s*=\s*true;/;
async function pairedPageParts(env, request) {
  let held = PAIRED_PAGE_PARTS.get(env.ASSETS);
  if (!held) PAIRED_PAGE_PARTS.set(env.ASSETS, held = new Map());
  const origin = new URL(request.url).origin;
  if (!held.has(origin)) held.set(origin, (async () => {
    const response = await env.ASSETS.fetch(new Request(new URL('/rapier-app.html', request.url)));
    if (!response.ok) return null;
    let html = await readTextBody(response, MAX_UI_BYTES, 'editor page', 'UI_RESOURCE_TOO_LARGE');
    const versions = [...html.matchAll(/<meta\s+name="rapier-version"\s+content="([^"]+)"\s*\/?\s*>/gi)];
    if (versions.length !== 1 || versions[0][1] !== VERSION) return null;
    html = html.replace(/(<link\b[^>]*\bhref=)(["'])(icon-(?:192|512)\.png)\2/gi, (_, prefix, quote, name) => prefix + quote + '/' + name + quote);
    html = html.replace(/<\/title>\n?/, all => all + PAIRED_PREVIEW);
    const flag = APPS_HOST_FLAG.exec(html);
    return flag ? {before: encoder.encode(html.slice(0, flag.index)), after: encoder.encode(html.slice(flag.index + flag[0].length))} : null;
  })().catch(() => null));
  const parts = await held.get(origin);
  if (!parts) held.delete(origin);
  return parts;
}

async function pairedPage(request, env, page) {
  const socketOrigin = new URL(request.url).origin.replace(/^http/, 'ws');
  const headers = {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': PAGE_CSP.replace("connect-src 'self'", "connect-src 'self' " + socketOrigin)};
  const unavailable = () => new Response('The editor is unavailable.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}});
  if (!env.ASSETS?.fetch || !env.DOCUMENTS?.get || env.ACCESS_PROFILE !== true && !editorSecret(env)) return unavailable();
  try {
    const parts = await pairedPageParts(env, request);
    if (!parts) return unavailable();
    const admitted = (await pageAdmission(env, page)).admitted === true;
    const fileOrigins = (env.FILE_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(value => configuredOrigin(value, 'FILE_DOWNLOAD_ORIGINS'));
    const flags = pageFlagText({id: page.id, editorKey: admitted ? env.ACCESS_PROFILE === true ? page.access.principalId : await mintEditorKey(editorSecret(env), Date.now(), {workspace: page.address, connection: page.authority.ownerKey || ''}) : '', fileOrigins});
    const middle = encoder.encode("globalThis.RAPIER_APPS_HOST = !(window.parent === window && new URLSearchParams(location.hash.slice(1)).has('live') && new URLSearchParams(location.hash.slice(1)).has('key')); "
      + flags + ' globalThis.RAPIER_ASSET_BASE = ' + JSON.stringify(new URL('/editor-assets/', request.url).href) + ';');
    if (request.method === 'HEAD') return new Response(null, {headers});
    const body = new Uint8Array(parts.before.length + middle.length + parts.after.length);
    body.set(parts.before); body.set(middle, parts.before.length); body.set(parts.after, parts.before.length + middle.length);
    return new Response(body, {headers});
  } catch { return unavailable(); }
}

async function editorAdmission(request, env, id, browser) {
  const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
  if (request.method !== 'POST') return new Response(null, {status: 405, headers: {...headers, Allow: 'POST'}});
  const url = new URL(request.url);
  if (url.search || request.headers.get('Origin') !== url.origin || !['same-origin', null].includes(request.headers.get('Sec-Fetch-Site')))
    return json({admitted: false}, 403, headers);
  if (!env.DOCUMENTS?.get || env.ACCESS_PROFILE !== true && !editorSecret(env)) return json({admitted: false}, 503, headers);
  const page = await pageCaller(request, env, id, browser);
  if (!page) return json({admitted: false}, 404, headers);
  try {
    if ((await pageAdmission(env, page)).admitted !== true) return json({admitted: false}, 200, headers);
    const fileOrigins = (env.FILE_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(value => configuredOrigin(value, 'FILE_DOWNLOAD_ORIGINS'));
    return json({admitted: true, editorKey: env.ACCESS_PROFILE === true ? page.access.principalId : await mintEditorKey(editorSecret(env), Date.now(), {workspace: page.address, connection: page.authority.ownerKey || ''}), fileOrigins}, 200, headers);
  } catch { return json({admitted: false}, 503, headers); }
}

async function takePairingStart(request, env) {
  if (!env.BUDGET?.get || !env.BUDGET?.idFromName) return false;
  try {
    const key = 'pairing-start:' + await digest(request.headers.get('CF-Connecting-IP') || 'unknown');
    const response = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({limit: DOOR_LIMITS.pairingStartsPerMinute, windowMs: DOOR_LIMITS.minuteMs}),
    }));
    return response.ok && (await parseJsonStream(response, {inlineBytes: 65536})).allowed === true;
  } catch { return false; }
}

async function pairStatus(request, env, page, args, cookies) {
  if (!plain(args) || args.document !== page.id) return toolError(failure('INVALID_DOCUMENT', 'The page names its own workspace.'));
  if (Object.keys(args).some(key => !['document', 'decision'].includes(key)) ||
      args.decision !== undefined && !['allow', 'cancel'].includes(args.decision)) return toolError(failure('INVALID_DOCUMENT_INPUT', 'Choose allow or cancel for this pairing.'));
  if (env.ACCESS_PROFILE === true) return (await pageAdmission(env, page)).admitted === true
    ? envelope({outcome: 'paired', paired: true}) : toolError(failure('DOCUMENT_UNAVAILABLE', 'This workspace is unavailable to the connected identity.'));
  if (!editorSecret(env)) return toolError(failure('EDITOR_KEY_UNCONFIGURED', 'This deployment cannot pair a browser.'));
  const ask = async body => (await env.DOCUMENTS.get(env.DOCUMENTS.idFromName(page.address)).fetch(new Request('https://rapier.internal/pair', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}))).json();
  const held = readCookie(request, pendingCookie(page.id));
  if (/^[A-Za-z0-9_-]{43}$/.test(held || '')) {
    const status = await ask({action: args.decision || 'status', secretHash: await digest(held)});
    if (status.status === 'absent') return toolError(failure('DOCUMENT_UNAVAILABLE', 'This workspace is unknown, deleted or expired.'));
    if (status.status === 'waiting') return envelope({outcome: 'waiting', paired: false, pairingCode: status.code, codeExpiresAt: new Date(status.expiresAt).toISOString()});
    if (status.status === 'owner-required') return envelope({outcome: 'owner_confirmation_required', paired: false,
      owner_approval_url: new URL('/editor/' + page.id + '?pair=' + await digest(held), request.url).href});
    if (status.status === 'confirmation_required') return envelope({outcome: 'confirmation_required', paired: false});
    if (status.status === 'cancelled') {
      cookies.push(...setCookies(page.id, pendingCookie(page.id), '', 0));
      return envelope({outcome: 'cancelled', paired: false});
    }
    if (status.status === 'paired') {
      cookies.push(...setCookies(page.id, sessionCookie(page.id), await mintSession(editorSecret(env), page.id, status.epoch), PAIR_SESSION_MS / 1000), ...setCookies(page.id, pendingCookie(page.id), '', 0));
      return envelope({outcome: 'paired', paired: true});
    }
  }
  if (args.decision) return envelope({outcome: 'refused', reason: 'pairing_not_ready', paired: false});
  if (!await takePairingStart(request, env)) return envelope({outcome: 'refused', reason: 'busy', paired: false});
  const secret = newSecret(), started = await ask({action: 'start', secretHash: await digest(secret), codes: [newCode(), newCode(), newCode(), newCode()]});
  if (started.status === 'absent') return toolError(failure('DOCUMENT_UNAVAILABLE', 'This workspace is unknown, deleted or expired.'));
  if (!started.code) return envelope({outcome: 'refused', reason: 'busy', paired: false});
  cookies.push(...setCookies(page.id, pendingCookie(page.id), secret, Math.ceil(PAIR_CODE_MS * 3 / 1000)));
  return envelope({outcome: 'waiting', paired: false, pairingCode: started.code, codeExpiresAt: new Date(started.expiresAt).toISOString()});
}

export default { fetch: handleMcp };

const BUDGET_LEASE_MS = 24 * 60 * 60 * 1000;
export class RapierBudget {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.window = null; this.lease = undefined; }
  storedLease() {
    if (this.lease === undefined) {
      const kv = this.ctx.storage.kv, lease = kv.get('lease'), start = kv.get('windowStart'), count = kv.get('count'), resetAt = kv.get('resetAt');
      const written = typeof start === 'number' && typeof count === 'number' && typeof resetAt === 'number' ? {start, until: resetAt, reserved: count} : null;
      this.lease = lease && written ? (lease.until >= written.until ? lease : written) : lease || written;
    }
    return this.lease;
  }
  receipts(now) {
    const retained = this.ctx.storage.kv.get('receipts');
    return Array.isArray(retained) ? retained.filter(entry => entry?.allowed && entry.resetAt > now) : [];
  }
  async fetch(request) {
    let takeId = null;
    if (request.method === 'POST' && new URL(request.url).pathname === '/oauth-store') {
      const body = await parseJsonStream(request, {inlineBytes: 1048576});
      if (body?.op === 'watch') {
        const answer = await oauthStoreRequest(this.ctx, {op: 'get', key: body.key});
        if (answer.state === 'value') watchGrant(this.ctx, body);
        return json(answer);
      }
      const answer = await oauthStoreRequest(this.ctx, body);
      if (body?.op === 'delete' && typeof body.key === 'string' && body.key.startsWith('grant:')) await tellRevoked(this.ctx, this.env, body.key);
      return json(answer);
    }
    try {
      if (this.ctx.storage) this.ctx.storage.operation = 'budget.take';
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/take') return new Response('Not found', { status: 404 });
      let body;
      try { body = await parseJsonStream(request, {inlineBytes: 65536}); } catch { return new Response('Bad request', { status: 400 }); }
      const limit = Number.isSafeInteger(body?.limit) && body.limit > 0 ? body.limit : 1, windowMs = Number.isSafeInteger(body?.windowMs) && body.windowMs > 0 ? body.windowMs : 3600000;
      takeId = typeof body.takeId === 'string' && /^take_[A-Za-z0-9_-]{1,96}$/.test(body.takeId) ? body.takeId : null;
      const now = Date.now(), lease = this.storedLease();
      let window = this.window;
      if (!window || now - window.start >= window.windowMs) {
        const raised = !window && lease?.held?.until > now ? lease.held : null;
        const held = !window && !raised && lease && lease.until > now, resume = held && Number.isSafeInteger(lease.start) && now - lease.start < windowMs;
        window = this.window = raised ? {start: raised.start, windowMs, count: Math.min(limit, raised.reserved), held: true}
          : {start: resume ? lease.start : now, windowMs, count: held ? Math.min(limit, lease.reserved) : 0, held: !!held};
      }
      const resetAt = window.start + window.windowMs;
      const receipts = takeId ? this.receipts(now) : [];
      if (takeId) {
        const prior = receipts.find(entry => entry.id === takeId);
        if (prior) return json({ allowed: prior.allowed, remaining: prior.remaining, resetAt: prior.resetAt, replayed: true, takeId });
      }
      const allowed = window.count < limit;
      if (!allowed) return json({ allowed, remaining: 0, resetAt, ...(takeId ? { takeId } : {}) });
      const count = window.count + 1, remaining = Math.max(0, limit - count), step = Math.max(0, Math.ceil(limit / 10) - 1);
      const base = lease && lease.until > now ? lease : null;
      const covered = window.held ? lease?.held?.until >= resetAt && lease.held.reserved >= count && lease.held.start === window.start
        : base && base.until >= resetAt && base.reserved >= count;
      const next = covered ? lease : window.held
        ? {...(base || {start: window.start, until: now + BUDGET_LEASE_MS, reserved: step}), held: {start: window.start, until: resetAt, reserved: Math.min(limit, count + step)}}
        : {start: window.start, until: Math.max(now + BUDGET_LEASE_MS, resetAt), reserved: Math.min(limit, Math.max(base ? base.reserved : 0, count + step))};
      if (!covered || takeId) {
        this.ctx.storage.transactionSync(() => {
          if (!covered) this.ctx.storage.kv.put('lease', next);
          if (takeId) this.ctx.storage.kv.put('receipts', [...receipts, { id: takeId, allowed, remaining, resetAt }]);
        });
        this.lease = next; window.count = count;
        if (!covered && await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Math.max(next.until, next.held?.until || 0));
        await this.ctx.storage.sync();
      } else window.count = count;
      return json({ allowed, remaining, resetAt, ...(takeId ? { takeId } : {}) });
    } catch (error) {
      this.window = null; this.lease = undefined;
      if (takeId) {
        const prior = this.receipts(Date.now()).find(entry => entry.id === takeId);
        if (prior) return json({ allowed: prior.allowed, remaining: prior.remaining, resetAt: prior.resetAt, replayed: true, takeId, code: 'WORKSPACE_UNAVAILABLE' });
      }
      return json({ allowed: false, code: 'WORKSPACE_UNAVAILABLE', message: 'The budget operation was not acknowledged.' });
    }
  }
  async alarm() {
    try { if (this.ctx.storage) this.ctx.storage.operation = 'budget.alarm'; } catch {}
    const lease = this.ctx.storage.kv.get('lease');
    const resetAt = Math.max(this.ctx.storage.kv.get('resetAt') ?? 0, lease?.until ?? 0, lease?.held?.until ?? 0);
    if (resetAt > Date.now()) {
      await this.ctx.storage.setAlarm(resetAt);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.lease = undefined;
  }
}

function leaseMarks(contexts = {}) {
  const rows = [];
  for (const [key, row] of Object.entries(contexts)) {
    if (row.drawing) return null;
    const {sequence, updatedAt, expiresAt, ...kept} = row;
    rows.push([key, kept]);
  }
  return JSON.stringify(rows);
}

export class RapierDocument {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.grantVerdicts = new GrantVerdicts(env);
    this.pending = Promise.resolve();
    this.leased = null;
    this.persisted = null;
    this.changes = changeSignal();
    this.cachedState = null;
    this.cachedJournal = null;
    this.live = new LiveSessions(this);
    this.relay = new PageRelay(this, {
      markdown: {analyze: analyzeMarkdown, check: checkMarkdownReferences},
      caller: input => ({...resolveCaller({actor: 'agent', principal: remotePrincipal(input), requestId: input.operationId}, {transport: 'mcp'}),
        ...(input.hostAgent ? {hostAgent: input.hostAgent} : {})}),
      inFlight: (input, head, caller) => [this.returnWaiter, this.visualWaiter, this.exportWaiter, this.editorWaiter, head.materialOwner].filter(row => row &&
        row.capabilityHash === input.capabilityHash && row.caller.invocationKey !== caller.invocationKey).map(row => row.caller),
      facts: (head, operation) => ({returns: receivedReturns(head).map(row => { const { name, ...listed } = returnMetadata(row); return listed; }),
        editorContext: {preferences: head.editorPreferences || null, receipts: (head.editorReceipts || []).map(row => row.receipt)},
        ...(operation === 'read' ? {paintBrushes: agentPaintBrushRegistry(), material: true} : {})}),
      decorate: (operation, value, head) => {
        const material = operation === 'read' && value.outcome === 'ok' && materialReport(head);
        return material ? {...value, material} : value;
      },
      envelope: (operation, value, head) => json(operationEnvelope(operation, value, head, {notesVersions: this.env.ACCESS_PROFILE === true})),
      opened: async (input, value, head, state, collaboration) => {
        const result = envelope({...value, outcome: value.outcome === 'ok' ? 'resumed' : value.outcome, created: false, resumed: true}, head,
          {snapshot: {...snapshot(state, collaboration, head.viewIntent, head.visualIntent, head.exportIntent, head.editorIntent),
            ...(head.bearer ? {} : {agentAccess: head.agentAccess !== false}),
            ...(head.askIntent && (this.returnWaiter?.askId === head.askIntent.id || head.askIntent.keptUntil > Date.now()) ? {askIntent: {id: head.askIntent.id, question: head.askIntent.question}} : {}),
            ...(head.humanMessages?.length ? {messagesQueued: head.humanMessages.length} : {})}});
        const current = this.ctx.storage.kv.get('head');
        if (!result.isError && current && current.expiresAt > Date.now()) result._meta = {...result._meta,
          rapier: {...result._meta?.rapier, live: await this.live.grant(current, input)}};
        return json(result);
      },
    });
    this.pace = new WritePace();
    this.returnWaiter = null;
    this.visualWaiter = null;
    this.exportWaiter = null;
    this.editorWaiter = null;
    this.activeRequests = new Map();
    this.taskCalls = new Map();
    this.requestCalls = new Map();
    this.stoppingRequests = new Set();
    this.materialRetries = new Set();
    this.retention = bounded(env.RETENTION_DAYS, 30, 1, 365) * DAY;
    this.maxStateBytes = bounded(env.MAX_STATE_MIB, 48, 8, 64) * 1024 * 1024;
  }

  exclusive(operation, silent = false) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {}).finally(() => { if (!silent && this.changes.size) this.changes.notify(); });
    task.then(() => this.noticeSoon(), () => this.noticeSoon());
    return task;
  }

  peek(input) { return this.exclusive(() => this.operate(input, undefined, undefined, undefined, input.signal), true); }
  answer(input) { return this.exclusive(() => this.operate(input, undefined, undefined, undefined, input.signal), true); }
  grantCurrent(grant) { return oauthGrantCurrent(grant, this.env); }

  waiting() {
    const head = this.ctx.storage.kv.get('head');
    return [this.returnWaiter, this.visualWaiter, this.exportWaiter, this.editorWaiter, head?.materialOwner].filter(Boolean).length;
  }
  noticeSoon() { try { this.live.notify(this.waiting()); } catch {} }

  tasks() {
    const complete = (input, result) => {
      const projected = publicToolResult(input.name, result, input.door, {workspaceNotes: this.env.ACCESS_PROFILE === true});
      return {result: {...projected, resultType: 'complete', _meta: {...projected._meta, [META_SERVER]: serverInfo(this.env)}}};
    };
    return this.taskLifetime ||= new TaskLifetime(this.ctx, {
      authorize: async (input, authority) => (await taskDocument(input, authority, this.env))?.admitted === true,
      recover: async input => {
        const held = await taskDocument(input, input.authority, this.env, true);
        if (held?.admitted !== true || Object.hasOwn(held, 'result') && !plain(held.result))
          throw Object.assign(new Error('Task recovery was not acknowledged.'), {code: -32603});
        if (!Object.hasOwn(held, 'result')) return null;
        const result = held.result;
        if (!result.isError && plain(result.structuredContent))
          result.structuredContent = {...result.structuredContent, document: input.args.document};
        return complete(input, result);
      },
      execute: async (input, signal) => {
        try {
          const result = await callTool(input.name, input.args, this.env, new Request(input.url, {method: 'POST', signal}),
            input.authority, input.hostAgent, input.door, null, false, input.task);
          return complete(input, result);
        } catch (error) {
          if (error?.code === 'CANCELLATION_UNACKNOWLEDGED') throw error;
          return {error: {code: signal.aborted ? REQUEST_CANCELLED : -32603,
            message: signal.aborted ? 'Request canceled.' : 'Task execution failed.'}};
        }
      },
    });
  }

  requestStopped(input) {
    return !!input?.requestKey && (this.stoppingRequests.has(input.requestKey) ||
      (this.ctx.storage.kv.get('requestStops') || []).some(row => row.key === input.requestKey && row.expiresAt > Date.now()));
  }

  async stopRequest(key, expiresAt, active) {
    this.stoppingRequests.add(key);
    active?.lifetime.cancel();
    await this.exclusive(async () => {
      const rows = (this.ctx.storage.kv.get('requestStops') || []).filter(row => row.expiresAt > Date.now() && row.key !== key);
      rows.push({key, expiresAt});
      this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('requestStops', rows));
      const alarm = await this.ctx.storage.getAlarm();
      await this.ctx.storage.setAlarm(Math.min(alarm || Infinity, ...rows.map(row => row.expiresAt)));
      await this.ctx.storage.sync();
    });
    if (active?.done) {
      try { await active.done; }
      catch {
        if (!active.cleanupFailed || !active.input) return new Response(null, {status: 503});
        try {
          await this.exclusive(() => this.cancelOperation(active.input));
          active.cleanupFailed = false;
          if (this.activeRequests.get(key) === active) this.activeRequests.delete(key);
        } catch { return new Response(null, {status: 503}); }
      }
    }
    return new Response(null, {status: 204});
  }

  async cancelRequestOperation(request) {
    const input = await parseJsonStream(request, {inlineBytes: 65536});
    if (!/^request_[a-f0-9]{32}$/.test(input.requestKey || '') || !Number.isSafeInteger(input.requestExpiresAt) ||
        input.requestExpiresAt > Date.now() + REQUEST_LEASE_MS + CLOCK_SKEW_MS) return new Response(null, {status: 400});
    const active = this.activeRequests.get(input.requestKey);
    return this.stopRequest(input.requestKey, input.requestExpiresAt, active);
  }

  async cancelRequestCall(request) {
    const input = await parseJsonStream(request, {inlineBytes: 65536});
    if (!/^[a-f0-9]{64}$/.test(input.key || '')) return new Response(null, {status: 400});
    const active = this.requestCalls.get(input.key);
    if (input.occurrence !== undefined) {
      if (!/^request_[a-f0-9]{32}$/.test(input.occurrence)) return new Response(null, {status: 400});
      return this.stopRequest(input.occurrence, Date.now() + REQUEST_LEASE_MS,
        active?.occurrence === input.occurrence ? active : null);
    }
    if (!active) {
      const found = await new Promise(resolve => {
        const timer = setTimeout(() => { if (this.earlyCancels.get(input.key) === entry) this.earlyCancels.delete(input.key); resolve(null); },
          Number(this.env.REQUEST_OWNER_AFTER_MS ?? REQUEST_OWNER_AFTER_MS) + 1000);
        const entry = {at: Date.now(), found: row => { clearTimeout(timer); resolve(row); }};
        (this.earlyCancels ??= new Map()).set(input.key, entry);
      });
      if (!found) return new Response(null, {status: 204});
      return this.stopRequest(found.occurrence, Date.now() + REQUEST_LEASE_MS, found);
    }
    return this.stopRequest(active.occurrence, Date.now() + REQUEST_LEASE_MS, active);
  }

  async holdRequestCall(request) {
    const input = await parseJsonStream(request, {inlineBytes: 4096});
    if (!/^[a-f0-9]{64}$/.test(input.key || '') || !/^request_[a-f0-9]{32}$/.test(input.occurrence || '') || !Number.isSafeInteger(input.startedAt))
      return new Response(null, {status: 400});
    if (this.requestCalls.has(input.key)) return json({inUse: true});
    const lifetime = createRequestLifetime(), ended = Promise.withResolvers();
    const row = {lifetime, occurrence: input.occurrence, done: ended.promise, ended, held: true};
    this.requestCalls.set(input.key, row);
    const finish = () => {
      lifetime.release(); this.stoppingRequests.delete(input.occurrence);
      if (this.requestCalls.get(input.key) === row) this.requestCalls.delete(input.key);
      ended.resolve();
    };
    request.signal?.addEventListener('abort', () => { if (!lifetime.signal.aborted) finish(); }, {once: true});
    const answer = new Promise(resolve => lifetime.signal.addEventListener('abort', () => resolve(json({cancelled: true})), {once: true}));
    const early = this.earlyCancels?.get(input.key);
    if (early && early.at >= input.startedAt) { this.earlyCancels.delete(input.key); early.found(row); }
    else if (this.stoppingRequests.has(input.occurrence) || (this.ctx.storage.kv.get('requestStops') || []).some(stop => stop.key === input.occurrence && stop.expiresAt > Date.now()))
      lifetime.cancel();
    row.finish = finish;
    return answer;
  }

  holdDone(input) {
    const row = this.requestCalls.get(input?.key);
    if (row?.held && row.occurrence === input.occurrence) row.finish();
    return new Response(null, {status: 204});
  }

  async runRequestCall(request) {
    const key = request.headers.get('X-Rapier-Request'), occurrence = request.headers.get('X-Rapier-Occurrence');
    if (!/^[a-f0-9]{64}$/.test(key || '') || !/^request_[a-f0-9]{32}$/.test(occurrence || '')) return new Response(null, {status: 400});
    if (this.requestCalls.has(key)) return json({error: {code: 'REQUEST_ID_IN_USE', message: 'This request ID is already in use.'}});
    const lifetime = createRequestLifetime(request.signal), row = {lifetime, occurrence, done: null};
    this.requestCalls.set(key, row);
    if (this.stoppingRequests.has(occurrence) || (this.ctx.storage.kv.get('requestStops') || []).some(stop => stop.key === occurrence && stop.expiresAt > Date.now())) lifetime.cancel();
    row.done = (async () => {
      const input = await parseJsonStream(request, {inlineBytes: 65536});
      if (input.key !== key || !plain(input.call)) return new Response(null, {status: 400});
      const call = input.call;
      try {
        const result = await callTool(call.name, call.args, this.env, new Request(call.url, {
          method: 'POST', headers: call.headers, signal: lifetime.signal,
        }), call.authority, call.hostAgent, call.door, call.editorProof, call.editorActivity);
        return lifetime.signal.aborted ? json({cancelled: true}) : json({result});
      } catch (error) {
        if (error?.code === 'CANCELLATION_UNACKNOWLEDGED') throw error;
        if (lifetime.signal.aborted || error?.name === 'AbortError') return json({cancelled: true});
        return json({error: error?.[PUBLIC_FAILURE] ? {code: error.code, message: error.message, details: error.details}
          : {code: 'WORKSPACE_UNAVAILABLE', message: 'The workspace operation was not acknowledged.'}});
      }
    })().finally(() => {
      lifetime.release(); this.stoppingRequests.delete(occurrence);
      if (this.requestCalls.get(key) === row) this.requestCalls.delete(key);
    });
    return row.done;
  }

  async cancelOperation(input) {
    this.cachedState = null; this.cachedJournal = null;
    let head = this.ctx.storage.kv.get('head');
    if (!head || head.ownerKey !== input.ownerKey || head.capabilityHash !== input.capabilityHash || head.expiresAt <= Date.now()) return;
    if (head.custody) return;
    for (const kind of ['visual', 'export']) {
      const held = head[kind + 'TaskInput'], intent = head[kind + 'Intent'];
      if (input.task && held?.task?.key === input.task.key && held.operationId === input.operationId &&
          held.capabilityHash === input.capabilityHash && intent?.task === input.task.key)
        head = await this.retireSurfaceIntent(kind, intent.id, head);
    }
    const caller = this.materialCaller(input), held = this.readMaterial(head);
    if (held?.key === caller.invocationKey) await this.retireMaterial(held, 'cancelled');
    if (!getTool(input.operation) && !(input.humanTool && getHumanOperation(input.operation))) return;
    const current = this.ctx.storage.kv.get('head'), journal = this.readJournal();
    const kernel = createKernel({state: this.readState(current), clock: Date.now, mintId,
      invocationJournal: journal.filter(row => row.key !== caller.invocationKey || row.output?.outcome !== 'pending')});
    const output = await kernel.invoke(input.operation, input.args, {...caller, signal: AbortSignal.abort()});
    if (output.replayed) return;
    await this.persist(current, kernel.snapshot(), kernel.invocationJournal(), true);
  }

  *storedParts(prefix, count) {
    if (count === undefined) throw failure('WORKSPACE_UNAVAILABLE', 'This workspace representation is unavailable. Open a fresh workspace from an exported copy.');
    if (!Number.isSafeInteger(count) || count < 1 || count > Math.ceil(this.maxStateBytes / (CHUNK_CHARS >> 1))) throw failure('CORRUPT_WORKSPACE', 'The stored workspace is incomplete.');
    for (let index = 0; index < count; index++) {
      const chunk = this.ctx.storage.kv.get(prefix + index);
      if (typeof chunk !== 'string') throw failure('CORRUPT_WORKSPACE', 'The stored workspace is incomplete.');
      yield chunk;
    }
  }

  readParts(prefix, count) { return [...this.storedParts(prefix, count)].join(''); }

  readJsonParts(prefix, count) { return count <= 2 ? JSON.parse(this.readParts(prefix, count)) : parseJsonChunks(this.storedParts(prefix, count)); }

  readState(head) {
    requireWorkspaceFormat(head);
    if (this.cachedState) return this.cachedState;
    const state = readWorkspaceState(head, this.readJsonParts('state:', head.parts));
    this.cachedState = { ...state, ...this.readJsonParts('human:', head.contextParts) };
    return this.cachedState;
  }

  readJournal() {
    requireWorkspaceFormat(this.ctx.storage.kv.get('head'));
    if (this.cachedJournal) return this.cachedJournal;
    this.cachedJournal = this.readJsonParts('journal:', this.ctx.storage.kv.get('head')?.journalParts);
    return this.cachedJournal;
  }

  readMaterial(head = this.ctx.storage.kv.get('head')) {
    return head?.materialParts ? this.readJsonParts('material:', head.materialParts) : null;
  }

  readTaskResult(input, head) {
    const row = input.task && head.taskResults?.find(row => row.key === input.task.key &&
      row.owner === input.capabilityHash && row.expiresAt > Date.now());
    if (!row) return null;
    const text = this.readParts('task-result:' + row.key + ':', row.parts);
    if (contentBytes(text) !== row.bytes) throw failure('CORRUPT_WORKSPACE', 'The stored task result is incomplete.');
    return JSON.parse(text);
  }

  requestAuthority(request) {
    if (this.env.ACCESS_PROFILE === true) {
      const reference = request.headers.get('X-Rapier-Access');
      return {access: reference ? JSON.parse(reference) : null, ownerKey: request.headers.get('X-Rapier-Owner')};
    }
    const reference = request.headers.get('X-Rapier-Grant');
    return reference ? {oauthGrant: JSON.parse(reference), ownerKey: request.headers.get('X-Rapier-Owner')} : {};
  }

  retainedAuthority(input) {
    return Object.fromEntries(['ownerKey', 'connectionKey', 'oauthGrant', ...(this.env.ACCESS_PROFILE === true ? ['access'] : [])].filter(field => input[field] !== undefined).map(field => [field, input[field]]));
  }

  async ownerLinkHash(input) {
    const head = this.ctx.storage.kv.get('head');
    if (!head || head.bearer || head.ownerKey !== input.ownerKey || head.agentAccess === false || head.expiresAt <= Date.now()) return null;
    if (input.capabilityHash === undefined && head.rotations > 0) return null;
    if (input.capabilityHash !== undefined && input.capabilityHash !== head.capabilityHash && input.capabilityHash !== await digest(await linkCapability(head, this.env))) return null;
    return head.capabilityHash;
  }

  async assertAuthority(input, {remembered = false} = {}) {
    assertRequestActive(input);
    if (Array.isArray(input)) {
      for (const authority of input) if (authority) await this.assertAuthority(authority, {remembered});
      assertRequestActive(input);
      return;
    }
    if (this.env.ACCESS_PROFILE === true) {
      const grant = input.access || input.page?.access, ownerKey = input.ownerKey || input.page?.ownerKey;
      if (!grant || ownerKey !== await digest(grant.ownerId) || input.editorAuthorized === true && grant.kind !== 'browser' ||
          !await this.env.accessCurrent(grant)) throw failure('OAUTH_AUTHORITY_REVOKED', 'Cloudflare sign-in no longer authorizes this operation.');
      input.signal?.throwIfAborted();
      return;
    }
    if (!input.oauthGrant && !input.connectionKey) return;
    const reference = input.oauthGrant;
    if (!validGrantReference(reference) || input.ownerKey !== await digest(reference.ownerId) ||
        input.connectionKey && input.connectionKey !== await digest(reference.connectionId) ||
        !await this.grantVerdicts.current(reference, {remembered}))
      throw failure('OAUTH_AUTHORITY_REVOKED', 'This connection no longer authorizes the pending operation.');
    input.signal?.throwIfAborted();
  }

  leaseOnly(head, state, journal) {
    const mark = this.persisted, stored = this.ctx.storage.kv.get('head');
    if (!mark || !stored || stored.version !== head.version || stored.version !== mark.version || stored.revision !== mark.revision ||
        stored.contextParts !== mark.contextParts || stored.expiresAt - Date.now() < this.retention - 86400000) return false;
    if (JSON.stringify(head.viewIntent ?? null) !== mark.view || journal.length !== mark.journalLength || journal.at(-1)?.key !== mark.journalLast) return false;
    const contexts = leaseMarks(state.humanContexts);
    return contexts !== null && contexts === mark.contexts;
  }
  leasedHead(head) {
    const held = this.leased;
    if (!held || !head || this.cachedState !== held.state || JSON.stringify(head) !== held.stored) { this.leased = null; return head; }
    return {...head, nextExpiryAt: held.nextExpiryAt, collaboration: held.collaboration, collaborationContext: held.collaborationContext};
  }

  async scheduleAlarm(at) {
    if (await this.ctx.storage.getAlarm() !== at) await this.ctx.storage.setAlarm(at);
  }

  async persist(head, state, journal, contextOnly = false, exported = null, material = undefined, authority = null, taskResult = null) {
    const admittedUntil = head.expiresAt;
    const assertUnexpired = () => {
      if (admittedUntil !== undefined && admittedUntil <= Date.now()) throw failure('DOCUMENT_UNAVAILABLE', 'This workspace expired before the operation could commit.');
    };
    assertUnexpired();
    const previousHead = this.ctx.storage.kv.get('head');
    const live = state && !contextOnly ? this.live.prepare(state, previousHead ? this.readState(previousHead) : null) : null;
    let text, human, journalText, materialText;
    if (material !== undefined) {
      materialText = material === null ? {bytes: 0, parts: 0, *[Symbol.iterator]() {}} : jsonRecord(material, CHUNK_CHARS);
      head.materialBytes = materialText.bytes;
    }
    const expired = (head.exports || []).filter(row => row.expiresAt <= Date.now() || row.owner !== head.capabilityHash);
    if (expired.length) head.exports = head.exports.filter(row => !expired.includes(row));
    head.exportBytes = (head.exports || []).reduce((sum, row) => sum + row.bytes, 0);
    const expiredTasks = (head.taskResults || []).filter(row => row.expiresAt <= Date.now() ||
      row.owner !== head.capabilityHash || row.key === taskResult?.task.key);
    let retainedTask;
    if (head.taskResults || taskResult) {
      head.taskResults = (head.taskResults || []).filter(row => !expiredTasks.includes(row));
      if (taskResult) {
        const text = jsonRecord(taskResult.result, CHUNK_CHARS);
        const row = {key: taskResult.task.key, owner: head.capabilityHash, expiresAt: taskResult.task.expiresAt,
          completedAt: Date.now(), bytes: text.bytes, parts: text.parts};
        if (row.bytes > 16 * 1024 * 1024) throw failure('WORKSPACE_STATE_LIMIT', 'The task result exceeds its storage limit.');
        head.taskResults.push(row);
        retainedTask = {row, text};
      }
      head.taskBytes = head.taskResults.reduce((sum, row) => sum + row.bytes, 0);
    }
    if (state) {
      requireWorkspaceFormat(head);
      if (state.commitResults) state.commitResults = state.commitResults.filter(row => head.receipts.some(receipt => receipt.id === row.id));
      const { humanContexts, contextSequences, clock, ...canonical } = state;
      human = jsonRecord({ humanContexts, contextSequences, clock }, CHUNK_CHARS);
      head.contextBytes = human.bytes;
      if (!contextOnly) {
        text = jsonRecord({format: WORKSPACE_STATE_FORMAT, metadata: workspaceMetadata(canonical), state: canonical}, CHUNK_CHARS, {contentDefined: true});
        head.stateBytes = text.bytes;
      }
      if (Array.isArray(journal)) {
        journalText = jsonRecord(journal, CHUNK_CHARS, {contentDefined: true});
        head.journalBytes = journalText.bytes;
      }

    }
    const expiresAt = Date.now() + this.retention;
    const renew = !(head.expiresAt > expiresAt - 60000);
    if (!state && !renew && !expired.length && !expiredTasks.length && !exported && !taskResult && material === undefined) return;
    if (renew) head.expiresAt = expiresAt;
    const records = [
      {prefix: 'state:', field: 'parts', text},
      {prefix: 'human:', field: 'contextParts', text: human},
      {prefix: 'journal:', field: 'journalParts', text: journalText},
      {prefix: 'material:', field: 'materialParts', text: materialText},
    ].filter(row => row.text !== undefined).map(row => ({...row, previous: head[row.field] || 0}));
    for (const row of records) head[row.field] = row.text.parts ?? Math.ceil(row.text.chars / (CHUNK_CHARS >> 1));
    const retainedBytes = (head.stateBytes || 0) + (head.contextBytes || 0) + (head.journalBytes || 0) +
      head.exportBytes + (head.returnBytes || 0) + (head.materialBytes || 0) + (head.taskBytes || 0) + contentBytes(JSON.stringify(head));
    if (retainedBytes > this.maxStateBytes) throw failure('WORKSPACE_STATE_LIMIT', 'This would exceed the workspace size. Let pending work or temporary exports finish before adding more.', {limitBytes: this.maxStateBytes});
    if (contentBytes(JSON.stringify(head)) > 2_000_000 - 1024) throw failure('WORKSPACE_STATE_LIMIT', 'The workspace metadata is full. Let temporary exports expire before creating another.', {limitBytes: this.maxStateBytes});
    if (this.env.ACCESS_PROFILE === true && typeof this.beforePersist === 'function') await this.beforePersist(head, state, journal, authority);
    await this.ctx.storage.transaction(async () => {
      if (authority) await this.assertAuthority(authority, {remembered: authority.operation === 'read'});
      assertRequestActive(authority);
      assertUnexpired();
      for (const row of expired) for (let index = 0; index < row.parts; index++) this.ctx.storage.kv.delete('export:' + row.id + ':' + index);
      for (const row of expiredTasks) for (let index = 0; index < row.parts; index++) this.ctx.storage.kv.delete('task-result:' + row.key + ':' + index);
      if (retainedTask) {
        let index = 0;
        for (const chunk of retainedTask.text) this.ctx.storage.kv.put('task-result:' + retainedTask.row.key + ':' + index++, chunk);
      }
      if (exported) for (let index = 0; index < exported.grant.parts; index++) {
        this.ctx.storage.kv.put('export:' + exported.grant.id + ':' + index, exported.bytes.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS));
      }
      for (const row of records) {
        let index = 0;
        for (const chunk of row.text) {
          const key = row.prefix + index++;
          if (this.ctx.storage.kv.get(key) !== chunk) this.ctx.storage.kv.put(key, chunk);
        }
        head[row.field] = index;
        for (; index < row.previous; index++) this.ctx.storage.kv.delete(row.prefix + index);
      }
      this.ctx.storage.kv.put('head', head);
      const stops = this.ctx.storage.kv.get('requestStops') || [];
      await this.scheduleAlarm(Math.min(head.expiresAt, head.materialIntent?.expiresAt || Infinity, this.live.nextAlarm(),
        ...(head.taskResults || []).map(row => row.expiresAt), ...stops.map(row => row.expiresAt)));
      assertRequestActive(authority);
    });
    await this.ctx.storage.sync();
    this.leased = null;
    const prior = this.persisted;
    this.persisted = {version: head.version, revision: head.revision, contextParts: head.contextParts, view: JSON.stringify(head.viewIntent ?? null),
      journalLength: Array.isArray(journal) ? journal.length : prior?.journalLength, journalLast: Array.isArray(journal) ? journal.at(-1)?.key : prior?.journalLast,
      contexts: state ? leaseMarks(state.humanContexts) : prior?.contexts ?? null};
    if (state) this.cachedState = state;
    if (journalText !== undefined) this.cachedJournal = journal;
    if (live) this.live.publish(live, head);
    this.wakeMaterialRetries();
  }

  describe(state, head, version, collaboration) {
    const expiries = [collaboration.nextExpiryAt, head.viewIntent?.status === 'pending' && head.viewIntent.kind !== 'mode' ? head.viewIntent.expiresAt : null, head.editorIntent?.expiresAt, head.materialIntent?.expiresAt].filter(value => Number.isFinite(value) && value > 0);
    return { ...head, documentId: state.documentId, revision: state.revision, filename: state.filename, docKind: state.docKind, chars: state.text.length, version, collaboration: collaborationSummary(collaboration), collaborationContext: collaborationContext(collaboration), nextExpiryAt: expiries.length ? Math.min(...expiries) : null };
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/live' && request.method === 'GET') return this.exclusive(() => this.live.upgrade(request));
    if (path === '/live/stop' && request.method === 'POST') return (async () => {
      const head = this.ctx.storage.kv.get('head');
      const access = this.env.ACCESS_PROFILE === true ? this.requestAuthority(request).access : undefined;
      if (head?.custody && (await this.live.admit(head, request.headers.get('X-Rapier-Live-Owner'), this.live.stopBinding.bind(this.live), access)).ok)
        await this.relay.recall();
      return this.exclusive(() => this.live.stop(request));
    })();
    if (path === '/grant-revoked' && request.method === 'POST') {
      const body = await parseJsonStream(request, {inlineBytes: 4096}).catch(() => null);
      return new Response(null, {status: this.grantVerdicts.revoked(body?.key) ? 204 : 400});
    }
    if (path === '/owner-link' && request.method === 'POST') return this.exclusive(async () => {
      const input = await parseJsonStream(request, {inlineBytes: 65536}), head = this.ctx.storage.kv.get('head');
      try {await this.assertAuthority(input);} catch {return json({admitted: false});}
      if (!head || head.bearer || head.ownerKey !== input.ownerKey || head.agentAccess === false || head.expiresAt <= Date.now()) return json({admitted: false});
      if (input.capabilityHash === undefined && head.rotations > 0) return json({admitted: false});
      const document = await linkCapability(head, this.env);
      if (input.capabilityHash !== undefined && input.capabilityHash !== head.capabilityHash && input.capabilityHash !== await digest(document)) return json({admitted: false});
      return json({document, capabilityHash: head.capabilityHash});
    });
    if (['/task/authority', '/task/recover'].includes(path) && request.method === 'POST') return this.exclusive(async () => {
      const input = await parseJsonStream(request, {inlineBytes: 65536});
      try { await this.assertAuthority(input); } catch { return json({admitted: false}); }
      const head = this.ctx.storage.kv.get('head');
      const admitted = !!head && head.expiresAt > Date.now() && head.agentAccess !== false &&
        head.ownerKey === input.ownerKey && head.capabilityHash === input.capabilityHash;
      if (!admitted) return json({admitted: false});
      if (path === '/task/recover' && /^[a-f0-9]{64}$/.test(input.taskKey || '') && Number.isSafeInteger(input.deadline)) {
        const held = head.taskResults?.find(row => row.key === input.taskKey && row.owner === input.capabilityHash &&
          row.expiresAt > Date.now() && Number.isSafeInteger(row.completedAt) && row.completedAt <= input.deadline);
        if (held) return json({admitted: true, result: this.readTaskResult({...input, task: {key: input.taskKey}}, head)});
      }
      return json({admitted: true});
    });
    if (['/task/create', '/task/get', '/task/update', '/task/cancel'].includes(path) && request.method === 'POST') {
      const body = await parseJsonStream(request, {inlineBytes: 65536});
      try {
        const tasks = this.tasks();
        const result = path === '/task/create' ? await tasks.create(body.taskId, body.input, body.authority)
          : path === '/task/get' ? await tasks.get(body.taskId, body.authority)
          : path === '/task/update' ? await tasks.update(body.taskId, body.input, body.authority)
          : await tasks.cancel(body.taskId, body.authority);
        return json({result});
      } catch (error) { return json({error: {code: Number.isSafeInteger(error?.code) ? error.code : -32603,
        message: Number.isSafeInteger(error?.code) ? error.message : 'Task unavailable.'}}); }
    }
    if (path === '/request/call' && request.method === 'POST') return this.runRequestCall(request).catch(() => new Response(null, {status: 503}));
    if (path === '/request/hold' && request.method === 'POST') return this.holdRequestCall(request).catch(() => new Response(null, {status: 503}));
    if (path === '/request/hold/done' && request.method === 'POST') return parseJsonStream(request, {inlineBytes: 4096}).then(input => this.holdDone(input), () => new Response(null, {status: 400}));
    if (path === '/request/cancel' && request.method === 'POST') return this.cancelRequestCall(request).catch(() => new Response(null, {status: 503}));
    if (path === '/operation/cancel' && request.method === 'POST') return this.cancelRequestOperation(request).catch(() => new Response(null, {status: 503}));
    if (path === '/return' && ['GET', 'POST'].includes(request.method)) return this.exclusive(() => this.acceptReturn(request));
    if (path === '/export' && ['GET', 'HEAD'].includes(request.method)) return this.exclusive(() => this.readExport(request));
    if (path === '/pair' && request.method === 'POST') return this.env.ACCESS_PROFILE === true ? new Response(null, {status: 404}) : this.exclusive(() => this.pairing(request));
    if (path === '/page' && request.method === 'POST') return this.exclusive(async () => {
      const head = this.ctx.storage.kv.get('head'), body = await parseJsonStream(request, {inlineBytes: 65536}).catch(() => null);
      if (this.env.ACCESS_PROFILE === true) {
        try {await this.assertAuthority(body?.authority || {});} catch {return json({admitted: false});}
      }
      const replaying = body?.rotationRetry && this.replaysPageRotation(head, body.authority, body.rotationRetry);
      const admitted = !!head && head.expiresAt > Date.now() && plain(body?.authority) && (this.admits(head, body.authority) || replaying);
      return json(admitted ? { admitted, prefix: head.prefix, ownerKey: head.ownerKey, bearer: head.bearer === true, epoch: replaying ? head.rotation.pageEpoch : head.pairEpoch || 0 } : { admitted });
    });
    try {
      if (request.method !== 'POST' || path !== '/operation') return new Response(null, { status: 404 });
      const input = await parseJsonStream(request, {inlineBytes: 65536});
      if (this.env.ACCESS_PROFILE === true) {
        if (!plain(input)) return new Response(null, {status: 400});
        await this.assertAuthority(input);
      }
      if (plain(input) && input.workspaceAddress !== undefined) { this.grantVerdicts.learn(input.workspaceAddress); delete input.workspaceAddress; }
      if (plain(input) && input.ownerLink !== undefined) {
        if (input.ownerLink !== true || input.page) return new Response(null, {status: 400});
        delete input.ownerLink;
        const linked = await this.ownerLinkHash(input);
        if (linked) input.capabilityHash = linked;
      }
      if (plain(input) && plain(input.page)) {
        const head = this.ctx.storage.kv.get('head');
        const replaying = input.operation === ROTATE && this.replaysPageRotation(head, input.page, input.page.rotationRetry);
        if (!head || head.expiresAt <= Date.now() || !this.admits(head, input.page) && !replaying ||
            input.operation === ROTATE && input.page.rotationEpoch !== (replaying ? head.rotation.pageEpoch : head.pairEpoch || 0))
          return json(toolError(failure('PAIRING_REQUIRED', 'This browser is not paired with this workspace. Open its editor link and give the assistant the code the page shows.')));
        if (input.pageBudgetAddress !== undefined) {
          if (typeof input.pageBudgetAddress !== 'string') return new Response(null, {status: 400});
          const admission = await takeVerifiedToolBudget(this.env, true,
            head.bearer ? 'address:' + input.pageBudgetAddress : 'page-owner:' + head.ownerKey);
          delete input.pageBudgetAddress;
          if (admission) return json({toolAdmission: admission});
        }
        Object.assign(input, { capabilityHash: replaying ? head.rotation.predecessorHash : head.capabilityHash, ownerKey: head.ownerKey,
          ...(input.operation === ROTATE ? {pageRetry: input.page.rotationRetry, ...(input.page.pairSessionHash ? {pageSessionHash: input.page.pairSessionHash} : {})} : {}) });
      }
      if (!plain(input) || !/^[a-f0-9]{64}$/.test(input.ownerKey || '') || !/^[a-f0-9]{64}$/.test(input.capabilityHash || '') || (input.connectionKey !== undefined && (!/^[a-f0-9]{64}$/.test(input.connectionKey) || !validGrantReference(input.oauthGrant))) || typeof input.operation !== 'string' || !plain(input.args) || (input.prefix !== undefined && !/^rpr_[A-Za-z0-9_-]{22}$/.test(input.prefix)) || (input.rotateToHash !== undefined && !/^[a-f0-9]{64}$/.test(input.rotateToHash)) || (input.operationId !== undefined && (typeof input.operationId !== 'string' || !input.operationId.length || input.operationId.length > 256 || [...input.operationId].length > 128)) || (input.returnAddress !== undefined && !/^[a-f0-9]{64}$/.test(input.returnAddress)) || (input.exportAddress !== undefined && !/^[a-f0-9]{64}$/.test(input.exportAddress))) return new Response(null, { status: 400 });
      if (input.create === true && (!plain(input.createBudget) || !/^take_[a-f0-9]{32}$/.test(input.createBudget.takeId || '') || !/^[a-f0-9]{64}$/.test(input.createBudget.principalKey || '') || typeof input.createBudget.retryable !== 'boolean' || ![undefined, true].includes(input.createBudget.anonymous))) return new Response(null, { status: 400 });
      if (input.waitBound !== undefined && (!(input.operation === 'show' && input.args.target === 'ask') || ![MUSE_WAIT_MS, 120000].includes(input.waitBound))) return new Response(null, {status: 400});
      if (input.holdBound !== undefined && (!['edit', 'undo'].includes(input.operation) || input.holdBound !== MUSE_WAIT_MS)) return new Response(null, {status: 400});
      if (input.peek !== undefined && (input.peek !== true || input.operation !== 'read')) return new Response(null, {status: 400});
      if (input.waitFor !== undefined && (!validWait(input.waitFor, input.operation) || input.peek !== undefined || input.args.as === 'image')) return new Response(null, {status: 400});
      input.operationId ??= crypto.randomUUID();
      if (input.task !== undefined && (!plain(input.task) || !/^[a-f0-9]{64}$/.test(input.task.key || '') ||
          !Number.isSafeInteger(input.task.expiresAt) || input.task.expiresAt <= Date.now() || input.task.expiresAt > Date.now() + TASK_TTL_MS + CLOCK_SKEW_MS ||
          !Number.isSafeInteger(input.task.deadline) || input.task.deadline > input.task.expiresAt || !taskTool(input.operation, input.args)))
        return new Response(null, {status: 400});
      const lifetime = createRequestLifetime(request.signal);
      const key = input.requestKey;
      const expiresAt = input.requestExpiresAt;
      if (key !== undefined && (!/^request_[a-f0-9]{32}$/.test(key) || !Number.isSafeInteger(expiresAt) || expiresAt > Date.now() + REQUEST_LEASE_MS + CLOCK_SKEW_MS))
        return new Response(null, {status: 400});
      const heldTask = input.task && this.taskCalls.get(input.task.key);
      if (heldTask) {
        lifetime.release();
        if (key) this.activeRequests.set(key, heldTask);
        const abort = () => heldTask.lifetime.cancel();
        request.signal.addEventListener('abort', abort, {once: true});
        if (request.signal.aborted || this.stoppingRequests.has(key) ||
            (this.ctx.storage.kv.get('requestStops') || []).some(row => row.key === key && row.expiresAt > Date.now())) abort();
        try {
          const reply = await heldTask.done;
          return new Response(reply.body, {status: reply.status, headers: reply.headers});
        } finally {
          request.signal.removeEventListener('abort', abort);
          if (key && this.activeRequests.get(key) === heldTask) this.activeRequests.delete(key);
          this.stoppingRequests.delete(key);
        }
      }
      Object.defineProperty(input, 'signal', {value: lifetime.signal});
      const record = {input, lifetime, done: null};
      if (key && this.activeRequests.has(key)) return new Response(null, {status: 409});
      if (key) this.activeRequests.set(key, record);
      if (input.task) this.taskCalls.set(input.task.key, record);
      const stopped = this.stoppingRequests.has(key) || (this.ctx.storage.kv.get('requestStops') || []).some(row => row.key === key && row.expiresAt > Date.now());
      if (stopped || Number.isSafeInteger(expiresAt) && expiresAt <= Date.now()) lifetime.cancel();
      const timer = Number.isSafeInteger(expiresAt) ? setTimeout(() => lifetime.cancel(), Math.max(0, expiresAt - Date.now())) : null;
      const run = async () => {
      if (this.env.ACCESS_PROFILE === true) await this.assertAuthority(input);
      const paced = await this.paceWrite(input);
      if (paced) return json(paced);
      const relayed = await this.relay.route(input, lifetime.signal);
      if (relayed) {
        if (input.operation === 'edit') {
          const result = await relayed.clone().json();
          if (['applied', 'rebased'].includes(result.structuredContent?.outcome) && result.structuredContent?.previews?.length)
            return json(await this.drawingPreviews(input, lifetime.signal, result));
        }
        return relayed;
      }
      if (input.operation === 'document.material_ack') {
        const result = await this.exclusive(() => this.operate(input));
        await this.resumeMaterial();
        return json(result);
      }
      if (input.operation === 'document.sync') await this.resumeMaterial();
      if (input.waitFor) return json(await waitInObject(this, input, lifetime.signal));
      if (input.operation === 'show' && input.args.target === 'ask') return await this.waitForReturn(input, lifetime.signal);
      if (input.operation === 'read' && input.args.as === 'image') return await this.inspectVisual(input, lifetime.signal);
      if (input.operation === 'export' && ['docx', 'pdf', 'page'].includes(input.args.format)) return await this.exportDocument(input, lifetime.signal);
      if (input.operation === 'show' && ['view', 'preferences', 'file', 'read_aloud', 'plugin', 'playback'].includes(input.args.target) || input.operation === 'export' && input.args.to === 'clipboard') return await this.requestEditor(input, lifetime.signal);
      if (['edit', 'undo'].includes(input.operation) ||
          input.operation === 'document.read' && input.args.paintSample) return await this.requestMaterials(input, lifetime.signal);
      return await this.exclusive(async () => {
        const result = await this.operate(input, undefined, undefined, undefined, lifetime.signal);
        if (!result.isError && (input.operation === 'open' || input.editorAuthorized === true)) {
          const head = this.ctx.storage.kv.get('head');
          if (head && head.expiresAt > Date.now()) result._meta = {...result._meta,
            rapier: {...result._meta?.rapier, live: await this.live.grant(head, input)}};
        }
        if (input.editorAuthorized === true && input.editorActivity === true && !result.isError && ['document.commit', 'document.human_context'].includes(input.operation)) {
          const head = this.ctx.storage.kv.get('head'), now = Date.now();
          if (head && head.expiresAt > now) {
            if (!(head.editorIssuedAt > now - 60000 && head.editorIssuedAt <= now)) {
              head.editorIssuedAt = now;
              this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
              await this.ctx.storage.sync();
            }
            result._meta = {...result._meta, rapier: {...result._meta?.rapier, editorIssuedAt: now}};
          }
        }
        return json(result);
      }, input.operation === 'read');
      };
      record.done = (async () => {
        let response;
        try {
          response = await run();
          if (this.env.ACCESS_PROFILE === true) await this.assertAuthority(input);
        }
        catch (error) { if (!lifetime.signal.aborted && error?.name !== 'AbortError') throw error; }
        if (lifetime.signal.aborted) {
          try { await this.exclusive(() => this.cancelOperation(input)); }
          catch (error) { record.cleanupFailed = true; throw error; }
          return new Response(null, {status: 499});
        }
        return response;
      })().then(async response => input.task ? {body: await response.arrayBuffer(), status: response.status,
        headers: [...response.headers]} : response).finally(() => {
        clearTimeout(timer); lifetime.release();
        this.stoppingRequests.delete(key);
        if (key && !record.cleanupFailed && this.activeRequests.get(key) === record) this.activeRequests.delete(key);
        if (input.task && this.taskCalls.get(input.task.key) === record) this.taskCalls.delete(input.task.key);
      });
      const reply = await record.done;
      return input.task ? new Response(reply.body, {status: reply.status, headers: reply.headers}) : reply;
    } catch (error) {
      this.cachedState = null;
      this.cachedJournal = null;
      this.live.reset();
      const inputVerdict = error instanceof TypeError && ['filename_invalid', 'document_kind_invalid'].includes(error.message);
      return json(toolError(inputVerdict ? failure('INVALID_DOCUMENT_INPUT', error.message) : error));
    }
  }

  webSocketMessage(socket, message) {
    if (this.env.ACCESS_PROFILE === true) return (async () => {
      const attached = this.live.attachment(socket);
      if (!attached?.access || !await this.env.accessCurrent(attached.access)) {this.live.close(socket); return;}
      return this.relay.intercept(socket, message) ?? this.exclusive(() => this.live.message(socket, message));
    })();
    return this.relay.intercept(socket, message) ?? this.exclusive(() => this.live.message(socket, message));
  }
  webSocketClose(socket) { this.relay.disconnected(socket); return this.exclusive(() => this.live.disconnected(socket)); }
  webSocketError(socket) { this.relay.disconnected(socket); return this.exclusive(() => this.live.disconnected(socket)); }

  admits(head, authority) {
    if (this.env.ACCESS_PROFILE === true) return !!head && !head.bearer && authority?.access?.kind === 'browser' &&
      authority.ownerKey === head.ownerKey && authority.ownerKey === sha256(authority.access.ownerId) &&
      this.env.accessLease(authority.access) > Date.now();
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

  async pairing(request) {
    try {
      const body = await parseJsonStream(request, {inlineBytes: 65536}), now = Date.now();
      const head = structuredClone(this.ctx.storage.kv.get('head'));
      if (!head || head.expiresAt <= now) return json({ status: 'absent' });
      if (!plain(body) || !/^[a-f0-9]{64}$/.test(body.secretHash || '')) return new Response(null, { status: 400 });
      const live = (head.pairings || []).filter(row => row.confirmedAt ? row.confirmedAt + 2 * PAIR_CODE_MS > now : row.expiresAt > now);
      const save = async () => {
        head.pairings = live;
        this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
        await this.ctx.storage.sync();
      };
      if (['owner-status', 'owner-allow', 'owner-cancel'].includes(body.action)) {
        if (head.bearer || body.ownerKey !== head.ownerKey) return json({status: 'absent'});
        const row = live.find(entry => entry.secretHash === body.secretHash && entry.confirmedAt);
        if (!row) return json({status: 'absent'});
        if (body.action === 'owner-cancel') {
          live.splice(live.indexOf(row), 1); await save();
          return json({status: 'cancelled'});
        }
        if (body.action === 'owner-allow' && !row.ownerApprovedAt) { row.ownerApprovedAt = now; await save(); }
        return json(row.ownerApprovedAt ? {status: 'owner-approved'} : {status: 'owner-required', code: row.code, filename: head.filename});
      }
      if (['status', 'allow', 'cancel'].includes(body.action)) {
        const row = live.find(entry => entry.secretHash === body.secretHash);
        if (!row) {
          if (live.length !== (head.pairings || []).length) await save();
          return json({ status: 'expired' });
        }
        const ownerRequired = row.confirmedAt && !head.bearer && !row.ownerApprovedAt;
        if (body.action === 'status') return json(ownerRequired ? {status: 'owner-required'} : row.confirmedAt
          ? {status: 'confirmation_required'} : {status: 'waiting', code: row.code, expiresAt: row.expiresAt});
        if (body.action === 'allow' && !row.confirmedAt) return json({status: 'not_ready'});
        if (body.action === 'allow' && ownerRequired) return json({status: 'owner-required'});
        live.splice(live.indexOf(row), 1);
        if (body.action === 'allow') head.pairedAt = now;
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
    const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex'};
    try {
      const head = this.ctx.storage.kv.get('head'), byHash = request.headers.get('X-Rapier-Export-Hash');
      const authority = this.requestAuthority(request);
      await this.assertAuthority(authority);
      if (head && (byHash ? !head.bearer && head.agentAccess === false : head.bearer || head.ownerKey !== request.headers.get('X-Rapier-Owner'))) return new Response(null, {status: 404, headers});
      if (!head || head.expiresAt <= Date.now()) return new Response(null, {status: 410, headers});
      const row = head.exports?.find(row => byHash ? row.hash === byHash : row.id === request.headers.get('X-Rapier-Export-ID'));
      if (!row) return new Response(null, {status: 404, headers});
      if (byHash && row.authority) {
        try { await this.assertAuthority({...row.authority}); } catch { return new Response(null, {status: 404, headers}); }
      }
      if (row.expiresAt <= Date.now() || row.owner !== head.capabilityHash) return new Response(null, {status: 410, headers});
      if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > MAX_EXPORT_BYTES ||
          row.parts !== Math.ceil(row.bytes / CHUNK_CHARS)) throw new Error('export byte limit');
      const bytes = new Uint8Array(row.bytes);
      for (let index = 0; index < row.parts; index++) {
        const part = this.ctx.storage.kv.get('export:' + row.id + ':' + index);
        if (!(part instanceof Uint8Array) || part.length !== Math.min(CHUNK_CHARS, row.bytes - index * CHUNK_CHARS)) throw new Error('export incomplete');
        bytes.set(part, index * CHUNK_CHARS);
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== row.sha256) throw new Error('export changed');
      await this.assertAuthority(authority);
      const name = encodeURIComponent(row.name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
      return new Response(request.method === 'HEAD' ? null : bytes, {headers: {...headers, 'Content-Type': row.mimeType + (row.mimeType.startsWith('text/') ? '; charset=utf-8' : ''),
        'Content-Length': String(row.bytes), 'Content-Disposition': "attachment; filename*=UTF-8''" + name}});
    } catch { return new Response(null, {status: 503, headers}); }
  }

  async acceptReturn(request) {
    try {
      try { this.ctx.storage.operation = 'return'; } catch {}
      const head = structuredClone(this.ctx.storage.kv.get('head')), byHash = request.headers.get('X-Rapier-Return-Hash');
      const authority = this.requestAuthority(request);
      await this.assertAuthority(authority);
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
      await this.assertAuthority(authority);
      if ((head.stateBytes || 0) + (head.contextBytes || 0) + (head.journalBytes || 0) + (head.materialBytes || 0) +
          (head.exportBytes || 0) + head.returnBytes + (head.taskBytes || 0) + contentBytes(JSON.stringify(head)) > this.maxStateBytes)
        return returnRefused('The workspace cannot retain this return.', 507);
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
      await this.assertAuthority(input);
      const head = this.ctx.storage.kv.get('head'), mode = input.args.wait || 'message';
      const refused = reason => ({ value: { outcome: 'refused', reason } });
      if (!head || head.ownerKey !== input.ownerKey || head.capabilityHash !== input.capabilityHash || head.agentAccess === false || head.expiresAt <= Date.now()) return refused('return_unavailable');
      const key = resolveCaller({ actor: 'agent', principal: remotePrincipal(input), requestId: input.operationId }, { transport: 'mcp' }).invocationKey;
      if (this.readJournal().some(row => row.key === key || row.spent?.some(([heldKey]) => heldKey === key))) return { value: null };
      if (this.returnWaiter) return refused('wait_already_pending');
      if (mode === 'selection' && input.args.after_return_id !== undefined) return refused('return_cursor_needs_message_mode');
      const received = receivedReturns(head), after = input.args.after_return_id;
      if (after && !received.some(row => row.id === after)) return refused('return_unavailable');
      const latest = received.at(-1);
      if (mode === 'message' && latest && latest.id !== after) return { value: { outcome: 'ok', returned: returnMetadata(latest) } };
      if (mode === 'message' && head.humanMessages?.length) {
        const words = head.humanMessages;
        const dropped = head.humanMessagesDropped || 0;
        const state = this.readState(head);
        head.humanMessages = []; delete head.humanMessagesDropped; head.version++; this.ctx.storage.kv.put('head', head);
        return { value: {
          outcome: 'message',
          text: words.map(row => row.text).join('\n'),
          count: words.length,
          messages: words.map(row => deliverHumanMessage(row, state)),
          truncated: words.some(row => row.truncated === true),
          ...(dropped ? {dropped} : {}),
        } };
      }
      const now = Date.now(), present = head.collaboration?.presence?.active && head.collaboration.presence.expiresAt > now;
      const returnOpen = (head.returns || []).some(row => !row.receivedAt && !(row.expiresAt <= now));
      if (!present && (mode === 'selection' || !returnOpen)) return refused('editor_unavailable');
      const waiter = createRequestWait({signal, timeoutMs: input.task ? Math.max(0, input.task.deadline - Date.now()) : waitTimeout(input.args.timeout_ms, input.waitBound),
        onFinish: settled => { if (this.returnWaiter === settled) this.returnWaiter = null; }});
      waiter.mode = mode;
      waiter.capabilityHash = input.capabilityHash;
      if (mode === 'message') {
        waiter.askId = mintId('ask_');
        head.askIntent = {id: waiter.askId, question: typeof input.args.question === 'string' ? input.args.question.slice(0, 500) : ''};
        head.version++; this.ctx.storage.kv.put('head', head);
        const askId = waiter.askId;
        const settle = result => void this.exclusive(async () => {
          const current = this.ctx.storage.kv.get('head');
          if (current?.askIntent?.id !== askId) return;
          if (result?.kind === 'timeout') current.askIntent = {...current.askIntent, keptUntil: Date.now() + ASK_KEPT_MS};
          else delete current.askIntent;
          current.version++; this.ctx.storage.kv.put('head', current);
        });
        waiter.promise.then(settle, () => settle(null));
      }
      waiter.operationId = input.operationId;
      waiter.caller = {...resolveCaller({actor: 'agent', principal: remotePrincipal(input),
        requestId: input.operationId}, {transport: 'mcp'}), agent: input.args.agent};
      this.returnWaiter = waiter;
      return {promise: waiter.promise};
    });
    const result = prepared.promise ? await prepared.promise : {kind: 'value', value: prepared.value};
    if (prepared.aborted || signal?.aborted || result.kind === 'aborted') return abandoned();
    const value = result.kind === 'timeout' ? {outcome: 'timeout', reason: 'wait_timed_out',
      ...((input.args.wait || 'message') === 'message' ? {status: 'awaiting_reply', next: 'The question stays shown in the editor. The person\'s reply arrives in messages on your next read.'} : {})} : result.value;
    return this.exclusive(async () => signal?.aborted ? abandoned() : json(await this.operate(input, value)));
  }

  inspectVisual(input, signal) { return this.requestSurface(input, signal, 'visual'); }
  exportDocument(input, signal) { return this.requestSurface(input, signal, 'export'); }

  materialCaller(input) {
    const actor = input.humanTool === true ? 'human' : 'agent';
    return {...resolveCaller({actor, principal: actor === 'human' ? 'remote:' + input.capabilityHash : remotePrincipal(input),
      ...(actor === 'human' ? {session: 'editor'} : {}), requestId: input.operationId}, {transport: 'mcp'}), agent: input.args.agent};
  }

  async requestMaterials(input, signal) {
    if (signal?.aborted) return new Response(null, {status: 499});
    const writing = ['edit', 'undo'].includes(input.operation);
    const until = Math.min(Date.now() + (input.holdBound ?? MATERIAL_RETRY_WAIT_MS), Number.isSafeInteger(input.requestExpiresAt) ? input.requestExpiresAt : Infinity);
    for (;;) {
      if (writing) await this.resumeMaterial();
      const step = await this.exclusive(async () => {
        if (signal?.aborted) return {abandoned: true};
        const timeoutMs = writing ? await this.materialRetryWait(input, until) : 0;
        if (!timeoutMs) return {result: await this.advanceMaterial(input)};
        const wait = createRequestWait({signal, timeoutMs, onFinish: settled => this.materialRetries.delete(settled)});
        this.materialRetries.add(wait);
        return {wait};
      });
      if (step.abandoned) return new Response(null, {status: 499});
      if (step.result) return json(await this.drawingPreviews(input, signal, step.result));
      if ((await step.wait.promise).kind === 'aborted') return new Response(null, {status: 499});
    }
  }

  async drawingPreviews(input, signal, result) {
    const value = result.structuredContent;
    if (input.operation !== 'edit' || !['applied', 'rebased'].includes(value?.outcome) || !value.previews?.length) return result;
    let recalled = false;
    try { if (!signal?.aborted) recalled = await this.relay.recall(); } catch {  }
    if (!recalled) return {...result, structuredContent: {...value,
      previews: value.previews.map(row => ({block: row.block, outcome: 'unavailable', reason: signal?.aborted ? 'cancelled' : 'editor_not_present'}))}};
    const previews = [], content = [];
    const chars = Math.min(DRAWING_PREVIEW_CHARS, Math.floor(DRAWING_PREVIEW_TOTAL_CHARS / value.previews.length));
    for (const target of value.previews) {
      try {
        const read = {...input, operation: 'read', args: {as: 'image', block: target.block, ...(input.args.agent ? {agent: input.args.agent} : {})},
          operationId: crypto.randomUUID(), peek: true, visualPreview: {...target, chars}};
        delete read.task;
        const response = await this.requestSurface(read, signal, 'visual');
        const observed = response.status === 499 ? {structuredContent: {reason: 'cancelled'}} : await response.json();
        const observation = observed.structuredContent;
        const image = observed.content?.find(row => row.type === 'image');
        if (observation?.outcome === 'ok' && image) {
          previews.push({block: target.block, outcome: 'ok', observation: observation.observation});
          content.push(image);
        } else previews.push({block: target.block, outcome: 'unavailable', reason: observation?.reason || 'visual_render_unavailable'});
      } catch (error) {
        previews.push({block: target.block, outcome: 'unavailable', reason: signal?.aborted ? 'cancelled' : 'visual_render_unavailable'});
      }
    }
    await this.assertAuthority(input);
    return {...result, structuredContent: {...value, previews}, content: [...result.content, ...content]};
  }

  async materialRetryWait(input, until) {
    const stored = this.readMaterial(), head = this.ctx.storage.kv.get('head'), now = Date.now();
    if (input.operationId === undefined || !stored || !head || stored.key !== this.materialCaller(input).invocationKey ||
        this.requestStopped(stored.input) || head.materialIntent?.status !== 'pending' ||
        stored.results.some(([job]) => job === stored.request.job)) return 0;
    const presence = head.collaboration?.presence;
    if (!presence?.active || !(presence.expiresAt > now)) return 0;
    if (stored.argumentsHash !== await digest(canonicalJson({operation: input.operation, args: input.args}))) return 0;
    return Math.max(0, Math.min(until, head.materialIntent.expiresAt, presence.expiresAt) - now);
  }

  wakeMaterialRetries() {
    for (const wait of [...this.materialRetries]) wait.finish(null);
  }

  async advanceMaterial(input, stored = this.readMaterial()) {
    const caller = this.materialCaller(input), key = caller.invocationKey;
    if (stored?.key === key && this.requestStopped(stored.input)) {
      await this.retireMaterial(stored, 'cancelled');
      return this.operate(input);
    }
    const argumentsHash = await digest(canonicalJson({operation: input.operation, args: input.args}));
    if (stored && stored.key === key && stored.argumentsHash !== argumentsHash) return this.operate(input);
    if (stored && stored.key === key) {
      const head = this.ctx.storage.kv.get('head');
      if (head.materialIntent?.status === 'pending' && head.materialIntent.expiresAt > Date.now() &&
          !stored.results.some(([job]) => job === stored.request.job)) return this.operate(input);
    }
    const own = stored?.key === key ? stored : null;
    const work = {key, argumentsHash, caller, input: own?.input || Object.fromEntries([
      'operation', 'args', 'ownerKey', 'capabilityHash', 'connectionKey', 'oauthGrant', 'operationId', 'hostAgent',
      'humanTool', 'editorAuthorized', 'page', 'requestKey', 'requestExpiresAt', ...(this.env.ACCESS_PROFILE === true ? ['access'] : [])].filter(field => input[field] !== undefined).map(field => [field,
        input[field]])),
      record: own, results: new Map(own?.results || []), acks: own?.acks || [], request: null,
      binding: own?.binding || null, presentationBinding: own ? own.presentationBinding : undefined, resumeId: own?.id || null,
      failure: stored && !own ? 'material_busy' : null};
    if (own) {
      const intent = this.ctx.storage.kv.get('head')?.materialIntent;
      if (!intent || intent.status === 'refused') work.failure = intent?.reason || 'document_changed';
      else if (intent.expiresAt <= Date.now() && !work.results.has(own.request.job)) work.failure = 'material_request_expired';
    }
    try {
      const execution = {...work.input};
      if (input.signal) Object.defineProperty(execution, 'signal', {value: input.signal});
      const result = await this.operate(execution, undefined, undefined, undefined, input.signal, work);
      if (own && result.structuredContent?.pending?.requirements?.kind !== 'material' && this.readMaterial()?.key === key) {
        const head = this.ctx.storage.kv.get('head');
        if (head) await this.retireMaterial(stored, head.agentAccess === false ? 'agent_access_disconnected'
          : result.structuredContent?.reason || 'document_changed');
      }
      return result;
    } catch (error) {
      this.cachedState = null; this.cachedJournal = null;
      if (own && error?.code === 'OAUTH_AUTHORITY_REVOKED') {
        const head = this.ctx.storage.kv.get('head');
        if (head) await this.retireMaterial(stored, 'oauth_authority_revoked');
      }
      if (own && error?.code === 'WORKSPACE_STATE_LIMIT') {
        await this.retireMaterial(stored, 'workspace_state_limit');
        return this.operate(input);
      }
      throw error;
    }
  }

  async retireMaterial(record, reason) {
    const head = this.ctx.storage.kv.get('head');
    if (!head || this.readMaterial(head)?.key !== record.key) return;
    const journal = this.readJournal(), row = journal.find(row => row.key === record.key && row.output?.pending?.requestId === record.id);
    if (row) {
      const {pending, ...output} = row.output;
      row.output = {...output, outcome: 'refused', reason,
        ...(output.receipt ? {receipt: {...output.receipt, state: 'unavailable', presentation: 'unavailable'}} : {})};
    }
    head.materialIntent = null; head.materialOwner = null; head.materialReceipts = record.acks;
    head.materialEnded = {reason, operation: record.input.operation, at: Date.now()}; head.version++;
    await this.persist(head, this.readState(head), journal, false, null, null);
  }

  async resumeMaterial() {
    return this.exclusive(async () => {
      const stored = this.readMaterial(), head = this.ctx.storage.kv.get('head');
      if (!stored || head.materialIntent?.status === 'pending' && head.materialIntent.expiresAt > Date.now()) return;
      try { return await this.advanceMaterial(stored.input, stored); }
      catch (error) { if (error?.code !== 'OAUTH_AUTHORITY_REVOKED') throw error; }
    });
  }

  async requestSurface(input, signal, kind) {
    const exporting = kind === 'export', slot = exporting ? 'exportWaiter' : 'visualWaiter', intentKey = kind + 'Intent';
    const expired = exporting ? 'export_expired' : 'visual_capture_expired';
    if (signal?.aborted) return new Response(null, {status: 499});
    const started = await this.exclusive(async () => {
      if (signal?.aborted) return {abandoned: true};
      const result = await this.operate(input);
      const pending = result.structuredContent?.pending;
      if (!input.task && !exporting && result.structuredContent?.outcome === 'ok' && result.structuredContent?.representation === 'visual') return {result: envelope({outcome: 'refused', reason: expired, representation: 'visual'})};
      if (result.structuredContent?.outcome !== 'pending' || pending?.kind !== 'surface-fact' || pending.requirements?.kind !== kind) return {result};
      if (this[slot]?.id === pending.requestId && this[slot].capabilityHash === input.capabilityHash) return {result};
      const request = pending.requirements;
      const refuse = reason => ({...request, outcome: 'refused', reason});
      const resume = fact => this.operate(input, undefined, {requestId: pending.requestId, fact});
      if (result.structuredContent.replayed && !input.task) return {result: await resume(refuse(expired))};
      if (signal?.aborted) return {result: await resume(refuse('cancelled'))};
      if (this[slot]) return {result: await resume(refuse(exporting ? 'export_busy' : 'visual_capture_busy'))};
      const hosted = exporting && typeof this.env.EXPORT_RENDERER?.renderArtifact === 'function';
      if (!hosted && !result.structuredContent.collaboration?.presence?.active) return {result: await resume(refuse(exporting ? 'editor_unavailable' : 'editor_not_present'))};
      const timeoutMs = input.task ? Math.max(0, input.task.deadline - Date.now()) : exporting ? EXPORT_LEASE_MS : VIEW_LEASE_MS;
      if (!timeoutMs) return {result: await resume(refuse(expired))};
      const renderControl = hosted ? new AbortController() : null;
      const wait = createRequestWait({signal, timeoutMs, onFinish: () => renderControl?.abort()});
      const capture = {wait, input, id: pending.requestId, request, capabilityHash: input.capabilityHash,
        operationId: input.operationId,
        caller: {...resolveCaller({actor: 'agent', principal: remotePrincipal(input),
          requestId: input.operationId}, {transport: 'mcp'}), agent: input.args.agent}};
      this[slot] = capture;
      if (hosted) {
        const state = this.readState(this.ctx.storage.kv.get('head'));
        return {capture, hosted: {source: typeof request.part?.text === 'string' ? request.part.text : state.text, filename: request.filename, format: request.format, docKind: state.docKind,
          signal: renderControl.signal}};
      }
      try {
        const head = structuredClone(this.ctx.storage.kv.get('head'));
        head[intentKey] = {id: capture.id, ...request, status: 'pending', expiresAt: Date.now() + timeoutMs,
          ...(input.task ? {task: input.task.key} : {})};
        if (input.task) head[kind + 'TaskInput'] = {...input};
        head.version++;
        await this.persist(head, this.readState(head), this.readJournal(), true, null, undefined, input);
      } catch (error) {
        wait.finish(refuse(exporting ? 'export_unavailable' : 'visual_render_unavailable'));
        try { await this.retireSurfaceIntent(kind, capture.id); } catch {}
        if (this[slot] === capture) this[slot] = null;
        throw error;
      }
      return {capture};
    });
    if (started.abandoned) return new Response(null, {status: 499});
    if (started.result) return json(started.result);
    const {capture} = started;
    if (started.hosted) {
      Promise.resolve().then(() => this.env.EXPORT_RENDERER.renderArtifact(started.hosted)).then(
        artifact => capture.wait.finish({...capture.request, outcome: 'ok', artifact}),
        error => capture.wait.finish({...capture.request, outcome: 'refused', reason: signal?.aborted ? 'cancelled'
          : /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(error?.code || '') ? error.code : 'export_unavailable'}));
    }
    const settled = await capture.wait.promise;
    const fact = settled.kind === 'value' ? settled.value : {...capture.request, outcome: 'refused', reason: settled.kind === 'aborted' ? 'cancelled' : expired};
    return this.exclusive(async () => {
      try {
        await this.retireSurfaceIntent(kind, capture.id);
        return json(await this.operate(input, undefined, {requestId: capture.id, fact}, undefined, signal));
      } finally {
        if (this[slot] === capture) this[slot] = null;
      }
    });
  }

  async retireSurfaceIntent(kind, id, head = this.ctx.storage.kv.get('head')) {
    const key = kind + 'Intent';
    if (!head?.[key] || head[key].id !== id) return head;
    const next = {...head, [key]: null, ...(head[kind + 'TaskInput'] ? {[kind + 'TaskInput']: null} : {}), version: head.version + 1};
    this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', next));
    await this.ctx.storage.sync();
    return next;
  }

  recoverSurfaceCapture(head, kind) {
    const intent = head[kind + 'Intent'], input = head[kind + 'TaskInput'];
    if (!intent?.task || !input?.task || intent.task !== input.task.key || intent.expiresAt <= Date.now() ||
        intent.revision !== head.revision || input.capabilityHash !== head.capabilityHash) return null;
    const {id, status, expiresAt, task, ...request} = intent;
    return {id, request, input, capabilityHash: input.capabilityHash, wait: {finish: () => true}};
  }

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
      const wait = createRequestWait({signal, timeoutMs}), capture = {id: request.id, input, request, capabilityHash: input.capabilityHash, wait,
        operationId: input.operationId,
        caller: {...resolveCaller({actor: 'agent', principal: remotePrincipal(input),
          requestId: input.operationId}, {transport: 'mcp'}), agent: input.args.agent}};
      this.editorWaiter = capture;
      try {
        head.editorIntent = {...request, status: 'pending', expiresAt: Date.now() + timeoutMs};
        head.editorAuthority = {id: request.id, ...this.retainedAuthority(input)};
        head.version++;
        await this.persist(head, this.readState(head), this.readJournal(), true, null, undefined, input);
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

  async paceWrite(input) {
    if (!PACED_OPERATIONS.has(input.operation)) return null;
    const now = Date.now(), held = this.pace.check(now), editor = input.editorAuthorized === true;
    if (held) return toolError(failure(held.code, editor ? PACE_WORDS.editor : PACE_WORDS.agent, {retryAfter: held.retryAfter}));
    this.pace.admit(now);
    return null;
  }

  async operate(input, waitResult, observation, editor, signal = input.signal, material) {
    await this.assertAuthority(input, {remembered: true});
    await prepareDoorLetters();
    const { operation, args, capabilityHash, ownerKey } = input;
    try { if (this.ctx.storage) this.ctx.storage.operation = operation; } catch {}
    let head = this.leasedHead(structuredClone(this.ctx.storage.kv.get('head')));
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
      this.live.reset(); this.live.expire(null);
      head = undefined;
    }
    if (input.create === true) {
      if (operation !== 'open') return toolError(failure('WORKSPACE_EXISTS', 'A workspace cannot be created at this capability.'));
      if (head) {
        if (head.capabilityHash !== capabilityHash) return toolError(failure('WORKSPACE_EXISTS', 'A workspace cannot be created at this capability.'));
        if (input.hostFileBinding && head.fileHydration?.binding !== input.hostFileBinding)
          return toolError(failure('HOST_FILE_CHANGED', 'This creation token belongs to a different source. Resume its workspace or use a new creation token.'));
        if (head.agentAccess === false) return toolError(failure('DOCUMENT_UNAVAILABLE', 'Agent access to this workspace is disconnected. The person can share it again from the editor.'));
        const state = this.readState(head);
        const kernel = createKernel({ state, host: {retainHistory: true, liveSession: true}, clock: Date.now, mintId, invocationJournal: this.readJournal() });
        const observation = await initialObservation(kernel, input);
        const collaboration = kernel.collaboration();
        head = this.describe(state, head, head.version, collaboration);
        await this.persist(head, kernel.snapshot(), kernel.invocationJournal(), false, null, undefined, input);
        return envelope({...observation, outcome: observation.outcome === 'ok' ? 'resumed' : observation.outcome, created: false, resumed: true, replayed: true}, head, { snapshot: snapshot(state, collaboration) });
      }
      const invalid = admissibleText(args.text ?? '');
      if (invalid) throw failure('INVALID_DOCUMENT_INPUT', invalid);
      let fenced;
      try { fenced = fencedBlocks(args.text || '').length > 0; }
      catch (error) { return toolError(failure('INVALID_DOCUMENT_INPUT', String(error?.message || 'A Rapier block is malformed.').slice(0, 200))); }
      const budget = await takeCreateBudget(this.env, {...input.createBudget, anonymous: input.bearer === true});
      if (budget === 'no-binding') return toolError(failure('WORKSPACE_CREATION_UNAVAILABLE', 'The workspace creation budget binding is unavailable.'));
      if (budget === 'uncertain') return toolError(failure('WORKSPACE_UNAVAILABLE', input.createBudget.retryable ? 'The creation budget did not answer. Retry with the same createToken.' : 'The creation budget did not answer, so no workspace was made. Retry; a createToken makes the next create retryable.'));
      if (budget !== 'ok') return toolError(failure('CREATE_BUDGET_EXCEEDED', budget === 'exceeded-day' ? 'The creation budget is full for today. Reopen an existing document capability, or create tomorrow.' : 'The creation budget is full for this hour. Reopen an existing document capability, or create later.'));
      const kernel = createKernel({ state: createState({ id: crypto.randomUUID(), filename: args.filename ?? 'Untitled.md', text: fenced ? '' : args.text ?? '', docKind: args.docKind }), host: {retainHistory: true, liveSession: true}, clock: Date.now, mintId });
      const observation = await initialObservation(kernel, input);
      const collaboration = kernel.collaboration(), state = kernel.snapshot();
      head = this.describe(state, { stateFormat: WORKSPACE_STATE_FORMAT, ownerKey, capabilityHash, ...(input.bearer === true ? { bearer: true } : {}), prefix: input.prefix, pairEpoch: 0, createdAt: Date.now(), receipts: [], parts: 0, viewIntent: null,
        ...(input.hostFileBinding ? {fileHydration: {id: mintId('hydrate_'), binding: input.hostFileBinding, status: 'pending', baseRevision: state.revision}} : {}) }, 1, collaboration);
      await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, input);
      if (fenced) {
        const edited = await this.advanceMaterial({...input, create: false, operation: 'edit', args: {revision: state.revision, changes: [{text: args.text}], ...(args.agent ? {agent: args.agent} : {})}});
        const latest = this.ctx.storage.kv.get('head'), currentState = this.readState(latest);
        let seen = null;
        if (edited.structuredContent?.outcome === 'applied') {
          try {
            const {outcome: _o, created: _c, resumed: _r, ...fields} = await initialObservation(createKernel({state: currentState, host: {retainHistory: true, liveSession: true}, clock: Date.now, mintId}), input);
            seen = fields;
          } catch (_) {}
        }
        return {...edited, structuredContent: {...seen, ...edited.structuredContent, ...(edited.structuredContent?.outcome === 'applied' ? {outcome: 'created'} : {}), created: true, resumed: false},
          _meta: {rapier: {...edited._meta?.rapier, snapshot: snapshot(currentState, latest.collaboration), editorIssuedAt: latest.editorIssuedAt ?? latest.createdAt}}};
      }
      return envelope({...observation, outcome: observation.outcome === 'ok' ? 'created' : observation.outcome, created: true, resumed: false}, head, { snapshot: snapshot(state, collaboration) });
    }
    if (!head || head.capabilityHash !== capabilityHash) {
      if (operation === 'document.delete' && !head) return envelope({ outcome: 'deleted', deleted: true });
      if (head && operation === ROTATE && head.rotation && head.rotation.predecessorHash === capabilityHash && input.rotateToHash === head.capabilityHash && (!input.page || this.replaysPageRotation(head, input.page, input.page.rotationRetry))) {
        return envelope({ outcome: 'rotated', rotated: true, replayed: true, rotations: head.rotations, rotatedAt: new Date(head.rotatedAt).toISOString() }, head);
      }
      return toolError(failure('DOCUMENT_UNAVAILABLE', 'This document capability is unknown, deleted or expired. Open a new workspace from an exported copy.'));
    }
    if (head.agentAccess === false && input.editorAuthorized !== true) return toolError(failure('DOCUMENT_UNAVAILABLE', 'Agent access to this workspace is disconnected. The person can share it again from the editor.'));
    const retainedTask = this.readTaskResult(input, head);
    if (retainedTask) return retainedTask;
    const principal = 'remote:' + capabilityHash;
    const actor = (['comments.write', 'document.read'].includes(operation) || operation === 'comparison.present' && args.action === 'close') && input.humanTool === true ? 'human' : 'agent';
    const agentCaller = () => ({...resolveCaller({ actor, principal: actor === 'human' ? principal : remotePrincipal(input), ...(actor === 'human' ? {session: 'editor'} : {}), requestId: input.operationId }, { transport: 'mcp' }), ...(actor === 'agent' && input.hostAgent ? {hostAgent: input.hostAgent} : {})});
    const queued = actor === 'agent' && queuedConflict(this.ctx.storage.kv, {operationId: input.operationId,
      agent: {principal: agentCaller().principal}, same: {operation, args}});
    if (queued) return operationEnvelope(operation, queued, head, {notesVersions: this.env.ACCESS_PROFILE === true});
    const invocationKey = agentCaller().invocationKey;
    const inFlight = [this.returnWaiter, this.visualWaiter, this.exportWaiter, this.editorWaiter, head.materialOwner].filter(row => row &&
      row.capabilityHash === capabilityHash && row.caller.invocationKey !== invocationKey).map(row => row.caller);
    if ((getTool(operation) || input.humanTool && getHumanOperation(operation)) && !observation && !editor && !material?.resumeId) {
      const caller = agentCaller(), journal = this.readJournal();
      if (journal.some(row => row.key === caller.invocationKey || row.spent?.some(([key]) => key === caller.invocationKey))) {
        const replay = createKernel({state: this.readState(head), host: {retainHistory: true, liveSession: true}, invocationJournal: journal, inFlight, clock: Date.now, mintId}).replay(operation, args, caller);
        if (replay) return operationEnvelope(operation, replay, head, {notesVersions: this.env.ACCESS_PROFILE === true});
      }
    }
    for (const kind of ['visual', 'export']) {
      const intent = head[kind + 'Intent'], capture = this[kind + 'Waiter'];
      if (intent && ((!capture && !intent.task) || capture && (capture.id !== intent.id || capture.capabilityHash !== capabilityHash) ||
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
      await this.assertAuthority(input);
      if (this.env.ACCESS_PROFILE === true && typeof this.beforeDocumentDelete === 'function') await this.beforeDocumentDelete(head, input);
      this.cachedState = null;
      this.cachedJournal = null;
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.sync();
      this.live.reset(); this.live.expire(null);
      this.returnWaiter?.finish({ outcome: 'refused', reason: 'document_deleted' });
      this.visualWaiter?.wait.finish({...this.visualWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.exportWaiter?.wait.finish({...this.exportWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.editorWaiter?.wait.finish({...this.editorWaiter.request, receipt: {id: this.editorWaiter.id, status: 'unavailable', reason: 'document_changed'}});
      return envelope({ outcome: 'deleted', deleted: true, documentId: head.documentId });
    }
    if (operation === ROTATE) {
      if (!input.rotateToHash) return toolError(failure('INVALID_DOCUMENT_INPUT', 'Rotation needs a successor.'));
      if (head.editorIntent) head = await this.retireEditorIntent(head.editorIntent.id, head, 'document_changed');
      head.rotation = { predecessorHash: head.capabilityHash, generation: (head.rotations || 0) + 1,
        ...(input.page ? {pageRetry: input.pageRetry, pageEpoch: head.pairEpoch || 0, ...(input.pageSessionHash ? {pageSessionHash: input.pageSessionHash} : {})} : {}) };
      head.capabilityHash = input.rotateToHash;
      if (!head.bearer) { head.agentAccess = false; head.version++; }
      head.pairEpoch = (head.pairEpoch || 0) + 1;
      head.pairings = [];
      head.materialIntent = null; head.materialOwner = null; head.materialReceipts = [];
      const materialParts = head.materialParts || 0;
      head.materialParts = 0; head.materialBytes = 0;
      head.rotatedAt = Date.now();
      head.rotations = (head.rotations || 0) + 1;
      delete head.agentCall;
      await this.assertAuthority(input);
      if (this.env.ACCESS_PROFILE === true && typeof this.beforeHeadChange === 'function') await this.beforeHeadChange(head, input);
      this.ctx.storage.transactionSync(() => {
        for (let index = 0; index < materialParts; index++) this.ctx.storage.kv.delete('material:' + index);
        this.ctx.storage.kv.put('head', head);
      });
      await this.ctx.storage.sync();
      this.live.expire(head);
      this.returnWaiter?.finish({ outcome: 'refused', reason: 'document_disconnected' });
      this.visualWaiter?.wait.finish({...this.visualWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.exportWaiter?.wait.finish({...this.exportWaiter.request, outcome: 'refused', reason: 'document_changed'});
      this.editorWaiter?.wait.finish({...this.editorWaiter.request, receipt: {id: this.editorWaiter.id, status: 'unavailable', reason: 'document_changed'}});
      return envelope({ outcome: 'rotated', rotated: true, rotations: head.rotations, rotatedAt: new Date(head.rotatedAt).toISOString() }, head);
    }
    if (operation === PAIR_BROWSER) {
      const now = Date.now(), code = String(args.code || '').toUpperCase();
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
      await this.assertAuthority(input);
      row.confirmedAt = now;
      head.agentCall = {id: 'pair_' + crypto.randomUUID(), at: now, operation: PAIR_BROWSER};
      this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('head', head));
      await this.ctx.storage.sync();
      return envelope({outcome: 'confirmation_required', paired: false, ...(head.bearer
        ? {message: 'The browser showing that code can now choose ALLOW or CANCEL.'}
        : {ownerApprovalId: row.secretHash, message: 'Open owner_approval_url in the browser where Rapier was connected and approve this browser. Then choose ALLOW on the page showing the code.'})}, head);
    }
    const elapsed = head.nextExpiryAt !== null && head.nextExpiryAt <= Date.now();
    if (operation === 'document.sync' && !elapsed &&
        (head.collaboration?.agentPresence?.inFlight || 0) === inFlight.length &&
        args.afterVersion === head.version && (args.afterRevision === undefined || args.afterRevision === head.revision)) {
      return envelope({ outcome: 'current', unchanged: true, ...agentReport(head) }, head);
    }
    let state = this.live.heldState(this.readState(head)), collaboration;
    let viewKey = JSON.stringify(head.viewIntent);
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
    let exported = null;
    const presentationBinding = () => {
      if (material?.presentationBinding !== undefined) return material.presentationBinding;
      const row = Object.values(state.humanContexts).filter(row => row.visible && row.expiresAt > Date.now() && row.revision === state.revision)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const binding = row ? {contextId: row.contextId, contextOwner: row.owner, navigationSequence: row.navigationSequence || 0} : null;
      if (material) material.presentationBinding = binding;
      return binding;
    };
    const commitFence = createCommitFence(() => kernel, () => state.text, analyzeMarkdown);
    const liveSessions = this.live;
    const notesHost = this.env.ACCESS_PROFILE === true && typeof this.notesHost === 'function' ? await this.notesHost(input) : null;
    const kernel = createKernel({ state, inFlight, host: {...notesHost, retainHistory: true,
      ...(operation === 'document.human_context' && this.live.holds(args.contextId) ? {presenceMs: LIVE_LIMITS.heldContextMs} : {}),
      get liveSession() {
        const currentHead = liveSessions.owner.ctx.storage.kv.get('head');
        return liveSessions.sockets().some(socket => !!liveSessions.valid(socket, currentHead)?.client);
      },
      liveComposition: splices => this.live.collision(kernel.snapshot(), splices), exportScope: true, exportFile: async request => {
      if (this.env.ACCESS_PROFILE !== true && !editorSecret(this.env) || !input.exportAddress) return {reason: 'export_unavailable'};
      if (request.guard?.() === false) return {reason: 'document_changed'};
      const file = request.file || await exportFile(this.env, {...request, signal});
      if (request.guard?.() === false) return {reason: 'document_changed'};
      exported = file.bytes && file.bytes.byteLength <= MAX_EXPORT_BYTES ? {...file, id: mintId('export_')} : file;
      return exported;
    }, markdown: analyzeMarkdown, referenceCheck: checkMarkdownReferences, commitFence, drawingPresentationBinding: presentationBinding,
      paint: (strokes, options = {}) => paintAgentStrokes(strokes, options.seed, options.target, options),
      material: request => {
        if (material?.results.has(request.job)) return material.results.get(request.job);
        if (material?.failure) return {...materialDescription(request), outcome: 'refused', reason: material.failure};
        if (material) material.request = request;
        return null;
      },
      paintSheet: agentPaintSheetHolds, paintBrushes: agentPaintBrushRegistry, paintStrokesFault: agentStrokesFault, paintReplay: replayAgentPainting, paintRaster: validatePaintRaster, paintSample: sampleAgentPainting,
      setView: request => queueView('mode', request), view: () => ({current: kernel.collaboration().presence?.view || null}),
      editorContext: () => ({preferences: head.editorPreferences || null, receipts: (head.editorReceipts || []).map(row => row.receipt)}),
      returns: () => receivedReturns(head).map(row => { const { name, ...listed } = returnMetadata(row); return listed; }),
      readReturn: input => this.readReturn(head, input),
      createReturn: async () => {
        if (!input.returnAddress) return { outcome: 'refused', reason: 'return_unavailable' };
        const retained = (head.returns || []).filter(row => row.receivedAt || row.expiresAt > Date.now() && row.owner === head.capabilityHash);
        if (retained.length >= MAX_RETURNS) return { outcome: 'refused', reason: 'return_envelopes_full' };
        const grant = { id: mintId('return_'), owner: head.capabilityHash, expiresAt: Math.min(Date.now() + DAY, head.expiresAt) };
        const token = 'rpret_' + input.returnAddress + '.' + (head.bearer ? base64url(crypto.getRandomValues(new Uint8Array(32))) : grant.id);
        if (head.bearer) grant.hash = await digest(token);
        head.returns = [...retained, grant];
        return { outcome: 'ok', return_url: configuredOrigin(this.env.RETURN_ORIGIN || oauthOrigin(this.env), 'RETURN_ORIGIN', true) + '/return/' + token, return_id: grant.id, return_expires_at: new Date(grant.expiresAt).toISOString(), max_bytes: MAX_TEXT_BYTES };
      },
      wait: async () => waitResult || { outcome: 'refused', reason: 'wait_unavailable' },
      save: async request => ({ok: true, saved: true, verified: true, confirmed: true, destination: 'workspace',
        savedDocumentId: request.documentId, savedDocumentRevision: request.revision}), reveal: request => queueView('document', request), revealChange: request => queueView('compare', request) }, clock: Date.now, mintId,
      invocationJournal: observation || editor || material?.resumeId ? this.readJournal().filter(row =>
        row.output?.pending?.requestId !== ((observation || editor)?.requestId || material.resumeId)) : this.readJournal() });
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
      if (head.materialIntent?.status === 'pending' &&
          (!materialMatches(head.materialIntent, next, kernel.drawingContext()) || head.materialIntent.expiresAt <= Date.now())) {
        head.materialIntent = {...head.materialIntent, status: 'refused', reason:
          head.materialIntent.expiresAt <= Date.now() ? 'material_request_expired' : 'document_changed'};
        head.version++;
      }
      const nextViewKey = JSON.stringify(head.viewIntent);
      const changed = viewChanged(state, next) || nextViewKey !== viewKey ||
        (head.collaboration?.agentPresence?.inFlight || 0) !== collaboration.agentPresence.inFlight;
      head = this.describe(next, head, head.version + (changed ? 1 : 0), collaboration);
      state = next;
      viewKey = nextViewKey;
    };
    const initialVersion = head.version, initialExpiry = head.nextExpiryAt;
    refresh(elapsed || Object.keys(state.humanContexts).length > 0 || !!head.viewIntent);
    if (elapsed || head.version !== initialVersion || (initialExpiry !== null && initialExpiry <= Date.now())) {
      const journal = observation || editor || material?.resumeId ? this.readJournal() : kernel.invocationJournal();
      await this.persist(head, state, journal, false, null, undefined, input);
    }
    const current = () => ({...snapshot(state, collaboration, head.viewIntent, head.visualIntent, head.exportIntent, head.editorIntent),
      ...(head.materialIntent ? {materialIntent: {...head.materialIntent,
        ...(head.materialIntent.status === 'pending' ? {payload: this.readMaterial(head)?.request.payload} : {})}} : {}),
      ...(head.bearer ? {} : {agentAccess: head.agentAccess !== false}),
      ...(head.askIntent && (this.returnWaiter?.askId === head.askIntent.id || head.askIntent.keptUntil > Date.now()) ? {askIntent: {id: head.askIntent.id, question: head.askIntent.question}} : {}),
      ...(head.humanMessages?.length ? {messagesQueued: head.humanMessages.length} : {})});
    if (operation === 'document.human_message') {
      const raw = String(args.text);
      const truncated = raw.length > HUMAN_MESSAGE_CHARS;
      const text = raw.slice(0, HUMAN_MESSAGE_CHARS);
      const referent = admitHumanReferent(args.referent);
      const waiter = this.returnWaiter;
      if (waiter?.mode === 'message' && waiter.askId && waiter.finish({
        outcome: 'message', text, truncated,
        ...(referent ? {referent: resolveHumanReferent(referent, state)} : {}),
      }))
        return envelope({outcome: 'ok', delivered: 'answered', ...(truncated ? {truncated: true} : {})}, head, {snapshot: current()});
      delete head.askIntent;
      const queued = [...head.humanMessages || [], {
        id: mintId('msg_'), text, at: Date.now(), truncated,
        ...(referent ? {referent} : {}),
      }];
      const dropped = Math.max(0, queued.length - HUMAN_MESSAGE_KEEP);
      head.humanMessages = queued.slice(-HUMAN_MESSAGE_KEEP);
      if (dropped) head.humanMessagesDropped = (head.humanMessagesDropped || 0) + dropped;
      head.version++; this.ctx.storage.kv.put('head', head);
      return envelope({outcome: 'ok', delivered: 'queued',
        ...(truncated ? {truncated: true} : {}),
        ...(dropped ? {dropped} : {})}, head, {snapshot: current()});
    }
    if (operation === 'document.material_ack') {
      const record = this.readMaterial(head);
      const answerHash = await digest(canonicalJson(args.fact));
      const previous = [...record?.acks || [], ...head.materialReceipts || []].find(row => row.id === args.materialId);
      if (previous) return envelope(previous.hash === answerHash && previous.capabilityHash === capabilityHash
        ? {outcome: 'ok', materialId: args.materialId, replayed: true} : {outcome: 'refused', reason: 'material_result_mismatch'}, head);
      if (!record || record.id !== args.materialId || record.input.capabilityHash !== capabilityHash)
        return envelope({outcome: 'refused', reason: 'material_request_expired'}, head);
      if (this.requestStopped(record.input)) {
        await this.retireMaterial(record, 'cancelled');
        return envelope({outcome: 'refused', reason: 'cancelled'}, this.ctx.storage.kv.get('head'));
      }
      try { await this.assertAuthority(record.input); }
      catch (error) {
        if (error?.code !== 'OAUTH_AUTHORITY_REVOKED') throw error;
        await this.retireMaterial(record, 'oauth_authority_revoked');
        return envelope({outcome: 'refused', reason: 'oauth_authority_revoked'}, this.ctx.storage.kv.get('head'));
      }
      if (head.materialIntent?.status !== 'pending' || args.expectedRevision !== state.revision ||
          !materialMatches(record.request, state, kernel.drawingContext()))
        return envelope({outcome: 'refused', reason: 'document_changed'}, head);
      const checked = admitMaterialResult(record.request, args.fact);
      if (checked.reason === 'material_result_mismatch' || args.fact.outcome === 'ok' && checked.outcome !== 'ok') return envelope(checked, head);
      record.results.push([record.request.job, {...materialDescription(record.request), ...checked}]);
      if (contentBytes(serializeJson(record.results)) > MATERIAL_LIMITS.bytes) {
        record.results.pop();
        record.results.push([record.request.job, {...materialDescription(record.request), outcome: 'refused', reason: 'material_too_large'}]);
      }
      record.acks.push({id: record.id, hash: answerHash, capabilityHash});
      head.materialIntent = {...head.materialIntent, status: 'prepared'};
      head.version++;
      await this.persist(head, state, kernel.invocationJournal(), false, null, record, [input, record.input]);
      return envelope({outcome: 'ok', materialId: args.materialId}, head);
    }
    if (operation === 'document.export_ack') {
      const capture = this.exportWaiter || this.recoverSurfaceCapture(head, 'export');
      if (!capture || capture.id !== args.exportId || capture.capabilityHash !== capabilityHash) return toolError(failure('EXPORT_UNAVAILABLE', 'This export is no longer pending.'), head);
      await this.assertAuthority(input);
      try { await this.assertAuthority(capture.input); }
      catch (error) {
        if (error?.code === 'OAUTH_AUTHORITY_REVOKED') capture.wait.finish({...capture.request, outcome: 'refused', reason: 'oauth_authority_revoked'});
        throw error;
      }
      if (args.expectedRevision !== state.revision || capture.request.revision !== state.revision) {
        capture.wait.finish({...capture.request, outcome: 'refused', reason: 'document_changed'});
        return toolError(failure('REVISION_CONFLICT', 'The document changed before the export arrived.'), head);
      }
      if (args.fact.documentId !== capture.request.documentId || args.fact.revision !== capture.request.revision || args.fact.format !== capture.request.format)
        return envelope({outcome: 'refused', reason: 'export_target_changed'}, head);
      const file = admitExportArtifact(capture.request, args.fact);
      if (args.fact.outcome === 'ok' && !file.bytes) return envelope({outcome: 'refused', reason: file.reason,
        ...(file.limitBytes ? {limitBytes: file.limitBytes} : {}), ...(file.byteLength ? {bytes: file.byteLength} : {})}, head);
      if (capture.input.task) {
        const result = await this.operate(capture.input, undefined, {requestId: capture.id, fact: args.fact});
        if (result.isError) { capture.wait.finish(args.fact); return result; }
        await this.retireSurfaceIntent('export', capture.id);
      }
      if (!capture.wait.finish(args.fact)) return toolError(failure('EXPORT_UNAVAILABLE', 'This export is no longer pending.'), head);
      return envelope({outcome: 'ok', exportId: args.exportId}, head);
    }
    if (operation === 'document.editor_ack') {
      const active = head.editorIntent?.id === args.editorId ? head.editorIntent : null;
      const prior = head.editorReceipts?.find(row => row.receipt.id === args.editorId);
      const request = active || prior?.request;
      if (!request) return envelope(editorFailure('editor_request_unavailable'), head);
      if (active && head.editorAuthority?.id === args.editorId) {
        try { await this.assertAuthority(head.editorAuthority); }
        catch (error) {
          if (error?.code === 'OAUTH_AUTHORITY_REVOKED') {
            await this.retireEditorIntent(args.editorId, head, 'oauth_authority_revoked');
            this.editorWaiter?.wait.finish({...request, receipt: {id: args.editorId, status: 'unavailable', reason: 'oauth_authority_revoked'}});
          }
          throw error;
        }
      }
      const acknowledge = (row, replayed = false) => {
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
          await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, [input, active ? head.editorAuthority : null]);
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
      await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, [input, active ? head.editorAuthority : null]);
      return acknowledge(head.editorReceipts.find(row => row.receipt.id === args.editorId));
    }
    if (operation === 'document.visual_ack') {
      const capture = this.visualWaiter || this.recoverSurfaceCapture(head, 'visual');
      if (!capture || capture.id !== args.visualId || capture.capabilityHash !== capabilityHash) return toolError(failure('VISUAL_UNAVAILABLE', 'This visual observation is no longer pending.'), head);
      await this.assertAuthority(input);
      try { await this.assertAuthority(capture.input); }
      catch (error) {
        if (error?.code === 'OAUTH_AUTHORITY_REVOKED') capture.wait.finish({...capture.request, outcome: 'refused', reason: 'oauth_authority_revoked'});
        throw error;
      }
      if (args.expectedRevision !== state.revision || capture.request.revision !== state.revision) {
        capture.wait.finish({...capture.request, outcome: 'refused', reason: 'document_changed'});
        return toolError(failure('REVISION_CONFLICT', 'The document changed before the observation arrived.'), head);
      }
      if ((capture.request.drawing || !capture.request.detail) && !sameVisualDrawing(capture.request.drawing, kernel.drawingContext())) {
        capture.wait.finish({...capture.request, outcome: 'refused', reason: 'visual_target_changed'});
        return envelope({outcome: 'refused', reason: 'visual_target_changed', representation: 'visual'}, head);
      }
      let fact = args.fact;
      if (input.visualObservation) {
        const meta = input.visualObservation;
        if (meta.visualId !== capture.id || meta.documentId !== capture.request.documentId || meta.revision !== capture.request.revision)
          return envelope({outcome: 'refused', reason: 'visual_target_changed', representation: 'visual'}, head);
        const pick = keys => Object.fromEntries(keys.filter(key => meta[key] !== undefined).map(key => [key, meta[key]]));
        fact = {...fact, ...pick(['state', 'projection']), ...(fact.image ? {image: {...fact.image,
          ...pick(['nativeWidth', 'nativeHeight', 'reduced'])}} : {})};
      }
      const verdict = visualResult(capture.request, fact);
      if (fact.outcome === 'ok' && verdict.outcome !== 'ok') return envelope(verdict, head);
      if (capture.input.task) {
        const result = await this.operate(capture.input, undefined, {requestId: capture.id, fact});
        if (result.isError) { capture.wait.finish(fact); return result; }
        await this.retireSurfaceIntent('visual', capture.id);
      }
      if (!capture.wait.finish(fact)) return toolError(failure('VISUAL_UNAVAILABLE', 'This visual observation is no longer pending.'), head);
      return envelope({outcome: 'ok', visualId: args.visualId}, head);
    }
    if (operation === 'open' || operation === 'document.sync') {
      if (operation === 'open') {
        const observation = await initialObservation(kernel, input);
        refresh();
        await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, input);
        return envelope({...observation, outcome: observation.outcome === 'ok' ? 'resumed' : observation.outcome, created: false, resumed: true}, head, {snapshot: current()});
      }
      return envelope({outcome: 'current', unchanged: false, ...agentReport(head)}, head, {snapshot: current()});
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
      const journal = kernel.invocationJournal();
      if (head.version === priorVersion && value.acknowledged === true && this.leaseOnly(head, state, journal)) {
        this.cachedState = state;
        this.leased = {state, stored: JSON.stringify(this.ctx.storage.kv.get('head')), nextExpiryAt: head.nextExpiryAt,
          collaboration: head.collaboration, collaborationContext: head.collaborationContext};
      } else await this.persist(head, state, journal, head.version === priorVersion, null, undefined, input);
      if (value.outcome === 'ok' && value.acknowledged === true && args.visible && args.selection && this.returnWaiter?.mode === 'selection') this.returnWaiter.finish({ outcome: 'ok', selection: args.selection });
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
        await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, input);
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
      await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, input);
      return envelope({ outcome: 'ok', viewId: view.id, presented: args.status === 'presented' }, head);
    }
    if (operation === 'document.connect_agents') {
      const id = input.operationId;
      const hash = await digest(JSON.stringify({operation, expectedRevision: args.expectedRevision, expectedVersion: args.expectedVersion}));
      const receipt = head.receipts.find(entry => entry.id === id);
      if (receipt) {
        if (receipt.hash !== hash) return toolError(failure('OPERATION_ID_REUSED', 'This operation_id already identifies another operation.'), head, {snapshot: current()});
        return envelope({...receipt.result, replayed: true}, head, {snapshot: current()});
      }
      if (args.expectedRevision !== state.revision || args.expectedVersion !== head.version)
        return toolError(failure('REVISION_CONFLICT', 'The workspace changed. Inspect its current state before reconnecting.'), head, {snapshot: current()});
      if (head.bearer) return toolError(failure('INVALID_ACCESS_OPERATION', 'An anonymous workspace is shared by its document capability.'), head);
      const changed = head.agentAccess === false;
      if (changed) {head.agentAccess = true; head.version++;}
      const value = {outcome: 'ok', connected: true, changed};
      head.receipts = [...head.receipts, {id, hash, revision: state.revision, version: head.version, result: value}].slice(-MAX_RECEIPTS);
      await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, input);
      return envelope(value, head, {snapshot: current()});
    }
    if (operation === 'document.commit') {
      const invalid = admissibleText(args.text);
      if (invalid) throw failure('INVALID_DOCUMENT_INPUT', invalid);
      if (!args.commitId) return toolError(failure('INVALID_COMMIT_ID', 'commitId must be a nonempty identifier for this exact draft.'));
      const who = human(args.commitId), client = row => row.id ? 'act:' + row.id : row.actor + ':' + row.principal + ':' + row.requestId;
      const hash = await digest(canonicalJson({ expectedRevision: args.expectedRevision, text: args.text,
        splices: args.splices ?? null, acts: args.acts ?? null, filename: args.filename ?? null,
        docKind: args.docKind ?? null, turnId: args.turn_id ?? null, label: args.label ?? null, hydrationId: args.hydration_id ?? null }));
      const receipt = head.receipts.find(entry => entry.id === args.commitId);
      if (receipt) {
        if (receipt.hash !== hash) return toolError(failure('COMMIT_ID_REUSED', 'This commitId already identifies different content. Keep an identifier stable only for an identical retry.'), head, { snapshot: current() });
        await this.persist(head, null, null, false, null, undefined, input);
        const draftEdits = state.commitResults?.find(row => row.id === receipt.id)?.edits || [];
        const text = replay(args.text, draftEdits);
        const accepted = {...(head.version === receipt.version ? current() : { documentId: head.documentId,
          revision: receipt.revision, text, filename: receipt.filename, docKind: receipt.docKind,
          journal: state.journal.filter(row => row.revision <= receipt.revision) }), historyComplete: receipt.historyComplete === true, draftEdits, draftClient: receipt.draftClient};
        const acceptedHead = { ...head, revision: receipt.revision, version: receipt.version, filename: receipt.filename, docKind: receipt.docKind, chars: text.length };
        return envelope({ outcome: 'committed', replayed: true, commitId: receipt.id, acceptedRevision: receipt.revision, acceptedVersion: receipt.version, currentRevision: head.revision, currentVersion: head.version }, acceptedHead, { snapshot: accepted, ...(head.version !== receipt.version ? { currentSnapshot: current() } : {}) });
      }
      if (args.hydration_id !== undefined && (!head.fileHydration || args.hydration_id !== head.fileHydration.id ||
          head.fileHydration.status !== 'pending' || args.expectedRevision !== head.fileHydration.baseRevision || state.revision !== head.fileHydration.baseRevision))
        return toolError(failure('HOST_FILE_HYDRATION_CHANGED', 'This workspace was hydrated or edited already. Its current source was retained.'), head, {snapshot: current()});
      if (state.journal.some(row => row.principal === who.principal && row.requestId === args.commitId))
        return toolError(failure('COMMIT_RECEIPT_EXPIRED', 'This draft was already committed, but its exact receipt is no longer retained.'), head, { snapshot: current() });
      if (Array.isArray(args.acts) && plain(args.acts[0])) {
        let skip = 0, at = args.expectedRevision;
        while (skip < args.acts.length - 1) {
          const act = args.acts[skip], row = state.journal.find(entry => entry.baseRevision === at);
          if (!plain(act) || !row || row.id !== act.id || !Array.isArray(act.splices) || canonicalJson(row.splices) !== canonicalJson(act.splices)) break;
          skip++; at = row.revision;
        }
        if (skip) {
          const spliced = args.acts.slice(0, skip).reduce((sum, act) => sum + act.splices.length, 0);
          Object.assign(args, {acts: args.acts.slice(skip), expectedRevision: at, ...(Array.isArray(args.splices) ? {splices: args.splices.slice(spliced)} : {})});
        }
      }
      let original = state.text, originalMetadata = {filename: state.filename, docKind: state.docKind};
      let revision = state.revision, text, draftEdits, committedMetadata, draftClient = client(who);
      const log = [], remoteFields = new Set(), entries = [];
      const canonical = row => ({splices: row.splices, ...(Object.hasOwn(row, 'authored') ? {authored: row.authored} : {}), ...(row.metadata ? {metadata: row.metadata} : {}), transaction: row});
      try {
        for (let index = state.journal.length - 1; revision > args.expectedRevision && index >= 0; index--) {
          const row = state.journal[index];
          if (row.revision !== revision || row.baseRevision !== revision - 1 || row.operation === 'document.replace') throw new Error('draft_base_unavailable');
          const before = transformSplices(original, row.splices, true);
          const beforeMetadata = _rapierTransformMetadata(originalMetadata, row.metadata, true);
          if (before === null || !beforeMetadata) throw new Error('draft_base_unavailable');
          for (const field of Object.keys(row.metadata || {})) remoteFields.add(field);
          log.unshift(...row.splices.map(splice => ({client: client(row),
            splices: [{at: splice.pos, remove: splice.removed.length, insert: splice.inserted}]})));
          original = before; originalMetadata = beforeMetadata; revision = row.baseRevision;
        }
        if (revision !== args.expectedRevision) throw new Error('draft_base_unavailable');
        if (args.acts !== undefined) {
          const boundedText = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit &&
            value.isWellFormed() && !/[\u0000-\u001f\u007f]/.test(value);
          if (!Array.isArray(args.acts) || !args.acts.length || args.acts.length > 1024) throw new Error('canonical_act_invalid');
          let sourceStart = state.text;
          for (let index = state.journal.length - 1; index >= 0; index--) sourceStart = transformSplices(sourceStart, state.journal[index].splices, true);
          const retained = state.journal.map(canonical), ids = new Set(state.journal.map(row => row.id));
          let localText = original, localMetadata = {...originalMetadata}, localRevision = args.acts[0]?.baseRevision;
          text = state.text; committedMetadata = {filename: state.filename, docKind: state.docKind}; draftEdits = log;
          const authoredPrior = state.journal.filter(row => row.revision <= args.expectedRevision).map(canonical);
          for (const row of args.acts) {
            if (!plain(row) || !boundedText(row.id, 256) || ids.has(row.id) ||
                !Number.isSafeInteger(row.baseRevision) || row.baseRevision < 0 || row.baseRevision !== localRevision ||
                row.revision !== row.baseRevision + 1 || !Array.isArray(row.splices) || row.splices.length > 64 ||
                !plain(row.author) || !['human', 'agent', 'system'].includes(row.author.kind) || !boundedText(row.author.id, 160) ||
                row.author.name !== undefined && !boundedText(row.author.name, 120) || !boundedText(row.operation, 96) ||
                !(row.createdAt === null || Number.isSafeInteger(row.createdAt) && row.createdAt >= 0) ||
                row.label != null && (typeof row.label !== 'string' || row.label.length > 120) ||
                row.turnId !== undefined && !boundedText(row.turnId, 160) ||
                row.affectedBlockIds !== undefined && (!Array.isArray(row.affectedBlockIds) ||
                  row.affectedBlockIds.some(id => !Number.isSafeInteger(id) || id < 0)) ||
                row.metadata !== undefined && !_rapierValidMetadataEffect(row.metadata) ||
                Object.hasOwn(row, 'authored') && !_rapierValidAuthored(row.authored)) throw new Error('canonical_act_invalid');
            if (Object.keys(row.metadata || {}).some(field => remoteFields.has(field))) throw new Error('metadata_changed');
            const authored = row.authored ?? authoredPlacement(localText, row.splices, authoredBasis(authoredPrior));
            const nextLocalText = transformSplices(localText, row.splices);
            const nextLocalMetadata = _rapierTransformMetadata(localMetadata, row.metadata);
            const nextMetadata = _rapierTransformMetadata(committedMetadata, row.metadata);
            if (nextLocalText === null || !nextLocalMetadata || !nextMetadata) throw new Error('canonical_act_invalid');
            const submittedIds = authoredPrior.map(row => row.transaction.id), transported = retained.some(record => !submittedIds.includes(record.transaction.id));
            const proved = row.authored || transported ? transposeAuthored(sourceStart, retained, {...canonical(row), authored}, submittedIds)
              : {text: nextLocalText, splices: row.splices, against: [], submittedBefore: localText, submitted: nextLocalText};
            if (proved.submittedBefore !== localText || proved.submitted !== nextLocalText) throw new Error('canonical_act_rebase_conflict');
            const merged = {...proved, remote: proved.against.flatMap(record => record.splices.map(splice => ({client: client(record.transaction),
              splices: [{at: splice.pos, remove: splice.removed.length, insert: splice.inserted}]})))};
            const baseRevision = state.revision + entries.length;
            const turnBaseRevision = row.turnId ? [...state.journal, ...entries].find(entry => entry.turnId === row.turnId &&
              entry.author?.kind === row.author.kind && entry.author?.id === row.author.id)?.turnBaseRevision ?? baseRevision : null;
            const entry = {...who, id: row.id, actor: row.author.kind, author: {...row.author},
              baseRevision, revision: baseRevision + 1, operation: row.operation, createdAt: row.createdAt,
              label: row.label ?? null, affectedBlockIds: (row.affectedBlockIds || []).slice(), splices: merged.splices, ...((row.authored || transported) ? {authored: structuredClone(authored)} : {}),
              ...(row.metadata ? {metadata: structuredClone(row.metadata)} : {}),
              ...(row.turnId ? {turnId: row.turnId, turnBaseRevision} : {}),
              ...(row.sourceTransactionId ? {sourceTransactionId: row.sourceTransactionId} : {}),
              ...(row.sourceTransactionIds?.length ? {sourceTransactionIds: row.sourceTransactionIds.slice()} : {}),
              ...(row.reverts ? {reverts: row.reverts} : {}), ...(row.reapplies ? {reapplies: row.reapplies} : {})};
            if (!entry.splices.length && !Object.values(entry.metadata || {}).some(pair => pair.before !== pair.after) &&
                !_rapierHasHistoryEffect(canonical(entry), retained)) throw new Error('canonical_act_invalid');
            retained.push(canonical(entry)); ids.add(row.id); entries.push(entry); authoredPrior.push(canonical(row));
            localText = nextLocalText; localMetadata = nextLocalMetadata; localRevision = row.revision;
            text = merged.text; committedMetadata = nextMetadata; draftEdits = merged.remote;
          }
          if (localText !== args.text || (args.filename ?? originalMetadata.filename) !== localMetadata.filename ||
              (args.docKind ?? originalMetadata.docKind) !== localMetadata.docKind || args.splices !== undefined &&
              canonicalJson(args.splices) !== canonicalJson(args.acts.flatMap(row => row.splices))) throw new Error('canonical_act_invalid');
          try { if (retained.some(record => Object.hasOwn(record, 'authored'))) authoredHistory(sourceStart, retained); } catch (_) { throw new Error('canonical_act_invalid'); }
          let baseline = {filename: state.filename, docKind: state.docKind};
          for (let index = state.journal.length - 1; baseline && index >= 0; index--)
            baseline = _rapierTransformMetadata(baseline, state.journal[index].metadata, true);
          const replayedMetadata = baseline && _rapierReplayMetadata(baseline, retained);
          if (!replayedMetadata || canonicalJson(replayedMetadata) !== canonicalJson(committedMetadata)) throw new Error('canonical_act_invalid');
        } else {
          const filename = args.filename ?? state.filename, docKind = args.docKind ?? state.docKind;
          const assigned = ['filename', 'docKind'].filter(field => Object.hasOwn(args, field));
          if (assigned.some(field => remoteFields.has(field))) throw new Error('metadata_changed');
          committedMetadata = {filename, docKind};
          if (!_rapierValidMetadata(committedMetadata)) throw new Error('canonical_act_invalid');
          let authored = args.splices;
          try { if (authored === undefined) authored = sourceEdits(original, args.text); }
          catch (error) {
            if (log.length || error.message !== 'source_diff_limit') throw error;
            authored = [minimalSplice(original, args.text)];
          }
          if (args.splices === undefined && !log.length && authored.length > 64) authored = [minimalSplice(original, args.text)];
          if (transformSplices(original, authored) !== args.text)
            return toolError(failure('INVALID_DOCUMENT_EDITS', 'The local journal does not produce this exact draft from its acknowledged source.'), head, {snapshot: current()});
          const rawActId = mintId('change_'); draftClient = client({id: rawActId});
          const submitted = state.journal.filter(row => row.revision <= args.expectedRevision).map(canonical), retained = state.journal.map(canonical);
          let merged, placement = null, sourceStart = state.text;
          for (let index = state.journal.length - 1; index >= 0; index--) sourceStart = transformSplices(sourceStart, state.journal[index].splices, true);
          try {
            if (retained.length === submitted.length) { merged = mergeSource(original, authored, draftClient, log); }
            else {
            const originalPlacement = authoredPlacement(original, authored, authoredBasis(submitted));
            const proved = transposeAuthored(sourceStart, retained, {transaction: {id: rawActId}, splices: authored, authored: originalPlacement}, submitted.map(row => row.transaction.id));
            if (proved.submittedBefore !== original || proved.submitted !== args.text) throw new Error('canonical_act_invalid');
            merged = {...proved, remote: proved.against.flatMap(record => record.splices.map(splice => ({client: client(record.transaction),
              splices: [{at: splice.pos, remove: splice.removed.length, insert: splice.inserted}]})))};
            placement = originalPlacement;
            }
          } catch (_) { merged = mergeSource(original, authored, draftClient, log); }
          if (merged.splices.length > 64) throw new Error('canonical_act_rebase_conflict');
          text = merged.text; draftEdits = merged.remote;
          const changed = text !== state.text || filename !== state.filename || docKind !== state.docKind;
          if (!changed) draftClient = client(who);
          const effect = _rapierMetadataDelta({filename: state.filename, docKind: state.docKind}, committedMetadata, {assign: assigned});
          if (changed) entries.push({id: rawActId, ...who, author: {kind: 'human', id: 'local'},
            baseRevision: state.revision, revision: state.revision + 1, operation: 'document.human_edit', createdAt: Date.now(),
            ...(args.turn_id ? {turnId: args.turn_id, turnBaseRevision: state.journal.find(row => row.turnId === args.turn_id &&
              row.author?.kind === 'human' && row.author?.id === 'local')?.turnBaseRevision ?? state.revision} : {}),
            ...(args.label !== undefined ? {label: args.label} : {}), splices: merged.splices,
            ...(placement ? {authored: placement} : {}), ...(effect ? {metadata: effect} : {})});
        }
      } catch (error) {
        const code = error.message === 'metadata_changed' ? 'DOCUMENT_METADATA_CHANGED' : error.message === 'canonical_act_invalid'
          ? 'INVALID_CANONICAL_ACTS' : error.message === 'canonical_act_rebase_conflict' ? 'CANONICAL_ACT_REBASE_CONFLICT' : 'DRAFT_BASE_UNAVAILABLE';
        const message = code === 'DOCUMENT_METADATA_CHANGED' ? 'The same document metadata changed while this draft was being edited.'
          : code === 'INVALID_CANONICAL_ACTS' ? 'The canonical acts do not replay this exact draft and its metadata.'
            : code === 'CANONICAL_ACT_REBASE_CONFLICT' ? 'Concurrent edits prevent preserving this exact act. Its draft remains in the editor.'
              : 'The retained history cannot rebase this draft. Its source remains in the editor.';
        return toolError(failure(code, message), head, {snapshot: current()});
      }
      const mergedInvalid = admissibleText(text);
      if (mergedInvalid) return toolError(failure('INVALID_DOCUMENT_INPUT', mergedInvalid), head, { snapshot: current() });
      const nextRevision = state.revision + entries.length;
      kernel.reconcile({ documentId: state.documentId, revision: nextRevision, text, ...committedMetadata,
        ...(entries.length ? {journal: [...state.journal, ...entries]} : {}) }, who);
      const admitted = kernel.snapshot();
      if (admitted.revision !== nextRevision || admitted.text !== text || admitted.filename !== committedMetadata.filename ||
          admitted.docKind !== committedMetadata.docKind || entries.some(entry => {
            const retained = admitted.journal.find(row => row.id === entry.id);
            return !retained || retained.createdAt !== entry.createdAt ||
              canonicalJson(retained.splices) !== canonicalJson(entry.splices) ||
              canonicalJson(retained.metadata ?? null) !== canonicalJson(entry.metadata ?? null) ||
              canonicalJson(retained.author) !== canonicalJson(entry.author);
          })) throw failure('INVALID_CANONICAL_ACTS', 'The canonical commit did not preserve this draft history.');
      refresh();
      head.receipts = [...head.receipts, { id: args.commitId, hash, draftClient, revision: state.revision, version: head.version, filename: state.filename, docKind: state.docKind, historyComplete: state.history.complete === true }].slice(-MAX_RECEIPTS);
      if (args.hydration_id) head.fileHydration = {...head.fileHydration, status: 'complete', revision: state.revision};
      if (draftEdits.length) state.commitResults = [...(state.commitResults || []), {id: args.commitId, edits: draftEdits}];
      await this.persist(head, state, kernel.invocationJournal(), false, null, undefined, input);
      return envelope({ outcome: 'committed', commitId: args.commitId, acceptedRevision: state.revision, acceptedVersion: head.version }, head, { snapshot: {...current(), draftEdits, draftClient} });
    }
    if (!getTool(operation) && !(input.humanTool && getHumanOperation(operation))) return toolError(failure('UNKNOWN_TOOL', 'Unknown operation.'));
    const documentId = head.documentId;
    let value = await kernel.invoke(operation, args, { ...agentCaller(), signal, ...(material?.binding ? {materialBinding: material.binding} : {}),
      ...(input.visualPreview ? {visualPreview: input.visualPreview} : {}),
      world: { presence: WORKER_PRESENCE, ...(observation ? {[operation === 'export' ? 'export' : 'visual']: observation.fact} : {}), ...(editor ? {editor: editor.fact} : {}) } });
    for (let guard = 0; guard < 4 && value.outcome === 'pending' && value.pending?.kind === 'surface-fact'; guard++) {
      const fact = resolveStructureFact(value.pending.requirements);
      if (!fact) break;
      value = await kernel.invoke(operation, args, { ...agentCaller(), signal, continues: value.pending.requestId, world: { presence: WORKER_PRESENCE, structure: fact } });
    }
    refresh();
    if (operation === 'read' && value.outcome === 'ok') {
      const material = materialReport(head);
      if (material) value = {...value, material};
      if (actor === 'agent' && !value.replayed && head.humanMessages?.length && input.peek) value = {...value, messagesQueued: head.humanMessages.length};
      else if (actor === 'agent' && !value.replayed && head.humanMessages?.length) {
        const dropped = head.humanMessagesDropped || 0;
        value = {
          ...value,
          messages: head.humanMessages.map(row => deliverHumanMessage(row, state)),
          ...(dropped ? {dropped} : {}),
        };
        head.humanMessages = []; delete head.humanMessagesDropped; head.version++;
      }
    }
    if (state.documentId !== documentId) return toolError(failure('DOCUMENT_IDENTITY_CHANGED', 'This operation cannot replace the remote workspace identity.'));
    const calledBy = typeof args.agent === 'string' && args.agent.trim() ? args.agent.trim().slice(0, 24) : typeof input.hostAgent === 'string' ? input.hostAgent.slice(0, 24) : '';
    if (actor === 'agent' && !value.replayed) head.agentCall = { id: input.operationId, at: Date.now(), operation, ...(operation === 'document.find' && typeof args.kind === 'string' ? { kind: args.kind.slice(0, 24) } : {}), ...(calledBy ? { name: calledBy } : {}) };
    let download = null, publication = null;
    const exportId = value.exportId;
    if (operation === 'export' && value.exportId) {
      let grant = head.exports?.find(row => row.id === value.exportId);
      if (exported?.id) {
        grant = await createExportGrant(exported, capabilityHash, input.exportAddress, this.env, head.bearer, head.bearer ? null : this.retainedAuthority(input));
        head.exports = [...head.exports || [], grant];
        publication = {grant, bytes: exported.bytes};
      }
      if (!grant || grant.owner !== capabilityHash || grant.expiresAt <= Date.now()) value = {...value, outcome: 'refused', reason: 'export_expired'};
      else {
        const token = !input.exportAddress ? null : grant.hash && editorSecret(this.env) ? await exportToken(input.exportAddress, grant, this.env)
          : !head.bearer ? exportHandle(input.exportAddress, grant) : null;
        if (!token || grant.hash && await digest(token) !== grant.hash) value = {...value, outcome: 'refused', reason: 'export_unavailable'};
        else {
          download = {type: 'resource_link', uri: input.exportOrigin + '/export/' + token, name: grant.name, mimeType: grant.mimeType, size: grant.bytes};
          value = {...value, filename: grant.name, mimeType: grant.mimeType, bytes: grant.bytes, downloadUrl: download.uri,
            artifact: {...value.artifact, status: 'created', destination: 'hosted_export', access: 'expiring_http_link', expiresAt: new Date(grant.expiresAt).toISOString()},
            exportExpiresAt: new Date(grant.expiresAt).toISOString()};
        }
      }
    }
    if (download) value = {...value, hostedDownload: download};
    let retainedResult;
    if (!value.replayed) {
      const journal = kernel.invocationJournal();
      this.live.observe(state, journal, {...agentCaller(), ...(args.agent ? {agent: args.agent} : {})}, value);
      if (exportId || operation === 'read' && value.messages) {
        const caller = agentCaller(), owner = JSON.stringify([caller.transport, caller.actor, caller.principal]);
        const record = journal.find(row => row.key === caller.invocationKey && row.owner === owner && row.documentId === documentId && row.operation === operation && (!exportId || row.output?.exportId === exportId));
        if (exportId && !record) throw failure('WORKSPACE_UNAVAILABLE', 'The exported result was not retained. Retry with the same operation identity.');
        if (record) record.output = structuredClone(value);
      }
      let retainedMaterial;
      if (material && !material.failure) {
        const pending = value.pending;
        if (value.outcome === 'pending' && pending?.requirements?.kind === 'material' && material.request) {
          material.binding ||= materialDescription(material.request);
          retainedMaterial = {key: material.key, argumentsHash: material.argumentsHash, input: material.input,
            id: pending.requestId, binding: material.binding, presentationBinding: material.presentationBinding ?? null, request: material.request,
            results: [...material.results], acks: material.acks};
          head.materialIntent = {...materialDescription(material.request), id: pending.requestId, status: 'pending',
            expiresAt: Date.now() + MATERIAL_LIMITS.lifetimeMs};
          head.materialOwner = {capabilityHash, caller: material.caller};
          delete head.materialEnded;
          head.version++;
        } else if (material.record) {
          retainedMaterial = null;
          head.materialReceipts = material.acks;
          if (['ok', 'applied', 'rebased', 'unchanged'].includes(value.outcome) || value.receipt?.state === 'committed') delete head.materialEnded;
          else head.materialEnded = {reason: value.reason || 'document_changed', operation, at: Date.now(),
            ...(value.field ? {field: value.field} : {})};
          head.materialIntent = null; head.materialOwner = null; head.version++;
        }
      } else if (material?.record) {
        retainedMaterial = null;
        head.materialReceipts = material.acks;
        head.materialEnded = {reason: value.reason || material.failure || 'document_changed', operation, at: Date.now(),
          ...(value.field ? {field: value.field} : {})};
        head.materialIntent = null; head.materialOwner = null; head.version++;
      }
      const taskResult = input.task && value.outcome !== 'pending' ? operationEnvelope(operation, value, head, {notesVersions: this.env.ACCESS_PROFILE === true}) : null;
      if (taskResult && operation === 'read' && value.outcome === 'ok' && observation?.fact?.image)
        taskResult.content.push({type: 'image', mimeType: 'image/png', data: observation.fact.image.data});
      const unchanged = ['edit', 'undo'].includes(operation) && ['conflict', 'refused'].includes(value.outcome) &&
        !publication && !taskResult && retainedMaterial === undefined && head.version === initialVersion;
      if (!unchanged) await this.persist(head, state, journal, false, publication, retainedMaterial, input,
        taskResult ? {task: input.task, result: taskResult} : null);
      retainedResult = taskResult;
    }
    await this.assertAuthority(input, {remembered: true});
    if (retainedResult) return retainedResult;
    const result = operationEnvelope(operation, value, head, {notesVersions: this.env.ACCESS_PROFILE === true});
    if (operation === 'read' && value.outcome === 'ok' && observation?.fact?.image) result.content.push({type: 'image', mimeType: 'image/png', data: observation.fact.image.data});
    return result;
  }

  alarm() {
    if (this.ctx.storage.kv.get('task')) return this.tasks().alarm();
    return this.exclusive(async () => {
      try { if (this.ctx.storage) this.ctx.storage.operation = 'alarm'; } catch {}
      const stops = (this.ctx.storage.kv.get('requestStops') || []).filter(row => row.expiresAt > Date.now());
      this.stoppingRequests = new Set(stops.map(row => row.key));
      this.ctx.storage.transactionSync(() => {
        if (stops.length) this.ctx.storage.kv.put('requestStops', stops);
        else this.ctx.storage.kv.delete('requestStops');
      });
      const head = this.ctx.storage.kv.get('head');
      this.live.expire(head);
      if (!head && stops.length) {
        await this.ctx.storage.setAlarm(Math.min(...stops.map(row => row.expiresAt)));
        return;
      }
      if (!head || head.expiresAt <= Date.now()) {
        this.cachedState = null;
        this.cachedJournal = null;
        await this.ctx.storage.deleteAll();
        await this.ctx.storage.sync();
      }
      else {
        const material = this.readMaterial(head);
        if (material && head.materialIntent?.expiresAt <= Date.now()) {
          try { await this.advanceMaterial(material.input, material); }
          catch (error) { if (error?.code !== 'OAUTH_AUTHORITY_REVOKED') throw error; }
        }
        const current = this.ctx.storage.kv.get('head');
        if (current) {
          const expired = (current.taskResults || []).filter(row => row.expiresAt <= Date.now() || row.owner !== current.capabilityHash);
          if (expired.length) {
            current.taskResults = current.taskResults.filter(row => !expired.includes(row));
            current.taskBytes = current.taskResults.reduce((sum, row) => sum + row.bytes, 0);
            this.ctx.storage.transactionSync(() => {
              for (const row of expired) for (let index = 0; index < row.parts; index++)
                this.ctx.storage.kv.delete('task-result:' + row.key + ':' + index);
              this.ctx.storage.kv.put('head', current);
            });
            await this.ctx.storage.sync();
          }
          await this.ctx.storage.setAlarm(Math.min(current.expiresAt, current.materialIntent?.expiresAt || Infinity, this.live.nextAlarm(),
            ...(current.taskResults || []).map(row => row.expiresAt), ...stops.map(row => row.expiresAt)));
        }
      }
    });
  }
}
