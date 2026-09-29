// SPDX-License-Identifier: AGPL-3.0-only

// Feather align-left / align-center / align-right; justify remains a command.
const _rapierAlignmentIcons = Object.freeze({
  left: 'M17 10H3M21 6H3M21 14H3M17 18H3',
  center: 'M18 10H6M21 6H3M21 14H3M18 18H6',
  right: 'M21 10H7M21 6H3M21 14H3M21 18H7',
  justify: 'M21 10H3M21 6H3M21 14H3M21 18H3',
});

function _rapierSelectionAlignment(selection = window.getSelection()) {
  if (rapier.view.mode === 'source') {
    const textarea = document.getElementById('source-textarea');
    if (!textarea) return 'left';
    const source = _rapierSourceText(), opening = _rapierSplitOpeningFrontmatter(source);
    const start = _rapierAbsPos(textarea.selectionStart) - opening.bodyOffset,
      end = _rapierAbsPos(textarea.selectionEnd) - opening.bodyOffset;
    const target = globalThis.RapierMarkdownLayout.layoutTargets(opening.body, md, globalThis.RapierImageAssets.imageEnvironment(source))
      .find(row => start === end ? row.start <= start && start <= row.end : row.start < end && row.end > start);
    return target?.layout?.align || 'left';
  }
  const image = _rapierImageRuntime.image;
  let node = image?.isConnected ? image : null;
  if (!node && selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    node = range.startContainer;
    if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length) {
      node = node.childNodes[Math.min(range.startOffset, node.childNodes.length - 1)];
    }
  }
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const wrapper = element?.closest('.block-wrapper');
  if (!wrapper) return 'left';
  const live = _liveBlockEl(wrapper);
  let paragraph = element.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote');
  if (!paragraph || !wrapper.contains(paragraph)) {
    paragraph = live?.querySelector('p,h1,h2,h3,h4,h5,h6,li') || live;
  }
  if (!paragraph) return 'left';
  const explicit = paragraph.closest('[data-md-align]')?.getAttribute('data-md-align');
  if (Object.hasOwn(_rapierAlignmentIcons, explicit)) return explicit;
  const style = getComputedStyle(paragraph), align = style.textAlign;
  if (Object.hasOwn(_rapierAlignmentIcons, align)) return align;
  return (align === 'end' ? style.direction !== 'rtl' : style.direction === 'rtl') ? 'right' : 'left';
}

function _rapierNextAlignment(align) {
  return align === 'left' ? 'center' : align === 'center' ? 'right' : 'left';
}

function _rapierUpdateAlignmentButton(selection) {
  const button = document.getElementById('fmt-btn-alignment');
  if (!button) return;
  const align = _rapierSelectionAlignment(selection), next = _rapierNextAlignment(align);
  button.dataset.alignment = align;
  button.dataset.tip = 'alignment: ' + align + ' · tap for ' + next;
  button.setAttribute('aria-label', 'Alignment: ' + align + '. Change to ' + next + ' alignment');
  button.querySelector('path')?.setAttribute('d', _rapierAlignmentIcons[align]);
  button.toggleAttribute('data-active', align !== 'left');
}

function rapierCycleAlignment() {
  if (_rapierUserMutationBlocked() || rapier.document.docKind !== 'markdown') return false;
  if (rapier.view.mode !== 'source') {
    _rapierRestoreToolbarSelection();
  }
  if (rapier.view.mode === 'source' && !rapierCheckpointMarkdownSource()) return false;
  return rapierAlign(_rapierNextAlignment(_rapierSelectionAlignment()));
}
