// SPDX-License-Identifier: MIT
import {createCodec} from './node_modules/rapier-jxl/dist/codec.mjs';

const form = document.querySelector('#encode'), file = document.querySelector('#file');
const start = document.querySelector('#start'), cancel = document.querySelector('#cancel');
const status = document.querySelector('#status'), progress = document.querySelector('#progress');
const numbers = document.querySelector('#numbers'), picture = document.querySelector('#picture');
const download = document.querySelector('#download');
let codec, controller, generation = 0, currentURL = null, currentImage = null, pending = null, painting = false;

function releaseURL() {
  download.hidden = true; download.removeAttribute('href');
  if (currentURL !== null) { URL.revokeObjectURL(currentURL); currentURL = null; }
}

function clearPicture() {
  currentImage?.removeAttribute('src'); currentImage = null;
  for (const image of picture.children) image.removeAttribute('src');
  picture.replaceChildren(); releaseURL();
}

function stop(message) {
  generation++; controller?.abort(); controller = null;
  pending?.resolve(false); pending = null;
  clearPicture(); numbers.textContent = ''; progress.hidden = true; cancel.disabled = true;
  status.textContent = message;
}

function measured(record) {
  return record.measurements.map(({metric, score, domain, region}) => {
    const area = region ? `region ${region.x},${region.y} ${region.width}×${region.height}` : 'whole image';
    return `${metric} ${score.toFixed(2)} (${area}; ${domain})`;
  }).join(' · ');
}

function display(record, token, final = false, name = '') {
  if (token !== generation) return Promise.resolve(false);
  pending?.resolve(false);
  return new Promise((resolve, reject) => {
    pending = {record, token, final, name, resolve, reject};
    void paint();
  });
}

async function paint() {
  if (painting) return;
  painting = true;
  try {
    while (pending) {
      const next = pending; pending = null;
      if (next.token !== generation) { next.resolve(false); continue; }
      try {
        releaseURL();
        const image = currentImage = new Image();
        image.alt = next.final ? 'Final image' : 'Encoding preview';
        image.style.maxWidth = '100%'; image.style.height = 'auto';
        currentURL = URL.createObjectURL(new Blob([next.record.bytes], {type: 'image/jxl'}));
        image.src = currentURL;
        await image.decode();
        if (next.token !== generation || currentImage !== image) { next.resolve(false); continue; }
        picture.replaceChildren(image);
        const scores = measured(next.record);
        numbers.textContent = `${next.record.bytes.length.toLocaleString()} bytes · ${next.record.width}×${next.record.height}` + (scores ? ' · ' + scores : '');
        status.textContent = next.final ? 'Final image' : 'Preview · encoding…';
        if (next.final) { download.href = currentURL; download.download = next.name; download.hidden = false; }
        next.resolve(true);
      } catch (cause) {
        if (next.token !== generation) { next.resolve(false); continue; }
        clearPicture();
        const error = new Error('This browser could not display the JPEG XL image.', {cause});
        controller?.abort(error); next.reject(error);
      }
    }
  } finally { painting = false; }
}

async function nativeJPEGXL() {
  if (typeof Image.prototype.decode !== 'function') return false;
  const image = new Image();
  image.src = 'data:image/jxl;base64,/woYAAaASAgCAQBkAEsYkw5wiBJQIwEA4eShY0EWAPoFIgDov58=';
  try { await image.decode(); return image.naturalWidth === 4 && image.naturalHeight === 4; }
  catch { return false; }
  finally { image.removeAttribute('src'); }
}

const supported = await nativeJPEGXL();
const ready = supported ? '' : 'This browser cannot display JPEG XL. Open this example in a browser with native JPEG XL decoding.';
start.disabled = !supported; status.textContent = ready;

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supported || !file.files[0] || !form.reportValidity()) return;
  stop('Encoding…');
  const token = generation, selected = file.files[0], signal = (controller = new AbortController()).signal;
  const effort = Number(document.querySelector('#effort').value), quality = Number(document.querySelector('#quality').value);
  let final = false;
  progress.hidden = false; progress.value = 0; cancel.disabled = false;
  try {
    codec ??= createCodec({module: 'rapier-jxl'});
    const result = await codec.encode(selected, {effort, fidelity: {quality}, signal,
      onProgress(fraction) { if (token === generation) progress.value = fraction; },
      onPreview(record) { if (!final && token === generation) return display(record, token).then(() => {}); },
    });
    final = true;
    if (token !== generation) return;
    if (!result.fits) throw new Error(result.reason.message);
    await display(result, token, true, selected.name.replace(/\.[^.]*$/, '') + '.jxl');
  } catch (error) {
    if (token !== generation) return;
    pending?.resolve(false); pending = null; clearPicture(); numbers.textContent = '';
    status.textContent = 'Encoding failed: ' + error.message;
  } finally {
    if (token === generation) { controller = null; progress.hidden = true; cancel.disabled = true; }
  }
});

cancel.addEventListener('click', () => stop('Canceled.'));
file.addEventListener('change', () => stop(ready));
window.addEventListener('pagehide', () => { stop(''); void codec?.close(); codec = null; });
