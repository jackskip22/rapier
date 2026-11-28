// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {createRequire, registerHooks} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {deflateSync} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(process.env.JXL_PACKAGE || resolve(here, '../..'));
const distDir = (await stat(join(pkgRoot, 'dist/index.mjs')).then(() => true, () => false))
  ? join(pkgRoot, 'dist')
  : pkgRoot;
const distUrl = pathToFileURL(distDir + '/').href;
const examplesUrl = pathToFileURL(here + '/').href;
const projectDir = resolve(process.env.PAYLOAD_PROJECT_DIR || process.cwd());
const projectRequire = createRequire(join(projectDir, 'package.json'));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'rapier-jxl' || specifier === 'jpegxl') {
      return {url: new URL('index.mjs', distUrl).href, shortCircuit: true};
    }
    if (specifier.startsWith('rapier-jxl/') || specifier.startsWith('jpegxl/')) {
      const sub = specifier.slice(specifier.indexOf('/') + 1);
      return {url: new URL(`${sub}.mjs`, distUrl).href, shortCircuit: true};
    }
    if (specifier === 'react') {
      return {
        url: 'data:text/javascript,' + encodeURIComponent('export function createElement(type, props, ...children) { return {type, props, children}; }'),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

let payloadPkgPath = dirname(projectRequire.resolve('payload'));
while (!(await stat(join(payloadPkgPath, 'package.json')).then(() => true, () => false))) {
  const parent = dirname(payloadPkgPath);
  if (parent === payloadPkgPath) throw new Error('Could not locate payload package.json');
  payloadPkgPath = parent;
}
const payloadPkg = JSON.parse(await readFile(join(payloadPkgPath, 'package.json'), 'utf8'));
const major = Number(String(payloadPkg.version || '').split('.')[0]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function pngChunk(type, body) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const full = Buffer.concat([typeBytes, body]);
  let crc = 0xffffffff;
  for (let i = 0; i < full.length; i++) crc = CRC_TABLE[(crc ^ full[i]) & 0xff] ^ (crc >>> 8);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([len, full, crcBuf]);
}
function makePng(width = 96, height = 72) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rows[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 4;
      rows[i] = Math.round(127 + 100 * Math.sin(x / 7));
      rows[i + 1] = Math.round(127 + 100 * Math.cos(y / 6));
      rows[i + 2] = (x + y * 2) & 255;
      rows[i + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function loadProjectModule(name) {
  return import(pathToFileURL(projectRequire.resolve(name)).href);
}

const scenario = process.argv[2] || '';

if (major >= 4 && !scenario) {
  for (const name of ['p4-sharp', 'p4-plugin', 'p4-browser-r2', 'p4-standalone', 'p4-options']) {
    const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], {
      cwd: projectDir,
      env: {...process.env, JXL_PACKAGE: pkgRoot, PAYLOAD_PROJECT_DIR: projectDir},
      stdio: 'inherit',
    });
    if (res.status !== 0) process.exit(res.status ?? 1);
  }
  console.log(`ALL PAYLOAD ${payloadPkg.version} CHECKS PASSED`);
  process.exit(0);
}

const payloadMod = await loadProjectModule('payload');
const {sqliteAdapter} = await loadProjectModule('@payloadcms/db-sqlite');
const sharpMod = await loadProjectModule('sharp');
const sharp = sharpMod.default ?? sharpMod;
const {jxl, jxlTransformer, restoreOriginals} = await import(new URL('index.mjs', examplesUrl).href);
const {pictureHtml, pictureProps} = await import(new URL('picture.mjs', examplesUrl).href);
const {appendPreparedUpload, prepareUploadFile} = await import(new URL('browser.mjs', examplesUrl).href);
const {close: closeJpeg} = await import(new URL('jpeg.mjs', distUrl).href);
const {close: closeIndex} = await import(new URL('index.mjs', distUrl).href);
const {close: closeUpload} = await import(new URL('upload.mjs', distUrl).href);

const samplePng = makePng(96, 72);
const sampleJpg = await sharp(samplePng).jpeg({quality: 92}).toBuffer();

const workDir = await mkdtemp(join(tmpdir(), 'jxl-payload-check-'));
try {
  if (major < 4) {
    const {buildConfig, createLocalReq, getPayload} = payloadMod;
    const staticDir = join(workDir, 'media');
    const dbFile = join(workDir, 'p3.db');
    const config = await buildConfig({
      secret: 'check-secret-p3-1234567890123456',
      db: sqliteAdapter({client: {url: `file:${dbFile}`}, push: true}),
      sharp,
      collections: [
        {slug: 'users', auth: true, fields: []},
        {
          slug: 'media',
          access: {read: () => true},
          upload: {staticDir, imageSizes: [{name: 'thumb', width: 16, height: 16}]},
          fields: [{name: 'alt', type: 'text'}],
        },
      ],
      plugins: [jxl({spaceSaver: true})],
    });
    const payload = await getPayload({config});
    try {
      const endpoints = payload.collections.media.config.endpoints;
      const fileEndpoint = [...endpoints].reverse().find(ep => ep.method === 'get' && ep.path === '/file/:filename');
      assert.ok(fileEndpoint, 'media /file/:filename endpoint exists');

      async function callFile(filename, headersObj = {}) {
        const req = await createLocalReq({req: {headers: new Headers(headersObj)}}, payload);
        req.method = 'GET';
        req.routeParams = {collection: 'media', filename};
        req.url = `http://localhost/api/media/file/${encodeURIComponent(filename)}`;
        req.searchParams = new URLSearchParams();
        return fileEndpoint.handler(req);
      }

      const jpgDoc = await payload.create({
        collection: 'media',
        data: {alt: 'P3 photo'},
        file: {data: sampleJpg, mimetype: 'image/jpeg', name: 'hero.jpg', size: sampleJpg.byteLength},
      });
      assert.equal(jpgDoc.mimeType, 'image/jpeg');
      assert.equal(jpgDoc.jxl?.mimeType, 'image/jxl');
      assert.equal(jpgDoc.jxl?.originalSha256, sha256(sampleJpg));
      assert.ok(jpgDoc.jxl?.sizes?.thumb?.filename?.endsWith('.jxl'));

      await payload.jobs.run();
      const afterJob = await payload.findByID({collection: 'media', id: jpgDoc.id});
      assert.equal(afterJob.jxl?.spaceSaved, true);
      await assert.rejects(() => stat(join(staticDir, jpgDoc.filename)), {code: 'ENOENT'});

      const chromeJpg = await callFile(jpgDoc.filename, {Accept: 'image/jxl,image/avif,image/webp,*/*'});
      assert.equal(chromeJpg.status, 200);
      assert.equal(chromeJpg.headers.get('content-type'), 'image/jxl');
      assert.match(chromeJpg.headers.get('vary') || '', /\bAccept\b/i);

      const edgeJpg = await callFile(jpgDoc.filename, {Accept: 'image/avif,image/webp,*/*'});
      assert.equal(edgeJpg.status, 200);
      assert.equal(edgeJpg.headers.get('content-type'), 'image/jpeg');
      assert.equal(sha256(new Uint8Array(await edgeJpg.arrayBuffer())), sha256(sampleJpg));

      const botJpg = await callFile(jpgDoc.filename, {Accept: 'image/jxl,*/*', 'User-Agent': 'Slackbot-LinkExpanding 1.0'});
      assert.equal(botJpg.status, 200);
      assert.equal(botJpg.headers.get('content-type'), 'image/jpeg');

      const restored = await restoreOriginals(payload);
      assert.equal(restored.restored, 1);
      assert.equal(sha256(await readFile(join(staticDir, jpgDoc.filename))), sha256(sampleJpg));

      const pngDoc = await payload.create({
        collection: 'media',
        data: {alt: 'P3 png'},
        file: {data: samplePng, mimetype: 'image/png', name: 'ui.png', size: samplePng.byteLength},
      });
      assert.equal(pngDoc.mimeType, 'image/png');
      assert.equal(pngDoc.jxl?.mimeType, 'image/jxl');

      const chromePng = await callFile(pngDoc.filename, {Accept: 'image/jxl,image/avif,image/webp,*/*'});
      assert.equal(chromePng.status, 200);
      assert.equal(chromePng.headers.get('content-type'), 'image/jxl');
      assert.match(chromePng.headers.get('vary') || '', /\bAccept\b/i);

      const edgePng = await callFile(pngDoc.filename, {Accept: 'image/avif,image/webp,*/*'});
      assert.equal(edgePng.status, 200);
      assert.equal(edgePng.headers.get('content-type'), 'image/png');
      assert.match(edgePng.headers.get('vary') || '', /\bAccept\b/i);
      assert.equal(sha256(new Uint8Array(await edgePng.arrayBuffer())), sha256(samplePng), '3.x PNG fallback serves exact original PNG to non-JXL browser');

      const botPng = await callFile(pngDoc.filename, {Accept: 'image/jxl,*/*', 'User-Agent': 'Slackbot-LinkExpanding 1.0'});
      assert.equal(botPng.status, 200);
      assert.equal(botPng.headers.get('content-type'), 'image/png');
      assert.equal(sha256(new Uint8Array(await botPng.arrayBuffer())), sha256(samplePng));

      const pngHtml = pictureHtml(pngDoc, {sizes: '100vw'});
      assert.match(pngHtml, /<source type="image\/jxl"/);
      assert.match(pngHtml, /<img src="\/api\/media\/file\/ui\.png"/);
      assert.equal(pictureProps(pngDoc, {size: 'thumb'})?.sources?.length, 1);

      console.log(`PAYLOAD ${payloadPkg.version} CHECK PASSED:`, {
        jpegBytes: `${sampleJpg.byteLength} -> ${jpgDoc.jxl.filesize}`,
        pngBytes: `${samplePng.byteLength} -> ${pngDoc.jxl.filesize}`,
        nonJxlBrowserGotExactPng: true,
      });
    } finally {
      await payload.db?.destroy?.();
    }
  } else {
    const {buildConfig, createPayloadRequestFromWebRequest, getPayload} = payloadMod;
    const {sharpTransformer} = await loadProjectModule('@payloadcms/transformer-sharp');

    async function callGetFile(payload, key, slug, filename, {headers = {}, method = 'GET', query = ''} = {}) {
      const endpoints = payload.collections[slug].config.endpoints;
      const ep = endpoints.find(e => e.method === 'get' && e.path === '/file/:filename');
      assert.ok(ep, `${slug} /file/:filename endpoint exists`);
      const url = `http://localhost/api/${slug}/file/${encodeURIComponent(filename)}${query ? '?' + query : ''}`;
      const req = await createPayloadRequestFromWebRequest({
        config: Promise.resolve(payload.config),
        payloadInstanceCacheKey: key,
        request: new Request(url, {method, headers}),
        shouldAuthenticate: false,
      });
      req.routeParams = {collection: slug, filename};
      return ep.handler(req);
    }

    async function postMultipartUpload(payload, key, slug, formData) {
      const endpoints = payload.collections[slug].config.endpoints;
      const ep = endpoints.find(e => e.method === 'post' && e.path === '/');
      assert.ok(ep, `${slug} POST / endpoint exists`);
      const wire = new Response(formData);
      const body = await wire.arrayBuffer();
      const webReq = new Request(`http://localhost/api/${slug}`, {
        method: 'POST',
        body,
        headers: {
          'content-type': wire.headers.get('content-type'),
          'content-length': String(body.byteLength),
        },
      });
      const req = await createPayloadRequestFromWebRequest({
        config: Promise.resolve(payload.config),
        payloadInstanceCacheKey: key,
        request: webReq,
        shouldAuthenticate: false,
      });
      req.routeParams = {collection: slug};
      return ep.handler(req);
    }

    if (scenario === 'p4-sharp') {
      const staticDir = join(workDir, 'media-sharp');
      const dbFile = join(workDir, 'sharp.db');
      const config = await buildConfig({
        secret: 'check-secret-p4-sharp-1234567890',
        db: sqliteAdapter({client: {url: `file:${dbFile}`}, push: true}),
        collections: [
          {slug: 'users', auth: true, fields: []},
          {slug: 'media', access: {read: () => true}, upload: {staticDir}, fields: [{name: 'alt', type: 'text'}]},
        ],
        upload: {
          transformers: [
            sharpTransformer({collections: {media: {variants: [{name: 'thumb', width: 24, height: 18}]}}}),
            jxlTransformer(),
          ],
        },
      });
      const payload = await getPayload({config, key: 'p4-sharp'});
      try {
        const jpgDoc = await payload.create({
          collection: 'media',
          data: {alt: 'P4 JPEG'},
          file: {data: sampleJpg, mimetype: 'image/jpeg', name: 'hero.jpg', size: sampleJpg.byteLength},
          overrideAccess: true,
        });
        assert.equal(jpgDoc.mimeType, 'image/jxl');
        assert.equal(jpgDoc.original?.mimeType, 'image/jpeg');
        assert.equal(jpgDoc.variants?.thumb?.mimeType, 'image/jxl');

        const chromeMain = await callGetFile(payload, 'p4-sharp', 'media', jpgDoc.filename, {headers: {Accept: 'image/jxl,*/*'}});
        assert.equal(chromeMain.status, 200);
        assert.equal(chromeMain.headers.get('content-type'), 'image/jxl');
        assert.match(chromeMain.headers.get('vary') || '', /\bAccept\b/i);

        const edgeMain = await callGetFile(payload, 'p4-sharp', 'media', jpgDoc.filename, {headers: {Accept: 'image/avif,image/webp,*/*'}});
        assert.equal(edgeMain.status, 200);
        assert.equal(edgeMain.headers.get('content-type'), 'image/jpeg');
        assert.equal(sha256(new Uint8Array(await edgeMain.arrayBuffer())), sha256(sampleJpg));

        const edgeThumb = await callGetFile(payload, 'p4-sharp', 'media', jpgDoc.variants.thumb.filename, {headers: {Accept: 'image/webp,*/*'}});
        assert.equal(edgeThumb.status, 200);
        assert.equal(edgeThumb.headers.get('content-type'), 'image/jpeg');
        const thumbMeta = await sharp(Buffer.from(await edgeThumb.arrayBuffer())).metadata();
        assert.equal(thumbMeta.width, 24);
        assert.equal(thumbMeta.height, 18);

        const headThumb = await callGetFile(payload, 'p4-sharp', 'media', jpgDoc.variants.thumb.filename, {headers: {Accept: 'image/webp,*/*'}, method: 'HEAD'});
        assert.equal(headThumb.status, 200);
        assert.equal((await headThumb.arrayBuffer()).byteLength, 0);

        const pngDoc = await payload.create({
          collection: 'media',
          data: {alt: 'P4 PNG'},
          file: {data: samplePng, mimetype: 'image/png', name: 'ui.png', size: samplePng.byteLength},
          overrideAccess: true,
        });
        assert.equal(pngDoc.mimeType, 'image/jxl');
        assert.equal(pngDoc.original?.mimeType, 'image/png');
        assert.equal(pngDoc.variants?.thumb?.mimeType, 'image/jxl');

        const chromePng = await callGetFile(payload, 'p4-sharp', 'media', pngDoc.filename, {headers: {Accept: 'image/jxl,*/*'}});
        assert.equal(chromePng.status, 200);
        assert.equal(chromePng.headers.get('content-type'), 'image/jxl');

        const edgePng = await callGetFile(payload, 'p4-sharp', 'media', pngDoc.filename, {headers: {Accept: 'image/avif,image/webp,*/*'}});
        assert.equal(edgePng.status, 200);
        assert.equal(edgePng.headers.get('content-type'), 'image/png');
        assert.match(edgePng.headers.get('vary') || '', /\bAccept\b/i);
        assert.equal(sha256(new Uint8Array(await edgePng.arrayBuffer())), sha256(samplePng));

        const botPng = await callGetFile(payload, 'p4-sharp', 'media', pngDoc.filename, {headers: {Accept: 'image/jxl,*/*', 'User-Agent': 'Slackbot-LinkExpanding 1.0'}});
        assert.equal(botPng.status, 200);
        assert.equal(botPng.headers.get('content-type'), 'image/png');
        assert.equal(sha256(new Uint8Array(await botPng.arrayBuffer())), sha256(samplePng));

        const edgePngThumb = await callGetFile(payload, 'p4-sharp', 'media', pngDoc.variants.thumb.filename, {headers: {Accept: 'image/webp,*/*'}});
        assert.equal(edgePngThumb.status, 200);
        assert.equal(edgePngThumb.headers.get('content-type'), 'image/png');

        const html = pictureHtml(pngDoc, {sizes: '100vw'});
        assert.match(html, /<source type="image\/jxl" srcset="[^"]*\.jxl"/);
        assert.match(html, /<img src="[^"]*ui\.png"/);
        console.log('p4-sharp PASSED');
      } finally {
        await payload.db?.destroy?.();
      }
    } else if (scenario === 'p4-plugin') {
      const staticDir = join(workDir, 'media-plugin');
      const dbFile = join(workDir, 'plugin.db');
      const config = await buildConfig({
        secret: 'check-secret-p4-plugin-1234567890',
        db: sqliteAdapter({client: {url: `file:${dbFile}`}, push: true}),
        collections: [
          {slug: 'users', auth: true, fields: []},
          {slug: 'media', access: {read: () => true}, upload: {staticDir}, fields: [{name: 'alt', type: 'text'}]},
        ],
        upload: {transformers: [sharpTransformer({collections: {media: {}}})]},
        plugins: [jxl()],
      });
      assert.deepEqual(config.upload.transformers.map(t => t.slug), ['sharp', 'jxl']);
      const payload = await getPayload({config, key: 'p4-plugin'});
      try {
        const doc = await payload.create({
          collection: 'media',
          data: {alt: 'P4 auto-wired'},
          file: {data: samplePng, mimetype: 'image/png', name: 'auto.png', size: samplePng.byteLength},
          overrideAccess: true,
        });
        assert.equal(doc.mimeType, 'image/jxl');
        assert.equal(doc.original?.mimeType, 'image/png');
        const edgeRes = await callGetFile(payload, 'p4-plugin', 'media', doc.filename, {headers: {Accept: 'image/webp,*/*'}});
        assert.equal(edgeRes.status, 200);
        assert.equal(edgeRes.headers.get('content-type'), 'image/png');
        assert.equal(sha256(new Uint8Array(await edgeRes.arrayBuffer())), sha256(samplePng));
        console.log('p4-plugin PASSED');
      } finally {
        await payload.db?.destroy?.();
      }
    } else if (scenario === 'p4-browser-r2') {
      const jpgPrepared = await prepareUploadFile(new File([sampleJpg], 'worker-photo.jpg', {type: 'image/jpeg'}), {effort: 2});
      assert.equal(jpgPrepared.converted, true);
      assert.equal(jpgPrepared.file.name, 'worker-photo.jxl');
      assert.equal(jpgPrepared.file.type, 'image/jxl');
      assert.equal(jpgPrepared.jxlFile, null);

      const pngPrepared = await prepareUploadFile(new File([samplePng], 'worker-ui.png', {type: 'image/png'}), {effort: 2});
      assert.equal(pngPrepared.converted, true);
      assert.equal(pngPrepared.file.name, 'worker-ui.png', 'Non-JPEG keeps original PNG in prepared.file');
      assert.equal(pngPrepared.file.type, 'image/png');
      assert.ok(pngPrepared.jxlFile instanceof File, 'Non-JPEG places browser-encoded JXL in prepared.jxlFile');
      assert.equal(pngPrepared.jxlFile.name, 'worker-ui.jxl');
      assert.equal(pngPrepared.jxlFile.type, 'image/jxl');

      const svgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], 'icon.svg', {type: 'image/svg+xml'});
      const svgPrepared = await prepareUploadFile(svgFile);
      assert.equal(svgPrepared.converted, false);
      assert.equal(svgPrepared.file, svgFile);
      assert.equal(svgPrepared.jxlFile, null);

      const staticDir = join(workDir, 'media-r2');
      const dbFile = join(workDir, 'r2.db');
      const config = await buildConfig({
        secret: 'check-secret-p4-r2-1234567890123',
        db: sqliteAdapter({client: {url: `file:${dbFile}`}, push: true}),
        collections: [
          {slug: 'users', auth: true, fields: []},
          {
            slug: 'media',
            access: {create: () => true, read: () => true},
            upload: {staticDir},
            fields: [{name: 'alt', type: 'text'}],
          },
        ],
        upload: {transformers: [jxlTransformer({onUpload: false})]},
      });
      const payload = await getPayload({config, key: 'p4-browser-r2'});
      try {
        const jpgForm = appendPreparedUpload(new FormData(), jpgPrepared);
        jpgForm.append('_payload', JSON.stringify({alt: 'R2 browser JPEG'}));
        const jpgPost = await postMultipartUpload(payload, 'p4-browser-r2', 'media', jpgForm);
        assert.equal(jpgPost.status, 201);
        const {doc: jpgDoc} = await jpgPost.json();
        assert.equal(jpgDoc.mimeType, 'image/jxl');
        assert.equal(jpgDoc.width, 96);
        assert.equal(jpgDoc.height, 72);

        const chromeJpg = await callGetFile(payload, 'p4-browser-r2', 'media', jpgDoc.filename, {headers: {Accept: 'image/jxl,*/*'}});
        assert.equal(chromeJpg.status, 200);
        assert.equal(chromeJpg.headers.get('content-type'), 'image/jxl');
        assert.match(chromeJpg.headers.get('vary') || '', /\bAccept\b/i);

        const edgeJpg = await callGetFile(payload, 'p4-browser-r2', 'media', jpgDoc.filename, {headers: {Accept: 'image/avif,image/webp,*/*'}});
        assert.equal(edgeJpg.status, 200);
        assert.equal(edgeJpg.headers.get('content-type'), 'image/jpeg');
        assert.equal(sha256(new Uint8Array(await edgeJpg.arrayBuffer())), sha256(sampleJpg), 'Edge gets pure-JS restored original JPEG');

        const pngForm = appendPreparedUpload(new FormData(), pngPrepared);
        pngForm.append('_payload', JSON.stringify({alt: 'R2 browser PNG'}));
        const pngPost = await postMultipartUpload(payload, 'p4-browser-r2', 'media', pngForm);
        assert.equal(pngPost.status, 201);
        const {doc: pngDoc} = await pngPost.json();
        assert.equal(pngDoc.mimeType, 'image/jxl');
        assert.equal(pngDoc.width, 96);
        assert.equal(pngDoc.height, 72);
        assert.equal(pngDoc.original?.mimeType, 'image/png', 'Payload 4.0 retains original PNG in doc.original');
        assert.match(pngDoc.original?.filename || '', /\.png$/);

        const browserJxlBytes = new Uint8Array(await pngPrepared.jxlFile.arrayBuffer());
        const chromePng = await callGetFile(payload, 'p4-browser-r2', 'media', pngDoc.filename, {headers: {Accept: 'image/jxl,image/avif,image/webp,*/*'}});
        assert.equal(chromePng.status, 200);
        assert.equal(chromePng.headers.get('content-type'), 'image/jxl');
        assert.match(chromePng.headers.get('vary') || '', /\bAccept\b/i);
        assert.equal(sha256(new Uint8Array(await chromePng.arrayBuffer())), sha256(browserJxlBytes), 'Chrome receives exact browser-encoded JXL with zero server encoding');

        const edgePng = await callGetFile(payload, 'p4-browser-r2', 'media', pngDoc.filename, {headers: {Accept: 'image/avif,image/webp,*/*'}});
        assert.equal(edgePng.status, 200);
        assert.equal(edgePng.headers.get('content-type'), 'image/png');
        assert.match(edgePng.headers.get('vary') || '', /\bAccept\b/i);
        assert.equal(sha256(new Uint8Array(await edgePng.arrayBuffer())), sha256(samplePng), 'Browser without JPEG XL receives exact original PNG');

        const botPng = await callGetFile(payload, 'p4-browser-r2', 'media', pngDoc.filename, {headers: {Accept: 'image/jxl,*/*', 'User-Agent': 'Twitterbot/1.0'}});
        assert.equal(botPng.status, 200);
        assert.equal(botPng.headers.get('content-type'), 'image/png');
        assert.equal(sha256(new Uint8Array(await botPng.arrayBuffer())), sha256(samplePng));

        const pngHtml = pictureHtml(pngDoc);
        assert.match(pngHtml, /<source type="image\/jxl" srcset="[^"]*worker-ui\.jxl"/);
        assert.match(pngHtml, /<img src="[^"]*worker-ui\.png" alt="R2 browser PNG" width="96" height="72">/);

        const singlePngForm = new FormData();
        singlePngForm.append('file', pngPrepared.file);
        singlePngForm.append('_payload', JSON.stringify({alt: 'Single-file PNG'}));
        const singlePost = await postMultipartUpload(payload, 'p4-browser-r2', 'media', singlePngForm);
        assert.equal(singlePost.status, 201);
        const {doc: singleDoc} = await singlePost.json();
        assert.equal(singleDoc.mimeType, 'image/png');
        const edgeSingle = await callGetFile(payload, 'p4-browser-r2', 'media', singleDoc.filename, {headers: {Accept: 'image/webp,*/*'}});
        assert.equal(edgeSingle.status, 200);
        assert.equal(edgeSingle.headers.get('content-type'), 'image/png');
        assert.equal(sha256(new Uint8Array(await edgeSingle.arrayBuffer())), sha256(samplePng));

        const badForm = new FormData();
        badForm.append('file', new File([samplePng], 'spoof.png', {type: 'image/png'}));
        badForm.append('jxl', new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'spoof.jxl', {type: 'image/jxl'}));
        badForm.append('_payload', JSON.stringify({alt: 'Spoofed companion'}));
        await assert.rejects(() => postMultipartUpload(payload, 'p4-browser-r2', 'media', badForm));

        console.log('p4-browser-r2 PASSED:', {
          jpegJxlBytes: jpgDoc.filesize,
          pngOrigBytes: samplePng.byteLength,
          pngJxlBytes: pngDoc.filesize,
          nonJxlBrowserGotExactPng: true,
        });
      } finally {
        await payload.db?.destroy?.();
      }
    } else if (scenario === 'p4-standalone') {
      const staticDir = join(workDir, 'media-solo');
      const dbFile = join(workDir, 'solo.db');
      const config = await buildConfig({
        secret: 'check-secret-p4-solo-12345678901',
        db: sqliteAdapter({client: {url: `file:${dbFile}`}, push: true}),
        collections: [
          {slug: 'users', auth: true, fields: []},
          {slug: 'media', access: {read: () => true}, upload: {staticDir}, fields: [{name: 'alt', type: 'text'}]},
        ],
        upload: {transformers: [jxlTransformer({effort: 3})]},
      });
      const payload = await getPayload({config, key: 'p4-standalone'});
      try {
        const pngDoc = await payload.create({
          collection: 'media',
          data: {alt: 'Standalone PNG'},
          file: {data: samplePng, mimetype: 'image/png', name: 'solo.png', size: samplePng.byteLength},
          overrideAccess: true,
        });
        assert.equal(pngDoc.mimeType, 'image/jxl');
        assert.equal(pngDoc.width, 96);
        assert.equal(pngDoc.height, 72);
        assert.equal(pngDoc.original?.mimeType, 'image/png');

        const edgePng = await callGetFile(payload, 'p4-standalone', 'media', pngDoc.filename, {headers: {Accept: 'image/webp,*/*'}});
        assert.equal(edgePng.status, 200);
        assert.equal(edgePng.headers.get('content-type'), 'image/png');
        assert.equal(sha256(new Uint8Array(await edgePng.arrayBuffer())), sha256(samplePng));
        console.log('p4-standalone PASSED');
      } finally {
        await payload.db?.destroy?.();
      }
    } else if (scenario === 'p4-options') {
      assert.throws(() => jxlTransformer({badOption: true}), {code: 'JXL_OPTIONS'});
      assert.throws(() => jxlTransformer({effort: 0}), {code: 'JXL_OPTIONS'});
      assert.throws(() => jxlTransformer({effort: 10}), {code: 'JXL_OPTIONS'});
      assert.throws(() => jxlTransformer({slug: '   '}), {code: 'JXL_OPTIONS'});
      assert.throws(() => jxlTransformer({onUpload: 'yes'}), {code: 'JXL_OPTIONS'});
      assert.throws(() => jxlTransformer({collections: 123}), {code: 'JXL_OPTIONS'});
      assert.throws(() => jxlTransformer({collections: {media: {bad: true}}}), {code: 'JXL_OPTIONS'});
      await assert.rejects(() => prepareUploadFile(null), {code: 'JXL_INPUT'});
      await assert.rejects(() => prepareUploadFile(new File([], 'a.jpg'), {effort: 4}), {code: 'JXL_OPTIONS'});
      await assert.rejects(() => prepareUploadFile(new File([], 'a.jpg'), {unknown: 1}), {code: 'JXL_OPTIONS'});
      assert.throws(() => appendPreparedUpload(null, {file: new File([], 'a.png')}), {code: 'JXL_INPUT'});
      const scoped = jxlTransformer({collections: ['media']});
      assert.equal(scoped.canTransform({operation: 'upload', collectionSlug: 'docs', mimeType: 'image/jpeg'}), false);
      assert.ok(scoped.canTransform({operation: 'upload', collectionSlug: 'media', mimeType: 'image/jpeg'}));
      assert.equal(scoped.canTransform({operation: 'upload', collectionSlug: 'media', mimeType: 'image/svg+xml'}), false);
      assert.equal(scoped.canTransform({operation: 'upload', collectionSlug: 'media', mimeType: 'image/jxl'}), false);
      console.log('p4-options PASSED');
    } else {
      throw new Error(`Unknown scenario: ${scenario}`);
    }
  }
} finally {
  try { await closeJpeg(); } catch {}
  try { await closeIndex(); } catch {}
  try { await closeUpload(); } catch {}
  await rm(workDir, {recursive: true, force: true});
}
