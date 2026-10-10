// This source stays outside every packed resource. Recovery reads never open a writer.
async function _rapierRescueStartup() {
  const panel = document.querySelector('.rapier-boot-failure');
  if (!panel || document.getElementById('rapier-startup-rescue')) return;
  const section = document.createElement('section'), status = document.createElement('p'), files = document.createElement('div');
  section.id = 'rapier-startup-rescue';
  section.dataset.state = 'loading';
  section.style.marginTop = '1.5rem';
  panel.style.maxHeight = '100dvh'; panel.style.overflow = 'auto'; panel.style.boxSizing = 'border-box';
  status.textContent = 'Finding saved documents…';
  section.append(status, files); panel.append(section);
  let incomplete = false, settled = false, scope = '';
  try { if (/^https?:$/.test(location.protocol)) { const dir = new URL('.', location.href).pathname; if (dir !== '/') scope = '@' + dir; } } catch (_) {}
  const documents = new Map(), notes = [], number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const nameOf = value => typeof value === 'string' && value ? value : 'untitled.md';
  const markdownName = value => {
    let name = nameOf(value).replace(/[\\/<>:"|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '_').replace(/^\.+|[ .]+$/g, '');
    if (!name) name = 'untitled';
    return /\.md$/i.test(name) ? name : name + '.md';
  };
  const linkFor = row => {
    if (row.link) return row.link;
    const link = document.createElement('a'); let busy = false;
    link.href = '#'; link.download = markdownName(row.name); link.textContent = row.name;
    link.style.cssText = 'display:block;padding:.65rem 0;color:inherit;overflow-wrap:anywhere;font:inherit';
    // Large Notes stay in their store until requested. The download gets a Blob of the original bytes.
    link.addEventListener('click', async event => {
      if (link.getAttribute('href') !== '#') return;
      event.preventDefault(); if (busy) return; busy = true;
      try {
        const blob = await row.read(), url = URL.createObjectURL(blob);
        link.href = url; link.click();
        setTimeout(() => { URL.revokeObjectURL(url); if (link.href === url) link.href = '#'; }, 60000);
      } catch (error) {
        incomplete = true; section.dataset.state = 'partial';
        status.textContent = 'This saved document could not be read. Reload this file to try again.';
        console.warn('[rapier] saved document could not be read', error);
      } finally { busy = false; }
    });
    return row.link = link;
  };
  const render = () => {
    const rows = [...documents.values()].flat().concat(notes).sort((a, b) => b.time - a.time);
    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.appendChild(linkFor(row));
    files.replaceChildren(fragment);
    status.textContent = incomplete ? 'Some saved documents could not be read. Reload this file to try again.'
      : rows.length ? 'Download your saved documents.' : settled ? 'No saved documents found in this browser.' : 'Finding saved documents…';
    section.dataset.state = settled ? incomplete ? 'partial' : 'ready' : 'loading';
  };
  const documentRow = (record, key, field = 'canonicalText') => {
    if (!record || record.docId !== 'current') return;
    if (typeof record[field] !== 'string') { incomplete = true; return; }
    const held = typeof record.slot === 'string' && /^current:held(?::|$)/.test(record.slot);
    if (!held && record.integritySchema !== 4) { incomplete = true; return; }
    const text = record[field], name = nameOf(record.filename), generation = number(record.generation);
    const authority = typeof record.documentAuthority === 'string' ? record.documentAuthority : '';
    if (authority.startsWith('notes:')) return;
    const identity = held ? record.slot : authority ? 'document:' + authority : key;
    const previous = documents.get(identity) || [];
    if (previous.length && generation < previous[0].generation) return;
    const peers = previous.length && generation === previous[0].generation ? previous : [];
    const same = peers.find(row => row.text === text && row.name === name), time = number(record.updatedAt ?? record.ts);
    if (same) { same.time = Math.max(same.time, time); return; }
    // Equal-generation disagreement is kept as two downloads; a timestamp cannot decide which words to discard.
    peers.push({name, text, generation, time, read: () => new Blob([text], {type: 'text/markdown;charset=utf-8'})});
    documents.set(identity, peers);
  };
  const database = name => new Promise((resolve, reject) => {
    let request, absent = false, finished = false;
    const finish = (error, db = null) => {
      if (finished) { db?.close(); return; } finished = true;
      error ? reject(error) : resolve(db);
    };
    try { if (!globalThis.indexedDB) { resolve(null); return; } request = indexedDB.open(name); }
    catch (error) { reject(error); return; }
    // Opening an absent database starts an upgrade. Aborting it leaves no database behind.
    request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
    request.onsuccess = () => finish(null, request.result);
    request.onerror = () => finish(absent ? null : request.error || new Error('Saved documents could not be opened'));
    request.onblocked = () => finish(new Error('Saved documents are busy in another tab'));
  });
  const read = (db, stores, act) => new Promise((resolve, reject) => {
    let tx, value;
    try { tx = db.transaction(stores, 'readonly'); act(tx, result => { value = result; }); }
    catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Saved documents could not be read'));
  });
  const recovery = async () => {
    const db = await database('rapier:recovery' + scope); if (!db) return;
    try {
      const stores = ['meta', 'checkpoints'].filter(name => db.objectStoreNames.contains(name));
      if (!stores.length) throw new Error('Saved document records are unavailable');
      await read(db, stores, tx => {
        for (const name of stores) {
          const request = tx.objectStore(name).openCursor();
          request.onsuccess = () => {
            const cursor = request.result; if (!cursor) return;
            documentRow(cursor.value, name + ':' + String(cursor.key)); cursor.continue();
          };
        }
      });
    } finally { db.close(); }
  };
  const noteName = (name, index) => typeof name === 'string' && /^[^/\\\0]+$/.test(name) &&
    (/\.md$/i.test(name) || !name.startsWith('.') && name !== 'notes.json' && name !== 'rapier-backup.json' && Object.hasOwn(index?.notes || {}, name));
  const noteIndex = async load => {
    try {
      const index = JSON.parse(await (await load()).text());
      if (index?.version === 1 && index.notes && typeof index.notes === 'object' && !Array.isArray(index.notes)) return index;
      incomplete = true;
    } catch (error) { if (error?.name !== 'NotFoundError') incomplete = true; }
    return null;
  };
  const noteBlob = async name => {
    const db = await database('rapier-notes-preview'); if (!db) throw new Error('Saved notes are unavailable');
    try {
      return await read(db, ['bytes'], (tx, done) => {
        const store = tx.objectStore('bytes'), request = store.get(name);
        request.onsuccess = () => {
          const value = request.result;
          if (value instanceof Uint8Array) { done(new Blob([value], {type: 'text/markdown;charset=utf-8'})); return; }
          if (!value || value.type !== 'chunks' || typeof value.id !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(value.id) ||
              !Number.isSafeInteger(value.size) || value.size < 0 || value.chunkBytes !== 1048576 ||
              value.count !== Math.ceil(value.size / 1048576) || !/^[0-9a-f]{64}$/.test(value.digest)) { tx.abort(); return; }
          const parts = []; let at = 0;
          const next = () => {
            if (at === value.count) { done(new Blob(parts, {type: 'text/markdown;charset=utf-8'})); return; }
            const part = store.get('\u0000rapier-file:' + value.id + ':' + at);
            part.onsuccess = () => {
              const bytes = part.result;
              if (!(bytes instanceof Uint8Array) || bytes.length !== Math.min(1048576, value.size - at * 1048576)) { tx.abort(); return; }
              parts.push(bytes); at++; next();
            };
          };
          next();
        };
      });
    } finally { db.close(); }
  };
  const noteDatabase = async () => {
    const db = await database('rapier-notes-preview'); if (!db) return;
    let names;
    try {
      names = await read(db, ['bytes'], (tx, done) => {
        const keys = tx.objectStore('bytes').getAllKeys(); keys.onsuccess = () => done(keys.result);
      });
    } finally { db.close(); }
    const index = names.includes('notes.json') ? await noteIndex(() => noteBlob('notes.json')) : null;
    for (const name of names) if (noteName(name, index)) notes.push({name, time: number(index?.notes?.[name]?.modified), read: () => noteBlob(name)});
  };
  const noteFiles = async () => {
    if (!navigator.storage?.getDirectory) return;
    let directory;
    try { directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('notes'); }
    catch (error) { if (error?.name === 'NotFoundError') return; throw error; }
    const index = await noteIndex(async () => (await directory.getFileHandle('notes.json')).getFile());
    for await (const [name, handle] of directory) {
      if (handle.kind !== 'file' || !noteName(name, index)) continue;
      try {
        const file = await handle.getFile();
        notes.push({name, time: number(file.lastModified), read: () => handle.getFile()});
      } catch (_) { incomplete = true; }
    }
  };
  try {
    const raw = localStorage.getItem('rapier:recovery:snapshot' + scope);
    if (raw) documentRow(JSON.parse(raw), 'local', 'markdown');
  } catch (_) { incomplete = true; }
  try {
    const storage = sessionStorage, prefix = 'rapier:embed:draft' + scope + ':';
    for (let at = 0; at < storage.length; at++) {
      const key = storage.key(at); if (!key?.startsWith(prefix)) continue;
      try {
        const record = JSON.parse(storage.getItem(key));
        if (!record || record.integritySchema !== 1 || typeof record.content !== 'string') { incomplete = true; continue; }
        const text = record.content;
        documents.set('embed:' + key, [{name: nameOf(record.filename), text, time: number(record.timestamp),
          read: () => new Blob([text], {type: 'text/markdown;charset=utf-8'})}]);
      } catch (_) { incomplete = true; }
    }
  } catch (_) { incomplete = true; }
  render();
  await Promise.allSettled([recovery, noteDatabase, noteFiles].map(async load => {
    try { await load(); } catch (error) { incomplete = true; console.warn('[rapier] saved documents could not be read', error); }
    render();
  }));
  settled = true; render();
}
