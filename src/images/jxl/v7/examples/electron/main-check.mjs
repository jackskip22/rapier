import {app} from 'electron';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

app.whenReady().then(async () => {
  const pkg = pathToFileURL(join(resolve(process.env.JXL_PACKAGE), 'dist/')).href;
  const {encode} = await import(`${pkg}upload.mjs`), {recompress, restore} = await import(`${pkg}jpeg.node.mjs`);
  const photo = await readFile(process.argv[2]);
  const data = new Uint8ClampedArray(64 * 64 * 4).map((_, i) => i % 4 === 3 ? 255 : (i * 7) & 255);
  const still = await encode({data, width: 64, height: 64}, {effort: 3, fidelity: {quality: 80}});
  const small = await recompress(new Uint8Array(photo)), back = small.bytes && await restore(small.bytes);
  console.log('RESULT ' + JSON.stringify({electron: process.versions.electron, node: process.versions.node, stillBytes: still.bytes?.length, jpegBytes: small.bytes?.length,
    restored: !!back?.bytes && Buffer.compare(Buffer.from(back.bytes), photo) === 0, reason: still.reason?.code ?? small.reason?.code}));
  app.exit(0);
}).catch(error => { console.log('RESULT ' + JSON.stringify({error: String(error?.stack ?? error)})); app.exit(1); });
