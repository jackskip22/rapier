const tell = message => webkit.messageHandlers.rapier.postMessage(JSON.stringify(message));
const worker = new Worker(new URL('./encoder.mjs', location.href), {type: 'module'});
const fail = message => tell({type: 'error', id: null, code: 'JXL_WORKER', message});
worker.onmessage = ({data}) => tell(data);
worker.onerror = event => { event.preventDefault(); fail(event.message || 'The encoder worker stopped.'); worker.terminate(); };
worker.onmessageerror = () => { fail('The encoder reply could not be read.'); worker.terminate(); };

const refusal = (code, message) => Object.assign(new Error(message), {code});
async function frames({id, part, width, height, times}) {
  const response = await fetch(`/in/${id}.${part}`);
  if (!response.ok) throw refusal('JXL_BRIDGE', 'Swift did not send the frames.');
  const buffer = await response.arrayBuffer(), size = width * height * 4;
  if (buffer.byteLength !== size * times.length) throw refusal('JXL_BRIDGE', 'Swift sent part of a frame.');
  worker.postMessage({type: 'frames', id, width, height, times, buffer}, [buffer]);
}
globalThis.rapier = {
  run: job => worker.postMessage(job),
  frames,
  drop: id => worker.postMessage({type: 'drop', id}),
  cancel: id => worker.postMessage({type: 'cancel', id})
};
