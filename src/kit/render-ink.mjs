// SPDX-License-Identifier: MIT
import {check, pause} from './render-work.mjs';
import {apply as applyTypography} from '../layout/typography.mjs';
import {documentLanguage} from '../spec/document-settings.mjs';
import {waitForFonts} from './export-fonts.mjs';

const MARK = 'span.rapier-ink-mark[data-rapier-ink]';
const TYPOGRAPHY = 'p[data-md-hyphens="auto"],p[data-md-lines],p[data-md-hanging="on"]';
const SVG = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';
const failure = message => Object.assign(new Error('The published page could not be prepared: ' + message), {code: 'EXPORT_INK_UNAVAILABLE'});

function groupsOf(root, spec) {
  const nodes = [...root.childNodes], ranges = [], arrows = new Map();
  const topIndex = element => {
    while (element.parentElement && element.parentElement !== root) element = element.parentElement;
    return nodes.indexOf(element);
  };
  for (const span of root.querySelectorAll(MARK)) {
    const mark = spec.parseInkBody(span.getAttribute('data-rapier-ink'));
    if (!mark) continue;
    const index = topIndex(span);
    if (index < 0) throw failure('an annotation has no containing block.');
    ranges.push([index, index]);
    if (mark.kind === 'arrow' || mark.kind === 'end') {
      const pair = arrows.get(mark.id) || [];
      pair.push(index); arrows.set(mark.id, pair);
    }
  }
  for (const pair of arrows.values()) ranges.push([Math.min(...pair), Math.max(...pair)]);
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const groups = [];
  for (const range of ranges) {
    const prior = groups.at(-1);
    if (prior && range[0] <= prior[1]) prior[1] = Math.max(prior[1], range[1]);
    else groups.push(range);
  }
  return {nodes, groups};
}

export async function freezePublishedInk(root, {document: doc, css, fontCss = '', settings, language, theme, work, spec, ink, draw}) {
  const annotated = !!root.querySelector(MARK), refined = !!root.querySelector(TYPOGRAPHY);
  if (!annotated && !refined) return;
  if (!doc?.body || !doc.defaultView || annotated && (!spec?.parseInkBody || !ink?.deriveMark || !draw?.drawInk))
    throw failure('the browser publication renderer is unavailable.');
  check(work);
  const frame = doc.createElement('iframe'), width = Math.max(1, doc.documentElement.clientWidth || doc.defaultView.innerWidth);
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true'); frame.setAttribute('tabindex', '-1');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:' + width + 'px;height:1px;border:0;visibility:hidden;pointer-events:none';
  const policy = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  let timer, abort;
  const stopped = new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure('its embedded resources did not finish loading.')), 20000);
    abort = () => { try { check(work); } catch (error) { reject(error); } };
    work?.signal?.addEventListener('abort', abort, {once: true});
  });
  const wait = promise => Promise.race([promise, stopped]);
  try {
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once: true}));
    frame.srcdoc = '<!doctype html><html lang="' + documentLanguage(settings, language) + '" data-rapier-theme="' + theme + '"><head><meta charset="utf-8">'
      + '<meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="referrer" content="no-referrer">'
      + '<style>' + css + '</style></head><body class="' + (theme === 'light' ? 'light' : '')
      + '"><main class="rapier-page md-render" data-md-theme="' + theme + '">' + root.innerHTML + '</main></body></html>';
    doc.body.appendChild(frame);
    await wait(loaded);
    const paper = frame.contentDocument, main = paper?.querySelector('main.rapier-page');
    if (!main) throw failure('the browser could not open its isolated page.');
    const captured = annotated ? groupsOf(main, spec) : {nodes: [], groups: []}, prepared = [];
    for (const [first, last] of captured.groups) {
      const group = paper.createElement('div');
      group.setAttribute('data-rapier-published-ink', '');
      group.style.cssText = 'display:flow-root;position:relative;width:100%;margin:0;padding:0;border:0;overflow:visible';
      main.insertBefore(group, captured.nodes[first]);
      for (let index = first; index <= last; index++) group.appendChild(captured.nodes[index]);
      for (const span of group.querySelectorAll(MARK)) {
        for (let parent = span.parentElement; parent && parent !== group; parent = parent.parentElement)
          if (parent.localName === 'details') parent.open = true;
      }
      for (const summary of group.querySelectorAll('summary')) summary.setAttribute('inert', '');
      prepared.push(group);
    }
    await wait(Promise.all([...main.querySelectorAll('img')].map(async image => {
      image.loading = 'eager';
      try { await image.decode(); }
      catch (_) { throw failure('an embedded picture could not be decoded.'); }
    })));
    main.getBoundingClientRect();
    await wait(waitForFonts(main, {settings, css, fontCss, install: false}));
    if (paper.fonts?.ready) await wait(paper.fonts.ready);
    await pause(work);
    if (refined) applyTypography(main, {all: true});
    const results = [];
    for (const group of prepared) {
      check(work);
      draw.drawInk(group, {spec, ink, place: 'start'});
      const box = group.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) throw failure('an annotation has no measurable words.');
      const svg = paper.createElementNS(SVG, 'svg'), content = paper.createElementNS(SVG, 'foreignObject');
      svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
      svg.setAttribute('width', String(box.width)); svg.setAttribute('height', String(box.height));
      svg.setAttribute('role', 'group'); svg.setAttribute('data-rapier-published-ink', '');
      svg.style.cssText = 'display:block;width:100%;max-width:' + box.width + 'px;height:auto;margin:0;padding:0;overflow:visible';
      content.setAttribute('width', String(box.width)); content.setAttribute('height', String(box.height));
      content.style.overflow = 'visible';
      group.setAttribute('xmlns', XHTML);
      group.style.width = box.width + 'px';
      group.style.maxWidth = 'none';
      content.appendChild(group.cloneNode(true)); svg.appendChild(content);
      results.push(svg);
      await pause(work);
    }
    for (const [index, group] of prepared.entries()) group.replaceWith(results[index]);
    const projected = doc.createDocumentFragment();
    for (const node of main.childNodes) {
      projected.appendChild(doc.importNode(node, true));
      await pause(work);
    }
    check(work);
    root.replaceChildren(projected);
  } finally {
    clearTimeout(timer);
    work?.signal?.removeEventListener('abort', abort);
    frame.remove();
  }
}
