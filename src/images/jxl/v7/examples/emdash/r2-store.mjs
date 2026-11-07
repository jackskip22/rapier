export function r2Store(inner, bucket) {
  const store = new Proxy(inner, {get(target, property) {
    if (property === 'download') return async (key, options) => {
      options?.signal?.throwIfAborted();
      const object = await bucket.get(key, options?.range ? {range: options.range} : undefined);
      if (!object?.body) return target.download(key, options);
      return {body: object.body, size: object.size, ...(object.range ? {range: object.range} : {}), contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        cacheControl: object.httpMetadata?.cacheControl, lastModified: object.uploaded, etag: object.etag, version: object.version};
    };
    const value = target[property];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  async function create(key, body, {contentType, signal} = {}) {
    signal?.throwIfAborted();
    return await bucket.put(key, body, {onlyIf: new Headers({'If-None-Match': '*'}), httpMetadata: {contentType}}) !== null;
  }
  return {store, create};
}
