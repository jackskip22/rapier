// SPDX-License-Identifier: MIT
export function createMediaPlayback(win, inspectGIF) {
  const active = new Map(), encode = bytes => bytes.toBase64();
  const bytes = async url => {
    const text = url.slice(url.indexOf(',') + 1), slice = 1 << 20;
    const out = new Uint8Array(text.length / 4 * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0));
    if (out.length > 16 * 1024 * 1024) throw new Error('Animation exceeds the byte budget');
    for (let i = 0, at = 0; i < text.length; i += slice) {
      if (i) await new Promise(resolve => win.setTimeout(resolve, 0));
      at += out.subarray(at).setFromBase64(text.slice(i, i + slice)).written;
    }
    return out;
  };
  function raster(url, canvas, changed = () => {}, dimensions = null) {
    if (url.length > 24 * 1024 * 1024 || !/^data:image\/(gif|jxl);base64,/i.test(url) || (url.length - url.indexOf(',') - 1) % 4) throw new Error('Unsupported animation source');
    const type = url.slice(5, url.indexOf(';')).toLowerCase();
    let data = null, info = null, size = null, decoder = null, timer = 0, closed = false, paused = true, ticket = 0, next = 0, loops = 0, duration = 0, single = false, held = false;
    const state = {animated: true, status: 'loading', first: '', frames: 0};
    const admitted = (async () => {
      const buffer = await bytes(url); info = type === 'image/gif' ? inspectGIF(buffer) : null;
      size = info || dimensions;
      if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1 ||
          size.width > 16384 || size.height > 16384 || size.width * size.height > 24000000) throw new Error('Animation requires bounded inspected dimensions');
      data = buffer; state.animated = info?.animated ?? true; state.frames = info?.frames || 0;
      if (info) state.first = 'data:image/gif;base64,' + encode(info.first);
      if (!closed) changed(state);
    })();
    admitted.catch(error => {if (!closed) {state.status = 'admission-failed'; state.error = String(error.message).slice(0, 160); changed(state);}});
    let inflight = null;
    const closeDecoder = () => {ticket++; win.clearTimeout(timer); timer = 0; active.delete(canvas); const old = decoder; decoder = null; if (old) inflight ? inflight.then(() => old.close()) : old.close();};
    const settle = async promise => {
      let timeout;
      try {return await Promise.race([promise, new Promise((_, reject) => {timeout = win.setTimeout(() => reject(new Error('Animation decode timeout')), 5000);})]);}
      finally {win.clearTimeout(timeout);}
    };
    async function step() {
      if (closed || paused) return;
      const stamp = ticket;
      try {await admitted;} catch {return;}
      try {
        if (!win.ImageDecoder || !await win.ImageDecoder.isTypeSupported(type)) {
          state.status = 'playback-unavailable'; paused = true; changed(state); return;
        }
        if (closed || paused || stamp !== ticket) return;
        if (!decoder) {
          if ([...active].reduce((sum, [other, pixels]) => sum + (other === canvas ? 0 : pixels), 0) + size.width * size.height > 24000000 || !active.has(canvas) && active.size >= 8) {
            state.status = 'playback-budget'; paused = true; changed(state); return;
          }
          active.set(canvas, size.width * size.height);
          decoder = new win.ImageDecoder({data, type, preferAnimation: true});
          const current = decoder; await settle(current.tracks.ready);
          if (closed || paused || stamp !== ticket || decoder !== current) return;
          const track = current.tracks.selectedTrack;
          if (!track || track.frameCount < 1 || track.frameCount > 240 || info && track.frameCount !== info.frames) throw new Error('Animation frame budget or container mismatch');
          state.frames = track.frameCount; state.animated = track.animated;
        }
        const current = decoder, decoding = current.decode({frameIndex: next, completeFramesOnly: true});
        const settled = inflight = decoding.then(() => {}, () => {}).then(() => {if (inflight === settled) inflight = null;});
        decoding.then(result => {if (closed || stamp !== ticket) result.image.close();}, () => {});
        const result = await settle(decoding);
        const frame = result.image;
        try {
          if (closed || paused || stamp !== ticket || decoder !== current) return;
          const w = frame.displayWidth, h = frame.displayHeight;
          if (!result.complete || w !== size.width || h !== size.height || w * h * state.frames > 96000000) throw new Error('Decoded animation exceeds the image budget');
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, w, h); ctx.drawImage(frame, 0, 0);
          if (!state.first && next === 0) state.first = canvas.toDataURL('image/png');
          const delay = frame.duration > 10000 ? Math.max(20, frame.duration / 1000) : 100;
          duration += delay; if (duration > 120000) throw new Error('Animation exceeds the duration budget');
          state.status = 'ready'; state.frame = next; changed(state);
          if (single) {paused = true; closeDecoder(); return;}
          next++;
          if (next === state.frames) {
            next = 0; duration = 0; loops++;
            if (!state.animated || Number.isFinite(current.tracks.selectedTrack.repetitionCount) && loops > current.tracks.selectedTrack.repetitionCount) {paused = true; closeDecoder(); return;}
          }
          timer = win.setTimeout(step, delay);
        } finally {frame.close();}
      } catch (error) {
        if (closed || stamp !== ticket) return;
        state.status = 'decode-failed'; state.error = String(error.message).slice(0, 160); paused = true; closeDecoder(); changed(state);
      }
    }
    return {state, play() {if (!closed && paused && !['decode-failed', 'admission-failed'].includes(state.status)) {paused = false; void step();}},
      async first() {if (!state.first && !closed) {single = true; next = 0; paused = false; try {await step();} finally {single = false; paused = true; closeDecoder(); if (held) {held = false; this.suspend();}}} return state.first;},
      pause() {paused = true; ticket++; win.clearTimeout(timer); timer = 0;},
      suspend() {if (single) {held = true; return;} paused = true; closeDecoder(); canvas.width = canvas.height = 0; state.status = 'suspended'; changed(state);},
      close() {closed = true; paused = true; closeDecoder(); canvas.width = canvas.height = 0;},
      get paused() {return paused;}};
  }
  return {raster, inspectGIF, encode, source: '(' + createMediaPlayback.toString() + ')(window, ' + inspectGIF.toString() + ')'};
}
