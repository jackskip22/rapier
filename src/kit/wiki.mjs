// SPDX-License-Identifier: MIT
export const WIKI_PREFIX = '?rapier-wiki=';
export function wikiAddress(target) {
  const at = target.indexOf('#'), path = at < 0 ? target : target.slice(0, at);
  return WIKI_PREFIX + encodeURIComponent(path) + (at < 0 ? '' : '#' + encodeURIComponent(target.slice(at + 1)));
}
export function wikiTarget(address) {
  if (typeof address !== 'string' || !address.startsWith(WIKI_PREFIX)) return null;
  try { return decodeURIComponent(address.slice(WIKI_PREFIX.length).split('#')[0]); }
  catch { return null; }
}
export function installWikiParser(md, render) {
  md.inline.ruler.before('image', 'rapier_wiki', (state, silent) => {
    if (!state.env?.rapierWikiLinks) return false;
    const start = state.pos, embed = state.src[start] === '!';
    const open = start + (embed ? 1 : 0);
    if (state.linkLevel || state.src.slice(open, open + 2) !== '[[') return false;
    const end = state.src.indexOf(']]', open + 2);
    if (end < 0 || end + 2 > state.posMax || end - start > 4096) return false;
    const body = state.src.slice(open + 2, end);
    if (!body || /[\[\]\n\r\0]/.test(body)) return false;
    const pipe = body.indexOf('|'), target = (pipe < 0 ? body : body.slice(0, pipe)).trim();
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(target)) return false;
    if (!silent) {
      const token = state.push('rapier_wiki', '', 0);
      token.content = state.src.slice(start, end + 2);
      token.meta = {target, label: pipe < 0 ? target : body.slice(pipe + 1), embed};
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.rapier_wiki = (tokens, at, options, env) => render(tokens[at], env);
}

