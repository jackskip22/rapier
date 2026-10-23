// Chrome with WebGPU on a served copy of images/jxl/: RAPIER_CHROME names the browser (Chrome 155 for the record);
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json'};

export const SOFTWARE_FLAGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'];

export async function openBrowser({chrome, flags = SOFTWARE_FLAGS, headless = true} = {}) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    try { const body = await readFile(join(root, path)); res.writeHead(200, {'content-type': TYPES[extname(path)] || 'application/octet-stream'}); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const require = createRequire(join(process.env.PLAYWRIGHT_ROOT || '/opt/node-tools/node_modules', 'x'));
  const {chromium} = require('playwright');
  const browser = await chromium.launch({executablePath: chrome || process.env.RAPIER_CHROME || '/home/user/cft/chrome/linux-155.0.8059.39/chrome-linux64/chrome',
    args: flags, headless});
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[page]', e.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin + '/gpu-search/test/blank.html');
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter();
    return a ? {vendor: a.info.vendor, architecture: a.info.architecture, fallback: a.info.isFallbackAdapter} : null;
  });
  return {page, adapter, origin, close: async () => { await browser.close(); server.close(); }};
}
