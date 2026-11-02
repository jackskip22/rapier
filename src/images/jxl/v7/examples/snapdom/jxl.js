import { capture } from 'rapier-jxl/capture';
import { encode } from 'rapier-jxl/upload';

export function jxl() {
  return {
    name: 'jxl',
    defineExports: ({ exports }) => ({
      async jxl(context, options = {}) {
        const canvas = await exports.canvas(options);
        const quality = context.export?.requestedOptions?.quality;
        const bytes = quality === undefined || quality >= 1
          ? await capture(canvas)
          : await encode(canvas, { fidelity: { quality: Math.max(1, quality * 100) } });
        return new Blob([bytes], { type: 'image/jxl' });
      },
    }),
  };
}
