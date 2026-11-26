import {shrinker} from './shrink.mjs';

export default function jxl({addFilter, utils}) {
  const {Type} = utils;
  let made;
  const shrink = (file, query) => (made ??= shrinker()).shrink(file, {fidelity: {quality: query('GET_IMAGE_JXL_QUALITY')},
    effort: query('GET_IMAGE_JXL_EFFORT'), retainExif: query('GET_IMAGE_JXL_RETAIN_EXIF')});

  addFilter('SHOULD_PREPARE_OUTPUT', (should, {query}) => Promise.resolve(should || !query('IS_ASYNC')));

  addFilter('PREPARE_OUTPUT', async (output, {query}) => {
    if (!query('GET_ALLOW_IMAGE_JXL')) return output;
    if (Array.isArray(output))
      return Promise.all(output.map(async variant => ({...variant, file: (await shrink(variant.file, query)).file})));
    return output instanceof Blob ? (await shrink(output, query)).file : output;
  });

  return {
    options: {
      allowImageJxl: [true, Type.BOOLEAN],
      imageJxlQuality: [70, Type.INT],
      imageJxlEffort: [3, Type.INT],
      imageJxlRetainExif: [false, Type.BOOLEAN],
    },
  };
}
