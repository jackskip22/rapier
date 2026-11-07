import {createElement as h, useEffect, useRef, useState} from 'react';
import {Button, Input, Meter, Select, Switch, Table, Tabs} from '@cloudflare/kumo';
import {api, check, createQueue, createSettings, rewriteAndRead, workerResult} from './admin-work.mjs';

const ROUTE = '/_emdash/api/plugins/rapier-media';
const DEFAULTS = {quality: 90, exact: false, effort: 3, maxKilobytes: 0, widths: [640, 750, 828, 960, 1080, 1280, 1668, 1920, 2048, 2560, 3200, 3840]};
const column = gap => ({display: 'flex', flexDirection: 'column', gap});
const line = {display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12};
const size = n => n == null ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const percent = (after, before) => `${Math.round(100 * (1 - after / before))}%`;
const WORDS = {not_smaller: 'Already small', restore_differs: 'Not exact', too_large: 'Too large', too_large_to_defer: 'Too large',
  key_changed: 'Changed', missing: 'Missing', JXL_JPEG: 'Not supported', JXL_UNSUPPORTED: 'Not supported', no_frame: 'Not a picture'};
const why = reason => WORDS[reason] ?? 'Failed';
const failure = error => error.name === 'AbortError' ? 'Canceled' : error.phase === 'rewrite' ? 'Links not updated' : why(error.code);

function makeJxl(file, settings, signal, onProgress) {
  return workerResult(() => new Worker(new URL('./media-worker.mjs', import.meta.url), {type: 'module'}),
    {file, settings}, {signal, progress: onProgress});
}
async function fetchFile(item, signal) {
  check(signal);
  const response = await fetch(`/_emdash/api/media/file/${item.storageKey}`, {signal, credentials: 'same-origin', cache: 'no-store', headers: {Accept: item.mimeType}});
  check(signal);
  if (!response.ok) throw new Error(`${response.status}`);
  const blob = await response.blob(); check(signal);
  return new File([blob], item.filename, {type: item.mimeType});
}
async function download(item) {
  const file = await fetchFile(item, new AbortController().signal), url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = item.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const query = item => `id=${item.id}&key=${encodeURIComponent(item.storageKey)}`;
async function keep(item, made, signal) {
  const attach = (path, record) => {
    const {bytes, ...description} = record;
    return api(path, {method: 'POST', body: bytes, signal, type: 'application/octet-stream',
      headers: {'x-rapier-result': JSON.stringify(description)}});
  };
  let result = {stored: 'original', reason: made.result.reason?.code};
  if (made.result.fits) {
    result = await attach(`${ROUTE}/attach?${query(item)}&source=${made.source}`, made.result);
    if (result.stored === 'sidecar')
      for (const copy of made.copies) if (copy.fits)
        await attach(`${ROUTE}/variant?${query(item)}&width=${copy.width}&source=${made.source}`, copy);
  }
  const {items: [stored]} = await api(`${ROUTE}/library`, {method: 'POST', signal, type: 'application/json',
    body: JSON.stringify({items: [{id: item.id, key: item.storageKey, size: item.size ?? made.bytes}]})});
  return {result, stored};
}

function useQueue() {
  const [rows, setRows] = useState([]), [state, setState] = useState({busy: false, paused: false}), [status, setStatus] = useState(null);
  const owner = useRef(null);
  const update = (id, patch) => setRows(old => old.map(row => row.id === id ? {...row, ...patch} : row));
  function current() {
    return owner.current ??= createQueue({change: setState,
      start: (item, cancel) => update(item.id, {cancel}), finish: item => update(item.id, {cancel: null}),
      fail: (item, error) => {
        const state = failure(error);
        if (item.status) setStatus(state); else update(item.id, {state, after: null, widths: null});
      }});
  }
  useEffect(() => () => { owner.current?.dispose(); owner.current = null; }, []);
  return {rows, setRows, update, status, ...state,
    run(items, task, options) { setStatus(null); return current().run(items, task, options); },
    togglePause: () => current().togglePause(), cancel: () => current().cancel()};
}

const WIDE = 'hidden lg:table-cell';
function Results({queue}) {
  const {rows} = queue, done = rows.filter(r => r.after != null);
  const before = done.reduce((s, r) => s + r.before, 0), after = done.reduce((s, r) => s + r.after, 0);
  const finished = rows.filter(r => r.state && !/…$|^Waiting$/.test(r.state)).length;
  const cell = (value, className) => h(Table.Cell, {className}, value ?? '');
  const details = (b, a, widths) => [b != null && size(b), a != null && size(a)].filter(Boolean).join(' → ') + (widths ? ` · ${widths} widths` : '');
  const name = (text, b, a, widths) => h('div', {className: 'min-w-0'}, h('span', {className: 'block truncate', style: {maxWidth: '40vw'}}, text),
    (b != null || a != null) && h('span', {className: 'block text-xs text-kumo-subtle xl:hidden'}, details(b, a, widths)));
  return h('div', {style: column(12)},
    queue.busy && rows.length > 0 && h(Meter, {label: `${finished} of ${rows.length}`, value: Math.round(100 * finished / rows.length), showValue: false}),
    rows.length > 0 && h(Table, null,
      h(Table.Header, null, h(Table.Row, null, [['Name'], ['Before', WIDE], ['After', WIDE], ['Saved'], ['Widths', WIDE], ['']]
        .map(([t, className], i) => h(Table.Head, {key: i, className}, t)))),
      h(Table.Body, null, rows.map(row => h(Table.Row, {key: row.id},
        cell(name(row.name, row.before, row.after, row.widths)), cell(size(row.before), WIDE), cell(size(row.after), WIDE),
        cell(row.after != null ? percent(row.after, row.before) : ''), cell(row.widths, WIDE),
        cell(h('div', {className: 'whitespace-nowrap', style: {...line, alignItems: 'center', flexWrap: 'nowrap'}}, row.state,
          row.cancel ? h(Button, {size: 'sm', variant: 'secondary', onClick: row.cancel}, 'Cancel') :
            row.mimeType === 'image/jpeg' && row.storageKey ? h(Button, {size: 'sm', variant: 'ghost', onClick: () => download(row)}, 'JPEG') : null))))),
      done.length > 0 && h(Table.Footer, null, h(Table.Row, null, cell(name('Total', before, after)), cell(size(before), WIDE),
        cell(size(after), WIDE), cell(percent(after, before)), cell('', WIDE), cell()))));
}
function Controls({queue, children}) {
  return h('div', {style: line}, children,
    queue.busy && h(Button, {variant: 'secondary', onClick: queue.togglePause}, queue.paused ? 'Resume' : 'Pause'),
    queue.busy && h(Button, {variant: 'secondary', onClick: queue.cancel}, 'Cancel'),
    queue.status && h('span', {role: 'status'}, queue.status));
}
async function convert(queue, item, settings, signal) {
  check(signal);
  queue.update(item.id, {state: 'Converting…'});
  const file = await fetchFile(item, signal), made = await makeJxl(file, settings, signal);
  const {result, stored} = await keep(item, made, signal), kept = stored.state === 'sidecar';
  check(signal);
  queue.update(item.id, {before: file.size, after: stored.stored, widths: stored.widths, state: made.over ? 'Over target' : kept ? 'Done' : why(result.reason)});
}

function Upload({settings}) {
  const queue = useQueue(), input = useRef(), next = useRef(0);
  async function add(event) {
    const files = [...event.target.files]; event.target.value = '';
    const items = files.map(file => ({id: `u${next.current++}`, file, name: file.name, state: 'Waiting'}));
    queue.setRows(old => [...old, ...items]);
    await queue.run(items, async (row, signal) => {
      queue.update(row.id, {state: 'Uploading…'});
      const form = new FormData(); form.append('file', row.file);
      const {item} = await api('/_emdash/api/media', {method: 'POST', body: form, signal});
      queue.update(row.id, {...item, id: row.id, name: row.name, state: 'Making…'});
      const made = await makeJxl(row.file, settings, signal);
      const {result, stored} = await keep(item, made, signal), kept = stored.state === 'sidecar';
      check(signal);
      queue.update(row.id, {before: made.bytes, after: stored.stored, widths: stored.widths,
        state: made.over ? 'Over target' : kept ? 'Done' : why(result.reason)});
    });
  }
  return h('div', {style: column(16)},
    h(Controls, {queue}, h(Button, {variant: 'primary', onClick: () => input.current.click()}, 'Add images'),
      h('input', {ref: input, type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,image/avif', hidden: true, onChange: add})),
    h(Results, {queue}));
}

function Library({settings}) {
  const queue = useQueue();
  const scan = () => queue.run([{id: 'scan', status: true}], async (_, signal) => {
    const found = [];
    for (let cursor; ;) {
      const page = await api(`/_emdash/api/media?mimeType=image%2F&limit=8${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {signal});
      const {items} = await api(`${ROUTE}/library`, {method: 'POST', signal, type: 'application/json',
        body: JSON.stringify({items: page.items.map(item => ({id: item.id, key: item.storageKey, size: item.size}))})});
      found.push(...page.items.map((item, i) => {
        const row = items[i], kept = row.state === 'sidecar';
        const needsWidths = kept && !row.widths && settings.widths.some(w => w < (item.width ?? 0));
        return {...item, name: item.filename, before: item.size, after: row.stored, widths: row.widths,
          state: needsWidths ? 'To convert' : {sidecar: 'Done', jpeg: 'To convert', plain: 'To convert', missing: 'Missing'}[row.state] ?? ''};
      }));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    check(signal); queue.setRows(found);
  });
  const todo = queue.rows.filter(row => row.state === 'To convert');
  return h('div', {style: column(16)},
    h(Controls, {queue}, h(Button, {variant: 'primary', disabled: queue.busy, onClick: scan}, 'Check'),
      h(Button, {disabled: queue.busy || !todo.length, onClick: () => queue.run(todo, (item, signal) => convert(queue, item, settings, signal))},
        todo.length ? `Convert ${todo.length}` : 'Convert')),
    h(Results, {queue}));
}

function WordPress({settings}) {
  const queue = useQueue(), input = useRef(), [found, setFound] = useState(null);
  async function choose(event) {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    setFound(null);
    await queue.run([{id: 'analyze', status: true}], async (_, signal) => {
      const form = new FormData(); form.append('file', file);
      const analysis = await api('/_emdash/api/import/wordpress/analyze', {method: 'POST', body: form, signal});
      setFound(analysis.attachments.items);
      queue.setRows(analysis.attachments.items.map((a, i) => ({id: `w${i}`, name: a.filename ?? a.url.split('/').pop(), state: 'Waiting'})));
    });
  }
  const start = () => queue.run([{id: 'import', status: true}], async (_, signal) => {
    queue.setRows(rows => rows.map(r => ({...r, state: 'Importing…'})));
    const result = await api('/_emdash/api/import/wordpress/media', {method: 'POST', signal, type: 'application/json',
      body: JSON.stringify({attachments: found, stream: false})});
    const imported = await rewriteAndRead(result, {signal,
      rewrite: (urlMap, signal) => api('/_emdash/api/import/wordpress/rewrite-urls', {method: 'POST', signal, type: 'application/json', body: JSON.stringify({urlMap})}),
      read: async (id, signal) => (await api(`/_emdash/api/media/${id}`, {signal})).item});
    const items = imported.map(item => ({...item, state: 'Waiting'}));
    check(signal);
    queue.setRows(items.map(item => ({...item, name: item.filename})));
    void queue.run(items, (item, s) => convert(queue, item, settings, s), {signal});
  }, {onError: error => queue.setRows(rows => rows.map(row => ({...row, state: failure(error), after: null, widths: null})))});
  return h('div', {style: column(16)},
    h(Controls, {queue}, h(Button, {variant: 'primary', disabled: queue.busy, onClick: () => input.current.click()}, 'Choose export'),
      h('input', {ref: input, type: 'file', accept: '.xml,application/xml,text/xml', hidden: true, onChange: choose}),
      h(Button, {disabled: queue.busy || !found?.length, onClick: start}, found ? `Import ${found.length}` : 'Import')),
    h(Results, {queue}));
}

function Settings({settings, save, error}) {
  const [widths, setWidths] = useState(settings.widths.join(', '));
  useEffect(() => setWidths(settings.widths.join(', ')), [settings.widths.join()]);
  return h('div', {style: line},
    h(Input, {label: 'Quality', type: 'number', min: 1, max: 100, value: settings.quality, disabled: settings.exact, style: {width: '6em'},
      onChange: e => save({quality: Number(e.target.value)})}),
    h(Switch, {label: 'Exact', checked: settings.exact, onCheckedChange: exact => save({exact})}),
    h(Select, {label: 'Effort', value: String(settings.effort), items: {1: '1', 2: '2', 3: '3'}, onValueChange: v => save({effort: Number(v)})}),
    h(Input, {label: 'Size target (KB)', type: 'number', min: 0, value: settings.maxKilobytes || '', placeholder: 'None', style: {width: '8em'},
      onChange: e => save({maxKilobytes: Number(e.target.value) || 0})}),
    h(Input, {label: 'Widths', value: widths, style: {width: '22em', maxWidth: '100%'}, onChange: e => setWidths(e.target.value),
      onBlur: () => save({widths: widths.split(/[\s,]+/).filter(Boolean).map(Number)})}),
    error && h('span', {role: 'status'}, error.phase === 'settings-save' ? 'Settings not saved' : 'Failed'),
    h('span', {className: 'text-sm text-kumo-subtle', style: {flexBasis: '100%'}},
      'Quality and size target apply to non-JPEG main photos. JPEG originals and art stay exact. Photo widths use WebP 85.'));
}

function ImagesPage() {
  const [settings, setSettings] = useState(DEFAULTS), [settingsError, setSettingsError] = useState(null), [tab, setTab] = useState('upload'), writer = useRef(null);
  useEffect(() => {
    const own = createSettings(DEFAULTS, {
      read: signal => api(`${ROUTE}/settings`, {signal}),
      write: (value, signal) => api(`${ROUTE}/save-settings`, {method: 'POST', signal, type: 'application/json', body: JSON.stringify(value)}),
      change: ({value, error}) => { setSettings(value); setSettingsError(error); }});
    writer.current = own; void own.load().catch(() => {});
    return () => { own.dispose(); writer.current = null; };
  }, []);
  const save = patch => { void writer.current?.save(patch).catch(() => {}); };
  const panels = {upload: Upload, library: Library, wordpress: WordPress};
  return h('div', {style: column(24)}, h('h1', {className: 'text-2xl font-semibold'}, 'Smaller images'),
    h(Settings, {settings, save, error: settingsError}),
    h(Tabs, {tabs: [{value: 'upload', label: 'Upload'}, {value: 'library', label: 'Library'}, {value: 'wordpress', label: 'WordPress'}],
      value: tab, onValueChange: setTab, className: 'w-full max-w-full sm:w-fit'}),
    Object.entries(panels).map(([key, Panel]) => h('div', {key, hidden: key !== tab}, h(Panel, {settings}))));
}
export const pages = {'/images': ImagesPage};
