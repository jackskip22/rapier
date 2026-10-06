export function structureRequest(input) {
  const extension = String(input.filename || '').split('.').pop().toLowerCase();
  const kind = ['html', 'htm'].includes(extension) ? 'html' : ['js', 'mjs', 'cjs'].includes(extension) ? 'javascript' : '';
  if (!kind) return null;
  const text = String(input.text || '');
  if (text.length > 8 * 1024 * 1024) return null;
  return {
    source: text, kind, mode: input.mode || 'outline',
    dialect: extension === 'mjs' ? 'module' : extension === 'cjs' ? 'script' : 'infer',
    ...(input.query == null ? {} : {query: input.query}),
    ...(input.kind ? {kinds: [input.kind]} : {}),
    ...(input.within ? {within: input.within} : {}),
    ...(input.beforeText == null ? {} : {before: {source: input.beforeText}, after: {source: text}}),
    matchOffset: Number(input.offset || 0), matchLimit: 200,
    limits: {tokens: 600000, nodes: 600000, depth: 1200, units: 64, declarations: 4096, occurrences: 200000, bindings: 100000, scopes: 20000, entries: 2048, matches: 200, strings: 786432, resultBytes: 1048576},
  };
}
