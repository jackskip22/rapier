// SPDX-License-Identifier: MIT
import {fault} from './fault.mjs';
import {encodeData} from './resumable-data.mjs';

export const RECORD_PAGE_ITEMS = 128;
export const RECORD_PAGE_BYTES = 65536;
const MAX_HEIGHT = 52;
const fail = message => { throw fault('JXL_INPUT', message); };
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && Object.keys(value).every(key => names.includes(key));
const positive = value => Number.isSafeInteger(value) && value > 0;
function reference(ref) {
  if (!keys(ref, ['hash', 'length']) || typeof ref.hash !== 'string' || !ref.hash.length || ref.hash.length > 128 ||
      !Number.isSafeInteger(ref.length) || ref.length < 0 || ref.length > RECORD_PAGE_BYTES)
    fail('Invalid immutable record page reference.');
  return ref;
}
function treeOf(tree) {
  if (!keys(tree, ['height', 'count', 'ref']) || !Number.isInteger(tree.height) || tree.height < 0 ||
      tree.height > MAX_HEIGHT || !positive(tree.count) || tree.count < 2 ** tree.height ||
      tree.count > Math.min(Number.MAX_SAFE_INTEGER, RECORD_PAGE_ITEMS * 2 ** tree.height))
    fail('Invalid immutable record tree.');
  reference(tree.ref); return tree;
}
export function recordIndex(value) {
  if (!keys(value, ['schema', 'count', 'trees']) || value.schema !== 1 || !Number.isSafeInteger(value.count) || value.count < 0 ||
      !Array.isArray(value.trees) || value.trees.length > MAX_HEIGHT + 1)
    fail('Invalid immutable record index.');
  let count = 0, height = MAX_HEIGHT + 1;
  for (const tree of value.trees) {
    treeOf(tree);
    if (tree.height >= height) fail('Record index trees must have descending distinct heights.');
    height = tree.height; count += tree.count;
    if (!Number.isSafeInteger(count)) fail('The immutable record count is invalid.');
  }
  if (count !== value.count) fail('The immutable record count differs from its trees.');
  return value;
}
export const emptyRecordIndex = () => ({schema: 1, count: 0, trees: []});

export async function appendRecordIndex(io, saved, items) {
  recordIndex(saved);
  const index = {schema: 1, count: saved.count, trees: saved.trees.map(tree => ({...tree}))};
  if (!Array.isArray(items) || !items.length || items.length > RECORD_PAGE_ITEMS)
    fail('A record page contains 1..128 records.');
  const node = {schema: 1, items}, bytes = encodeData(node);
  if (bytes.length > RECORD_PAGE_BYTES) fail('A record page exceeds 64 KiB; nested lists need their own pages.');
  const count = index.count + items.length;
  if (!Number.isSafeInteger(count)) fail('The immutable record count is invalid.');
  let tree = {height: 0, count: items.length, ref: await io.writeJSON(node)};
  reference(tree.ref);
  while (index.trees.length && index.trees.at(-1).height === tree.height) {
    const left = index.trees.pop();
    const branch = {schema: 1, left, right: tree};
    tree = {height: tree.height + 1, count: left.count + tree.count, ref: await io.writeJSON(branch)};
    treeOf(tree);
  }
  index.count = count; index.trees.push(tree);
  return recordIndex(index);
}

function cursorOf(value) {
  if (!keys(value, ['schema', 'total', 'from', 'end', 'at', 'stack']) || value.schema !== 1 ||
      ![value.total, value.from, value.end, value.at].every(Number.isSafeInteger) ||
      value.total < 0 || value.from < 0 || value.from > value.at || value.at > value.end || value.end > value.total ||
      !Array.isArray(value.stack) || value.stack.length > MAX_HEIGHT * 2 + 1)
    fail('Invalid immutable record cursor.');
  let at = value.at;
  for (let i = value.stack.length - 1; i >= 0; i--) {
    const item = value.stack[i];
    if (!keys(item, ['tree', 'offset']) || !Number.isSafeInteger(item.offset) || item.offset < 0)
      fail('Invalid immutable record cursor stack.');
    const tree = treeOf(item.tree), end = item.offset + tree.count;
    if (!Number.isSafeInteger(end) || end > value.total) fail('Invalid immutable record cursor span.');
    const lo = Math.max(item.offset, value.at), hi = Math.min(end, value.end);
    if (lo !== at || hi <= lo) fail('The immutable record cursor does not cover its remaining range.');
    at = hi;
  }
  if (at !== value.end) fail('The immutable record cursor is truncated.');
  return value;
}

export function recordIndexCursor(saved, from = 0, length) {
  const index = recordIndex(saved);
  if (length === undefined) length = index.count - from;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(length) || from < 0 || length < 0 || from + length > index.count)
    fail('Invalid immutable record cursor range.');
  const end = from + length, stack = []; let offset = 0;
  for (const tree of index.trees) {
    if (length && offset < end && offset + tree.count > from) stack.push({tree: {...tree}, offset});
    offset += tree.count;
  }
  stack.reverse();
  return cursorOf({schema: 1, total: index.count, from, end, at: from, stack});
}

export async function advanceRecordIndex(io, saved) {
  cursorOf(saved);
  const cursor = {...saved, stack: saved.stack.map(item => ({tree: {...item.tree}, offset: item.offset}))};
  const item = cursor.stack.pop();
  if (!item) return {cursor, items: [], done: true};
  const {tree: expected, offset} = item, node = await io.readJSON(expected.ref);
  let items = [];
  if (expected.height === 0) {
    if (!keys(node, ['schema', 'items']) || node.schema !== 1 || !Array.isArray(node.items) ||
        !node.items.length || node.items.length > RECORD_PAGE_ITEMS || node.items.length !== expected.count)
      fail('Invalid immutable record leaf.');
    const end = Math.min(cursor.end, offset + expected.count);
    items = node.items.slice(cursor.at - offset, end - offset); cursor.at = end;
  } else {
    if (!keys(node, ['schema', 'left', 'right']) || node.schema !== 1)
      fail('Invalid immutable record branch.');
    const left = treeOf(node.left), right = treeOf(node.right);
    if (left.height !== expected.height - 1 || right.height !== left.height || left.count + right.count !== expected.count)
      fail('An immutable record branch summary changed.');
    for (const [tree, at] of [[right, offset + left.count], [left, offset]])
      if (at < cursor.end && at + tree.count > cursor.at) cursor.stack.push({tree: {...tree}, offset: at});
  }
  cursorOf(cursor);
  return {cursor, items, done: cursor.at === cursor.end};
}

export async function* recordIndexRange(io, saved, from, length) {
  let cursor = recordIndexCursor(saved, from, length);
  while (cursor.at !== cursor.end) {
    const next = await advanceRecordIndex(io, cursor); cursor = next.cursor;
    yield* next.items;
  }
}

export async function* recordIndexItems(io, saved) {
  yield* recordIndexRange(io, saved, 0, recordIndex(saved).count);
}
