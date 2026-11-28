const loaded = new Map();
const load = url => (loaded.get(url) ?? loaded.set(url, import(url)).get(url));
const say = (value, transfer) => postMessage(value, transfer || []);
const refusal = (code, message) => Object.assign(new Error(message), {code});
const bytesOf = result => {
  if (!result.bytes) throw refusal(result.reason.code, result.reason.message);
  return result.bytes;
};
const running = new Map();

async function run({op, id, mime, quality, effort, moduleUrl, input}) {
  const controller = new AbortController(), {signal} = controller;
  running.set(id, controller);
  try {
    say({type: 'started', id});
    let bytes;
    if (op === 'restore') {
      const {restore} = await load(moduleUrl);
      bytes = bytesOf(await restore(new Uint8Array(input), {signal}));
    } else if (op === 'recompress') {
      const {recompress} = await load(moduleUrl);
      bytes = bytesOf(await recompress(new Uint8Array(input), {effort, signal}));
    } else if (op === 'encode' || op === 'encodeExact') {
      const {encode} = await load(moduleUrl);
      bytes = bytesOf(await encode(new Blob([input], {type: mime}), {effort, fidelity: op === 'encodeExact' ? 'exact' : {quality}, signal}));
    } else {
      throw refusal('JXL_MESSAGE', 'Unknown operation.');
    }
    const copy = bytes.buffer.byteLength === bytes.length ? bytes : bytes.slice();
    say({type: 'done', id, bytes: copy.buffer ?? copy}, [copy.buffer ?? copy]);
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'JXL_CANCELED' : /^JXL_[A-Z0-9_]+$/.test(error?.code) ? error.code : 'JXL_MESSAGE';
    say({type: 'error', id, code, message: (error?.message || String(error)) + (error?.cause?.message ? ` (${error.cause.message})` : '')});
  } finally { running.delete(id); }
}
onmessage = ({data}) => {
  if (data?.type === 'cancel') running.get(data.id)?.abort();
  else if (typeof data?.id === 'string' && data.id) run(data);
  else say({type: 'error', id: null, code: 'JXL_MESSAGE', message: 'Expected an operation and its id.'});
};
say({type: 'ready'});
