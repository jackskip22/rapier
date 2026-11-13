export const WATER_NO_WEBGPU = 'water_webgpu_unavailable';
export function withWaterEditorLink(structured, editorUrl) {
  if (!structured || typeof structured !== 'object' || structured.reason !== WATER_NO_WEBGPU) return structured;
  if (typeof editorUrl !== 'string' || !editorUrl) return structured;
  return {...structured, editor_url: editorUrl};
}
