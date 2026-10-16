// SPDX-License-Identifier: MIT
export function inspectGIF(bytes) {
  const fail = message => {throw Object.assign(new Error(message), {code: 'GIF_ADMISSION'});};
  if (!(bytes instanceof Uint8Array) || bytes.length < 13 || bytes.length > 16 * 1024 * 1024 ||
      !/^GIF8[79]a$/.test(String.fromCharCode(...bytes.subarray(0, 6)))) fail('Invalid GIF header or byte budget');
  const u16 = at => bytes[at] + bytes[at + 1] * 256;
  const width = u16(6), height = u16(8);
  if (!width || !height || width > 16384 || height > 16384 || width * height > 24000000) fail('GIF dimensions exceed the image budget');
  let at = 13, frames = 0, control = null, first = null, duration = 0;
  const need = n => {if (at + n > bytes.length) fail('Truncated GIF');};
  if (bytes[10] & 128) at += 3 * (2 << (bytes[10] & 7));
  need(0); const prefix = at;
  const blocks = () => {for (;;) {need(1); const n = bytes[at++]; need(n); at += n; if (!n) break;}};
  while (at < bytes.length) {
    const start = at, code = bytes[at++];
    if (code === 0x3b) {
      if (!first) fail('GIF contains no image');
      const still = new Uint8Array(prefix + (first.control?.length || 0) + first.image.length + 1);
      still.set(bytes.subarray(0, prefix)); let offset = prefix;
      if (first.control) {still.set(first.control, offset); offset += first.control.length;}
      still.set(first.image, offset); still[still.length - 1] = 0x3b;
      return {type: 'image/gif', width, height, displayWidth: width, displayHeight: height, orientation: 1,
        frames, animated: frames > 1, duration, first: still};
    }
    if (code === 0x21) {
      need(1); const label = bytes[at++];
      if (label === 0xf9) {
        need(6); if (bytes[at] !== 4 || bytes[at + 5] !== 0 || (bytes[at + 1] >> 2 & 7) > 3) fail('Invalid GIF frame control');
        control = bytes.subarray(start, at + 6); at += 6;
      } else {blocks(); if (label === 1) fail('GIF plain-text rendering is unsupported');}
      continue;
    }
    if (code !== 0x2c) fail('Invalid GIF record');
    need(9);
    const x = u16(at), y = u16(at + 2), w = u16(at + 4), h = u16(at + 6), packed = bytes[at + 8];
    if (!w || !h || x + w > width || y + h > height) fail('Invalid GIF frame bounds');
    at += 9; if (packed & 128) at += 3 * (2 << (packed & 7));
    need(1); if (bytes[at] < 2 || bytes[at] > 8) fail('Invalid GIF code size');
    at++; blocks(); frames++;
    const delay = control ? control[4] + control[5] * 256 : 0;
    duration += delay > 1 ? delay * 10 : 100;
    if (frames > 240 || width * height * frames > 96000000 || duration > 120000) fail('GIF animation exceeds the frame, work or duration budget');
    first ||= {control, image: bytes.subarray(start, at)}; control = null;
  }
  fail('GIF trailer is missing');
}
