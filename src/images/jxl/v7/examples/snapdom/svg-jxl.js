import { svgJxl as rewrite } from 'rapier-jxl/svg-jxl';

export function svgJxl({ effort: preset, webgpu, codec } = {}) {
  return {
    name: 'svg-jxl',
    defineExports: ({ exports }) => ({
      svgJxl: async (context, options = {}) => {
        const asked = context.export?.requestedOptions ?? {}, pick = k => options[k] !== undefined ? options[k] : asked[k];
        const effort = pick('effort') ?? preset, signal = pick('signal'), onProgress = pick('onProgress'), quality = pick('quality'), exact = pick('exact');
        signal?.throwIfAborted();
        const img = await abortable(exports.svg(options), signal);
        if (!img.src.startsWith('data:image/svg+xml')) throw new Error('html-in-canvas makes a raster capture, not an SVG.');
        const shown = decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1));
        const file = await abortable(exports.blob({ ...options, format: 'svg' }), signal), same = await abortable(file.text(), signal) === shown;
        const fidelity = exact ? 'exact' : quality !== undefined ? { quality: Math.max(1, quality * 100) } : undefined;
        const common = { ...(fidelity && { fidelity }), effort, ...(webgpu !== undefined && { webgpu }), codec, signal, cache: new Map() };
        const half = (from, span) => onProgress && (f => onProgress(from + f * span));
        const a = await rewrite(shown, { ...common, onProgress: half(0, same ? 1 : 0.5) });
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg)}`;
        await abortable(img.decode(), signal);
        const b = same ? null : await rewrite(file, { ...common, onProgress: half(0.5, 0.5) });
        const blob = b ? b.svg : new Blob([a.svg], { type: file.type || 'image/svg+xml' });
        img.svgJxl = { ...(b ?? a).record, bytes: file.size, jxl: blob.size, blob };
        return img;
      },
    }),
  };
}

function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
