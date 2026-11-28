let animationMod, jpegMod;
const loadAnimation = () => (animationMod ??= import('./jpegxl/animation.mjs'));
const loadJpeg = () => (jpegMod ??= import('./jpegxl/jpeg.mjs'));

const say = value => postMessage(value);
const refusal = (code, message) => Object.assign(new Error(message), {code});
const bytesOf = result => {
  if (!result.bytes) throw refusal(result.reason.code, result.reason.message);
  return result.bytes;
};
const put = (id, kind, bytes) => fetch(`/out/${id}/${kind}`, {method: 'POST', body: bytes}).then(response => {
  if (!response.ok) throw refusal('JXL_BRIDGE', 'Swift did not take the result.');
});
const running = new Map(), clips = new Map();

function addFrames({id, width, height, times, buffer}) {
  const size = width * height * 4;
  if (!clips.has(id)) clips.set(id, {width, height, frames: []});
  const clip = clips.get(id);
  times.forEach((time, i) => clip.frames.push({data: new Uint8ClampedArray(buffer, i * size, size), time}));
}
function clipOf(id, end) {
  const clip = clips.get(id);
  clips.delete(id);
  if (!clip?.frames.length) throw refusal('JXL_INPUT', 'Video has no frames.');
  const {width, height, frames} = clip;
  return {width, height, loops: 0, frames: frames.map(({data, time}, i) => ({data, duration: ((frames[i + 1]?.time ?? end) - time) * 1000}))};
}

async function run({op, id, mime, quality, effort, end}) {
  const controller = new AbortController(), {signal} = controller;
  running.set(id, controller);
  try {
    let input;
    if (op === 'animate' && mime === 'video/frames') {
      input = clipOf(id, end);
    } else {
      const response = await fetch(`/in/${id}`);
      if (!response.ok) throw refusal('JXL_BRIDGE', 'Swift did not send the input.');
      input = await response.arrayBuffer();
    }
    say({type: 'started', id});
    if (op === 'restore') {
      const {restore} = await loadJpeg();
      await put(id, 'result', bytesOf(await restore(new Uint8Array(input), {signal})));
    } else if (op === 'recompress') {
      const {recompress} = await loadJpeg();
      await put(id, 'result', bytesOf(await recompress(new Uint8Array(input), {effort, signal})));
    } else if (op === 'encode' || op === 'encodeExact') {
      const {encode} = await loadAnimation();
      await put(id, 'result', bytesOf(await encode(new Blob([input], {type: mime}),
        {effort, fidelity: op === 'encodeExact' ? 'exact' : {quality}, signal})));
    } else if (op === 'animate') {
      const {encode} = await loadAnimation();
      const source = mime === 'video/frames' ? input : new Blob([input], {type: mime});
      let shown = -1;
      const result = await encode(source, {effort, fidelity: {quality}, signal, ...(mime === 'video/frames' && {transfer: true}), onProgress: fraction => {
        const step = Math.floor(fraction * 100);
        if (step > shown) { shown = step; say({type: 'progress', id, fraction}); }
      }});
      await put(id, 'result', bytesOf(result));
    } else {
      throw refusal('JXL_MESSAGE', 'Unknown operation.');
    }
    say({type: 'done', id});
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'JXL_CANCELED' : /^JXL_[A-Z0-9_]+$/.test(error?.code) ? error.code : 'JXL_MESSAGE';
    say({type: 'error', id, code, message: (error?.message || String(error)) + (error?.cause?.message ? ` (${error.cause.message})` : '')});
  } finally { running.delete(id); }
}
onmessage = ({data}) => {
  if (data?.type === 'frames') addFrames(data);
  else if (data?.type === 'drop') clips.delete(data.id);
  else if (data?.type === 'cancel') running.get(data.id)?.abort();
  else if (typeof data?.id === 'string' && data.id) run(data);
  else say({type: 'error', id: null, code: 'JXL_MESSAGE', message: 'Expected an operation and its id.'});
};
say({type: 'ready'});
