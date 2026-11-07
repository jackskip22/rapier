export const QUALITY = 85;

export async function deliveryCopies(source, {width, height}, widths, {variants},
  {fidelity = {quality: QUALITY}, signal, onProgress} = {}) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      !Array.isArray(widths) || widths.some(w => !Number.isSafeInteger(w) || w < 1))
    throw new TypeError('Expected picture dimensions and positive widths');
  const sizes = [...new Set([...widths.filter(w => w < width), width])].sort((a, b) => a - b);
  const outputs = sizes.map(w => ({width: w, height: Math.max(1, Math.round(height * w / width)), fidelity}));
  const copies = await variants(source, {outputs, signal, onProgress});
  signal?.throwIfAborted();
  return copies.filter(result => result.fits);
}
