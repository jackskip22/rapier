function _rapierCanonicalImportedTransform(transform) {
  if (!transform) return null;
  const crop = Object.fromEntries(['left', 'top', 'right', 'bottom'].map(key => [key, Number(transform.crop?.[key] ?? 0)]));
  const rotation = Number(transform.rotation ?? 0);
  if (!Number.isFinite(rotation) || Math.abs(rotation) > 360 ||
      !Object.values(crop).every(value => Number.isFinite(value) && value >= 0 && value < 1) ||
      crop.left + crop.right >= 1 || crop.top + crop.bottom >= 1)
    throw new Error('This picture has an unsupported crop or rotation.');
  return Object.values(crop).some(Boolean) || rotation % 360 || transform.flipH || transform.flipV
    ? {crop, rotation: rotation % 360, flipH: !!transform.flipH, flipV: !!transform.flipV} : null;
}

function _rapierTransformImportedRaster(image, width, height, transform) {
  const crop = transform.crop || {};
  const edges = ['left', 'top', 'right', 'bottom'].map(key => Number(crop[key] || 0));
  const rotation = Number(transform.rotation || 0);
  if (!edges.every(value => Number.isFinite(value) && value >= 0 && value < 1) ||
      edges[0] + edges[2] >= 1 || edges[1] + edges[3] >= 1 || !Number.isFinite(rotation) || Math.abs(rotation) > 360)
    throw new Error('This picture has an unsupported crop or rotation.');
  const [left, top, right, bottom] = edges;
  const cropWidth = width * (1 - left - right), cropHeight = height * (1 - top - bottom);
  const radians = rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians)), sine = Math.abs(Math.sin(radians));
  const outputWidth = Math.max(1, Math.ceil(cropWidth * cosine + cropHeight * sine - 1e-7));
  const outputHeight = Math.max(1, Math.ceil(cropWidth * sine + cropHeight * cosine - 1e-7));
  if (!RapierImageAssets.validAssetDimensions(outputWidth, outputHeight))
    throw new Error('This transformed picture exceeds the image size limit.');
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth; canvas.height = outputHeight;
  try {
    const context = canvas.getContext('2d', {alpha: true});
    if (!context) throw new Error('Picture transformation is unavailable.');
    context.translate(outputWidth / 2, outputHeight / 2);
    context.rotate(radians);
    context.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
    context.drawImage(image, width * left, height * top, cropWidth, cropHeight,
      -cropWidth / 2, -cropHeight / 2, cropWidth, cropHeight);
    return canvas;
  } catch (error) { canvas.width = 0; canvas.height = 0; throw error; }
}
