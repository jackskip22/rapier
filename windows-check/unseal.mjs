import { createDecipheriv } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

async function decrypt() {
  const [app, dir, output] = process.argv.slice(2);
  if (!['watercolor', 'converter', 'guides'].includes(app)) throw new Error('Invalid app');
  const key = process.env.WINDOWS_CANDIDATE_KEY;
  if (!/^[0-9a-f]{64}$/.test(key ?? '')) throw new Error('Missing key');
  const match = new RegExp('^' + app + '\\.part-[0-9]{3}$');
  const files = (await readdir(dir)).filter(name => match.test(name)).sort();
  if (!files.length || files.length > 40 ||
      files.some((name, i) => name !== app + '.part-' + String(i).padStart(3, '0'))) throw new Error('Invalid sealed parts');
  const combined = output + '.locked';
  async function* streamParts() {
    for (const file of files) {
      const part = join(dir, file);
      const info = await stat(part);
      if (info.size > 45 * 1024 * 1024 || !info.isFile()) throw new Error('Invalid sealed part');
      yield* createReadStream(part);
    }
  }
  try {
    await pipeline(Readable.from(streamParts()), createWriteStream(combined, {flags:'wx'}));
    const handle = await open(combined);
    const nonce = Buffer.alloc(12), tag = Buffer.alloc(16);
    let bytes;
    try {
      ({size:bytes} = await handle.stat());
      if (bytes <= nonce.length + tag.length) throw new Error('Invalid sealed size');
      if ((await handle.read(nonce, 0, nonce.length, 0)).bytesRead !== nonce.length ||
          (await handle.read(tag, 0, tag.length, bytes - tag.length)).bytesRead !== tag.length) throw new Error('Truncated');
    } finally { await handle.close(); }
    const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), nonce);
    cipher.setAAD(Buffer.from('windows-candidate:' + app));
    cipher.setAuthTag(tag);
    await pipeline(createReadStream(combined, {start:nonce.length, end:bytes-tag.length-1}),
      cipher, createWriteStream(output, {flags:'wx'}));
  } catch {
    await rm(output, {force:true});
    throw new Error('Sealed snapshot verification failed');
  } finally { await rm(combined, {force:true}); }
}
decrypt().catch(() => { console.error('Sealed snapshot unavailable or not authenticated.'); process.exitCode = 1; });
