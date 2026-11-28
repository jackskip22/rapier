let animationMod, jpegMod;
const loadAnimation = () => (animationMod ??= import('./jpegxl/animation.mjs'));
const loadJpeg = () => (jpegMod ??= import('./jpegxl/jpeg.mjs'));

const say = value => postMessage(JSON.stringify(value));
const refusal = (code, message) => Object.assign(new Error(message), {code});
const bytesOf = result => {
  if (!result.bytes) throw refusal(result.reason.code, result.reason.message);
  return result.bytes;
};
function send(type, id, bytes) {
  const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer : bytes.slice().buffer;
  say({type, id, byteLength: bytes.byteLength});
  postMessage(buffer, [buffer]);
}
let waiting = null, active = null;
onmessage = async ({data}) => {
  let job;
  try {
    if (typeof data === 'string') {
      job = JSON.parse(data);
      if (active || waiting) throw refusal('JXL_BUSY', 'Finish the current image first.');
      if (!job || !['encode', 'jpeg'].includes(job.type) || typeof job.id !== 'string' || !job.id || typeof job.mime !== 'string')
        throw refusal('JXL_MESSAGE', 'Expected an image operation, its id, and its MIME type.');
      waiting = job;
      return;
    }
    if (!(data instanceof ArrayBuffer) || !waiting || active) {
      if (!active) { job = waiting; waiting = null; }
      throw refusal('JXL_MESSAGE', 'Expected image bytes after an operation.');
    }
    job = waiting; waiting = null; active = job;
    const progress = stage => value => say({type: 'progress', id: job.id, stage, progress: value});
    if (job.type === 'encode') {
      const {encode} = await loadAnimation();
      send('result', job.id, bytesOf(await encode(new Blob([data], {type: job.mime}), {effort: 3, fidelity: {quality: 80}, onProgress: progress('encode')})));
    } else {
      const {recompress, restore} = await loadJpeg();
      const bytes = bytesOf(await recompress(new Uint8Array(data), {effort: 3, onProgress: progress('recompress')}));
      const restored = bytesOf(await restore(bytes, {onProgress: progress('restore')}));
      send('result', job.id, bytes);
      send('restored', job.id, restored);
    }
  } catch (error) {
    say({type: 'error', id: job?.id ?? waiting?.id ?? null,
      code: /^JXL_[A-Z0-9_]+$/.test(error.code) ? error.code : 'JXL_MESSAGE', message: error.message || String(error)});
  } finally { if (job && active === job) active = null; }
};
say({type: 'ready'});
