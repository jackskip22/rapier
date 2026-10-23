// SPDX-License-Identifier: MIT
import {GpuSsimulacra2} from './gpu-ssimulacra2.mjs';
import {GpuButteraugli} from './gpu-butteraugli.mjs';

export async function browserDecoder(width, height) {
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', {willReadFrequently: true});
  return async bytes => {
    const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/jxl'}), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
    context.clearRect(0, 0, width, height); context.drawImage(bitmap, 0, 0); bitmap.close();
    return new Uint8Array(context.getImageData(0, 0, width, height).data.buffer);
  };
}

export async function gpuMeasure(device, rgba, width, height, target, decode) {
  decode ??= await browserDecoder(width, height);
  const s2 = target.ssimulacra2 !== undefined ? await GpuSsimulacra2.create(device, width, height) : null;
  const ba = target.butteraugli3 !== undefined || target.butteraugli !== undefined ? await GpuButteraugli.create(device, width, height) : null;
  s2?.setReference(rgba); ba?.setReference(rgba);
  const measure = async bytes => {
    const pixels = await decode(bytes), out = {};
    if (s2) out.ssimulacra2 = (await s2.score(pixels)).score;
    if (ba) { const r = await ba.score(pixels); out.butteraugli = r.score; out.butteraugli3 = r.pnorm3; }
    return out;
  };
  measure.destroy = () => { s2?.destroy(); ba?.destroy(); };
  return measure;
}
