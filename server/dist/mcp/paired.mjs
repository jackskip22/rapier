// SPDX-License-Identifier: AGPL-3.0-only
// The paired editor at /d/<id>: the built app page in a browser tab, talking to its own workspace over HTTP.
// A browser reaches one workspace: as the connected owner (the browser identity set at consent), or through a
// pairing the agent confirms with the four-letter code the page shows. Neither credential appears in a tool result.
import {base64url, fromBase64url} from '../agent/door-identity.mjs';
import {editorSecretKeyMaterial, editorSecretUsable} from './editor-keys.mjs';

export const PAIRED_PATH = /^\/d\/(ws_[A-Za-z0-9_-]{43})$/;
export const PAIR_CODE = /^[A-HJ-NP-Z]{4}$/;
export const PAIR_CODE_MS = 60000, PAIR_SESSION_MS = 86400000, MAX_PAIRINGS = 8;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const encoder = new TextEncoder();

export const sessionCookie = id => 'rapier_pair_' + id;
export const pendingCookie = id => 'rapier_pairing_' + id;

export function readCookie(request, name) {
  const values = String(request.headers.get('Cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}
// Scoped to the one workspace's path, so the browser never sends it anywhere else.
export const setCookie = (id, name, value, seconds) => `${name}=${value}; Path=/d/${id}; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, byte => LETTERS[byte % LETTERS.length]).join('');
}
export const newSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

async function pairKey(secret) {
  return crypto.subtle.importKey('raw', editorSecretKeyMaterial(secret, 'rapier-pair-v1:'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
// A paired session names its workspace, the workspace's pairing epoch (a rotation retires every session) and its end.
export async function mintSession(secret, id, epoch, now = Date.now()) {
  const body = `${epoch}.${now + PAIR_SESSION_MS}`;
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', await pairKey(secret), encoder.encode(id + '.' + body)));
  return 'pp1.' + body + '.' + base64url(tag);
}
export async function verifySession(secret, id, value, now = Date.now()) {
  const parts = /^pp1\.(0|[1-9][0-9]{0,8})\.([0-9]{13})\.([A-Za-z0-9_-]{43})$/.exec(value || '');
  if (!parts || !editorSecretUsable(secret) || Number(parts[2]) <= now || Number(parts[2]) > now + PAIR_SESSION_MS + 60000) return null;
  const tag = fromBase64url(parts[3]);
  if (base64url(tag) !== parts[3]) return null;
  const valid = await crypto.subtle.verify('HMAC', await pairKey(secret), tag, encoder.encode(id + '.' + parts[1] + '.' + parts[2]));
  return valid ? {epoch: Number(parts[1]), expiresAt: Number(parts[2])} : null;
}

// The top-level page: the Apps resource's own bytes, told which workspace it edits and where its transport posts.
// The editor key is minted only for a browser the workspace admitted.
export const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src data:; connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export function pageFlags(html, {id, editorKey, fileOrigins}) {
  const flags = ' globalThis.RAPIER_PAIRED_DOCUMENT = ' + JSON.stringify(id) + '; globalThis.RAPIER_DOOR = ' + JSON.stringify('/d/' + id) + ';'
    + (editorKey ? ' globalThis.RAPIER_EDITOR_KEY = ' + JSON.stringify(editorKey) + '; globalThis.RAPIER_FILE_DOWNLOAD_ORIGINS = ' + JSON.stringify(fileOrigins) + ';' : '');
  const flagged = html.replace(/globalThis\.RAPIER_APPS_HOST\s*=\s*true;/, match => match + flags);
  return flagged === html ? null : flagged;
}
