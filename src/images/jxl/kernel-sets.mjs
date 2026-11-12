// SPDX-License-Identifier: MIT
const captureUpload = ['captureWeighted', 'lowestInk', 'edges', 'rowInk', 'colInk', 'prices', 'copies', 'runs', 'scan',
  'tally', 'part', 'literals', 'pieces', 'smooth', 'denseTiles', 'gradient4', 'captureTokens', 'weighted4', 'patchInk', 'patchMarks'];
const capture = [...captureUpload, 'peelInk', 'peelMarks', 'textDelta', 'peelBackground', 'peelCellData', 'peelEqual',
  'peelGlyphs', 'peelTemplates', 'peelFactor', 'peelContainIndex', 'peelContain', 'peelBody'];
const captureAll = [...capture, 'fillHoles', 'maskRuns', 'quantise', 'squeezeStep', 'photoTextTiles', 'mergePhotoHints'];
const photo = ['residual', 'tokens', 'dct', 'ycbcrTile', 'xybTile', 'quantTile', 'acGroup', 'captureSelect', 'opaque',
  'rgbTile', 'rgbQuant'];
const generalPhoto = [...photo, 'sampled', 'acTokens', 'ansFlush', 'ansFlush2', 'packLevels', 'wpTokens',
  'unpackGroup', 'nonzeroCounts', 'subtract', 'gab', 'sgFill', 'xybRows', 'fgXyb', 'gab32', 'gab32From', 'fgTiles',
  'vbDct', 'vbQuant', 'vbRow8', 'gabTiles', 'gradEvents', 'hpCount', 'hpTokens', 'shape', 'wpDc', 'ctxIds', 'weighted'];
const sample = ['orientRGBA', 'sampleTable', 'sampleRead', 'sampleHorizontal', 'sampleAccumulate', 'sampleFinish'];
const jpeg = ['residual', 'fill', 'sampled', 'acGroup', 'ansFlush', 'ansFlush2', 'packLevels', 'wpTokens', 'unpackGroup',
  'nonzeroCounts', 'subtract', 'gradEvents', 'hpCount', 'hpTokens', 'shape', 'wpDc', 'ctxIds', 'tokens', 'weighted',
  'captureWeighted', 'smooth', 'pieces', 'prices', 'captureTokens', 'copies', 'treeWalk', 'tokAnsBack', 'tokAnsWrite'];
const upload = ['residual', 'fill', 'screen', 'sampled', 'dct', 'ycbcrTile', 'xybTile', 'quantTile', 'acGroup',
  'captureSelect', 'rgbTile', 'rgbQuant', 'ansFlush', 'ansFlush2', 'packLevels', 'wpTokens', 'opaque', 'unpackGroup', 'nonzeroCounts', 'photoTextTiles', 'mergePhotoHints',
  'subtract', 'gab', 'xybRows', 'fgXyb', 'gab32', 'gab32From', 'fgTiles', 'gabTiles', 'gradEvents', 'hpCount',
  'hpTokens', 'shape', 'wpDc', 'ctxIds', 'tokens', 'weighted', 'treeWalk', 'tokAnsBack', 'tokAnsWrite', ...sample, ...capture,
  's2MetricInit', 's2MetricDown', 's2MetricScale',
  'idct8f32'];

export const KERNEL_EXPORTS = Object.freeze(Object.fromEntries(Object.entries({
  capture,
  resumable: ['scan', 'captureWeighted', 'smooth', 'weighted4', 'gradient4', 'runs', 'copies', 'copiesStep',
    'tally', 'part', 'literals', 'pieces', 'prices', 'captureTokens', ...sample, 's2MetricInit', 's2MetricDown', 's2MetricScale', 's2MetricBand', 's2MetricBand2'],
  'capture-complete': [...captureAll, ...generalPhoto, 'treeWalk', 'tokAnsBack', 'tokAnsWrite', 'frameRows', 'idct8f32',
    's2MetricInit', 's2MetricDown', 's2MetricScale'],
  upload,
  jpeg,
  verify: [...sample, 's2MetricInit', 's2MetricDown', 's2MetricScale', 's2MetricBand'],
  sample,
}).map(([name, exports]) => [name, Object.freeze([...new Set(exports)])])));
