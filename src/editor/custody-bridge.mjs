// SPDX-License-Identifier: AGPL-3.0-only
import {custodySocket} from './live-custody.mjs';

export function createCustodyBridge({post, RealSocket, store, key, rules, host = {}, events = {}}) {
  const Socket = custodySocket(RealSocket, {store, key, rules, host, events});
  const sockets = new Map();
  let active = null, parked = null;
  const bind = (id, socket) => {
    sockets.set(id, socket); active = socket;
    socket.onopen = () => post({type: 'socket', id, event: 'open'});
    socket.onmessage = event => post({type: 'socket', id, event: 'message', data: event.data});
    socket.onerror = () => post({type: 'socket', id, event: 'error'});
    socket.onclose = event => { sockets.delete(id); if (active === socket) active = null; post({type: 'socket', id, event: 'close', code: event.code, reason: event.reason || ''}); };
  };
  return {
    handle(value) {
      const socket = sockets.get(value.id);
      if (value.op === 'open') {
        if (parked && parked.url === value.url && parked.socket.mode === 'custody') {
          const held = parked.socket; parked = null;
          bind(value.id, held); held.attachClient();
          return;
        }
        parked = null;
        const opened = new Socket(value.url, value.protocols);
        opened.url = value.url;
        bind(value.id, opened);
      } else if (value.op === 'send') socket?.send(value.data);
      else if (value.op === 'close' && socket) {
        sockets.delete(value.id);
        if (value.reason === 'renamed' && socket.mode === 'custody') { socket.detachClient(); parked = {url: socket.url, socket}; return; }
        if (active === socket) active = null;
        socket.close(value.code, value.reason);
      }
    },
    mode: () => active?.mode || null,
    context: args => active?.mode === 'custody' ? active.context(args) : null,
    sync: args => active?.mode === 'custody' ? active.sync(args) : null,
    close() { for (const socket of sockets.values()) socket.close(1000, 'left'); sockets.clear(); parked?.socket.close(1000, 'left'); parked = null; active = null; },
  };
}

export function custodyStore(indexedDB, name, slot) {
  let opened;
  const open = () => opened ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('custody');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('custody_store_blocked'));
  });
  const run = (mode, act) => open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('custody', mode), request = act(tx.objectStore('custody'));
    tx.oncomplete = () => resolve(request?.result ?? null);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('custody_store_failed'));
  }));
  return {
    read: () => run('readonly', store => store.get(slot)),
    write: value => run('readwrite', store => store.put(value, slot)).then(() => undefined),
    clear: () => run('readwrite', store => store.delete(slot)).then(() => undefined),
  };
}
