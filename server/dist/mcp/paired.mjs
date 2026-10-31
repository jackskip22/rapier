// SPDX-License-Identifier: AGPL-3.0-only
import {base64url, fromBase64url} from '../agent/door-identity.mjs';
import {editorSecretKeyMaterial, editorSecretUsable} from './editor-keys.mjs';

export const PAIRED_PATH = /^\/d\/(ws_[A-Za-z0-9_-]{43})$/;
export const PAIR_CODE = /^[A-HJ-NP-Z]{4}$/;
export const PAIR_CODE_MS = 60000, PAIR_SESSION_MS = 86400000;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const encoder = new TextEncoder();

export const sessionCookie = id => 'rapier_pair_' + id;
export const pendingCookie = id => 'rapier_pairing_' + id;

export function readCookie(request, name) {
  const values = String(request.headers.get('Cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}
export const setCookies = (id, name, value, seconds) => ['/d/', '/editor/'].map(path =>
  `${name}=${value}; Path=${path}${id}; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`);

export function newCode() {
  const bound = Math.floor(256 / LETTERS.length) * LETTERS.length;
  let code = '';
  while (code.length < 4) {
    const bytes = crypto.getRandomValues(new Uint8Array(4 - code.length));
    for (const byte of bytes) if (byte < bound) code += LETTERS[byte % LETTERS.length];
  }
  return code;
}
export const newSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

async function pairKey(secret) {
  return crypto.subtle.importKey('raw', editorSecretKeyMaterial(secret, 'rapier-pair-v1:'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
export async function mintSession(secret, id, epoch, now = Date.now()) {
  const body = `${epoch}.${now + PAIR_SESSION_MS}.${newSecret()}`;
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', await pairKey(secret), encoder.encode(id + '.' + body)));
  return 'pp1.' + body + '.' + base64url(tag);
}
export async function verifySession(secret, id, value, now = Date.now()) {
  const parts = /^pp1\.(0|[1-9][0-9]{0,8})\.([0-9]{13})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(value || '');
  if (!parts || !editorSecretUsable(secret) || Number(parts[2]) <= now || Number(parts[2]) > now + PAIR_SESSION_MS + 60000) return null;
  const tag = fromBase64url(parts[4]);
  if (base64url(tag) !== parts[4] || base64url(fromBase64url(parts[3])) !== parts[3]) return null;
  const valid = await crypto.subtle.verify('HMAC', await pairKey(secret), tag, encoder.encode(id + '.' + parts[1] + '.' + parts[2] + '.' + parts[3]));
  return valid ? {epoch: Number(parts[1]), expiresAt: Number(parts[2])} : null;
}

export const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src data:; connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const pageFlagText = ({id, editorKey, fileOrigins}) =>
  ' globalThis.RAPIER_PAIRED_DOCUMENT = ' + JSON.stringify(id) + '; globalThis.RAPIER_DOOR = ' + JSON.stringify('/editor/' + id) + ';'
    + (editorKey ? ' globalThis.RAPIER_EDITOR_KEY = ' + JSON.stringify(editorKey) + '; globalThis.RAPIER_FILE_DOWNLOAD_ORIGINS = ' + JSON.stringify(fileOrigins) + ';' : '');
export function pageFlags(html, {id, editorKey, fileOrigins}) {
  const flags = pageFlagText({id, editorKey, fileOrigins});
  const flagged = html.replace(/globalThis\.RAPIER_APPS_HOST\s*=\s*true;/, match => match + flags);
  return flagged === html ? null : flagged;
}

export const PAIRED_SHELL_FILE = 'paired-editor.html';
export const PAIRED_SHELL_REDIRECTS = '/d/:id /' + PAIRED_SHELL_FILE.replace(/\.html$/, '') + ' 200\n';
export const PAIRED_SHELL_HEADERS = '/d/*\n  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n' +
  '  X-Robots-Tag: noindex\n  Content-Security-Policy: ' + PAGE_CSP + '\n';
export const PAIRED_PREVIEW = '<meta property="og:title" content="Rapier">\n<meta property="og:description" content="A shared document in Rapier: open it to see and edit it live with the agent.">\n';

export function pairedShell(html) {
  const prelude = " (() => { const id = /^\\/d\\/(ws_[A-Za-z0-9_-]{43})$/.exec(location.pathname)?.[1]; if (!id) return;" +
    " if (/^\\?pair=[a-f0-9]{64}$/.test(location.search)) { location.replace('/editor/' + id + location.search); return; }" +
    " globalThis.RAPIER_PAIRED_DOCUMENT = id; globalThis.RAPIER_DOOR = '/editor/' + id;" +
    " globalThis.RAPIER_ASSET_BASE = new URL('/editor-assets/', location.href).href;" +
    " globalThis.RAPIER_EDITOR_ADMISSION = fetch('/editor/' + id + '/admit', {method: 'POST', credentials: 'same-origin', cache: 'no-store'," +
    " headers: {'Content-Type': 'application/json'}, body: '{}'}).then(response => response.ok ? response.json() : {}, () => ({})); })();";
  const hostExpression = " globalThis.RAPIER_APPS_HOST = !(window.parent === window && new URLSearchParams(location.hash.slice(1)).has('live') && new URLSearchParams(location.hash.slice(1)).has('key')); ";
  let replaced = 0;
  const out = html.replace(/(<link\b[^>]*\bhref=)(["'])(icon-(?:192|512)\.png)\2/gi, (_, prefix, quote, name) => prefix + quote + '/' + name + quote)
    .replace(/<\/title>\n?/, all => all + PAIRED_PREVIEW)
    .replace(/globalThis\.RAPIER_APPS_HOST\s*=\s*true;/, () => { replaced++; return 'globalThis.RAPIER_APPS_HOST = true;' + prelude + hostExpression; });
  if (replaced !== 1) throw new Error('The Apps page has no RAPIER_APPS_HOST flag for the paired editor shell.');
  return out;
}
