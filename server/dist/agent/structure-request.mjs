// What `document.find` may ask a document's structure for. The document kind decides which analyzer answers: Acorn for
// JavaScript and HTML, the Markdown parser for Markdown.
export const FIND_KINDS = Object.freeze({
  code: Object.freeze(['declaration', 'reference', 'call', 'construct', 'write', 'member', 'import', 'export']),
  markdown: Object.freeze(['heading', 'paragraph', 'list', 'item', 'task', 'table', 'row', 'fence', 'quote', 'link', 'image', 'footnote']),
});

export function structureRequest(input) {
  const extension = String(input.filename || '').split('.').pop().toLowerCase();
  // The kernel's document kind, when the caller knows it, outranks the extension.
  const markdown = input.docKind == null ? ['md', 'markdown', 'mdown', 'mkd'].includes(extension) : input.docKind === 'markdown';
  const kind = markdown ? 'markdown' : ['html', 'htm'].includes(extension) ? 'html' : ['js', 'mjs', 'cjs'].includes(extension) ? 'javascript' : '';
  if (!kind) return null;
  const text = String(input.text || '');
  if (text.length > 8 * 1024 * 1024) return null;
  // Markdown answers a find alone: its outline is the kernel's own, from the same parser.
  if (kind === 'markdown' && input.mode !== 'find') return null;
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
