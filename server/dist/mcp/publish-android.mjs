// SPDX-License-Identifier: AGPL-3.0-only
import {MAX_PUBLISHED_PAGE_BYTES} from '../spec/publish.mjs';
import {HOUSE_STYLE} from './oauth.mjs';

const PACKAGES = new Set(['app.rapier', 'app.rapier.debug', 'app.rapier.alpha']);
const FINGERPRINT = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/;
const HEADERS = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};

function androidRelations(value) {
  if (typeof value !== 'string' || !value || value.length > 8192) return null;
  let configured;
  try { configured = JSON.parse(value); } catch { return null; }
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return null;
  const entries = Object.entries(configured);
  if (!entries.length || entries.some(([name, fingerprints]) => !PACKAGES.has(name) || !Array.isArray(fingerprints) ||
      !fingerprints.length || fingerprints.length > 4 || fingerprints.some(value => typeof value !== 'string' || !FINGERPRINT.test(value)))) return null;
  return entries.map(([package_name, fingerprints]) => ({relation: ['delegate_permission/common.use_as_origin'],
    target: {namespace: 'android_app', package_name, sha256_cert_fingerprints: [...new Set(fingerprints.map(value => value.toUpperCase()))]}}));
}

export function androidPublishRuntime(config, scope = globalThis) {
  const status = scope.document.getElementById('status'), close = scope.document.getElementById('close');
  let port = null, transfer = '', token = '', pending = null, retired = false, busy = false, timer = 0, controller = null;
  const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  const digest = async bytes => hex(new Uint8Array(await scope.crypto.subtle.digest('SHA-256', bytes)));
  const send = value => port?.postMessage(JSON.stringify({v: 1, transfer, token, ...value}));
  const drop = () => { if (pending?.bytes) pending.bytes.fill(0); pending = null; };
  const retire = message => {
    if (retired) return;
    retired = true; scope.clearTimeout(timer); controller?.abort(); drop();
    status.textContent = message;
  };
  const refuse = () => { send({type: 'error', code: 'PUBLISH_TRANSFER', message: 'The publishing transfer was not confirmed. Return to Rapier and try again.'}); retire('Publishing was not confirmed.'); };
  const activity = () => { scope.clearTimeout(timer); timer = scope.setTimeout(refuse, 120000); };
  close.addEventListener('click', () => { send({type: 'cancel'}); retire('Return to Rapier.'); });
  scope.addEventListener('pagehide', () => { send({type: 'cancel'}); retire('Publishing was interrupted.'); });
  async function receive(event) {
    if (retired) return;
    if (busy) return refuse();
    let value;
    try {
      if (typeof event.data !== 'string' || event.data.length > 90000) throw new Error();
      value = JSON.parse(event.data);
      if (value.v !== 1 || value.transfer !== transfer || value.token !== token) throw new Error();
      activity();
      if (value.type === 'begin') {
        if (pending || !['GET', 'PUT', 'DELETE'].includes(value.method) || !/^[a-f0-9]{64}$/.test(value.id) ||
            !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value.secret) ||
            value.revision !== null && !/^[a-f0-9]{32}$/.test(value.revision) ||
            !Number.isSafeInteger(value.size) || value.size < 0 || value.size > config.maxBytes ||
            !/^[a-f0-9]{64}$/.test(value.sha256) || (value.method === 'PUT' ? value.size === 0 : value.size !== 0)) throw new Error();
        busy = true;
        if (await digest(new TextEncoder().encode('rapier-publish-v1:' + value.secret)) !== value.id) throw new Error();
        if (retired) return;
        pending = {method: value.method, id: value.id, secret: value.secret, revision: value.revision,
          sha256: value.sha256, bytes: new Uint8Array(value.size), offset: 0};
        busy = false; status.textContent = 'Receiving page…'; send({type: 'ack', offset: 0}); return;
      }
      if (!pending) throw new Error();
      if (value.type === 'chunk') {
        if (value.offset !== pending.offset || typeof value.data !== 'string' || value.data.length > 4 * Math.ceil(config.chunkBytes / 3)) throw new Error();
        const decoded = scope.atob(value.data);
        if (!decoded.length || decoded.length > config.chunkBytes || scope.btoa(decoded) !== value.data || pending.offset + decoded.length > pending.bytes.length) throw new Error();
        for (let i = 0; i < decoded.length; i++) pending.bytes[pending.offset + i] = decoded.charCodeAt(i);
        pending.offset += decoded.length; send({type: 'ack', offset: pending.offset}); return;
      }
      if (value.type !== 'finish' || pending.offset !== pending.bytes.length) throw new Error();
      busy = true;
      if (await digest(pending.bytes) !== pending.sha256 || retired) throw new Error();
      const headers = {'Authorization': 'Bearer ' + pending.secret};
      if (pending.method === 'PUT') {
        headers['Content-Type'] = 'text/html; charset=utf-8';
        headers['X-Rapier-SHA256'] = pending.sha256;
      }
      if (pending.method !== 'GET') headers[pending.revision === null ? 'If-None-Match' : 'If-Match'] = pending.revision === null ? '*' : '"' + pending.revision + '"';
      controller = new AbortController();
      status.textContent = pending.method === 'DELETE' ? 'Unpublishing…' : 'Publishing…';
      const response = await scope.fetch('/publish/' + pending.id, {method: pending.method, headers,
        ...(pending.method === 'PUT' ? {body: pending.bytes} : {}), credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal});
      const reader = response.body?.getReader(), chunks = []; let size = 0;
      if (reader) try {
        for (;;) { const read = await reader.read(); if (read.done) break; size += read.value.byteLength;
          if (size > 16384) throw new Error(); chunks.push(read.value); }
      } finally { try { await reader.cancel(); } catch {} }
      const bytes = new Uint8Array(size); let at = 0;
      for (const part of chunks) { bytes.set(part, at); at += part.length; }
      const body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
      if (!body || typeof body !== 'object' || Array.isArray(body) || retired) throw new Error();
      send({type: 'result', status: response.status, body});
      retire(response.ok ? 'Done. Return to Rapier.' : 'Return to Rapier to finish publishing.');
    } catch { refuse(); }
  }
  scope.addEventListener('message', event => {
    if (port || retired || event.origin !== config.origin || event.ports?.length !== 1) return;
    let hello;
    try {
      if (typeof event.data !== 'string' || event.data.length > 256) return;
      hello = JSON.parse(event.data);
    } catch { return; }
    if (hello?.v !== 1 || hello.type !== 'hello' || !/^[a-f0-9]{32}$/.test(hello.transfer) || !/^[a-f0-9]{32}$/.test(hello.token)) return;
    transfer = hello.transfer; token = hello.token; port = event.ports[0];
    port.onmessage = receive; port.start?.(); activity(); send({type: 'ready'});
  });
}

export function handleAndroidPublish(request, env) {
  const url = new URL(request.url), assetlinks = url.pathname === '/.well-known/assetlinks.json';
  if (!assetlinks && url.pathname !== '/publish/android') return null;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {...HEADERS, Allow: 'GET, HEAD'}});
  const relations = androidRelations(env.PUBLISH_ANDROID_FINGERPRINTS);
  if (assetlinks) return new Response(request.method === 'HEAD' ? null : JSON.stringify(relations || []), {
    status: relations ? 200 : 503, headers: {...HEADERS, 'Content-Type': 'application/json; charset=utf-8'}});
  const nonce = crypto.randomUUID(), config = {maxBytes: MAX_PUBLISHED_PAGE_BYTES, chunkBytes: 65536, origin: url.origin};
  const script = relations ? '<script nonce="' + nonce + '">(' + androidPublishRuntime.toString() + ')(' + JSON.stringify(config) + ');</script>' : '';
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Publish · Rapier</title><link rel="stylesheet" href="/fonts.css"><style nonce="' + nonce + '">' + HOUSE_STYLE +
    '</style><main><h1>Publish page</h1><p id="status" role="status">' + (relations ? 'Connecting to Rapier…' : 'Android publishing is not configured yet. Return to Rapier.') +
    '</p><button id="close" class="negative">return to rapier</button></main>' + script + '</html>';
  return new Response(request.method === 'HEAD' ? null : html, {status: relations ? 200 : 503, headers: {...HEADERS,
    'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'self' 'nonce-" + nonce + "'; font-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
}
