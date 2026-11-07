import {fileURLToPath} from 'node:url';
import {definePlugin, PluginRouteError} from 'emdash';
import {encode, fit} from 'rapier-jxl/upload';
import {recompress} from 'rapier-jxl/jpeg';
import {activeStorage, activeStorageScope, isJpegKey, hasSidecar} from './media-storage.mjs';
import {digest} from './digest.mjs';
import {EMDASH_JOB_STORAGE} from './job-store.mjs';
import {createEmDashJobRunner} from './job-runner.mjs';

const ID = 'rapier-media', VERSION = '0.1.0';
const PAGES = [{path: '/images', label: 'Smaller images', icon: 'image'}];
const ADMIN = {entry: './media-admin.mjs', pages: PAGES};
const MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_KEY = /^[0-9A-HJKMNP-TV-Z]{26}\.[a-z0-9]{1,8}$/i;
const fail = (status, code, message) => new PluginRouteError(code, message, status);

export function rapierMediaPlugin() {
  return {id: ID, version: VERSION, format: 'native',
    entrypoint: fileURLToPath(new URL('./media-plugin.mjs', import.meta.url)),
    adminEntry: fileURLToPath(new URL('./media-admin.mjs', import.meta.url)), adminPages: PAGES};
}
function storage() {
  const value = activeStorage();
  if (!value) throw fail(500, 'storage_not_wrapped', 'Wrap the site storage with rapierStorage()');
  return value;
}
async function runner(ctx) {
  const media = storage(), backend = activeStorageScope();
  if (!backend) throw fail(500, 'storage_scope', 'Native storage has no configured backend scope');
  const scope = await digest(new TextEncoder().encode(JSON.stringify([ID, backend])));
  return createEmDashJobRunner(ctx, {media, scope, operations: {encode, fit, recompress}});
}
function jobRoute(request, permission, action) {
  return {methods: [request.body === 'none' ? 'GET' : 'POST'], request, permission,
    handler: async ctx => {
      try {
        return await action(await runner(ctx), ctx);
      } catch (error) {
        if (error instanceof PluginRouteError) throw error;
        const status = {JXL_INPUT: 400, JXL_OPTIONS: 400, JXL_LIMIT: 413, JXL_UNSUPPORTED: 422, JXL_IO: 503}[error?.code];
        if (status) throw new PluginRouteError(error.code, error.message, status);
        throw error;
      }
    }};
}
function target(ctx) {
  const query = new URL(ctx.request.url).searchParams, id = query.get('id'), key = query.get('key');
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id ?? '') || !UPLOAD_KEY.test(key ?? ''))
    throw fail(400, 'media_id', 'Expected a media id and key');
  const replace = query.get('replace');
  if (replace !== null && replace !== 'true' && replace !== 'false') throw fail(400, 'JXL_OPTIONS', 'Expected replace=true or false');
  return {id, key, source: query.get('source'), expectedGeneration: query.get('generation') ?? undefined, replace: replace === 'true'};
}

export function inputResult(ctx) {
  const text = ctx.request.headers.get('x-rapier-result');
  if (!text || text.length > 8192) throw fail(400, 'JXL_INPUT', 'Expected a bounded result record');
  let metadata;
  try { metadata = JSON.parse(text); } catch { throw fail(400, 'JXL_INPUT', 'Invalid result record'); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || 'bytes' in metadata)
    throw fail(400, 'JXL_INPUT', 'Send result metadata beside its byte body');
  return {...metadata, bytes: ctx.input};
}

export const DEFAULTS = {quality: 90, exact: false, effort: 3, maxKilobytes: 0,
  widths: [640, 750, 828, 960, 1080, 1280, 1668, 1920, 2048, 2560, 3200, 3840]};
const DELIVERY_QUALITY = 85;
const siteSettings = async ctx => settings(ctx.kv ? await ctx.kv.get('settings') : undefined);
function floorOf(site, variant = false) {
  if (site.exact) return 'exact';
  if (site.maxKilobytes > 0) return {quality: 1};
  return {quality: variant ? Math.min(site.quality, DELIVERY_QUALITY) : site.quality};
}

export function settings(value) {
  const v = {...DEFAULTS, ...(value && typeof value === 'object' ? value : {})};
  const widths = Array.isArray(v.widths) ? [...new Set(v.widths.map(Number))]
    .filter(w => Number.isSafeInteger(w) && w >= 16 && w <= 8192).sort((a, b) => a - b).slice(0, 16) : DEFAULTS.widths;
  return {quality: Math.min(100, Math.max(1, Math.round(Number(v.quality)) || DEFAULTS.quality)), exact: v.exact === true,
    effort: [1, 2, 3].includes(Number(v.effort)) ? Number(v.effort) : DEFAULTS.effort,
    maxKilobytes: Math.max(0, Math.min(1 << 20, Math.round(Number(v.maxKilobytes)) || 0)), widths};
}

async function bound(ctx, id, call = action => action()) {
  const file = await call(() => ctx.media.readBytes(id, {maxBytes: 16 * 1024 * 1024}));
  return digest(file.bytes);
}

export async function libraryRow(store, {id, key, size}) {
  if (!UPLOAD_KEY.test(key ?? '')) return {id, key, state: 'external'};
  const family = await store.family(key), main = family.find(file => file.key === key);
  if (!main) return {id, key, state: 'missing'};
  const stored = family.reduce((bytes, file) => bytes + file.size, 0);
  const copies = await store.currentCopies(key), widths = new Set(copies.filter(file => file.kind === 'variant').map(file => file.width)).size;
  const side = hasSidecar(key) && copies.filter(file => file.kind === 'sidecar').sort((a, b) => a.size - b.size)[0];
  return {id, key, widths, stored, jxl: side ? side.size : null,
    result: side?.result ?? null,
    state: side ? 'sidecar' : isJpegKey(key) ? 'jpeg' : hasSidecar(key) ? 'plain' : 'other'};
}

export function createPlugin() {
  return definePlugin({id: ID, version: VERSION, capabilities: ['media:read', 'media:bytes:read'], admin: ADMIN,
    storage: EMDASH_JOB_STORAGE,
    hooks: {cron: async (event, ctx) => (await runner(ctx)).cron(event)},
    routes: {
      'job-start': jobRoute({body: 'json', maxBytes: 4096}, 'media:upload', async (service, ctx) => {
        const {id, key, jobId, operation, options} = ctx.input ?? {};
        if (typeof id !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id) || typeof key !== 'string' || !UPLOAD_KEY.test(key) ||
            typeof jobId !== 'string' || !/^[a-f0-9]{32}$/.test(jobId))
          throw fail(400, 'JXL_INPUT', 'Expected a media id, storage key and image job id');
        const call = action => service.budget.call(action);
        const snapshot = await storage().sourceSnapshot(key, {signal: ctx.request.signal, call});
        if (!snapshot || snapshot.source.sha256 !== await bound(ctx, id, call)) throw fail(409, 'key_changed', 'The picture changed');
        ctx.request.signal.throwIfAborted();
        return service.queue({id: jobId, key, operation, options, input: {...snapshot.source, kind: 'file'}});
      }),
      'job-status': jobRoute({body: 'none'}, 'media:read', (service, ctx) =>
        service.status(new URL(ctx.request.url).searchParams.get('job'))),
      'job-advance': jobRoute({body: 'json', maxBytes: 256}, 'media:upload', (service, ctx) =>
        service.advance(ctx.input?.job, {signal: ctx.request.signal})),
      'job-cancel': jobRoute({body: 'json', maxBytes: 256}, 'media:upload', (service, ctx) => service.cancel(ctx.input?.job)),
      settings: {methods: ['GET'], request: {body: 'none'}, permission: 'media:read',
        handler: async ctx => settings(await ctx.kv.get('settings'))},
      'save-settings': {methods: ['POST'], request: {body: 'json', maxBytes: 4096}, permission: 'media:upload', handler: async ctx => {
        const value = settings(ctx.input); await ctx.kv.set('settings', value); return value;
      }},
      library: {methods: ['POST'], request: {body: 'json', maxBytes: 64 * 1024}, permission: 'media:read', handler: async ctx => {
        const items = ctx.input?.items;
        if (!Array.isArray(items) || items.length > 8) throw fail(400, 'library_page', 'Send at most 8 items');
        const rows = [];
        for (const item of items) rows.push(await libraryRow(storage(), item));
        return {items: rows};
      }},
      variant: {methods: ['POST'], request: {body: 'bytes', maxBytes: MAX_BYTES}, permission: 'media:upload', handler: async ctx => {
        const {id, key, source, expectedGeneration, replace} = target(ctx);
        const width = Number(new URL(ctx.request.url).searchParams.get('width'));
        if (await bound(ctx, id) !== source) throw fail(409, 'key_changed', 'The picture changed');
        return storage().attachVariant(key, width, inputResult(ctx),
          {source, expectedGeneration, replace, floor: floorOf(await siteSettings(ctx), true), signal: ctx.request.signal});
      }},
      attach: {methods: ['POST'], request: {body: 'bytes', maxBytes: MAX_BYTES}, permission: 'media:upload', handler: async ctx => {
        const {id, key, source, expectedGeneration, replace} = target(ctx);
        if (await bound(ctx, id) !== source) throw fail(409, 'key_changed', 'The picture changed');
        return storage().attach(key, inputResult(ctx), {source, expectedGeneration, replace, floor: floorOf(await siteSettings(ctx)), signal: ctx.request.signal});
      }}
    }});
}
