// SPDX-License-Identifier: MIT
import {readFile, stat} from 'node:fs/promises';
import {posix} from 'node:path';
import {crc32, deflateRawSync, inflateRawSync} from 'node:zlib';
import {COMMAND} from './package-name.mjs';
import {cliError} from './cli-error.mjs';
import {
  isAsciiAlpha, isHtmlSpace, decodeHtmlEntities, escapeHtmlAttr,
  parseSrcset, parseStartTag, parseEndTag, scanScriptEnd, scanRawTextEnd,
} from './cli-markup.mjs';

const MIMETYPE = 'application/epub+zip';
const MIMETYPE_BYTES = Buffer.from(MIMETYPE, 'ascii');
const MAX_ZIP_ENTRIES = 100_000;
const MAX_TOTAL_UNCOMPRESSED = 512 * 1024 * 1024;
const RAW_TEXT_TAGS = new Set(['textarea', 'title', 'xmp', 'noembed', 'noframes']);
const RASTER_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/jxl']);
const PRECOMPRESSED_EXTS = new Set(['.jxl', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.woff2', '.mp3', '.mp4', '.m4a', '.ogg', '.opus', '.webm', '.zip']);
const MARKUP_MIMES = new Set(['application/xhtml+xml', 'text/html', 'image/svg+xml', 'application/x-dtbncx+xml']);
const MARKUP_EXTS = new Set(['.xhtml', '.html', '.htm', '.svg', '.ncx']);
const CONVERTIBLE_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp', 'avif', 'hdr']);

const u16 = (buf, at) => buf[at] | (buf[at + 1] << 8);
const u32 = (buf, at) => (buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16) | (buf[at + 3] << 24)) >>> 0;
const u64 = (buf, at) => {
  const value = buf.readBigUInt64LE(at);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw cliError('JXL_LIMIT', 'EPUB ZIP64 offset: too large', 'use: smaller EPUB');
  return Number(value);
};
const localName = tag => { const colon = tag.indexOf(':'); return colon >= 0 ? tag.slice(colon + 1) : tag; };
const normalizePosix = raw => {
  const parts = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
};

function validateZipPath(name) {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/')) return false;
  if (/^[a-zA-Z]:/.test(name)) return false;
  const trimmed = name.endsWith('/') ? name.slice(0, -1) : name;
  if (!trimmed) return false;
  return !trimmed.split('/').some(seg => seg === '' || seg === '.' || seg === '..');
}

function decodeZipName(raw, utf8Flag) {
  try { return new TextDecoder('utf-8', {fatal: Boolean(utf8Flag)}).decode(raw); }
  catch { throw cliError('JXL_INPUT', 'EPUB archive: invalid UTF-8 entry name', 'check: EPUB file'); }
}

function parseZip64Extra(extra, needUncomp, needComp, needOffset) {
  const out = {};
  for (let p = 0; p + 4 <= extra.length;) {
    const id = u16(extra, p), size = u16(extra, p + 2);
    p += 4;
    if (p + size > extra.length) break;
    if (id === 0x0001) {
      let q = p;
      if (needUncomp && q + 8 <= p + size) { out.uncompSize = u64(extra, q); q += 8; }
      if (needComp && q + 8 <= p + size) { out.compSize = u64(extra, q); q += 8; }
      if (needOffset && q + 8 <= p + size) { out.localOffset = u64(extra, q); q += 8; }
      break;
    }
    p += size;
  }
  return out;
}

export function readZip(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 22) throw cliError('JXL_INPUT', 'EPUB archive: truncated ZIP', 'check: EPUB file');
  let eocd = -1;
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (u32(buf, i) === 0x06054b50 && u16(buf, i + 20) === buf.length - (i + 22)) { eocd = i; break; }
  }
  if (eocd < 0) throw cliError('JXL_INPUT', 'EPUB archive: missing ZIP central directory', 'check: EPUB file');
  let entryCount = u16(buf, eocd + 10);
  let cdSize = u32(buf, eocd + 12);
  let cdOffset = u32(buf, eocd + 16);

  if (eocd >= 20 && u32(buf, eocd - 20) === 0x07064b50) {
    const z64Off = u64(buf, eocd - 12);
    if (z64Off + 56 > buf.length || u32(buf, z64Off) !== 0x06064b50)
      throw cliError('JXL_INPUT', 'EPUB archive: invalid ZIP64 directory', 'check: EPUB file');
    entryCount = u64(buf, z64Off + 32);
    cdSize = u64(buf, z64Off + 40);
    cdOffset = u64(buf, z64Off + 48);
  }
  if (entryCount > MAX_ZIP_ENTRIES) throw cliError('JXL_LIMIT', 'EPUB archive: too many entries', 'use: smaller EPUB');
  if (cdOffset + cdSize > buf.length) throw cliError('JXL_INPUT', 'EPUB archive: central directory out of bounds', 'check: EPUB file');

  const entries = [], byName = new Map();
  let pos = cdOffset, totalUncompressed = 0;
  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > cdOffset + cdSize || u32(buf, pos) !== 0x02014b50)
      throw cliError('JXL_INPUT', 'EPUB archive: malformed central directory entry', 'check: EPUB file');
    const flags = u16(buf, pos + 8);
    const method = u16(buf, pos + 10);
    const modTime = u16(buf, pos + 12);
    const modDate = u16(buf, pos + 14);
    const crc = u32(buf, pos + 16);
    let compSize = u32(buf, pos + 20);
    let uncompSize = u32(buf, pos + 24);
    const nameLen = u16(buf, pos + 28);
    const extraLen = u16(buf, pos + 30);
    const commentLen = u16(buf, pos + 32);
    const extAttr = u32(buf, pos + 38);
    let localOffset = u32(buf, pos + 42);
    const headerEnd = pos + 46 + nameLen + extraLen + commentLen;
    if (headerEnd > cdOffset + cdSize)
      throw cliError('JXL_INPUT', 'EPUB archive: truncated entry header', 'check: EPUB file');
    const name = decodeZipName(buf.subarray(pos + 46, pos + 46 + nameLen), flags & 0x0800);
    const extra = buf.subarray(pos + 46 + nameLen, pos + 46 + nameLen + extraLen);
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
      const z64 = parseZip64Extra(extra, uncompSize === 0xffffffff, compSize === 0xffffffff, localOffset === 0xffffffff);
      if (z64.uncompSize !== undefined) uncompSize = z64.uncompSize;
      if (z64.compSize !== undefined) compSize = z64.compSize;
      if (z64.localOffset !== undefined) localOffset = z64.localOffset;
    }
    pos = headerEnd;

    if (!validateZipPath(name))
      throw cliError('JXL_INPUT', `EPUB archive: unsafe entry path "${name}"`, 'check: EPUB file');
    if (byName.has(name))
      throw cliError('JXL_INPUT', `EPUB archive: duplicate entry "${name}"`, 'check: EPUB file');
    if (flags & 0x0001)
      throw cliError('JXL_UNSUPPORTED', `EPUB archive: ZIP-encrypted entry "${name}"`, 'decrypt archive first');
    totalUncompressed += uncompSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED)
      throw cliError('JXL_LIMIT', 'EPUB archive: uncompressed size exceeds limit', 'use: smaller EPUB');

    if (localOffset + 30 > buf.length || u32(buf, localOffset) !== 0x04034b50)
      throw cliError('JXL_INPUT', `EPUB archive: malformed local header for "${name}"`, 'check: EPUB file');
    const localNameLen = u16(buf, localOffset + 26);
    const localExtraLen = u16(buf, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length)
      throw cliError('JXL_INPUT', `EPUB archive: truncated data for "${name}"`, 'check: EPUB file');
    const entry = {
      name, flags, method, modTime, modDate, crc, compSize, uncompSize, extAttr,
      rawComp: new Uint8Array(buf.buffer, buf.byteOffset + dataStart, compSize),
      data: null,
      modified: false,
    };
    entries.push(entry);
    byName.set(name, entry);
  }
  return {entries, byName};
}

export function readZipEntry(entry) {
  if (entry.data !== null) return entry.data;
  let data;
  if (entry.method === 0) {
    data = entry.rawComp;
  } else if (entry.method === 8) {
    try {
      data = new Uint8Array(inflateRawSync(entry.rawComp, {maxOutputLength: Math.max(entry.uncompSize, 1) + 16}));
    } catch {
      throw cliError('JXL_INPUT', `EPUB archive: corrupt deflate stream "${entry.name}"`, 'check: EPUB file');
    }
  } else {
    throw cliError('JXL_UNSUPPORTED', `EPUB archive: unsupported compression method ${entry.method} on "${entry.name}"`, 'repack EPUB with store or deflate');
  }
  if (data.byteLength !== entry.uncompSize)
    throw cliError('JXL_INPUT', `EPUB archive: size mismatch on "${entry.name}"`, 'check: EPUB file');
  if ((crc32(data) >>> 0) !== entry.crc)
    throw cliError('JXL_INPUT', `EPUB archive: CRC mismatch on "${entry.name}"`, 'check: EPUB file');
  entry.data = data;
  return data;
}

export function writeZip(entries) {
  const ordered = [];
  let mimeEntry = null;
  for (const entry of entries) {
    if (entry.name === 'mimetype') mimeEntry = entry;
    else ordered.push(entry);
  }
  const firstMime = {
    name: 'mimetype',
    data: MIMETYPE_BYTES,
    method: 0,
    flags: 0,
    modTime: mimeEntry?.modTime ?? 0,
    modDate: mimeEntry?.modDate ?? 0x0021,
    extAttr: mimeEntry?.extAttr ?? 0,
    modified: true,
    forceStore: true,
  };
  const all = [firstMime, ...ordered];
  if (all.length > 0xffff) throw cliError('JXL_LIMIT', 'EPUB archive: too many entries for ZIP', 'use: fewer files');

  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const entry of all) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const nonAscii = nameBuf.length !== entry.name.length;
    let method, compBuf, uncompSize, crc, flags;

    if (!entry.modified && entry.rawComp && (entry.method === 0 || entry.method === 8)) {
      method = entry.method;
      compBuf = Buffer.from(entry.rawComp.buffer, entry.rawComp.byteOffset, entry.rawComp.byteLength);
      uncompSize = entry.uncompSize;
      crc = entry.crc;
      flags = (entry.flags & ~0x0008) | (nonAscii ? 0x0800 : 0);
    } else {
      const rawBuf = Buffer.isBuffer(entry.data)
        ? entry.data
        : Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
      uncompSize = rawBuf.length;
      crc = crc32(rawBuf) >>> 0;
      flags = entry.forceStore ? 0 : (nonAscii ? 0x0800 : 0);
      const ext = posix.extname(entry.name).toLowerCase();
      if (entry.forceStore || entry.name.endsWith('/') || uncompSize === 0 || PRECOMPRESSED_EXTS.has(ext)) {
        method = 0;
        compBuf = rawBuf;
      } else {
        const deflated = deflateRawSync(rawBuf, {level: 9});
        if (deflated.length < rawBuf.length) { method = 8; compBuf = deflated; }
        else { method = 0; compBuf = rawBuf; }
      }
    }

    if (offset > 0xffffffff || compBuf.length > 0xffffffff || uncompSize > 0xffffffff)
      throw cliError('JXL_LIMIT', 'EPUB archive: exceeds 4 GiB ZIP limit', 'use: smaller EPUB');

    const modTime = entry.modTime ?? 0;
    const modDate = entry.modDate ?? 0x0021;
    const extAttr = entry.extAttr ?? 0;
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(modTime, 10);
    localHeader.writeUInt16LE(modDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compBuf.length, 18);
    localHeader.writeUInt32LE(uncompSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    const cdHeader = Buffer.alloc(46 + nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(flags, 8);
    cdHeader.writeUInt16LE(method, 10);
    cdHeader.writeUInt16LE(modTime, 12);
    cdHeader.writeUInt16LE(modDate, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compBuf.length, 20);
    cdHeader.writeUInt32LE(uncompSize, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(extAttr, 38);
    cdHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(cdHeader, 46);

    localParts.push(localHeader, compBuf);
    cdParts.push(cdHeader);
    offset += localHeader.length + compBuf.length;
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(all.length, 8);
  eocd.writeUInt16LE(all.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([...localParts, cdBuf, eocd]));
}

function decodeTextBytes(bytes, label) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {text: new TextDecoder('utf-16le', {fatal: true, ignoreBOM: true}).decode(bytes.subarray(2)), encoding: 'utf-16le', bom: bytes.subarray(0, 2)};
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {text: new TextDecoder('utf-16be', {fatal: true, ignoreBOM: true}).decode(bytes.subarray(2)), encoding: 'utf-16be', bom: bytes.subarray(0, 2)};
  }
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(hasBom ? bytes.subarray(3) : bytes);
    if (text.includes('\0')) throw new Error('NUL');
    return {text, encoding: 'utf-8', bom: hasBom ? bytes.subarray(0, 3) : null};
  } catch {
    throw cliError('JXL_INPUT', `EPUB "${label}": invalid UTF-8 text`, 'save text entries as UTF-8');
  }
}

function encodeTextBytes(text, encoding, bom) {
  let body;
  if (encoding === 'utf-16le') {
    body = Buffer.from(text, 'utf16le');
  } else if (encoding === 'utf-16be') {
    body = Buffer.from(text, 'utf16le');
    for (let i = 0; i + 1 < body.length; i += 2) { const t = body[i]; body[i] = body[i + 1]; body[i + 1] = t; }
  } else {
    body = Buffer.from(text, 'utf8');
  }
  return bom ? new Uint8Array(Buffer.concat([Buffer.from(bom), body])) : new Uint8Array(body);
}

function scanXmlTags(xml, onTag) {
  const len = xml.length;
  for (let i = 0; i < len;) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) return true;
    i = lt;
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      if (end < 0) return false;
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9);
      if (end < 0) return false;
      i = end + 3;
      continue;
    }
    if (xml[i + 1] === '!' || xml[i + 1] === '?') {
      const end = xml.indexOf('>', i + 2);
      if (end < 0) return false;
      i = end + 1;
      continue;
    }
    if (xml[i + 1] === '/') {
      const endTag = parseEndTag(xml, i);
      if (!endTag) return false;
      i = endTag.end;
      continue;
    }
    if (isAsciiAlpha(xml[i + 1])) {
      const tag = parseStartTag(xml, i, true);
      if (!tag) return false;
      onTag(tag, i);
      i = tag.end;
      continue;
    }
    i++;
  }
  return true;
}

export function parseContainerXml(xmlText) {
  const rootfiles = [];
  const ok = scanXmlTags(xmlText, tag => {
    if (localName(tag.name) !== 'rootfile') return;
    const fullPath = tag.attrs.get('full-path');
    const mediaType = (tag.attrs.get('media-type') ?? '').trim().toLowerCase();
    if (!fullPath) return;
    if (mediaType && mediaType !== 'application/oebps-package+xml') return;
    const norm = normalizePosix(fullPath.trim().replace(/^\/+/, ''));
    if (norm && !rootfiles.includes(norm)) rootfiles.push(norm);
  });
  if (!ok || !rootfiles.length)
    throw cliError('JXL_INPUT', 'EPUB META-INF/container.xml: no package rootfile', 'check: EPUB container.xml');
  return rootfiles;
}

export function parseEncryptionXml(xmlText) {
  const encrypted = [];
  const seen = new Set();
  const ok = scanXmlTags(xmlText, tag => {
    if (localName(tag.name) !== 'cipherreference') return;
    const rawUri = tag.attrs.get('uri');
    if (typeof rawUri !== 'string' || !rawUri.trim()) return;
    const clean = rawUri.trim().split(/[?#]/, 1)[0];
    let decoded;
    try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
    const norm = normalizePosix(decoded.replace(/^\/+/, ''));
    if (norm && !seen.has(norm)) { seen.add(norm); encrypted.push(norm); }
  });
  if (!ok)
    throw cliError('JXL_INPUT', 'EPUB META-INF/encryption.xml: malformed XML', 'fix: META-INF/encryption.xml');
  return encrypted;
}

function encodePathSegments(path) {
  return path.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

export function mapEpubUrl(rawUrl, docZipPath, renameMap) {
  if (typeof rawUrl !== 'string') return null;
  const leading = rawUrl.match(/^[\u0000-\u0020]*/)[0];
  const trailing = rawUrl.match(/[\u0000-\u0020]*$/)[0];
  const trimmed = rawUrl.slice(leading.length, rawUrl.length - trailing.length);
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(trimmed)) return null;
  let splitIdx = trimmed.length;
  const qIdx = trimmed.indexOf('?'), hIdx = trimmed.indexOf('#');
  if (qIdx >= 0 && qIdx < splitIdx) splitIdx = qIdx;
  if (hIdx >= 0 && hIdx < splitIdx) splitIdx = hIdx;
  const rawPath = trimmed.slice(0, splitIdx), suffix = trimmed.slice(splitIdx);
  if (!rawPath) return null;
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (!decoded || decoded.includes('\0') || decoded.includes('\\')) return null;
  const docDir = docZipPath.includes('/') ? posix.dirname(docZipPath) : '';
  const combined = decoded.startsWith('/') ? decoded.slice(1) : (docDir ? docDir + '/' + decoded : decoded);
  const resolved = normalizePosix(combined);
  if (!resolved) return null;
  const mapping = renameMap.get(resolved);
  if (!mapping) return null;

  const {newPath, newMediaType} = mapping;
  const oldBase = posix.basename(resolved), newBase = posix.basename(newPath);
  const slash = rawPath.lastIndexOf('/');
  const dirPrefix = slash >= 0 ? rawPath.slice(0, slash + 1) : '';
  const rawBase = slash >= 0 ? rawPath.slice(slash + 1) : rawPath;
  let rewrittenPath = null;
  if (posix.dirname(resolved) === posix.dirname(newPath)) {
    if (newBase.startsWith(oldBase)) {
      rewrittenPath = dirPrefix + rawBase + encodeURIComponent(newBase.slice(oldBase.length));
    } else if (oldBase.startsWith(newBase)) {
      const removed = oldBase.slice(newBase.length);
      if (rawBase.endsWith(removed)) rewrittenPath = dirPrefix + rawBase.slice(0, -removed.length);
    } else {
      const oldExt = posix.extname(oldBase), newExt = posix.extname(newBase);
      if (oldExt && oldBase.slice(0, -oldExt.length) === newBase.slice(0, -newExt.length) &&
          rawBase.toLowerCase().endsWith(oldExt.toLowerCase())) {
        rewrittenPath = dirPrefix + rawBase.slice(0, -oldExt.length) + newExt;
      }
    }
  }
  if (!rewrittenPath) {
    const rel = docDir ? posix.relative(docDir, newPath) : newPath;
    rewrittenPath = encodePathSegments(rel);
  }
  return {url: leading + rewrittenPath + suffix + trailing, newMediaType};
}

function applyEdits(text, edits) {
  if (!edits.length) return {text, count: 0};
  edits.sort((a, b) => a.from - b.from || a.to - b.to);
  let out = '', cursor = 0;
  for (const edit of edits) {
    if (edit.from < cursor) continue;
    out += text.slice(cursor, edit.from) + edit.text;
    cursor = edit.to;
  }
  out += text.slice(cursor);
  return {text: out, count: edits.length};
}

function unescapeCssString(raw) {
  return raw.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_, seq) => {
    if (/^[0-9a-fA-F]/.test(seq)) {
      const cp = parseInt(seq.trim(), 16);
      return Number.isSafeInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _;
    }
    return seq;
  });
}

function escapeCssUrl(url, quote) {
  if (quote) return url.replaceAll('\\', '\\\\').replaceAll(quote, '\\' + quote);
  return /[\s"'()\\]/.test(url) ? `"${url.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : url;
}

export function rewriteCss(css, cssZipPath, renameMap) {
  const edits = [];
  const len = css.length;
  const isIdentChar = ch => ch !== undefined && /[A-Za-z0-9_-]/.test(ch);

  function readCssString(start) {
    const quote = css[start];
    let p = start + 1;
    while (p < len) {
      if (css[p] === '\\') { p += 2; continue; }
      if (css[p] === quote) return {quote, innerStart: start + 1, innerEnd: p, end: p + 1};
      p++;
    }
    return null;
  }

  function skipWsAndComments(p) {
    while (p < len) {
      if (isHtmlSpace(css[p])) { p++; continue; }
      if (css.startsWith('/*', p)) {
        const end = css.indexOf('*/', p + 2);
        return end < 0 ? len : end + 2;
      }
      break;
    }
    return p;
  }

  function scanUrlArg(afterOpenParen) {
    const start = skipWsAndComments(afterOpenParen);
    if (start >= len) return null;
    if (css[start] === '"' || css[start] === "'") {
      const str = readCssString(start);
      if (!str) return null;
      const close = skipWsAndComments(str.end);
      if (css[close] !== ')') return {end: str.end, mapped: null};
      const rawUrl = unescapeCssString(css.slice(str.innerStart, str.innerEnd));
      const mapped = mapEpubUrl(rawUrl, cssZipPath, renameMap);
      if (mapped) edits.push({from: str.innerStart, to: str.innerEnd, text: escapeCssUrl(mapped.url, str.quote)});
      return {end: close + 1, mapped};
    }
    let p = start;
    while (p < len && css[p] !== ')' && !isHtmlSpace(css[p])) {
      if (css[p] === '\\') { p += 2; continue; }
      p++;
    }
    const close = skipWsAndComments(p);
    if (css[close] !== ')') return {end: p, mapped: null};
    const rawUrl = unescapeCssString(css.slice(start, p));
    const mapped = mapEpubUrl(rawUrl, cssZipPath, renameMap);
    if (mapped) edits.push({from: start, to: p, text: escapeCssUrl(mapped.url, '')});
    return {end: close + 1, mapped};
  }

  function scanImageSet(afterOpenParen) {
    let p = afterOpenParen, depth = 1, lastMapped = null;
    while (p < len && depth > 0) {
      p = skipWsAndComments(p);
      if (p >= len) break;
      const ch = css[p];
      if (ch === ')') { depth--; p++; break; }
      if (ch === ',') { lastMapped = null; p++; continue; }
      if (ch === '(') { depth++; p++; continue; }
      if ((ch === '"' || ch === "'") && depth === 1) {
        const str = readCssString(p);
        if (!str) return len;
        const rawUrl = unescapeCssString(css.slice(str.innerStart, str.innerEnd));
        const mapped = mapEpubUrl(rawUrl, cssZipPath, renameMap);
        if (mapped) {
          edits.push({from: str.innerStart, to: str.innerEnd, text: escapeCssUrl(mapped.url, str.quote)});
          lastMapped = mapped;
        }
        p = str.end;
        continue;
      }
      if (!isIdentChar(css[p - 1]) && css.slice(p, p + 4).toLowerCase() === 'url(') {
        const res = scanUrlArg(p + 4);
        if (!res) return len;
        if (res.mapped) lastMapped = res.mapped;
        p = res.end;
        continue;
      }
      if (lastMapped && !isIdentChar(css[p - 1]) && css.slice(p, p + 5).toLowerCase() === 'type(') {
        const argStart = skipWsAndComments(p + 5);
        if (css[argStart] === '"' || css[argStart] === "'") {
          const str = readCssString(argStart);
          if (!str) return len;
          const mime = unescapeCssString(css.slice(str.innerStart, str.innerEnd)).split(';', 1)[0].trim().toLowerCase();
          if (RASTER_MIMES.has(mime)) {
            edits.push({from: str.innerStart, to: str.innerEnd, text: lastMapped.newMediaType});
          }
          const close = skipWsAndComments(str.end);
          p = css[close] === ')' ? close + 1 : str.end;
          continue;
        }
      }
      p++;
    }
    return p;
  }

  for (let p = 0; p < len;) {
    if (css.startsWith('/*', p)) {
      const end = css.indexOf('*/', p + 2);
      p = end < 0 ? len : end + 2;
      continue;
    }
    if (css[p] === '"' || css[p] === "'") {
      const str = readCssString(p);
      p = str ? str.end : len;
      continue;
    }
    if (!isIdentChar(css[p - 1])) {
      const slice = css.slice(p, p + 18).toLowerCase();
      if (slice.startsWith('url(')) {
        const res = scanUrlArg(p + 4);
        p = res ? res.end : len;
        continue;
      }
      if (slice.startsWith('image-set(')) {
        p = scanImageSet(p + 10);
        continue;
      }
      if (slice.startsWith('-webkit-image-set(')) {
        p = scanImageSet(p + 18);
        continue;
      }
    }
    p++;
  }
  const applied = applyEdits(css, edits);
  return {css: applied.text, count: applied.count};
}

function rewriteStyleBody(body, docZipPath, renameMap) {
  const edits = [];
  let i = 0;
  const processSegment = (from, to) => {
    if (to <= from) return;
    const sub = body.slice(from, to);
    const rewritten = rewriteCss(sub, docZipPath, renameMap);
    if (rewritten.count > 0) edits.push({from, to, text: rewritten.css, count: rewritten.count});
  };
  while (i < body.length) {
    const cdata = body.indexOf('<![CDATA[', i);
    const comment = body.indexOf('<!--', i);
    const next = cdata >= 0 && (comment < 0 || cdata < comment) ? cdata : comment;
    if (next < 0) { processSegment(i, body.length); break; }
    processSegment(i, next);
    if (next === cdata) {
      const close = body.indexOf(']]>', next + 9);
      if (close < 0) { processSegment(next + 9, body.length); break; }
      processSegment(next + 9, close);
      i = close + 3;
    } else {
      const close = body.indexOf('-->', next + 4);
      if (close < 0) break;
      i = close + 3;
    }
  }
  if (!edits.length) return {text: body, count: 0};
  const totalCount = edits.reduce((n, e) => n + e.count, 0);
  return {text: applyEdits(body, edits).text, count: totalCount};
}

function replaceAttrValue(edits, span, newValue) {
  const quote = span.quote || '"';
  const encoded = escapeHtmlAttr(newValue, quote);
  edits.push({
    from: span.valueStart,
    to: span.valueEnd,
    text: span.quote ? encoded : `"${encoded}"`,
  });
}

export function rewriteOpf(xml, opfZipPath, renameMap) {
  const edits = [];
  const manifestDocs = new Map();
  let refCount = 0;
  const ok = scanXmlTags(xml, (tag, tagStart) => {
    const local = localName(tag.name);
    if (local === 'item') {
      const hrefSpan = tag.attrSpans.get('href');
      const mediaSpan = tag.attrSpans.get('media-type');
      const href = hrefSpan?.value;
      const mediaType = (mediaSpan?.value ?? '').split(';', 1)[0].trim().toLowerCase();
      if (typeof href === 'string') {
        const mapped = mapEpubUrl(href, opfZipPath, renameMap);
        if (mapped) {
          replaceAttrValue(edits, hrefSpan, mapped.url);
          refCount++;
          if (mediaSpan?.hasValue) {
            replaceAttrValue(edits, mediaSpan, mapped.newMediaType);
          } else {
            const insertAt = tag.selfClosing ? tag.end - 2 : tag.end - 1;
            edits.push({from: insertAt, to: insertAt, text: ` media-type="${mapped.newMediaType}"`});
          }
          return;
        }
        const clean = href.trim().split(/[?#]/, 1)[0];
        let decoded;
        try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
        const dir = opfZipPath.includes('/') ? posix.dirname(opfZipPath) : '';
        const norm = normalizePosix(decoded.startsWith('/') ? decoded.slice(1) : (dir ? dir + '/' + decoded : decoded));
        if (norm && mediaType) manifestDocs.set(norm, mediaType);
      }
    } else if (local === 'link' || local === 'reference') {
      const hrefSpan = tag.attrSpans.get('href');
      if (hrefSpan && typeof hrefSpan.value === 'string') {
        const mapped = mapEpubUrl(hrefSpan.value, opfZipPath, renameMap);
        if (mapped) {
          replaceAttrValue(edits, hrefSpan, mapped.url);
          refCount++;
          const mediaSpan = tag.attrSpans.get('media-type');
          const mime = (mediaSpan?.value ?? '').split(';', 1)[0].trim().toLowerCase();
          if (mediaSpan?.hasValue && RASTER_MIMES.has(mime)) replaceAttrValue(edits, mediaSpan, mapped.newMediaType);
        }
      }
    }
    void tagStart;
  });
  if (!ok) throw cliError('JXL_INPUT', `EPUB "${opfZipPath}": malformed OPF XML`, 'check: OPF package document');
  return {xml: applyEdits(xml, edits).text, count: refCount, manifestDocs};
}

export function rewriteMarkup(markup, docZipPath, renameMap) {
  if (markup.includes('\0')) return {markup, count: 0};
  const edits = [];
  const len = markup.length;
  let i = 0, refCount = 0;

  while (i < len) {
    const lt = markup.indexOf('<', i);
    if (lt < 0) break;
    i = lt;
    if (markup.startsWith('<!--', i)) {
      const end = markup.indexOf('-->', i + 4);
      if (end < 0) return {markup, count: 0};
      i = end + 3;
      continue;
    }
    if (markup.startsWith('<![CDATA[', i)) {
      const end = markup.indexOf(']]>', i + 9);
      if (end < 0) return {markup, count: 0};
      i = end + 3;
      continue;
    }
    if (markup[i + 1] === '!' || markup[i + 1] === '?') {
      const end = markup.indexOf('>', i + 2);
      if (end < 0) return {markup, count: 0};
      i = end + 1;
      continue;
    }
    if (markup[i + 1] === '/') {
      const endTag = parseEndTag(markup, i);
      if (!endTag) return {markup, count: 0};
      i = endTag.end;
      continue;
    }
    if (isAsciiAlpha(markup[i + 1])) {
      const tag = parseStartTag(markup, i, true);
      if (!tag) return {markup, count: 0};
      const local = localName(tag.name);
      if (local === 'base' && tag.attrs.has('href')) return {markup, count: 0};
      if (local === 'script') {
        if (tag.selfClosing) { i = tag.end; continue; }
        const end = scanScriptEnd(markup, tag.end);
        if (end === null) return {markup, count: 0};
        i = end;
        continue;
      }
      if (local === 'style') {
        if (tag.selfClosing) { i = tag.end; continue; }
        const end = scanRawTextEnd(markup, tag.end, tag.name);
        if (end === null) return {markup, count: 0};
        const closeTagStart = markup.lastIndexOf('</', end);
        const body = markup.slice(tag.end, closeTagStart);
        const rewritten = rewriteStyleBody(body, docZipPath, renameMap);
        if (rewritten.count > 0) {
          edits.push({from: tag.end, to: closeTagStart, text: rewritten.text});
          refCount += rewritten.count;
        }
        i = end;
        continue;
      }
      if (RAW_TEXT_TAGS.has(local)) {
        if (tag.selfClosing) { i = tag.end; continue; }
        const end = scanRawTextEnd(markup, tag.end, tag.name);
        if (end === null) return {markup, count: 0};
        i = end;
        continue;
      }

      let mappedType = null;
      const rewriteUrlAttr = attrName => {
        const span = tag.attrSpans.get(attrName);
        if (!span?.hasValue || typeof span.value !== 'string') return;
        const mapped = mapEpubUrl(span.value, docZipPath, renameMap);
        if (mapped) {
          replaceAttrValue(edits, span, mapped.url);
          refCount++;
          mappedType = mapped.newMediaType;
        }
      };
      const rewriteSrcsetAttr = () => {
        const span = tag.attrSpans.get('srcset');
        if (!span?.hasValue || typeof span.value !== 'string') return;
        const parsed = parseSrcset(span.value);
        if (!parsed) return;
        let changed = 0;
        const mappedTypes = new Set();
        const parts = parsed.map(entry => {
          const mapped = mapEpubUrl(entry.url, docZipPath, renameMap);
          if (!mapped) return entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url;
          changed++;
          mappedTypes.add(mapped.newMediaType);
          const safeUrl = mapped.url.replaceAll(' ', '%20').replace(/,+$/, commas => '%2C'.repeat(commas.length));
          return entry.descriptor ? `${safeUrl} ${entry.descriptor}` : safeUrl;
        });
        if (changed > 0) {
          replaceAttrValue(edits, span, parts.join(', '));
          refCount += changed;
          if (changed === parsed.length && mappedTypes.size === 1) mappedType = [...mappedTypes][0];
        }
      };

      if (local === 'img') {
        rewriteUrlAttr('src');
        rewriteSrcsetAttr();
      } else if (local === 'source') {
        rewriteUrlAttr('src');
        rewriteSrcsetAttr();
      } else if (local === 'image' || local === 'feimage') {
        for (const attrName of tag.attrSpans.keys()) {
          if (attrName === 'href' || attrName.endsWith(':href')) rewriteUrlAttr(attrName);
        }
      } else if (local === 'video') {
        rewriteUrlAttr('poster');
      } else if (local === 'object') {
        rewriteUrlAttr('data');
      } else if (local === 'link' || local === 'a') {
        rewriteUrlAttr('href');
      } else if (local === 'content') {
        rewriteUrlAttr('src');
      }

      if (mappedType && (local === 'source' || local === 'object' || local === 'link')) {
        const typeSpan = tag.attrSpans.get('type');
        const mime = (typeSpan?.value ?? '').split(';', 1)[0].trim().toLowerCase();
        if (typeSpan?.hasValue && RASTER_MIMES.has(mime)) replaceAttrValue(edits, typeSpan, mappedType);
      }

      const styleSpan = tag.attrSpans.get('style');
      if (styleSpan?.hasValue && typeof styleSpan.value === 'string' && /url\(|image-set\(/i.test(styleSpan.value)) {
        const rewritten = rewriteCss(styleSpan.value, docZipPath, renameMap);
        if (rewritten.count > 0) {
          replaceAttrValue(edits, styleSpan, rewritten.css);
          refCount += rewritten.count;
        }
      }
      i = tag.end;
      continue;
    }
    i++;
  }
  return {markup: applyEdits(markup, edits).text, count: refCount};
}

function replacePosixExt(filePath, newExt) {
  const ext = posix.extname(filePath);
  return (ext ? filePath.slice(0, -ext.length) : filePath) + newExt;
}

function planConvertPaths(imageEntries, existingFixedLower, keepExtension) {
  const planned = imageEntries.map(entry => ({
    entry,
    target: keepExtension ? entry.name + '.jxl' : replacePosixExt(entry.name, '.jxl'),
  }));
  const counts = new Map();
  for (const item of planned) {
    const key = item.target.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const item of planned) {
    const key = item.target.toLowerCase();
    if (!keepExtension && (counts.get(key) > 1 || existingFixedLower.has(key))) {
      item.target = item.entry.name + '.jxl';
    }
  }
  const seen = new Map();
  for (const item of planned) {
    const key = item.target.toLowerCase();
    if (existingFixedLower.has(key)) {
      throw cliError('JXL_OPTIONS', `EPUB "${item.entry.name}": target "${item.target}" already exists in archive`, 'rename conflicting entry');
    }
    const other = seen.get(key);
    if (other) {
      throw cliError('JXL_OPTIONS', `EPUB "${other.entry.name}" + "${item.entry.name}": same target "${item.target}"`, 'use: distinct entry names');
    }
    seen.set(key, item);
  }
  return planned;
}

function restoredJpegPath(jxlPath) {
  if (/\.(jpe?g)\.jxl$/i.test(jxlPath)) return jxlPath.slice(0, -4);
  if (/\.jxl$/i.test(jxlPath)) return jxlPath.slice(0, -4) + '.jpg';
  return jxlPath + '.jpg';
}

function planRestorePaths(restoredEntries, existingFixedLower) {
  const seen = new Map();
  return restoredEntries.map(item => {
    const target = restoredJpegPath(item.entry.name);
    const key = target.toLowerCase();
    if (existingFixedLower.has(key)) {
      throw cliError('JXL_OPTIONS', `EPUB "${item.entry.name}": restored target "${target}" already exists in archive`, 'remove colliding entry first');
    }
    const other = seen.get(key);
    if (other) {
      throw cliError('JXL_OPTIONS', `EPUB "${other.entry.name}" + "${item.entry.name}": same restored target "${target}"`, 'use: distinct entry names');
    }
    seen.set(key, item);
    return {...item, target};
  });
}

export async function processEpubTask(ctx) {
  const {
    task, options, runner, encodeFile, detectFormat, getJpeg, getVerify, getHdr,
    writeWhole, samePath, writeError, formatLine, friendlyError, formatFriendlyError,
    emit, stdout, stderr, json, caller, elapsed, begun,
  } = ctx;
  const {inputPath, outputPath, displayIn, displayOut} = task;
  const raw = new Uint8Array(await readFile(inputPath));
  if (!raw.byteLength) throw cliError('JXL_INPUT', `"${displayIn}": empty`, 'use: EPUB file');
  const {entries, byName} = readZip(raw);

  const mimeEntry = byName.get('mimetype');
  if (!mimeEntry) throw cliError('JXL_INPUT', `"${displayIn}": missing EPUB mimetype entry`, 'check: EPUB file');
  const mimeText = Buffer.from(readZipEntry(mimeEntry)).toString('ascii').trim();
  if (mimeText !== MIMETYPE)
    throw cliError('JXL_INPUT', `"${displayIn}": unexpected mimetype "${mimeText}"`, 'check: EPUB file');
  const containerEntry = byName.get('META-INF/container.xml');
  if (!containerEntry) throw cliError('JXL_INPUT', `"${displayIn}": missing META-INF/container.xml`, 'check: EPUB file');
  const opfPaths = parseContainerXml(decodeTextBytes(readZipEntry(containerEntry), 'META-INF/container.xml').text);
  for (const opfPath of opfPaths) {
    if (!byName.has(opfPath)) throw cliError('JXL_INPUT', `"${displayIn}": missing package "${opfPath}"`, 'check: EPUB container.xml');
  }

  const encryptionEntry = byName.get('META-INF/encryption.xml');
  const encryptedList = encryptionEntry
    ? parseEncryptionXml(decodeTextBytes(readZipEntry(encryptionEntry), 'META-INF/encryption.xml').text)
    : [];
  const encryptedSet = new Set(encryptedList);
  const encryptedPresent = encryptedList.filter(p => byName.has(p));

  for (const opfPath of opfPaths) {
    if (encryptedSet.has(opfPath)) {
      throw cliError('JXL_UNSUPPORTED', `"${displayIn}": encrypted package "${opfPath}"`, 'decrypt EPUB first');
    }
  }

  const renameMap = new Map();
  const convertedData = new Map();
  let imagesConverted = 0, jpegsExact = 0, imagesRestored = 0, keptJxl = 0, unread = 0;
  const unreadItems = [];
  let verifyFn = null;
  if (options.verify) verifyFn = (await getVerify()).verify;

  if (options.restore) {
    const jxlCandidates = [];
    const fixedNamesLower = new Set();
    for (const entry of entries) {
      if (entry.name === 'mimetype' || entry.name.startsWith('META-INF/') || entry.name.endsWith('/') || encryptedSet.has(entry.name)) {
        fixedNamesLower.add(entry.name.toLowerCase());
        continue;
      }
      const data = readZipEntry(entry);
      if (detectFormat(data, entry.name) === 'jxl') {
        jxlCandidates.push({entry, data});
      } else {
        fixedNamesLower.add(entry.name.toLowerCase());
      }
    }

    const {restore} = await getJpeg();
    const restoredItems = [];
    for (const {entry, data} of jxlCandidates) {
      try {
        const restored = await restore(data);
        if (verifyFn) {
          await verifyFn(restored.bytes, {
            bytes: data, width: restored.width, height: restored.height,
            format: 'jxl', fidelity: 'exact', kept: 'jpeg-bytes',
            source: null, meetsTarget: true, measurements: [],
          });
        }
        restoredItems.push({entry, restored});
      } catch (error) {
        if (error?.code === 'JXL_RECONSTRUCTION') {
          keptJxl++;
          fixedNamesLower.add(entry.name.toLowerCase());
          continue;
        }
        throw error;
      }
    }

    if (restoredItems.length === 0 && encryptedPresent.length === 0) {
      throw cliError('JXL_RECONSTRUCTION', `"${displayIn}": no restorable JPEG XL images`, `run: npx ${COMMAND} "${displayIn}"`);
    }

    const plannedRestore = planRestorePaths(restoredItems, fixedNamesLower);
    for (const {entry, restored, target} of plannedRestore) {
      renameMap.set(entry.name, {newPath: target, newMediaType: 'image/jpeg', format: 'jpeg', kept: 'jpeg-bytes'});
      convertedData.set(entry.name, restored.bytes);
      imagesRestored++;
    }
  } else {
    const imageCandidates = [];
    const fixedNamesLower = new Set();
    for (const entry of entries) {
      if (entry.name === 'mimetype' || entry.name.startsWith('META-INF/') || entry.name.endsWith('/')) {
        fixedNamesLower.add(entry.name.toLowerCase());
        continue;
      }
      if (encryptedSet.has(entry.name)) {
        fixedNamesLower.add(entry.name.toLowerCase());
        continue;
      }
      const data = readZipEntry(entry);
      const fmt = detectFormat(data, entry.name);
      if (fmt && CONVERTIBLE_FORMATS.has(fmt)) {
        imageCandidates.push({entry, data, format: fmt});
      } else {
        fixedNamesLower.add(entry.name.toLowerCase());
      }
    }

    const planned = planConvertPaths(imageCandidates.map(c => c.entry), fixedNamesLower, options.keepExtension);
    const planByName = new Map(planned.map(p => [p.entry.name, p.target]));

    let next = 0;
    const concurrency = options.jobs > 0 ? Math.min(imageCandidates.length, options.jobs) : 1;

    await Promise.all(Array.from({length: Math.max(1, concurrency)}, async () => {
      while (next < imageCandidates.length) {
        const item = imageCandidates[next++];
        const {entry, data, format} = item;
        const targetPath = planByName.get(entry.name);
        try {
          const made = await encodeFile(data, format, `${displayIn}:${entry.name}`, options, runner);
          if (!made.result.meetsTarget) {
            throw made.result.reason ?? cliError('JXL_TARGET', `"${entry.name}": target not met`, 'raise --max-bytes or lower --quality');
          }
          if (verifyFn) {
            const ref = format === 'hdr' ? await (await getHdr()).read(data) : new Blob([data]);
            await verifyFn(format === 'jpeg' && made.result.kept === 'jpeg-bytes' ? data : ref, made.result);
          }
          renameMap.set(entry.name, {newPath: targetPath, newMediaType: 'image/jxl', format, kept: made.result.kept});
          convertedData.set(entry.name, made.result.bytes);
          imagesConverted++;
          if (made.result.kept === 'jpeg-bytes') jpegsExact++;
        } catch (error) {
          if (error?.code === 'JXL_PLATFORM') {
            unread++;
            unreadItems.push({entry: entry.name, error});
            continue;
          }
          throw error;
        }
      }
    }));
  }

  const manifestMediaTypes = new Map();
  const updatedFiles = [];
  let referencesUpdated = 0;

  for (const opfPath of opfPaths) {
    const entry = byName.get(opfPath);
    const decoded = decodeTextBytes(readZipEntry(entry), opfPath);
    const rewritten = rewriteOpf(decoded.text, opfPath, renameMap);
    for (const [docPath, mime] of rewritten.manifestDocs) manifestMediaTypes.set(docPath, mime);
    if (rewritten.xml !== decoded.text) {
      entry.data = encodeTextBytes(rewritten.xml, decoded.encoding, decoded.bom);
      entry.modified = true;
      updatedFiles.push(opfPath);
      referencesUpdated += rewritten.count;
    }
  }

  const opfSet = new Set(opfPaths);
  if (renameMap.size > 0) {
    for (const entry of entries) {
      if (entry.name === 'mimetype' || entry.name.startsWith('META-INF/') || entry.name.endsWith('/')) continue;
      if (encryptedSet.has(entry.name) || renameMap.has(entry.name) || opfSet.has(entry.name)) continue;
      const mime = manifestMediaTypes.get(entry.name) ?? '';
      const ext = posix.extname(entry.name).toLowerCase();
      const isCss = mime === 'text/css' || ext === '.css';
      const isMarkup = MARKUP_MIMES.has(mime) || MARKUP_EXTS.has(ext);
      if (!isCss && !isMarkup) continue;
      const decoded = decodeTextBytes(readZipEntry(entry), entry.name);
      const rewritten = isCss
        ? rewriteCss(decoded.text, entry.name, renameMap)
        : rewriteMarkup(decoded.text, entry.name, renameMap);
      const nextText = isCss ? rewritten.css : rewritten.markup;
      if (nextText !== decoded.text) {
        entry.data = encodeTextBytes(nextText, decoded.encoding, decoded.bom);
        entry.modified = true;
        updatedFiles.push(entry.name);
        referencesUpdated += rewritten.count;
      }
    }
  }

  const outEntries = entries.map(entry => {
    const mapping = renameMap.get(entry.name);
    if (!mapping) return entry;
    return {
      ...entry,
      name: mapping.newPath,
      data: convertedData.get(entry.name),
      modified: true,
    };
  });

  const outBytes = writeZip(outEntries);

  if (await samePath(outputPath, inputPath))
    throw cliError('JXL_OPTIONS', `"${displayIn}": output equals input`, '--out: different path');

  let skipped = false, written = false;
  try {
    await writeWhole(outputPath, outBytes);
    written = true;
  } catch (error) {
    if (error.code !== 'EEXIST' || !await stat(outputPath).catch(() => null)) throw writeError(error, displayOut);
    const existing = await readFile(outputPath).catch(() => null);
    if (!existing || !Buffer.from(outBytes).equals(existing)) {
      throw cliError('JXL_OPTIONS', `"${displayOut}": exists${existing ? ', differing' : ''}`,
        `run: npx ${COMMAND} "${displayIn}"${options.restore ? ' --restore' : ''} --out "${displayOut.replace(/\.epub$/i, '')}-${options.restore ? 'restored' : 'new'}.epub"`);
    }
    skipped = true;
  }

  const notes = [];
  if (options.restore) {
    notes.push(`${imagesRestored} exact ${imagesRestored === 1 ? 'JPEG' : 'JPEGs'} restored`);
    if (keptJxl) notes.push(`${keptJxl} JXL kept`);
  } else if (imagesConverted) {
    notes.push(`${imagesConverted} ${imagesConverted === 1 ? 'image' : 'images'}${jpegsExact ? ` (${jpegsExact} exact JPEG)` : ''}`);
  } else {
    notes.push('no images converted');
  }
  if (encryptedPresent.length) notes.push(`${encryptedPresent.length} encrypted untouched`);
  const line = formatLine(displayIn, displayOut, raw.byteLength, outBytes.byteLength, notes.join(', '));

  if (!json) {
    for (const encPath of encryptedPresent) {
      await stdout(`${displayIn}: ${encPath}: encrypted (META-INF/encryption.xml), left untouched`);
    }
    for (const item of unreadItems) {
      await stderr(`${displayIn}:${item.entry}: not converted: ${formatFriendlyError(item.error)}`);
    }
    await stdout(line);
  } else {
    for (const item of unreadItems) {
      await emit({type: 'unread', input: `${displayIn}:${item.entry}`, reason: friendlyError(item.error)});
    }
    await emit({
      type: 'epub',
      mode: options.restore ? 'restore' : 'convert',
      input: displayIn,
      output: displayOut,
      inputBytes: raw.byteLength,
      outputBytes: outBytes.byteLength,
      ...(options.restore
        ? {imagesRestored, keptJxl}
        : {imagesConverted, jpegsExact, unread, effort: options.effort}),
      encrypted: encryptedPresent,
      filesUpdated: updatedFiles,
      referencesUpdated,
      ms: elapsed(begun),
      skipped,
      written,
    });
  }
  if (caller.failed) throw caller.reason;

  return {
    result: {meetsTarget: true, bytes: outBytes},
    inputPath,
    outputPath,
    inputBytes: raw.byteLength,
    outputBytes: outBytes.byteLength,
    effort: options.restore ? null : options.effort,
    skipped,
    written,
    unread,
    line,
  };
}
