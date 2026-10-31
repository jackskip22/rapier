// SPDX-License-Identifier: AGPL-3.0-only
const CHUNK = 4096;
import {hashText, foldHash, emptyHash, digest, commentBodyDigest} from '../spec/md-comments.mjs';
export {commentBodyDigest};
const length = tree => tree?.length || 0;
const height = tree => tree?.height || 0;
const count = tree => tree?.count || 0;

function branch(left, right) {
  if (!left) return right;
  if (!right) return left;
  return {left, right, length: left.length + right.length, count: left.count + right.count,
    height: Math.max(left.height, right.height) + 1,
    hash: left.hash && foldHash(left.hash, right.hash),
    firstBreak: left.firstBreak >= 0 ? left.firstBreak : right.firstBreak >= 0 ? left.length + right.firstBreak : -1,
    records: (left.records || 0) + (right.records || 0),
    references: (left.references || 0) + (right.references || 0)};
}

function balance(left, right) {
  if (height(left) > height(right) + 1) {
    if (height(left.left) >= height(left.right)) return branch(left.left, branch(left.right, right));
    return branch(branch(left.left, left.right.left), branch(left.right.right, right));
  }
  if (height(right) > height(left) + 1) {
    if (height(right.right) >= height(right.left)) return branch(branch(left, right.left), right.right);
    return branch(branch(left, right.left.left), branch(right.left.right, right.right));
  }
  return branch(left, right);
}

function join(left, right) {
  if (!left || !right) return left || right;
  if (left.height > right.height + 1) return balance(left.left, join(left.right, right));
  if (right.height > left.height + 1) return balance(join(left, right.left), right.right);
  return branch(left, right);
}

function fromRows(rows, start = 0, end = rows.length) {
  if (end === start) return null;
  if (end === start + 1) return rows[start];
  const middle = (start + end) >>> 1;
  return branch(fromRows(rows, start, middle), fromRows(rows, middle, end));
}

function textLeaf(raw) {
  return raw ? {raw, length: raw.length, count: 1, height: 1, hash: hashText(raw), firstBreak: raw.search(/[\r\n]/)} : null;
}

function textTree(source) {
  const rows = [];
  for (let at = 0; at < source.length; at += CHUNK) rows.push(textLeaf(source.slice(at, at + CHUNK)));
  return fromRows(rows);
}

function splitText(tree, at) {
  if (!tree) return [null, null];
  if (at <= 0) return [null, tree];
  if (at >= tree.length) return [tree, null];
  if (!tree.left) return [textLeaf(tree.raw.slice(0, at)), textLeaf(tree.raw.slice(at))];
  if (at < tree.left.length) {
    const [left, right] = splitText(tree.left, at);
    return [left, join(right, tree.right)];
  }
  const [left, right] = splitText(tree.right, at - tree.left.length);
  return [join(tree.left, left), right];
}

function readTree(tree, start, end, parts) {
  if (!tree || start >= end) return;
  if (!tree.left) { parts.push(tree.raw.slice(start, end)); return; }
  if (start < tree.left.length) readTree(tree.left, start, Math.min(end, tree.left.length), parts);
  if (end > tree.left.length) readTree(tree.right, Math.max(0, start - tree.left.length), end - tree.left.length, parts);
}

function hashRange(tree, start, end) {
  if (!tree || start >= end) return emptyHash();
  if (start === 0 && end === tree.length) return tree.hash;
  if (!tree.left) return hashText(tree.raw.slice(start, end));
  if (end <= tree.left.length) return hashRange(tree.left, start, end);
  if (start >= tree.left.length) return hashRange(tree.right, start - tree.left.length, end - tree.left.length);
  return foldHash(hashRange(tree.left, start, tree.left.length), hashRange(tree.right, 0, end - tree.left.length));
}

function firstBreak(tree, start, end) {
  if (!tree || start >= end || tree.firstBreak < 0) return -1;
  if (tree.firstBreak >= start) return tree.firstBreak < end ? tree.firstBreak : -1;
  if (!tree.left) {
    const at = tree.raw.slice(start, end).search(/[\r\n]/); return at < 0 ? -1 : start + at;
  }
  const left = start < tree.left.length ? firstBreak(tree.left, start, Math.min(end, tree.left.length)) : -1;
  if (left >= 0) return left;
  const right = end > tree.left.length ? firstBreak(tree.right, Math.max(0, start - tree.left.length), end - tree.left.length) : -1;
  return right < 0 ? -1 : tree.left.length + right;
}

function sourceView(root) {
  const readSlice = (start = 0, end = length(root)) => {
    const parts = []; readTree(root, Math.max(0, start), Math.min(length(root), end), parts); return parts.join('');
  };
  return {
    length: length(root), firstLineBreak: root?.firstBreak ?? -1, readSlice,
    digest(record = null) {
      return digest(record ? foldHash(hashRange(root, 0, record.start), hashRange(root, record.end, length(root))) : root?.hash || emptyHash());
    },
    lineEnding(record = null) {
      let at = root?.firstBreak ?? -1;
      if (record && at >= record.start && at < record.end) at = firstBreak(root, record.end, length(root));
      return at < 0 ? '\n' : readSlice(at, at + 2).startsWith('\r\n') ? '\r\n' : readSlice(at, at + 1);
    },
    splice(row) {
      if (!Number.isSafeInteger(row.pos) || row.pos < 0 || row.pos + row.removed.length > length(root) ||
          readSlice(row.pos, row.pos + row.removed.length) !== row.removed) return null;
      const [left, rest] = splitText(root, row.pos), [, right] = splitText(rest, row.removed.length);
      return sourceView(join(join(left, textTree(row.inserted)), right));
    },
  };
}

export function createCommentText(source, {yield: yieldWork, signal} = {}) {
  if (!yieldWork) return sourceView(textTree(source));
  return (async () => {
    const rows = [];
    for (let at = 0; at < source.length; at += CHUNK) {
      if (signal?.aborted) throw Object.assign(new Error('Canceled'), {name: 'AbortError'});
      rows.push(textLeaf(source.slice(at, at + CHUNK)));
      if ((rows.length & 15) === 0) await yieldWork();
    }
    return sourceView(fromRows(rows));
  })();
}

function blockLeaf(value) {
  return {value, length: value.length, height: 1, count: 1, firstBreak: -1,
    records: value.record ? 1 : 0, references: value.references?.length || 0};
}

function splitBlocks(tree, ordinal) {
  if (!tree) return [null, null];
  if (ordinal <= 0) return [null, tree];
  if (ordinal >= tree.count) return [tree, null];
  if (ordinal < tree.left.count) {
    const [left, right] = splitBlocks(tree.left, ordinal);
    return [left, join(right, tree.right)];
  }
  const [left, right] = splitBlocks(tree.right, ordinal - tree.left.count);
  return [join(tree.left, left), right];
}

function blockAt(tree, ordinal, start = 0, index = 0) {
  if (!tree) return null;
  if (!tree.left) return {value: tree.value, start, index};
  return ordinal < tree.left.count ? blockAt(tree.left, ordinal, start, index)
    : blockAt(tree.right, ordinal - tree.left.count, start + tree.left.length, index + tree.left.count);
}

function blockContaining(tree, position, start = 0, index = 0) {
  if (!tree) return null;
  if (!tree.left) return {value: tree.value, start, index};
  return position < tree.left.length ? blockContaining(tree.left, position, start, index)
    : blockContaining(tree.right, position - tree.left.length, start + tree.left.length, index + tree.left.count);
}

function visit(tree, predicate, consume, start = 0) {
  if (!tree || !predicate(tree)) return;
  if (!tree.left) {consume(tree.value, start); return;}
  visit(tree.left, predicate, consume, start);
  visit(tree.right, predicate, consume, start + tree.left.length);
}

function blockView(root) {
  return {
    length: length(root), count: count(root), records: root?.records || 0,
    at: ordinal => blockAt(root, ordinal),
    containing: position => blockContaining(root, Math.max(0, Math.min(length(root) - 1, position))),
    replace(start, count, rows) {
      const [left, rest] = splitBlocks(root, start), [, right] = splitBlocks(rest, count);
      return blockView(join(join(left, fromRows(rows.map(blockLeaf))), right));
    },
    record() {
      let found = null;
      if (root?.records === 1) visit(root, tree => tree.records > 0, (value, start) => {found = {value: value.record, start};});
      return found;
    },
    references() {
      const definitions = Object.create(null);
      visit(root, tree => tree.references > 0, value => {
        for (const [label, reference] of value.references) if (!Object.hasOwn(definitions, label)) definitions[label] = reference;
      });
      return definitions;
    },
  };
}

export const createCommentBlocks = rows => blockView(fromRows(rows.map(blockLeaf)));
