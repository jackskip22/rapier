// SPDX-License-Identifier: MIT
import {parseLayoutAttribute} from '../spec/md-layout.mjs';
import {imageOnly, lineMetrics, linesHeight} from '../layout/model.mjs';

export function followingPrintProse(paragraph) {
  let next = paragraph?.nextElementSibling;
  while (next && (next.classList?.contains('rapier-will-carrier') || next.classList?.contains('rapier-image-asset-record')))
    next = next.nextElementSibling;
  return next;
}

export function markPrintCapitals(root) {
  for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
    const layout = parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
    if (!layout?.lines || layout.wrap !== 'around' || layout.x != null || layout.y != null || layout.rotate ||
        layout.align && layout.align !== 'left') continue;
    const paragraph = image.closest('p'), owner = followingPrintProse(paragraph);
    if (!paragraph || !imageOnly(paragraph, image) || paragraph.closest('table,pre,figure') ||
        owner?.tagName !== 'P' || !owner.textContent.trim() || owner.hasAttribute('data-md-lines')) continue;
    image.setAttribute('data-rapier-print-lines', String(layout.lines));
  }
}

export function createPrintCapitals(lineMetrics, linesHeight, followingProse) {
  const selector = 'img[data-rapier-print-lines]', states = new WeakMap();
  const restoreStyle = (node, value) => value == null ? node.removeAttribute('style') : node.setAttribute('style', value);
  function clear(root) {
    for (const image of root.querySelectorAll(selector)) {
      const state = states.get(image);
      if (!state) continue;
      const {paragraph, parent, next, occurrence, imageStyle, occurrenceStyle, paragraphStyle} = state;
      parent.insertBefore(occurrence, next?.parentNode === parent ? next : null);
      restoreStyle(image, imageStyle);
      if (occurrence !== image) restoreStyle(occurrence, occurrenceStyle);
      restoreStyle(paragraph, paragraphStyle);
      states.delete(image);
    }
  }
  function apply(root) {
    for (const image of root.querySelectorAll(selector)) {
      const lines = Number(image.getAttribute('data-rapier-print-lines'));
      let state = states.get(image);
      const paragraph = state?.paragraph || image.closest('p');
      const owner = state?.owner || followingProse(paragraph);
      if (!Number.isInteger(lines) || lines < 1 || lines > 12 || !image.isConnected ||
          !owner || owner.tagName !== 'P' || !owner.textContent.trim()) continue;
      const metrics = lineMetrics(owner), height = linesHeight(lines, metrics);
      const naturalWidth = image.naturalWidth || Number(image.getAttribute('width'));
      const naturalHeight = image.naturalHeight || Number(image.getAttribute('height'));
      if (!(height > 0 && naturalWidth > 0 && naturalHeight > 0)) continue;
      const style = owner.ownerDocument.defaultView.getComputedStyle(owner);
      const availableWidth = owner.getBoundingClientRect().width -
        ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0);
      if (!(availableWidth > 0)) continue;
      const width = Math.min(availableWidth, height * naturalWidth / naturalHeight);
      const occurrence = state?.occurrence || (image.parentElement.tagName === 'A' ? image.parentElement : image);
      if (!state) {
        state = {paragraph, owner, occurrence, parent: occurrence.parentNode, next: occurrence.nextSibling,
          imageStyle: image.getAttribute('style'), occurrenceStyle: occurrence.getAttribute('style'),
          paragraphStyle: paragraph.getAttribute('style')};
        states.set(image, state);
        owner.prepend(occurrence);
        paragraph.style.setProperty('display', 'none', 'important');
      }
      const gap = (parseFloat(style.fontSize) || 16) * .4;
      for (const [name, value] of Object.entries({display: 'block', position: 'static', float: 'left',
          width: width + 'px', height: width * naturalHeight / naturalWidth + 'px', 'max-width': '100%',
          'margin-top': metrics.capTop + 'px', 'margin-right': gap + 'px', 'margin-bottom': '0', 'margin-left': '0',
          transform: 'none', 'object-fit': 'contain', 'break-inside': 'avoid'})) image.style.setProperty(name, value, 'important');
      if (occurrence !== image) {
        occurrence.style.setProperty('display', 'contents', 'important');
        occurrence.style.setProperty('float', 'none', 'important');
      }
    }
  }
  return {apply, clear};
}

const capitals = createPrintCapitals(lineMetrics, linesHeight, followingPrintProse);
export const applyPrintCapitals = capitals.apply;
