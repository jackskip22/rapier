// SPDX-License-Identifier: MIT
import {createPreparationScope, supportsRichStyle, captureFontAuthority} from './preparation.mjs';
import {createParagraphFitter} from './paragraph-fit.mjs';

export function createTypography(fitter = createParagraphFitter()) {
  const mark = 'data-rapier-typography', boundary = mark + '-break', hang = mark + '-hang';
  const protectedInitial = mark + '-protected-initial';
  const gapMark = mark + '-gap', fitMark = mark + '-fit';
  const exclude = 'code,kbd,samp,math,script,style,.math-rendered,[hidden]';
  const candidates = 'p[data-md-hyphens="auto"],p[data-md-lines],p[data-md-hanging="on"],p[' + mark + ']';
  const properties = ['--md-drop-cap-font', '--md-hang-start'];
  const states = new WeakMap(), documents = new WeakMap(), live = new Set();
  function scope(document) {
    let value = documents.get(document);
    if (!value) { value = createPreparationScope(document); documents.set(document, value); }
    return value;
  }
  let graphemes;
  const segment = text => (graphemes ||= new Intl.Segmenter(undefined, {granularity: 'grapheme'})).segment(text);
  const opening = /^[\p{Ps}\p{Pi}\p{Pf}"']+$/u;
  const closing = /^[\p{Pe}\p{Pi}\p{Pf}"'.,;:!?]+$/u;

  function initialRange(input) {
    const text = typeof input === 'string' ? input : input?.textContent;
    if (typeof text !== 'string') return null;
    const start = /^\s*/u.exec(text)[0].length;
    if (start === text.length) return null;
    let end = start;
    for (const part of segment(text.slice(start))) {
      if (/^\s/u.test(part.segment)) break;
      end = start + part.index + part.segment.length;
      if (!opening.test(part.segment)) break;
    }
    return end > start ? {start, end, text: text.slice(start, end)} : null;
  }

  function paragraphs(root, selector = candidates) {
    return [...(root?.matches?.(selector) ? [root] : []), ...(root?.querySelectorAll?.(selector) || [])];
  }

  function runs(paragraph, hard = null) {
    const walker = paragraph.ownerDocument.createTreeWalker(paragraph, hard ? 5 : 4), result = [];
    let start = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType !== 3) { if (node.tagName === 'BR') hard.push(start); continue; }
      if (node.length) result.push({node, start, end: start + node.length});
      start += node.length;
    }
    return result;
  }

  function point(items, offset, atEnd = false) {
    let lo = 0, hi = items.length;
    while (lo < hi) {
      const middle = lo + hi >>> 1;
      if (items[middle].end < offset || !atEnd && items[middle].end === offset) lo = middle + 1;
      else hi = middle;
    }
    const item = items[Math.min(lo, items.length - 1)];
    return item ? {node: item.node, offset: Math.max(0, Math.min(item.node.length, offset - item.start))} : null;
  }

  function protectInitial(root) {
    for (const paragraph of paragraphs(root, 'p[data-md-lines],p[data-md-hanging="on"],p[' + protectedInitial + ']')) {
      const initial = initialRange(paragraph), letter = initial && [...segment(initial.text)].at(-1);
      const at = initial && point(runs(paragraph), initial.start + letter.index);
      const enabled = paragraph.hasAttribute('data-md-lines') || paragraph.getAttribute('data-md-hanging') === 'on';
      paragraph.toggleAttribute(protectedInitial, Boolean(enabled && at?.node.parentElement?.closest(exclude)));
    }
  }

  function range(items, start, end) {
    const a = point(items, start), b = point(items, end, true);
    if (!a || !b) return null;
    const value = a.node.ownerDocument.createRange();
    value.setStart(a.node, a.offset); value.setEnd(b.node, b.offset);
    return value;
  }

  function boxes(items, start, end, height = Infinity) {
    return [...(range(items, start, end)?.getClientRects?.() || [])]
      .filter(box => box.width > .05 && box.height > 0 && box.height <= height);
  }

  function sameLine(a, b) {
    return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) * .35;
  }

  function ordinaryHeight(paragraph, style) {
    return paragraph.hasAttribute('data-md-lines') ? Math.max(parseFloat(style.lineHeight) || 0, parseFloat(style.fontSize) * 1.7) : Infinity;
  }

  function firstLineEnd(paragraph) {
    if (!paragraph?.isConnected || !paragraph.getClientRects?.().length) return null;
    const view = paragraph.ownerDocument.defaultView;
    if (!view) return null;
    const style = view.getComputedStyle(paragraph), height = ordinaryHeight(paragraph, style);
    const items = runs(paragraph), text = paragraph.textContent;
    const initial = paragraph.hasAttribute('data-md-lines') ? initialRange(text) : null;
    let first = null, end = null;
    for (const part of segment(text)) {
      if (initial && part.index < initial.end) continue;
      if (/^\s+$/u.test(part.segment)) continue;
      const rects = boxes(items, part.index, part.index + part.segment.length, height);
      if (!rects.length) continue;
      const box = rects[rects.length - 1];
      if (!first) first = box;
      if (sameLine(first, box)) end = part.index + part.segment.length;
      else if (box.top >= first.bottom - Math.min(box.height, first.height) * .35) break;
    }
    return end ?? initial?.end ?? null;
  }

  function setProperty(paragraph, state, name, value) {
    if (!state.properties.has(name)) state.properties.set(name, [paragraph.style.getPropertyValue(name), paragraph.style.getPropertyPriority(name)]);
    paragraph.style.setProperty(name, value);
    state.properties.get(name)[2] = paragraph.style.getPropertyValue(name);
  }

  function selectionBefore(paragraph) {
    const selection = paragraph.ownerDocument.getSelection();
    if (!selection?.rangeCount || !paragraph.contains(selection.anchorNode) && !paragraph.contains(selection.focusNode)) return null;
    const capture = (node, offset) => {
      if (!paragraph.contains(node)) return {node, offset};
      const prefix = paragraph.ownerDocument.createRange(); prefix.selectNodeContents(paragraph); prefix.setEnd(node, offset);
      return {text: prefix.toString().length};
    };
    return {selection, anchor: capture(selection.anchorNode, selection.anchorOffset), focus: capture(selection.focusNode, selection.focusOffset)};
  }

  function restoreSelection(paragraph, saved) {
    if (!saved) return;
    const items = runs(paragraph);
    const resolve = endpoint => endpoint.text == null ? endpoint : point(items, endpoint.text, true) || {node: paragraph, offset: 0};
    const anchor = resolve(saved.anchor), focus = resolve(saved.focus);
    if (anchor.node.isConnected && focus.node.isConnected) saved.selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  }

  function unifyInitial(paragraph, state, initial, letterStart) {
    const items = runs(paragraph), at = point(items, letterStart);
    if (!at || at.node.parentElement?.closest(exclude)) return;
    let prefix = '';
    for (const item of items) {
      if (item.node === at.node) break;
      const from = Math.max(initial.start, item.start), to = Math.min(letterStart, item.end);
      if (from >= to) continue;
      const before = item.node.data;
      prefix += before.slice(from - item.start, to - item.start);
      state.moves.push({node: item.node, parent: item.node.parentNode, next: item.node.nextSibling,
        before, after: before.slice(0, from - item.start) + before.slice(to - item.start)});
    }
    if (!prefix) return;
    state.moves.push({node: at.node, parent: at.node.parentNode, next: at.node.nextSibling,
      before: at.node.data, after: prefix + at.node.data});
    for (const move of state.moves) move.node.data = move.after;
  }

  function restoreInitial(state) {
    if (!state?.moves.length) return;
    const restore = [];
    for (const move of state.moves) {
      if (move.node.parentNode !== move.parent) return;
      const pieces = [move.node]; let cursor = move.node.nextSibling, text = move.node.data;
      while (cursor !== move.next && cursor?.nodeType === 3) { pieces.push(cursor); text += cursor.data; cursor = cursor.nextSibling; }
      if (cursor !== move.next || text !== move.after) return;
      restore.push({move, pieces});
    }
    for (const {move, pieces} of restore) { move.node.data = move.before; for (const piece of pieces.slice(1)) piece.remove(); }
  }

  function clear(root, {forget = true} = {}) {
    const list = paragraphs(root, 'p[' + mark + '],p[' + protectedInitial + ']');
    for (const paragraph of list) {
      if (!paragraph.hasAttribute(mark)) { paragraph.removeAttribute(protectedInitial); continue; }
      const selected = selectionBefore(paragraph);
      const state = states.get(paragraph);
      state?.work?.return();
      state?.fitWork?.return();
      for (const node of paragraph.querySelectorAll('[' + boundary + '],[' + hang + '],[' + gapMark + ']')) node.replaceWith(...node.childNodes);
      restoreInitial(state);
      for (const name of properties) {
        const previous = state?.properties.get(name);
        if (!previous || paragraph.style.getPropertyValue(name) !== previous[2] || paragraph.style.getPropertyPriority(name)) continue;
        if (previous?.[0]) paragraph.style.setProperty(name, previous[0], previous[1]);
        else paragraph.style.removeProperty(name);
      }
      paragraph.removeAttribute(mark); paragraph.removeAttribute(mark + '-ragged');
      paragraph.removeAttribute(fitMark);
      paragraph.removeAttribute(protectedInitial);
      if (!paragraph.getAttribute('style')) paragraph.removeAttribute('style');
      paragraph.normalize();
      states.delete(paragraph);
      live.delete(paragraph);
      if (forget) scope(paragraph.ownerDocument).forget(paragraph);
      restoreSelection(paragraph, selected);
    }
  }

  function clearSelection(root) {
    const selection=(root?.ownerDocument || root)?.getSelection?.();
    if (!selection?.rangeCount || selection.isCollapsed) return 0;
    const range=selection.getRangeAt(0), common=range.commonAncestorContainer;
    let within=common.nodeType===1?common:common.parentElement;
    if (!within || !root.contains(within)) within=root;
    else within=within.closest('p['+mark+']') || within;
    const selected=paragraphs(within,'p['+mark+']').filter(paragraph=>
      states.has(paragraph) && root.contains(paragraph) && range.intersectsNode(paragraph));
    for (const paragraph of selected) clear(paragraph,{forget:false});
    return selected.length;
  }

  function hangingEdge(paragraph, style, box) {
    const view = paragraph.ownerDocument.defaultView, rtl = style.direction === 'rtl';
    if (style.visibility !== 'visible' || box.right <= 0 || box.left >= view.innerWidth) return null;
    let edge = rtl ? view.innerWidth : 0;
    if (view.matchMedia('print').matches) {
      const content = paragraph.closest('.md-render')?.getBoundingClientRect();
      if (content?.width > 0) edge = rtl ? Math.min(edge, content.right) : Math.max(edge, content.left);
    }
    for (let element = paragraph; element; element = element.parentElement) {
      const computed = view.getComputedStyle(element);
      if (!/^(?:hidden|clip|scroll|auto)$/.test(computed.overflowX) &&
          !/(?:^|\s)(?:paint|content|strict)(?:\s|$)/.test(computed.contain) && computed.contentVisibility !== 'auto') continue;
      const bounds = element.getBoundingClientRect();
      if (!(bounds.width > 0)) continue;
      const limit = rtl ? bounds.right - (parseFloat(computed.borderRightWidth) || 0) :
        bounds.left + (parseFloat(computed.borderLeftWidth) || 0);
      edge = rtl ? Math.min(edge, limit) : Math.max(edge, limit);
    }
    return edge;
  }

  function hangPunctuation(paragraph, state, style, edge) {
    if (paragraph.ownerDocument.defaultView.CSS.supports('hanging-punctuation', 'first last allow-end')) return;
    const text = paragraph.textContent, parts = [...segment(text)], items = runs(paragraph);
    const initial = initialRange(text);
    if (initial && !paragraph.hasAttribute(protectedInitial)) {
      let end = initial.start;
      for (const part of segment(initial.text)) {
        if (!opening.test(part.segment)) break;
        end = initial.start + part.index + part.segment.length;
      }
      if (end > initial.start) {
        const rects = boxes(items, initial.start, end);
        if (rects.length === 1) {
          const box = rects[0], view = paragraph.ownerDocument.defaultView;
          const margin = parseFloat(view.getComputedStyle(paragraph, '::first-letter').marginInlineStart) || 0;
          const available = style.direction === 'rtl' ? edge - box.right - margin : box.left - edge - margin;
          const distance = edge == null ? box.width : Math.min(box.width, available);
          setProperty(paragraph, state, '--md-hang-start', -distance + 'px');
        }
      }
    }
    const last = parts.findLast(part => !/^\s+$/u.test(part.segment));
    if (!last || !closing.test(last.segment)) return;
    const a = point(items, last.index), b = point(items, last.index + last.segment.length, true);
    if (!a || !b || a.node !== b.node || a.node.parentElement?.closest(exclude)) return;
    const rects = boxes(items, last.index, last.index + last.segment.length);
    if (rects.length !== 1) return;
    let node = a.node;
    if (b.offset < node.length) node.splitText(b.offset);
    if (a.offset) node = node.splitText(a.offset);
    const wrapper = paragraph.ownerDocument.createElement('span');
    wrapper.setAttribute(hang, 'end'); wrapper.style.marginInlineEnd = -rects[0].width + 'px';
    node.before(wrapper); wrapper.append(node);
  }

  const shaping = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontKerning', 'fontOpticalSizing',
    'fontFeatureSettings', 'fontVariationSettings', 'fontVariant', 'fontVariantLigatures', 'fontVariantCaps',
    'fontVariantNumeric', 'fontVariantEastAsian', 'fontVariantPosition', 'fontVariantAlternates', 'fontSizeAdjust',
    'fontSynthesis', 'fontSynthesisWeight', 'fontSynthesisStyle', 'fontSynthesisSmallCaps', 'letterSpacing', 'wordSpacing',
    'textRendering', 'textTransform', 'direction', 'unicodeBidi', 'writingMode', 'verticalAlign', 'lineHeight',
    'whiteSpace', 'wordBreak', 'hyphens', 'hyphenateCharacter', 'lineBreak', 'hangingPunctuation', 'tabSize', 'textWrapStyle'];
  const admission = ['display', 'position', 'cssFloat', 'transform', 'zoom', 'paddingLeft', 'paddingRight',
    'borderLeftWidth', 'borderRightWidth', 'marginLeft', 'marginRight', 'textIndent'];
  const attributes = ['data-md-layout', 'data-md-align', 'data-md-lines', 'data-md-hyphens', 'data-md-caps', 'data-md-hanging', 'style', 'class', 'dir', 'lang'];
  const shapeKey = style => shaping.map(name => style[name]).join('|');

  function inspect(paragraph, parents, prior, baseStyle) {
    const document = paragraph.ownerDocument, view = document.defaultView, styles = new Map(), keys = [captureFontAuthority(document)];
    let supported = document === globalThis.document;
    for (let element = paragraph.parentElement; element; element = element.parentElement) {
      const s = view.getComputedStyle(element);
      keys.push(s.transform, s.zoom, s.whiteSpace, s.direction, s.writingMode,
        s.hyphens, s.hangingPunctuation, s.textWrapStyle, element.getAttribute('lang'));
      if (s.transform !== 'none' || !['1', 'normal'].includes(s.zoom) || s.whiteSpace !== 'normal') supported = false;
    }
    for (const element of parents) {
      const computed = element === paragraph ? baseStyle : view.getComputedStyle(element);
      const s = Object.fromEntries([...shaping, ...admission].map(name => [name, computed[name]]));
      if (prior?.plan) for (const name of ['whiteSpace', 'hyphens', 'hangingPunctuation', 'textWrapStyle'])
        s[name] = prior.saved.styles.get(element)?.[name] ?? s[name];
      const before = view.getComputedStyle(element, '::before').content, after = view.getComputedStyle(element, '::after').content;
      styles.set(element, s);
      keys.push(shapeKey(s), ...admission.map(name => s[name]), before, after);
      if (s.transform !== 'none' || !['1','normal'].includes(s.zoom) || s.cssFloat !== 'none' ||
          !['static','relative'].includes(s.position) || element !== paragraph && element.tagName !== 'BR' && s.display !== 'inline' ||
          !['none','normal'].includes(before) || !['none','normal'].includes(after)) supported = false;
    }
    keys.push(...attributes.map(name => paragraph.getAttribute(name)));
    return {key: keys.join('\u0000'), generation:keys[0], styles, parents, supported};
  }

  function snapshot(paragraph, inspection) {
    const text = paragraph.textContent, language = paragraph.closest('[lang]')?.getAttribute('lang') ?? '';
    if (!inspection.supported || !text.trim() || paragraph.hasAttribute('data-md-lines') ||
        paragraph.getAttribute('data-md-caps') === 'small' || paragraph.closest('[data-rapier-published-ink]') ||
        /[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/u.test(text) ||
        /[\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u.test(text)) return null;
    const hard = [], items = runs(paragraph, hard), atoms = [];
    for (const element of inspection.parents) {
      if (element !== paragraph && !/^(A|SPAN|EM|I|STRONG|B|DEL|S|MARK|CODE|KBD|SAMP|U|INS|ABBR|BR)$/.test(element.tagName)) return null;
      if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('data-rapier-source') ||
          element.hasAttribute('lang') && element.getAttribute('lang').toLowerCase() !== language.toLowerCase() ||
          ['white-space','text-wrap','hyphens','hanging-punctuation','word-spacing'].some(name => element.style.getPropertyPriority(name))) return null;
      const s = inspection.styles.get(element), atom = element !== paragraph && (/^(CODE|KBD|SAMP)$/.test(element.tagName) || s.whiteSpace === 'nowrap');
      if (s.hyphenateCharacter && s.hyphenateCharacter !== 'auto') return null;
      if (!supportsRichStyle({...s, hyphens:'manual', hangingPunctuation:'none', whiteSpace: atom ? 'nowrap' : s.whiteSpace}, language) ||
          !atom && s.whiteSpace !== 'normal') return null;
      const extras = ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth','marginLeft','marginRight']
        .reduce((sum,name) => sum + Math.abs(parseFloat(s[name]) || 0),0);
      if (atom) {
        const contained = items.filter(item => element.contains(item.node));
        if (!contained.length || atoms.some(previous => previous.element.contains(element))) continue;
        const start = contained[0].start, end = contained.at(-1).end;
        if (/^[\t\r\n\f ]|[\t\r\n\f ]$/.test(text.slice(start,end)) || hard.some(at => at > start && at < end) ||
            contained.some(item => shapeKey(inspection.styles.get(item.node.parentElement)) !== shapeKey(s))) return null;
        atoms.push({element,start,end,extraWidth:extras});
      } else if (element !== paragraph && extras > .01) return null;
    }
    const inline = [], paragraphBreaks = [0]; let hardIndex = 0;
    for (const run of items) {
      let broke = false;
      while (hardIndex < hard.length && hard[hardIndex] <= run.start) { paragraphBreaks.push(inline.length); hardIndex++; broke = true; }
      const atom = atoms.find(atom => atom.start <= run.start && run.start < atom.end);
      if (atom && atom.start !== run.start) continue;
      const s = inspection.styles.get(run.node.parentElement), end = atom?.end ?? run.end;
      const font = s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
      const letterSpacing = parseFloat(s.letterSpacing) || 0, body = text.slice(run.start,end), last = inline.at(-1);
      const hyphenate = s.hyphens === 'auto' && !atom;
      if (s.hyphens === 'none' && body.includes('\u00ad')) return null;
      if (!broke && !atom && last && last.break !== 'never' && last.font === font && last.letterSpacing === letterSpacing && last.hyphenate === hyphenate) last.text += body;
      else inline.push({text:body,font,letterSpacing,hyphenate,...(atom?{break:'never',extraWidth:atom.extraWidth}:{})});
    }
    while (hardIndex++ < hard.length) paragraphBreaks.push(inline.length);
    paragraphBreaks.push(inline.length);
    return {...inspection,text,items,atoms,inline,paragraphBreaks,language};
  }

  function dimensions(paragraph, style, box, hanging) {
    const left = box.left + (parseFloat(style.borderLeftWidth)||0) + (parseFloat(style.paddingLeft)||0);
    const right = box.right - (parseFloat(style.borderRightWidth)||0) - (parseFloat(style.paddingRight)||0);
    let clipLeft = 0, clipRight = paragraph.ownerDocument.defaultView.innerWidth;
    if (hanging) for (let element = paragraph; element; element = element.parentElement) {
      const s = paragraph.ownerDocument.defaultView.getComputedStyle(element);
      if (!/^(hidden|clip|scroll|auto)$/.test(s.overflowX) && !/(?:^|\s)(paint|content|strict)(?:\s|$)/.test(s.contain) && s.contentVisibility !== 'auto') continue;
      const bounds = element.getBoundingClientRect();
      clipLeft = Math.max(clipLeft,bounds.left+(parseFloat(s.borderLeftWidth)||0));
      clipRight = Math.min(clipRight,bounds.right-(parseFloat(s.borderRightWidth)||0));
    }
    if (hanging && paragraph.ownerDocument.defaultView.matchMedia('print').matches) {
      const content = paragraph.closest('.md-render')?.getBoundingClientRect();
      if (content) { clipLeft = Math.max(clipLeft,content.left); clipRight = Math.min(clipRight,content.right); }
    }
    const width = Math.floor((right-left)*64)/64;
    const indent = style.textIndent.endsWith('%') ? parseFloat(style.textIndent)*width/100 : parseFloat(style.textIndent)||0;
    return {width,indent,left:hanging?Math.max(0,left-clipLeft):0,right:hanging?Math.max(0,clipRight-right):0};
  }

  const topology = plan => plan && plan.lines.map(line => [line.start,line.end,line.next,line.kind,line.glyph].join(':')).join('|');
  function updateProjection(projection, plan) {
    for (const {node,property,line,sign} of projection.bindings) {
      const value = sign * plan.lines[line][property] + 'px';
      const name = property === 'opening' ? 'marginInlineStart' : property === 'closing' ? 'marginInlineEnd' : 'wordSpacing';
      if (node.style[name] !== value) node.style[name] = value;
    }
  }

  function project(paragraph, saved, geometry, plan) {
    if (paragraph.textContent !== saved.text) return false;
    const operations = [], inserts = [], bindings = [];
    for (let lineIndex = 0; lineIndex < plan.lines.length; lineIndex++) {
      const line = plan.lines[lineIndex];
      const words = geometry.segments[line.segment].words;
      {
        let start = line.start;
        const add = end => { if (end > start && /[\t\r\n\f ]/.test(saved.text.slice(start,end)))
          operations.push({start,end,spacing:true,line:lineIndex}); };
        for (let index = line.firstWord; index <= line.lastWord; index++) {
          const word = words[index];
          if (!word.protected && !/[\u00a0\u202f\u2060]/.test(saved.text.slice(word.start,word.end))) continue;
          add(word.start); start = word.end;
        }
        add(line.end);
      }
      if (line.kind === 'space') operations.push({start:line.end,end:line.next,boundary:true});
      else if (line.kind !== 'end') inserts.push({offset:line.end,glyph:line.glyph});
      const first = words[line.firstWord], last = words[line.lastWord];
      if (first.opening && line.start === first.start) operations.push({start:first.start,end:first.openEnd,opening:true,line:lineIndex});
      if (last.closing && line.end === last.end) operations.push({start:last.closeStart,end:last.end,closing:true,line:lineIndex});
    }
    const events = new Map();
    const event = offset => { let value = events.get(offset); if (!value) { value={start:[],end:[]}; events.set(offset,value); } return value; };
    for (const op of operations) { event(op.start).start.push(op); event(op.end).end.push(op); }
    for (const insert of inserts) event(insert.offset);
    const offsets = [...events.keys()].sort((a,b)=>a-b), active = new Set(), pieces = [];
    let cursor = 0;
    for (const item of runs(paragraph)) {
      let start = item.start;
      while (start < item.end) {
        while (cursor < offsets.length && offsets[cursor] <= start) {
          const value = events.get(offsets[cursor++]);
          for (const op of value.end) active.delete(op);
          for (const op of value.start) active.add(op);
        }
        const end = Math.min(item.end,offsets[cursor] ?? item.end);
        pieces.push({item,start,end,operations:[...active]}); start=end;
      }
    }
    const sourceEnds = new Set(pieces.map(piece => piece.end));
    if (inserts.some(insert => !sourceEnds.has(insert.offset))) return false;
    const ends = new Map();
    for (let index=pieces.length-1;index>=0;index--) {
      const piece=pieces[index], {item,start,end}=piece; let node=item.node;
      const from=start-item.start,to=end-item.start;
      if (to<node.length) node.splitText(to);
      if (from) node=node.splitText(from);
      let outer=node;
      if (piece.operations.length) {
        const wrapper=paragraph.ownerDocument.createElement('span'); wrapper.setAttribute(gapMark,'');
        for (const op of piece.operations) {
          if (op.spacing) bindings.push({node:wrapper,property:'wordSpacing',line:op.line,sign:1});
          if (op.boundary) {
            wrapper.setAttribute(mark+'-separator','');
            if (end===op.end) wrapper.setAttribute(boundary,'');
          }
          if (op.opening && start===op.start) {wrapper.setAttribute(hang,'start');bindings.push({node:wrapper,property:'opening',line:op.line,sign:-1});}
          if (op.closing && end===op.end) {wrapper.setAttribute(hang,'end');bindings.push({node:wrapper,property:'closing',line:op.line,sign:-1});}
        }
        node.before(wrapper);wrapper.append(node);outer=wrapper;
      }
      ends.set(end,outer);
    }
    for (const insert of inserts) {
      const at=ends.get(insert.offset);
      const marker=paragraph.ownerDocument.createElement('span');marker.setAttribute(boundary,insert.glyph?'hyphen':'');
      if (insert.glyph) marker.style.setProperty('--md-fit-hyphen',JSON.stringify(insert.glyph));
      at.after(marker);
    }
    const projection = {bindings,topology:topology(plan)};
    updateProjection(projection,plan);
    paragraph.setAttribute(fitMark,'');return projection;
  }

  function apply(root, {all=false}={}) {
    const started = performance.now();
    const generation = captureFontAuthority(root?.ownerDocument || globalThis.document);
    for (const paragraph of live) {
      const state = states.get(paragraph);
      if (!paragraph.isConnected || state && state.generation !== generation) clear(paragraph);
    }
    const jobs=[];let pending=false,changed=0,released=0,preparedCount=0;
    for (const paragraph of paragraphs(root)) {
      if (paragraph.closest('table,pre,code,h1,h2,h3,h4,h5,h6,.block-edit') ||
          paragraph.isContentEditable && !paragraph.closest('.block-read')) {clear(paragraph);continue;}
      if (!paragraph.isConnected || !all && paragraph.checkVisibility && !paragraph.checkVisibility({contentVisibilityAuto:true})) continue;
      const view=paragraph.ownerDocument.defaultView;
      if (!view || !paragraph.getClientRects().length) continue;
      const style=view.getComputedStyle(paragraph),box=paragraph.getBoundingClientRect(),prior=states.get(paragraph);
      if (!all && (box.bottom < -100 || box.top > view.innerHeight+100)) continue;
      const hanging=paragraph.getAttribute('data-md-hanging')==='on',size=dimensions(paragraph,style,box,hanging);
      if (!(size.width>0)) continue;
      const parents=prior?.parents || [paragraph,...paragraph.querySelectorAll('*')];
      const inspection=inspect(paragraph,parents,prior,style);
      const reusable=prior?.html===paragraph.innerHTML && prior.key===inspection.key && (!prior.geometry || scope(paragraph.ownerDocument).current(prior.geometry));
      const sizeKey=[size.width,size.indent,size.left,size.right].join('|');
      if (reusable && !prior.pending && prior.sizeKey===sizeKey) continue;
      const fitWork=reusable && prior.sizeKey===sizeKey?prior.fitWork:null;
      if (prior?.fitWork && prior.fitWork!==fitWork) {prior.fitWork.return();prior.fitWork=null;}
      if (!all && jobs.length===4) {if (!reusable) clear(paragraph);pending=true;continue;}
      jobs.push({paragraph,view,style,inspection,size,sizeKey,hanging,selected:selectionBefore(paragraph),
        cap:paragraph.hasAttribute('data-md-lines'),justified:paragraph.getAttribute('data-md-align')==='justify' && paragraph.getAttribute('data-md-hyphens')==='auto',
        saved:reusable?prior.saved:null,geometry:reusable?prior.geometry:null,prepared:reusable?prior.prepared:null,
        work:reusable?prior.work:null,fitWork,
        prior,reusable,needsClear:paragraph.hasAttribute(mark)});
    }
    for (const job of jobs) if (job.needsClear && !job.saved) clear(job.paragraph);
    function stateFor(job) {
      return {properties:new Map(),moves:[],saved:job.saved,geometry:job.geometry,prepared:job.prepared,plan:job.plan,
        work:job.work,fitWork:job.fitWork,parents:job.inspection.parents,key:job.inspection.key,generation:job.inspection.generation,sizeKey:job.sizeKey};
    }
    function suspend(job) {
      const state=stateFor(job);
      if (job.reusable && job.prior) for (const name of ['properties','moves','projection','plan']) state[name]=job.prior[name];
      state.pending=true;state.html=job.paragraph.innerHTML;
      states.set(job.paragraph,state);live.add(job.paragraph);job.paragraph.setAttribute(mark,'');pending=true;
    }
    for (let jobIndex = 0; jobIndex < jobs.length; jobIndex++) {
      if (!all && jobIndex && performance.now() - started >= 8) {pending=true;break;}
      const job = jobs[jobIndex];
      if (!job.saved && job.justified) {
        if (job.needsClear) job.inspection=inspect(job.paragraph,[job.paragraph,...job.paragraph.querySelectorAll('*')],null,job.view.getComputedStyle(job.paragraph));
        job.saved=snapshot(job.paragraph,job.inspection);
        if (job.saved) {
          job.work=scope(job.paragraph.ownerDocument).prepareSteps(job.paragraph,job.saved.inline,{policy:'paragraph',language:job.saved.language,
            whiteSpace:'normal',wordBreak:job.saved.styles.get(job.paragraph).wordBreak,hanging:job.hanging,paragraphBreaks:job.saved.paragraphBreaks});
          if (!all && performance.now()-started>=8) {suspend(job);continue;}
        }
      }
      if (job.work) {
        for (;;) {
          const step=job.work.next();
          if (step.done) {job.geometry=step.value;job.work=null;preparedCount++;break;}
          if (!all && performance.now()-started>=8) break;
        }
        if (job.work || !all && performance.now()-started>=8) {suspend(job);continue;}
      }
      if (job.geometry && !job.prepared) job.prepared=fitter.prepare(job.geometry);
      if (job.prepared && !job.fitWork) job.fitWork=scope(job.paragraph.ownerDocument).fitSteps(job.paragraph,job.geometry,
        known=>fitter.solveSteps(job.prepared,job.size.width,job.size,known));
      if (job.fitWork) {
        for (;;) {
          const step=job.fitWork.next();
          if (step.done) {job.plan=step.value;job.fitWork=null;break;}
          if (!all && performance.now()-started>=8) break;
        }
        if (job.fitWork) {suspend(job);continue;}
      }
      job.projection=job.reusable && job.plan && job.prior?.projection?.topology===topology(job.plan) ? job.prior.projection : null;
      if (job.needsClear && job.saved && !job.projection) clear(job.paragraph,{forget:false});
      const {paragraph,view,hanging,cap,justified}=job;
      if (!cap && !hanging && !justified) {restoreSelection(paragraph,job.selected);continue;}
      const state=stateFor(job);
      states.set(paragraph,state);live.add(paragraph);paragraph.setAttribute(mark,'');
      if (cap || hanging) protectInitial(paragraph);
      if (cap && !paragraph.hasAttribute(protectedInitial)) {
        const initial=initialRange(paragraph),letter=initial && [...segment(initial.text)].at(-1);
        const at=initial && point(runs(paragraph),initial.start+letter.index);
        if (at?.node.parentElement) setProperty(paragraph,state,'--md-drop-cap-font',view.getComputedStyle(at.node.parentElement).fontFamily);
        if (initial && letter) unifyInitial(paragraph,state,initial,initial.start+letter.index);
      }
      if (job.projection) {updateProjection(job.projection,job.plan);state.projection=job.projection;}
      else if (job.plan) state.projection=project(paragraph,job.saved,job.geometry,job.plan);
      if (state.projection) released+=job.plan.lines.filter(line=>line.kind!=='end').length;
      else if (hanging) hangPunctuation(paragraph,state,job.style,hangingEdge(paragraph,job.style,paragraph.getBoundingClientRect()));
      state.html=paragraph.innerHTML;
      restoreSelection(paragraph,job.selected);changed++;
    }
    return {changed,released,pending,prepared:preparedCount};
  }

  function retire(root, {documentChanged=false}={}) {
    clear(root);
    for (const paragraph of live) if (!paragraph.isConnected) clear(paragraph);
    scope(root?.ownerDocument || root || globalThis.document).retire({documentChanged});
  }
  const invalidateFonts = document => scope(document || globalThis.document).invalidateFonts();
  return {apply,clear,clearSelection,firstLineEnd,initialRange,protectInitial,invalidateFonts,retire};
}

const typography = createTypography();
export const apply = typography.apply;
export const clear = typography.clear;
export const clearSelection = typography.clearSelection;
export const firstLineEnd = typography.firstLineEnd;
export const initialRange = typography.initialRange;
export const protectInitial = typography.protectInitial;
export const invalidateFonts = typography.invalidateFonts;
export const retire = typography.retire;
