// SPDX-License-Identifier: AGPL-3.0-only

const USER_KEY = /^(?:grant|token):([^:]+):/;
const DAY_MS = 86400000, TOMBSTONE_SECONDS = 90 * 24 * 60 * 60;

export function storeShard(key) {
  const user = USER_KEY.exec(key);
  if (user) return 'oauth-store:u:' + user[1];
  if (key.startsWith('client:')) return 'oauth-store:c:' + key.slice('client:'.length);
  return 'oauth-store:k:' + key;
}
export function listShard(prefix) {
  const user = USER_KEY.exec(prefix);
  if (!user) throw new Error('The OAuth store lists one user\'s grants or tokens at a time.');
  return 'oauth-store:u:' + user[1];
}

const expirationOf = (options = {}) => Number.isSafeInteger(options.expiration) ? options.expiration
  : Number.isFinite(options.expirationTtl) ? Math.floor(Date.now() / 1000) + Math.ceil(options.expirationTtl) : undefined;

export function objectStore(env) {
  const legacy = env.OAUTH_KV, objects = env.BUDGET;
  const seen = new Map();
  const ask = async (shard, body) => {
    const response = await objects.get(objects.idFromName(shard)).fetch(new Request('https://rapier.internal/oauth-store',
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}));
    if (!response.ok) throw new Error('The OAuth store is unavailable.');
    return response.json();
  };
  const read = async key => {
    const answer = await ask(storeShard(key), {op: 'get', key});
    if (answer.state === 'value') return answer.value;
    if (answer.state === 'unknown' && legacy?.get) return legacy.get(key);
    return null;
  };
  return {
    async get(key, options) {
      if (!seen.has(key)) seen.set(key, read(key));
      let value;
      try { value = await seen.get(key); } catch (error) { seen.delete(key); throw error; }
      return value !== null && value !== undefined && (options === 'json' || options?.type === 'json') ? JSON.parse(value) : value ?? null;
    },
    async put(key, value, options = {}) {
      seen.delete(key);
      await ask(storeShard(key), {op: 'put', key, value: String(value), metadata: options.metadata, expiration: expirationOf(options)});
    },
    async delete(key) {
      seen.delete(key);
      await ask(storeShard(key), {op: 'delete', key});
    },
    async list({prefix = '', limit = 1000} = {}) {
      const answer = await ask(listShard(prefix), {op: 'list', prefix});
      const keys = answer.keys, names = new Set([...keys.map(row => row.name), ...answer.gone]);
      if (legacy?.list) {
        let cursor;
        do {
          const page = await legacy.list({prefix, ...(cursor ? {cursor} : {})});
          for (const row of page.keys) if (!names.has(row.name)) { names.add(row.name); keys.push(row); }
          cursor = page.list_complete ? undefined : page.cursor;
        } while (cursor && keys.length < limit + answer.gone.length + 1000);
      }
      keys.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      return {keys, list_complete: true, cursor: ''};
    },
  };
}

export async function oauthStoreRequest(ctx, {op, key, value, metadata, expiration, prefix}) {
  const kv = ctx.storage.kv, now = Date.now(), live = row => !(row.expiration && row.expiration * 1000 <= now);
  if (op === 'get') {
    const row = kv.get('o:' + key);
    if (!row) return {state: 'unknown'};
    return row.gone || !live(row) ? {state: 'gone'} : {state: 'value', value: row.value};
  }
  if (op === 'list') {
    const keys = [], gone = [];
    for (const [name, row] of kv.list({prefix: 'o:' + prefix})) {
      if (row.gone || !live(row)) gone.push(name.slice(2));
      else keys.push({name: name.slice(2), ...(row.metadata !== undefined ? {metadata: row.metadata} : {}), ...(row.expiration ? {expiration: row.expiration} : {})});
    }
    return {keys, gone};
  }
  if (op !== 'put' && op !== 'delete') throw new TypeError('Unknown OAuth store operation');
  const expired = [];
  for (const [name, row] of kv.list({prefix: 'o:'})) if (name !== 'o:' + key && !live(row)) expired.push(name);
  const row = op === 'put' ? {value, ...(metadata !== undefined ? {metadata} : {}), ...(expiration ? {expiration} : {})}
    : {gone: true, expiration: Math.floor(now / 1000) + TOMBSTONE_SECONDS};
  let lasting = !row.expiration, until = (row.expiration || 0) * 1000;
  for (const [name, other] of kv.list({prefix: 'o:'})) if (name !== 'o:' + key && !expired.includes(name)) {
    if (!other.expiration) lasting = true; else until = Math.max(until, other.expiration * 1000);
  }
  const resetAt = kv.get('resetAt');
  const extend = !lasting && !(Number.isFinite(resetAt) && resetAt >= until);
  ctx.storage.transactionSync(() => {
    for (const name of expired) kv.delete(name);
    kv.put('o:' + key, row);
    if (extend) kv.put('resetAt', until + DAY_MS);
    else if (lasting && resetAt !== undefined) kv.delete('resetAt');
  });
  if (extend) await ctx.storage.setAlarm(until + DAY_MS);
  else if (lasting && resetAt !== undefined) await ctx.storage.deleteAlarm();
  return {state: op === 'put' ? 'stored' : 'gone'};
}
