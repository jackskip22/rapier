// SPDX-License-Identifier: MIT
import {GpuNativeSsimulacra2} from '../gpu-ssimulacra2-native.mjs';
import {GpuButteraugli} from './gpu-butteraugli.mjs';

function presentDistorted(metric, rgba) {
  const view = rgba.subarray(0, metric.width * metric.height * 4);
  metric.device.queue.writeBuffer(metric.dist, 0, new Uint32Array(Uint8Array.from(view).buffer));
}

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
  const s2 = target.ssimulacra2 !== undefined ? await GpuNativeSsimulacra2.create(device, rgba, width, height) : null;
  const ba = target.butteraugli3 !== undefined || target.butteraugli !== undefined ? await GpuButteraugli.create(device, width, height) : null;
  ba?.setReference(rgba);
  const measure = async bytes => {
    const pixels = await decode(bytes), out = {};
    if (s2) { presentDistorted(s2, pixels); out.ssimulacra2 = (await s2.score()).score; }
    if (ba) { const r = await ba.score(pixels); out.butteraugli = r.score; out.butteraugli3 = r.pnorm3; }
    return out;
  };
  measure.destroy = () => { s2?.destroy(); ba?.destroy(); };
  return measure;
}
